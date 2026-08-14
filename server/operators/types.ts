import type { BusArrival, BusDirection, BusRoute, BusStop, InternalOperator, RouteStop } from '../domain/bus.ts'

export interface EtaRequest {
  route: string
  stopId: string
  serviceType: string
}

export interface RouteStopsRequest {
  route: string
  direction: BusDirection
  serviceType: string
}

export interface BusOperatorAdapter {
  readonly operator: InternalOperator
  getRoutes(): Promise<BusRoute[]>
  getStops(): Promise<BusStop[]>
  getRouteStops(request: RouteStopsRequest, stops?: BusStop[]): Promise<RouteStop[]>
  getArrivals(request: EtaRequest): Promise<BusArrival[]>
  getStopArrivals?(stopId: string): Promise<BusArrival[]>
}
