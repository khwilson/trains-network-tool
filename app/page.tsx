'use client';

import { ComposableMap, Geographies, Geography, Line, Marker, Point } from "react-simple-maps"

// How am I supposed to do this?
import { csv } from 'd3-fetch';
import { useEffect, useMemo, useState } from "react";
import { PriorityQueue } from "@datastructures-js/priority-queue";
import { CityMap, CityRaw, ComputeRouteStatisticsProps, PathAndDistance, RouteStatisticsMap, Segment, SegmentMap, SegmentStatisticsMap, ShortestPaths } from ".";
import clsx from 'clsx'

const statesUrl = "/states.json"

function computeShortestPaths(segments: SegmentMap): ShortestPaths {
  // We use Dijkstra since the number of edges is quite small
  // relative to the number of vertices

  // Build the adjacency list
  const adjList: {
    [fromCity: string] : {out: string, distance: number}[]
  } = {}

  // Be wasteful: these lists are small
  for (const seg of Object.values(segments)) {
    adjList[seg.fromCity] = []
    adjList[seg.toCity] = []
  }

  for (const seg of Object.values(segments)) {
    if (!seg.isOn) {
      continue
    }

    adjList[seg.fromCity].push({out: seg.toCity, distance: seg.distance})
    adjList[seg.toCity].push({out: seg.fromCity, distance: seg.distance})
  }

  const shortestPaths: ShortestPaths = {}
  for (const v of Object.keys(adjList)) {
    const thisOut: { [toCity: string]: PathAndDistance } = {}
    const queue = new PriorityQueue<PathAndDistance>((a, b) => a.distance > b.distance ? 1 : -1)
    queue.enqueue({ path: [v], distance: 0})
    while (queue.size() > 0) {
      const { path, distance } = queue.dequeue()
      const lastNode = path[path.length - 1]
      if (thisOut[lastNode] !== undefined) {
        // Already saw node; definitely shorter path
        continue
      }

      // Found shortest path. Yay priority queue
      thisOut[lastNode] = { path, distance }

      // Recurse
      for (const newDest of adjList[lastNode]) {
        queue.enqueue({
          path: [...path, newDest.out],
          distance: distance + newDest.distance
        })
      }
    }
    shortestPaths[v] = thisOut
  }

  return shortestPaths
}

function computeRouteStatistics({
  shortestPaths,
  cities,
  metcalfe = { coeff: 75000, power: 0.8 },
  financial = {
    operatingCostPerKm: 0.07,   // dollars per km
    maxProfitPerPassenger: 50,  // dollars
    baseFarePerKm: 0.135,       // dollars per km
  }
}: ComputeRouteStatisticsProps): RouteStatisticsMap {
  const output: RouteStatisticsMap = {}
  const { coeff, power } = metcalfe
  const {
    operatingCostPerKm,
    maxProfitPerPassenger,
    baseFarePerKm
  } = financial

  for (const fromCity of Object.keys(shortestPaths)) {
    output[fromCity] = {}

    const paths = shortestPaths[fromCity]
    for (const toCity of Object.keys(paths)) {
      const { path, distance } = paths[toCity]
      const denominator = Math.pow(distance < 500 ? 500 : distance, 2)
      const ridership = (
        coeff
        * Math.pow(cities[fromCity].population / 1e6, power)
        * Math.pow(cities[toCity].population / 1e6, power)
      ) / denominator

      const operatingCostPerPassenger = operatingCostPerKm * distance
      const maxFare = operatingCostPerPassenger + maxProfitPerPassenger
      const proposedFare = baseFarePerKm * distance
      const fare = maxFare < proposedFare ? maxFare : proposedFare

      output[fromCity][toCity] = {
        fromCityPop: cities[fromCity].population,
        toCityPop: cities[toCity].population,
        ridership,
        path,
        distance,
        operatingCostPerPassenger,
        maxFare,
        proposedFare,
        fare,
        profitPerPassenger: fare - operatingCostPerPassenger,
        totalProfit: (fare - operatingCostPerPassenger) * ridership,
      }
    }
  }
  return output
}

