"use client"

import {
  ComposableMap,
  Geographies,
  Geography,
  Line,
  Marker,
  Point,
} from "react-simple-maps"

// How am I supposed to do this?
import { csv } from "d3-fetch"
import { useEffect, useMemo, useState } from "react"
import { PriorityQueue } from "@datastructures-js/priority-queue"
import {
  CityMap,
  CityRaw,
  ComputeRouteStatisticsProps,
  PathAndDistance,
  RouteStatisticsMap,
  Segment,
  SegmentMap,
  SegmentStatisticsMap,
  ShortestPaths,
} from "."
import clsx from "clsx"

const statesUrl = "/states.json"

function computeShortestPaths(segments: SegmentMap): ShortestPaths {
  // We use Dijkstra since the number of edges is quite small
  // relative to the number of vertices

  // Build the adjacency list
  const adjList: {
    [fromCity: string]: { out: string; distance: number }[]
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

    adjList[seg.fromCity].push({ out: seg.toCity, distance: seg.distance })
    adjList[seg.toCity].push({ out: seg.fromCity, distance: seg.distance })
  }

  const shortestPaths: ShortestPaths = {}
  for (const v of Object.keys(adjList)) {
    const thisOut: { [toCity: string]: PathAndDistance } = {}
    const queue = new PriorityQueue<PathAndDistance>((a, b) =>
      a.distance > b.distance ? 1 : -1,
    )
    queue.enqueue({ path: [v], distance: 0 })
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
          distance: distance + newDest.distance,
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
    operatingCostPerKm: 0.07, // dollars per km
    maxProfitPerPassenger: 50, // dollars
    baseFarePerKm: 0.135, // dollars per km
  },
}: ComputeRouteStatisticsProps): RouteStatisticsMap {
  const output: RouteStatisticsMap = {}
  const { coeff, power } = metcalfe
  const { operatingCostPerKm, maxProfitPerPassenger, baseFarePerKm } = financial

  for (const fromCity of Object.keys(shortestPaths)) {
    output[fromCity] = {}

    const paths = shortestPaths[fromCity]
    for (const toCity of Object.keys(paths)) {
      const { path, distance } = paths[toCity]
      const denominator = Math.pow(distance < 500 ? 500 : distance, 2)
      const ridership =
        (coeff *
          Math.pow(cities[fromCity].population / 1e6, power) *
          Math.pow(cities[toCity].population / 1e6, power)) /
        denominator

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

function computeSegmentStatistics({
  routeStatistics,
  segments,
}: {
  routeStatistics: RouteStatisticsMap
  segments: SegmentMap
}): SegmentStatisticsMap {
  const segmentStatistics: SegmentStatisticsMap = {}
  for (const from_city of Object.keys(routeStatistics)) {
    const paths = routeStatistics[from_city]
    for (const to_city of Object.keys(paths)) {
      const { ridership, path, totalProfit, distance } = paths[to_city]

      for (let i = 0; i < path.length - 1; ++i) {
        let segName = `${path[i]} - ${path[i + 1]}`
        let seg = segments[segName]
        if (!seg) {
          segName = `${path[i + 1]} - ${path[i]}`
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
      inCities.map((city) => (newCities[city.city] = city))
      setCities(newCities)
    })
  }, [])

  const flipSegmentParity = (segName: string) => {
    setSegments({
      ...segments,
      [segName]: { ...segments[segName], isOn: !segments[segName].isOn },
    })
  }

  const foo = useMemo(() => {
    const shortestPaths = computeShortestPaths(segments)
    const routeStatistics = computeRouteStatistics({ shortestPaths, cities })
    const segmentStatistics = computeSegmentStatistics({
      routeStatistics,
      segments,
    })
    return {
      shortestPaths,
      routeStatistics,
      segmentStatistics,
    }
  }, [segments, cities])

  let heading
  if (
    foo.shortestPaths &&
    foo.shortestPaths["Toronto"] &&
    foo.shortestPaths["Toronto"]["Buffalo"]
  ) {
    heading = <p>{foo.shortestPaths["Toronto"]["Buffalo"].distance}</p>
  } else {
    heading = <p>Still null</p>
  }

  if (
    foo.routeStatistics &&
    foo.routeStatistics["Toronto"] &&
    foo.routeStatistics["Toronto"]["Buffalo"]
  ) {
    heading = <p>{foo.routeStatistics["Toronto"]["Buffalo"].ridership}</p>
  }
  if (foo.segmentStatistics && foo.segmentStatistics["Toronto - Buffalo"]) {
    heading = <p>{foo.segmentStatistics["Toronto - Buffalo"].totalProfit}</p>
  }

  return (
    <>
      {heading}
      <ComposableMap
        projection="geoAlbers"
        projectionConfig={{ center: [0, 40] }}
      >
        <Geographies geography={statesUrl}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#ddd"
                stroke="#000"
                style={{
                  default: { outline: "none" },
                  hover: { outline: "none" },
                  pressed: { outline: "none" },
                }}
                tabIndex={-1}
              />
            ))
          }
        </Geographies>
        {Object.values(cities).map(({ lng, lat }, idx) => (
          <Marker key={`cities-${idx}`} coordinates={[lng, lat]}>
            <circle r={4} stroke={"#fff"} strokeWidth={2} fill={"#f00"} />
          </Marker>
        ))}
        {Object.values(segments).map(({ fromCity, toCity, isOn }, idx) => {
          const f = cities[fromCity]
          const t = cities[toCity]
          const segName = `${fromCity} - ${toCity}`
          if (!f || !t) {
            return <></>
          }

          const left: Point = [f.lng, f.lat]
          const right: Point = [t.lng, t.lat]

          return (
            <Line
              onClick={() => flipSegmentParity(segName)}
              coordinates={[left, right]}
              key={`segment-${idx}`}
              stroke={clsx({
                "#000": !isOn,
                "#0f0": isOn,
              })}
            />
          )
        })}
      </ComposableMap>
    </>
  )
}
