export const OPERATORS = ['kmb-lwb', 'citybus'] as const
export type InternalOperator = (typeof OPERATORS)[number]

export const DIRECTIONS = ['outbound', 'inbound'] as const
export type BusDirection = (typeof DIRECTIONS)[number]

export interface BusRoute {
  route: string
  origin: string
  destination: string
  direction: BusDirection
  serviceType: string
  internalOperator: InternalOperator
}

export interface BusStop {
  stopId: string
  stopName: string
  latitude: number
  longitude: number
  internalOperator: InternalOperator
}

export interface RouteStop extends BusStop {
  route: string
  direction: BusDirection
  serviceType: string
  sequence: number
}

export type RouteGeometry = Array<Array<[number, number]>>

export interface ServiceAlert {
  title: string
  summary: string
  updatedAt: string
}

export interface BusArrival {
  route: string
  destination: string
  stopName: string
  stopId: string
  latitude: number
  longitude: number
  fare: number | null
  etaTime: string
  etaMinutes: number
  updatedAt: string
  serviceAlert: ServiceAlert | null
  internalOperator: InternalOperator
  direction: BusDirection | null
  serviceType: string
  sequence: number | null
  remark: string | null
}

export type CacheState = 'fresh' | 'stale' | 'miss'

export interface CacheMetadata {
  state: CacheState
  isStale: boolean
  updatedAt: string
  expiresAt: string
}

export interface DataEnvelope<T> {
  data: T
  cache: CacheMetadata
}

export interface NearbyBus {
  route: string
  destination: string
  stopName: string
  stopId: string
  latitude: number
  longitude: number
  distanceMeters: number
  fare: number | null
  arrivals: BusArrival[]
  serviceAlert: ServiceAlert | null
  updatedAt: string
  internalOperator: InternalOperator
  direction: BusDirection
  serviceType: string
}

export interface AlternativeStop extends BusStop {
  distanceMeters: number
}

export interface NearestRouteResult {
  route: string
  destination: string
  direction: BusDirection
  serviceType: string
  selectedStop: AlternativeStop | null
  arrivals: BusArrival[]
  fare: number | null
  updatedAt: string | null
  alternatives: AlternativeStop[]
  routeStops: RouteStop[]
  internalOperator: InternalOperator
}

export interface BusServiceNotice {
  id: string
  routeLabel: string
  title: string
  summary: string
  updatedAt: string
  priority: 'favorite' | 'nearby' | 'other'
  relatedRoute: BusRoute | null
}
