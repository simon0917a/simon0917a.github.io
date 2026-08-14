import type { BusArrival, BusRoute, BusStop, RouteStop } from '../domain/bus.ts'
import { fetchJson } from '../infrastructure/fetch-json.ts'
import type { BusOperatorAdapter, EtaRequest, RouteStopsRequest } from './types.ts'
import { cleanText, directionFromCode, directionToPath, etaMinutes, isCurrentEta, parseCoordinate, type ApiEnvelope } from './shared.ts'

const BASE_URL = 'https://rt.data.gov.hk/v2/transport/citybus'
const COMPANY = 'CTB'

interface CitybusRoute {
  route: string
  orig_tc: string
  dest_tc: string
}

interface CitybusStop {
  stop: string
  name_tc: string
  lat: string
  long: string
}

interface CitybusRouteStop {
  route: string
  dir: string
  seq: number
  stop: string
}

interface CitybusEta {
  route: string
  dir?: string
  seq?: number
  dest_tc: string
  eta: string | null
  rmk_tc?: string
  data_timestamp: string
}

export class CitybusAdapter implements BusOperatorAdapter {
  readonly operator = 'citybus' as const
  private readonly stopCache = new Map<string, Promise<BusStop>>()

  async getRoutes(): Promise<BusRoute[]> {
    const response = await fetchJson<ApiEnvelope<CitybusRoute[]>>(`${BASE_URL}/route/${COMPANY}`)
    return response.data.flatMap((item) => [
      { route: item.route, origin: item.orig_tc, destination: item.dest_tc, direction: 'outbound', serviceType: '1', internalOperator: this.operator },
      { route: item.route, origin: item.dest_tc, destination: item.orig_tc, direction: 'inbound', serviceType: '1', internalOperator: this.operator },
    ])
  }

  async getStops(): Promise<BusStop[]> {
    // 城巴公開 API 沒有全站批次端點；站點會在取得路線站序時逐站載入及快取。
    return []
  }

  async getRouteStops(request: RouteStopsRequest): Promise<RouteStop[]> {
    const pathDirection = directionToPath(request.direction)
    const response = await fetchJson<ApiEnvelope<CitybusRouteStop[]>>(
      `${BASE_URL}/route-stop/${COMPANY}/${encodeURIComponent(request.route)}/${pathDirection}`,
    )
    const routeStops = await Promise.all(response.data.map((item) => this.getStop(item.stop)))

    return response.data.map((item, index) => ({
      ...routeStops[index],
      route: item.route,
      direction: directionFromCode(item.dir) ?? request.direction,
      serviceType: request.serviceType,
      sequence: Number(item.seq),
    }))
  }

  async getArrivals(request: EtaRequest): Promise<BusArrival[]> {
    const [etaResponse, stopResponse] = await Promise.all([
      fetchJson<ApiEnvelope<CitybusEta[]>>(
        `${BASE_URL}/eta/${COMPANY}/${encodeURIComponent(request.stopId)}/${encodeURIComponent(request.route)}`,
      ),
      fetchJson<ApiEnvelope<CitybusStop>>(`${BASE_URL}/stop/${encodeURIComponent(request.stopId)}`),
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
        serviceType: request.serviceType,
        sequence: item.seq == null ? null : Number(item.seq),
        remark: cleanText(item.rmk_tc),
      }]
    })
  }

  private mapStop(item: CitybusStop): BusStop {
    return {
      stopId: item.stop,
      stopName: item.name_tc.trim(),
      latitude: parseCoordinate(item.lat),
      longitude: parseCoordinate(item.long),
      internalOperator: this.operator,
    }
  }

  private getStop(stopId: string): Promise<BusStop> {
    const cached = this.stopCache.get(stopId)
    if (cached) return cached

    const pending = fetchJson<ApiEnvelope<CitybusStop>>(`${BASE_URL}/stop/${encodeURIComponent(stopId)}`)
      .then((response) => this.mapStop(response.data))
      .catch((error) => {
        this.stopCache.delete(stopId)
        throw error
      })
    this.stopCache.set(stopId, pending)
    return pending
  }
}
