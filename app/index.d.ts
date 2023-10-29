export interface Segment extends SegmentRaw {
  fromCity: string
  toCity: string
  distance: number
  cost: number
  isOn: boolean
}

export interface SegmentMap {
  [segName: string]: Segment
}

export interface CityRaw {
  city: string
  state: string
  population: number
  lng: number
  lat: number
}

export interface CityMap {
  [city: string]: CityRaw
}

export interface RouteStatistics {
  // The population of the origin city
  fromCityPop: number

  // The population of the destination city
  toCityPop: number

  // The total ridership along the route (counts any passenger along
  // route no matter how long they have travelled
  ridership: number

  // The list of intermediary stops between the origin city and the
  // destination city along the _shortest_ path
  path: string[]

  // The total distance along the shortest path between the origin
  // and destination
  distance: number

  // The computed operating cost per passenger (will always be a multiple)
  // of `distance`)
  operatingCostPerPassenger: number

  // The default fare. Will always be a multiple of `distance`
  proposedFare: number

  // The maximum fare, which is `operatingCostPerPassenger` plus a constant
  maxFare: number

  // The actual fare charged for the route, which will be
  // `min(maxFare, proposedFare)`
  fare: number

  // The profit made on each trip. Equal to `operatingCostPerPassenger - fare`
  profitPerPassenger: number

  // `profitPerPassenger * ridership`
  totalProfit: number
}

export interface RouteStatisticsMap {
  [fromCity: string]: {
    [toCity: string]: RouteStatistics
  }
}

interface ComputeRouteStatisticsProps {
  shortestPaths: ShortestPaths
  cities: CityMap
  metcalfe?: {
    coeff: number
    power: number
  }
  financial?: {
    operatingCostPerKm: number
    maxProfitPerPassenger: number
    baseFarePerKm: number
  }
}

export interface PathAndDistance {
  path: string[]
  distance: number
}

export interface ShortestPaths {
  [fromCity: string]: {
    [toCity: string]: PathAndDistance
  }
}

export interface SegmentStatistics {
  ridership: number
  totalProfit: number
  cost: number
}

export interface SegmentStatisticsMap {
  [segName: string]: SegmentStatistics
}
