export type InternalOperator = 'kmb-lwb' | 'citybus'
export type BusDirection = 'outbound' | 'inbound'

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
  serviceAlert: { title: string; summary: string; updatedAt: string } | null
  internalOperator: InternalOperator
  direction: BusDirection | null
  serviceType: string
  sequence: number | null
  remark: string | null
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
  serviceAlert: BusArrival['serviceAlert']
  updatedAt: string
  internalOperator: InternalOperator
  direction: BusDirection
  serviceType: string
}

export interface AlternativeStop {
  stopId: string
  stopName: string
  latitude: number
  longitude: number
  internalOperator: InternalOperator
  distanceMeters: number
}

export interface RouteStop {
  stopId: string
  stopName: string
  latitude: number
  longitude: number
  internalOperator: InternalOperator
  route: string
  direction: BusDirection
  serviceType: string
  sequence: number
}

export type RouteGeometry = Array<Array<[number, number]>>

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

export interface Position {
  latitude: number
  longitude: number
}

export interface DatabaseUpdateStatus {
  state: 'idle' | 'running' | 'complete' | 'failed'
  phase: string
  message: string
  progress: number
  startedAt: string | null
  completedAt: string | null
  error: string | null
  stats: {
    fares: number
    citybusStops: number
    citybusMemberships: number
    routeGeometries: number
    operatorRoutes: number
    operatorStops: number
    operatorRouteStops: number
    fareUpdatedAt: string | null
    citybusUpdatedAt: string | null
    geometryUpdatedAt: string | null
    networkUpdatedAt: string | null
  }
}

export interface RouteSelection {
  route: string
  destination: string
  direction: BusDirection
  serviceType: string
  internalOperator: InternalOperator
}

export interface BusRoute extends RouteSelection {
  origin: string
}

export interface FavoriteRoute extends RouteSelection {
  id: string
}

export type AlertPriority = 'favorite' | 'nearby' | 'other'

export interface BusServiceAlert {
  id: string
  routeLabel: string
  title: string
  summary: string
  updatedAt: string
  priority: AlertPriority
  relatedRoute: RouteSelection | null
}