function computeSegmentStatistics({routeStatistics, segments}: {routeStatistics: RouteStatisticsMap, segments: SegmentMap}): SegmentStatisticsMap {
  const segmentStatistics: SegmentStatisticsMap = {}
  for (const from_city of Object.keys(routeStatistics)) {
    const paths = routeStatistics[from_city]
    for (const to_city of Object.keys(paths)) {
      const {
        ridership,
        path,
        totalProfit,
        distance,
      } = paths[to_city]

      for (let i = 0; i < path.length - 1; ++i) {
        let segName = `${path[i]} - ${path[i+1]}`
        let seg = segments[segName]
        if (!seg) {
          segName = `${path[i+1]} - ${path[i]}`
          seg = segments[segName]
        }
        let segStats = segmentStatistics[segName]
        if (!segStats) {
          segStats = {
            ridership: 0,
            totalProfit: 0,
            cost: seg.cost,
          }
          segmentStatistics[segName] = segStats
        }
        // Ridership is just an absolute count
        segStats.ridership += ridership

        // But assign total profit proportional to distance
        segStats.totalProfit += totalProfit * (seg.distance / distance)
      }
    }
  }
  return segmentStatistics
}

export default function Home() {
  const [cities, setCities] = useState<CityMap>({})
  const [segments, setSegments] = useState<SegmentMap>({})

  // Load the segments csv and set the contents of segments
  useEffect(() => {
    // TODO: Not sure how to get rid of the type error here
    csv("/segments.csv", (row) => {
      return {
        fromCity: row.from_city,
        toCity: row.to_city,
        distance: +row.distance,
        cost: +row.cost,
        isOn: false,
      }
    }).then((segs: Segment[]) => {
      const newSegs: SegmentMap = {}
      for (const seg of segs) {
        // WARNING: This is _not_ symmetric!
        newSegs[`${seg.fromCity} - ${seg.toCity}`] = seg
      }
      setSegments(newSegs)
    })
  }, [])

  // Load the cities csv and set the content of cities
  useEffect(() => {
    csv("/cities.csv", (row) => {
      return {
        city: row.city,
        state: row.state,
        population: +row.population,
        lng: +row.lng,
        lat: +row.lat,
      }
    }).then((inCities: CityRaw[]) => {
      const newCities: CityMap = {}
      inCities.map((city) => newCities[city.city] = city)
      setCities(newCities)
    })
  }, [])

  const flipSegmentParity = (segName: string) => {
    setSegments({...segments, [segName]: {...segments[segName], isOn: !segments[segName].isOn}})
  }

  const foo = useMemo(() => {
    const shortestPaths = computeShortestPaths(segments)
    const routeStatistics = computeRouteStatistics({ shortestPaths, cities })
    const segmentStatistics = computeSegmentStatistics({ routeStatistics, segments })
    return {
      shortestPaths,
      routeStatistics,
      segmentStatistics,
    }
  }, [segments, cities])

  let heading
  if (foo.shortestPaths && foo.shortestPaths['Toronto'] && foo.shortestPaths['Toronto']['Buffalo']) {
    heading = <p>{foo.shortestPaths['Toronto']['Buffalo'].distance}</p>
  } else {
    heading = <p>Still null</p>
  }

  if (foo.routeStatistics && foo.routeStatistics['Toronto'] && foo.routeStatistics['Toronto']['Buffalo']) {
    heading = <p>{foo.routeStatistics['Toronto']['Buffalo'].ridership}</p>
  }
  if (foo.segmentStatistics && foo.segmentStatistics['Toronto - Buffalo']) {
    heading = <p>{foo.segmentStatistics['Toronto - Buffalo'].totalProfit}</p>
  }

  return (
    <>
    {heading}
    <ComposableMap projection="geoAlbers" projectionConfig={{center: [0, 40]}}>
      <Geographies geography={statesUrl}>
        {({ geographies }) =>
          geographies.map((geo) => (
            <Geography key={geo.rsmKey} geography={geo} fill="#ddd" stroke="#000"   style={{
              default: { outline: "none" },
              hover: { outline: "none" },
              pressed: { outline: "none" },
            }} tabIndex={-1}/>
          ))
        }
      </Geographies>
      {
        Object.values(cities).map(({lng, lat}, idx) => (
          <Marker key={`cities-${idx}`} coordinates={[lng, lat]}>
            <circle r={4} stroke={"#fff"} strokeWidth={2} fill={"#f00"} />
          </Marker>
        ))
      }
      {
        Object.values(segments).map(({ fromCity, toCity, isOn }, idx) => {
          const f = cities[fromCity]
          const t = cities[toCity]
          const segName = `${fromCity} - ${toCity}`
          if (!f || !t) {
            return (<></>)
          }

          const left: Point = [f.lng, f.lat]
          const right: Point = [t.lng, t.lat]

          return (
            <Line
              onClick={() => flipSegmentParity(segName)}
              coordinates={[left, right]}
              key={`segment-${idx}`}
              stroke={clsx({
                '#000': !isOn,
                '#0f0': isOn,
              })}
            />
          )
        })
      }
    </ComposableMap>
    </>
    // <main className="flex min-h-screen flex-col items-center justify-between p-24">
    //   <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
    //     <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
    //       Get started by editing&nbsp;
    //       <code className="font-mono font-bold">app/page.tsx</code>
    //     </p>
    //     <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
    //       <a
    //         className="pointer-events-none flex place-items-center gap-2 p-8 lg:pointer-events-auto lg:p-0"
    //         href="https://vercel.com?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
    //         target="_blank"
    //         rel="noopener noreferrer"
    //       >
    //         By{' '}
    //         <Image
    //           src="/vercel.svg"
    //           alt="Vercel Logo"
    //           className="dark:invert"
    //           width={100}
    //           height={24}
    //           priority
    //         />
    //       </a>
    //     </div>
    //   </div>

    //   <div className="relative flex place-items-center before:absolute before:h-[300px] before:w-[480px] before:-translate-x-1/2 before:rounded-full before:bg-gradient-radial before:from-white before:to-transparent before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-[240px] after:translate-x-1/3 after:bg-gradient-conic after:from-sky-200 after:via-blue-200 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700 before:dark:opacity-10 after:dark:from-sky-900 after:dark:via-[#0141ff] after:dark:opacity-40 before:lg:h-[360px] z-[-1]">
    //     <Image
    //       className="relative dark:drop-shadow-[0_0_0.3rem_#ffffff70] dark:invert"
    //       src="/next.svg"
    //       alt="Next.js Logo"
    //       width={180}
    //       height={37}
    //       priority
    //     />
    //   </div>

    //   <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-4 lg:text-left">
    //     <a
    //       href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
    //       className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
    //       target="_blank"
    //       rel="noopener noreferrer"
    //     >
    //       <h2 className={`mb-3 text-2xl font-semibold`}>
    //         Docs{' '}
    //         <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
    //           -&gt;
    //         </span>
    //       </h2>
    //       <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
    //         Find in-depth information about Next.js features and API.
    //       </p>
    //     </a>

    //     <a
    //       href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
    //       className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
    //       target="_blank"
    //       rel="noopener noreferrer"
    //     >
    //       <h2 className={`mb-3 text-2xl font-semibold`}>
    //         Learn{' '}
    //         <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
    //           -&gt;
    //         </span>
    //       </h2>
    //       <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
    //         Learn about Next.js in an interactive course with&nbsp;quizzes!
    //       </p>
    //     </a>

    //     <a
    //       href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
    //       className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
    //       target="_blank"
    //       rel="noopener noreferrer"
    //     >
    //       <h2 className={`mb-3 text-2xl font-semibold`}>
    //         Templates{' '}
    //         <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
    //           -&gt;
    //         </span>
    //       </h2>
    //       <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
    //         Explore the Next.js 13 playground.
    //       </p>
    //     </a>

    //     <a
    //       href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
    //       className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
    //       target="_blank"
    //       rel="noopener noreferrer"
    //     >
    //       <h2 className={`mb-3 text-2xl font-semibold`}>
    //         Deploy{' '}
    //         <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
    //           -&gt;
    //         </span>
    //       </h2>
    //       <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
    //         Instantly deploy your Next.js site to a shareable URL with Vercel.
    //       </p>
    //     </a>
    //   </div>
    // </main>
  )
}
