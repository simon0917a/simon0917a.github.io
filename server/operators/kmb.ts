import type { BusArrival, BusRoute, BusStop, RouteStop } from '../domain/bus.ts'
import { fetchJson } from '../infrastructure/fetch-json.ts'
import type { BusOperatorAdapter, EtaRequest, RouteStopsRequest } from './types.ts'
import { cleanText, directionFromCode, directionToPath, etaMinutes, isCurrentEta, parseCoordinate, type ApiEnvelope } from './shared.ts'

const BASE_URL = 'https://data.etabus.gov.hk/v1/transport/kmb'

interface KmbRoute {
  route: string
  bound: string
  service_type: string
  orig_tc: string
  dest_tc: string
}

interface KmbStop {
  stop: string
  name_tc: string
  lat: string
  long: string
}

interface KmbRouteStop {
  route: string
  bound: string
  service_type: string
  seq: number
  stop: string
}

interface KmbEta {
  route: string
  dir?: string
  service_type?: number
  seq?: number
  dest_tc: string
  eta: string | null
  rmk_tc?: string
  data_timestamp: string
}

export class KmbAdapter implements BusOperatorAdapter {
  readonly operator = 'kmb-lwb' as const

  async getRoutes(): Promise<BusRoute[]> {
    const response = await fetchJson<ApiEnvelope<KmbRoute[]>>(`${BASE_URL}/route/`)
    return response.data.flatMap((item) => {
      const direction = directionFromCode(item.bound)
      return direction
        ? [{ route: item.route, origin: item.orig_tc, destination: item.dest_tc, direction, serviceType: item.service_type, internalOperator: this.operator }]
        : []
    })
  }

  async getStops(): Promise<BusStop[]> {
    const response = await fetchJson<ApiEnvelope<KmbStop[]>>(`${BASE_URL}/stop`)
    return response.data.map((item) => this.mapStop(item))
  }

  async getRouteStops(request: RouteStopsRequest, stops: BusStop[]): Promise<RouteStop[]> {
    const pathDirection = directionToPath(request.direction)
    const response = await fetchJson<ApiEnvelope<KmbRouteStop[]>>(
      `${BASE_URL}/route-stop/${encodeURIComponent(request.route)}/${pathDirection}/${encodeURIComponent(request.serviceType)}`,
    )
    const stopIndex = new Map(stops.map((stop) => [stop.stopId, stop]))

    return response.data.flatMap((item) => {
      const stop = stopIndex.get(item.stop)
      return stop
        ? [{ ...stop, route: item.route, direction: request.direction, serviceType: item.service_type, sequence: Number(item.seq) }]
        : []
    })
  }

  async getArrivals(request: EtaRequest): Promise<BusArrival[]> {
    const [etaResponse, stopResponse] = await Promise.all([
      fetchJson<ApiEnvelope<KmbEta[]>>(
        `${BASE_URL}/eta/${encodeURIComponent(request.stopId)}/${encodeURIComponent(request.route)}/${encodeURIComponent(request.serviceType)}`,
      ),
      fetchJson<ApiEnvelope<KmbStop>>(`${BASE_URL}/stop/${encodeURIComponent(request.stopId)}`),
    ])
    const stop = this.mapStop(stopResponse.data)

    return etaResponse.data.flatMap((item) => {
      if (!item.eta || !isCurrentEta(item.eta)) return []
      return [{
        route: item.route,
        destination: item.dest_tc,
        stopName: stop.stopName,
        stopId: stop.stopId,
        latitude: stop.latitude,
        longitude: stop.longitude,
        fare: null,
        etaTime: item.eta,
        etaMinutes: etaMinutes(item.eta),
        updatedAt: item.data_timestamp || etaResponse.generated_timestamp,
        serviceAlert: null,
        internalOperator: this.operator,
        direction: directionFromCode(item.dir),
        serviceType: String(item.service_type ?? request.serviceType),
        sequence: item.seq == null ? null : Number(item.seq),
        remark: cleanText(item.rmk_tc),
      }]
    })
  }

  async getStopArrivals(stopId: string): Promise<BusArrival[]> {
    const [etaResponse, stopResponse] = await Promise.all([
      fetchJson<ApiEnvelope<KmbEta[]>>(`${BASE_URL}/stop-eta/${encodeURIComponent(stopId)}`),
      fetchJson<ApiEnvelope<KmbStop>>(`${BASE_URL}/stop/${encodeURIComponent(stopId)}`),
    ])
    const stop = this.mapStop(stopResponse.data)

    return etaResponse.data.flatMap((item) => {
      if (!item.eta || !isCurrentEta(item.eta)) return []
      return [{
        route: item.route,
        destination: item.dest_tc,
        stopName: stop.stopName,
        stopId: stop.stopId,
        latitude: stop.latitude,
        longitude: stop.longitude,
        fare: null,
        etaTime: item.eta,
        etaMinutes: etaMinutes(item.eta),
        updatedAt: item.data_timestamp || etaResponse.generated_timestamp,
        serviceAlert: null,
        internalOperator: this.operator,
        direction: directionFromCode(item.dir),
        serviceType: String(item.service_type ?? '1'),
        sequence: item.seq == null ? null : Number(item.seq),
        remark: cleanText(item.rmk_tc),
      }]
    })
  }

  private mapStop(item: KmbStop): BusStop {
    return {
      stopId: item.stop,
      stopName: item.name_tc.trim(),
      latitude: parseCoordinate(item.lat),
      longitude: parseCoordinate(item.long),
      internalOperator: this.operator,
    }
  }
}
