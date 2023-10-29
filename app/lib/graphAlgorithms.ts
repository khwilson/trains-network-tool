import { PriorityQueue } from "@datastructures-js/priority-queue"
import {
  ComputeRouteStatisticsProps,
  PathAndDistance,
  RouteStatisticsMap,
  SegmentMap,
  SegmentStatisticsMap,
  ShortestPaths,
} from ".."

export function computeShortestPaths(segments: SegmentMap): ShortestPaths {
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

export function computeRouteStatistics({
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
  if (!cities) {
    // Data not ready
    return output
  }
  for (const fromCity of Object.keys(shortestPaths)) {
    output[fromCity] = {}

    const paths = shortestPaths[fromCity]
    for (const toCity of Object.keys(paths)) {
      const { path, distance } = paths[toCity]
      const denominator = Math.pow(distance < 500 ? 500 : distance, 2)
      if (!cities[fromCity] || !cities[toCity]) {
        // Something hasn't finished loading if we've gotten here
        return {}
      }

      const ridership =
        (1e6 *
          (coeff *
            Math.pow(cities[fromCity].population / 1e6, power) *
            Math.pow(cities[toCity].population / 1e6, power))) /
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

export function computeSegmentStatistics({
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
        // Divide by 2 since each route appears twice
        segStats.ridership += ridership / 2

        // But assign total profit proportional to distance
        // Divide by 2 since each route appears twice
        segStats.totalProfit += (totalProfit * (seg.distance / distance)) / 2
      }
    }
  }
  return segmentStatistics
}
