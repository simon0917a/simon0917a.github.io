import type { BusRoute, BusStop, InternalOperator } from '../domain/bus.ts'
import { busDatabase, type BusDatabase } from '../database/bus-database.ts'
import { SwrCache, type CachePolicy } from '../infrastructure/swr-cache.ts'
import { CitybusAdapter } from '../operators/citybus.ts'
import { KmbAdapter } from '../operators/kmb.ts'
import { isCurrentEta } from '../operators/shared.ts'
import type { BusOperatorAdapter, EtaRequest, RouteStopsRequest } from '../operators/types.ts'
import { fareService } from './fare-service.ts'

const DAY = 24 * 60 * 60 * 1_000
const STATIC_POLICY: CachePolicy = { freshForMs: 14 * DAY, staleForMs: 30 * DAY }
const ROUTE_STOPS_POLICY: CachePolicy = { freshForMs: 7 * DAY, staleForMs: 30 * DAY }
// ETA is perishable; a day-old fallback would turn departed journeys into false "0 minutes".
const ETA_POLICY: CachePolicy = { freshForMs: 20_000, staleForMs: 10 * 60_000 }

export class BusDataService {
  private readonly adapters: Map<InternalOperator, BusOperatorAdapter>

  constructor(
    private readonly cache = new SwrCache(),
    adapters: BusOperatorAdapter[] = [new KmbAdapter(), new CitybusAdapter()],
    private readonly database: BusDatabase = busDatabase,
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.operator, adapter]))
  }

  getRoutes() {
    return this.cache.get<BusRoute[]>(
      'routes:all',
      async () => {
        const stored = this.database.getRoutes()
        if (stored.length) return stored
        const downloaded = (await Promise.all([...this.adapters.values()].map((adapter) => adapter.getRoutes()))).flat()
        if (downloaded.length) this.database.replaceRoutes(downloaded)
        return downloaded
      },
      STATIC_POLICY,
    )
  }

  getStops() {
    return this.cache.get<BusStop[]>(
      'stops:all',
      async () => (
        await Promise.all([...this.adapters.keys()].map(async (operator) => (await this.getOperatorStops(operator)).data))
      ).flat(),
      STATIC_POLICY,
    )
  }

  getRouteStops(operator: InternalOperator, request: RouteStopsRequest) {
    const key = `route-stops:${operator}:${request.route}:${request.direction}:${request.serviceType}`
    return this.cache.get(
      key,
      async () => {
        const stored = this.database.getRouteStops(operator, request.route, request.direction, request.serviceType)
        if (stored.length) return stored
        const downloaded = await this.getAdapter(operator).getRouteStops(
          request,
          operator === 'kmb-lwb' ? (await this.getOperatorStops(operator)).data : undefined,
        )
        if (downloaded.length) this.database.replaceRouteStopsForService(operator, downloaded)
        return downloaded
      },
      ROUTE_STOPS_POLICY,
    )
  }

  async getArrivals(operator: InternalOperator, request: EtaRequest, force = false) {
    const key = `eta:${operator}:${request.stopId}:${request.route}:${request.serviceType}`
    const loader = async () => (await this.getAdapter(operator).getArrivals(request)).map((arrival) => ({
      ...arrival,
      fare: arrival.fare ?? fareService.getFare(operator, arrival.route, arrival.direction, arrival.destination),
    }))
    const result = await (force ? this.cache.force(key, loader, ETA_POLICY) : this.cache.get(key, loader, ETA_POLICY))
    return { ...result, data: result.data.filter((arrival) => isCurrentEta(arrival.etaTime)) }
  }

  async getStopArrivals(operator: InternalOperator, stopId: string, force = false) {
    const adapter = this.getAdapter(operator)
    if (!adapter.getStopArrivals) throw new Error('此資料來源不支援整站到站時間。')
    const key = `stop-eta:${operator}:${stopId}`
    const loader = async () => (await adapter.getStopArrivals!(stopId)).map((arrival) => ({
      ...arrival,
      fare: arrival.fare ?? fareService.getFare(operator, arrival.route, arrival.direction, arrival.destination),
    }))
    const result = await (force ? this.cache.force(key, loader, ETA_POLICY) : this.cache.get(key, loader, ETA_POLICY))
    return { ...result, data: result.data.filter((arrival) => isCurrentEta(arrival.etaTime)) }
  }

  clearCache() {
    this.cache.clear()
  }

  private getAdapter(operator: InternalOperator) {
    const adapter = this.adapters.get(operator)
    if (!adapter) throw new Error('找不到指定的巴士資料轉接器。')
    return adapter
  }

  private getOperatorStops(operator: InternalOperator) {
    return this.cache.get(
      `stops:${operator}`,
      async () => {
        const stored = this.database.getOperatorStops(operator)
        if (stored.length) return stored
        const downloaded = await this.getAdapter(operator).getStops()
        if (downloaded.length) this.database.replaceOperatorStops(operator, downloaded)
        return downloaded
      },
      STATIC_POLICY,
    )
  }
}

export const busDataService = new BusDataService()
