"use client"

import {
  ComposableMap,
  Geographies,
  Geography,
  Line,
  Marker,
  Point,
} from "react-simple-maps"

import { csv } from "d3-fetch"
import { useEffect, useMemo, useState } from "react"
import { CityMap, CityRaw, Segment, SegmentMap } from "."
import clsx from "clsx"
import {
  computeRouteStatistics,
  computeSegmentStatistics,
  computeShortestPaths,
} from "./lib/graphAlgorithms"

const statesUrl = "/states.json"
const segmentsUrl = "/segments.csv"
const citiesUrl = "/cities.csv"

export default function Home() {
  const [cities, setCities] = useState<CityMap>({})
  const [segments, setSegments] = useState<SegmentMap>({})

  // Load the segments csv and set the contents of segments
  useEffect(() => {
    csv(segmentsUrl, (row) => {
      return {
        name: `${row.from_city} - ${row.to_city}`,
        fromCity: row.from_city,
        toCity: row.to_city,
        distance: +row.distance,
        cost: +row.cost,
        isOn: true,
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
    csv(citiesUrl, (row) => {
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

  return (
    <main className="grid grid-cols-4 min-h-screen p-6">
      <div className="col-start-2 col-end-4">
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
      </div>
      <div className="col-start-1 col-end-5">
        <table>
          <thead>
            <tr>
              <td>From</td>
              <td>To</td>
              <td>Cost ($b)</td>
              <td>Ridership (m)</td>
              <td>Total Profit ($m)</td>
              <td>ROI (%)</td>
            </tr>
          </thead>
          <tbody>
            {Object.keys(foo.segmentStatistics).map((segName, idx) => {
              const segStats = foo.segmentStatistics[segName]
              const [fromCity, toCity] = segName.split(" - ")
              return (
                <tr key={`output-segment-tr-${idx}`}>
                  <td key={`output-segment-td-from-${idx}`}>{fromCity}</td>
                  <td key={`output-segment-td-to-${idx}`}>{toCity}</td>
                  <td key={`output-segment-td-cost-${idx}`}>
                    {(segStats.cost / 1e9).toFixed(2)}
                  </td>
                  <td key={`output-segment-td-ridership-${idx}`}>
                    {(segStats.ridership / 1e6).toFixed(3)}
                  </td>
                  <td key={`output-segment-td-totalprofit-${idx}`}>
                    {(segStats.totalProfit / 1e6).toFixed(2)}
                  </td>
                  <td key={`output-segment-td-roi-${idx}`}>
                    {(
                      (100 * (segStats.totalProfit - segStats.cost)) /
                      segStats.cost
                    ).toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="col-start-1 col-end-5">
        <table>
          <thead>
            <tr>
              <td>From</td>
              <td>To</td>
              <td>Distance</td>
              <td>Cost</td>
            </tr>
          </thead>
          <tbody>
            {Object.values(segments).map((segment, idx) => (
              <tr key={`input-segment-tr-${idx}`}>
                <td key={`input-segment-td-from-${idx}`}>{segment.fromCity}</td>
                <td key={`input-segment-td-to-${idx}`}>{segment.toCity}</td>
                <td key={`input-segment-td-dist-${idx}`}>{segment.distance}</td>
                <td key={`input-segment-td-cost-${idx}`}>
                  <input
                    value={segment.cost}
                    onChange={(event) =>
                      setSegments((old) => {
                        return {
                          ...old,
                          [segment.name]: {
                            ...segment,
                            cost: +event.target.value,
                          },
                        }
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="col-start-1 col-end-5">
        <table>
          <thead>
            <tr>
              <td>Name</td>
              <td>Population</td>
            </tr>
          </thead>
          <tbody>
            {Object.values(cities).map((city, idx) => (
              <tr key={`tr-${idx}`}>
                <td key={`td-name-${idx}`}>{city.city}</td>
                <td key={`td-population-${idx}`}>{city.population}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
