import type { BusDirection, BusRoute, BusStop, InternalOperator, RouteStop } from '../domain/bus.ts'
import {
  busDatabase,
  type BusDatabase,
  type CitybusDatabaseMembership,
  type CitybusDatabaseStop,
  type FareDatabaseRecord,
} from '../database/bus-database.ts'
import { busDataService, type BusDataService } from './bus-data-service.ts'
import { routeGeometryService, type RouteGeometryService } from './route-geometry-service.ts'

const FARE_SOURCE = 'https://static.data.gov.hk/td/routes-fares-geojson/JSON_BUS.json'
const KMB_BASE_URL = 'https://data.etabus.gov.hk/v1/transport/kmb'
const CITYBUS_BASE_URL = 'https://rt.data.gov.hk/v2/transport/citybus'
const CITYBUS_COMPANY = 'CTB'
const CONCURRENCY = 20

type UpdateState = 'idle' | 'running' | 'complete' | 'failed'

export interface DatabaseUpdateStatus {
  state: UpdateState
  phase: string
  message: string
  progress: number
  startedAt: string | null
  completedAt: string | null
  error: string | null
  stats: ReturnType<BusDatabase['getStats']>
}

interface ApiEnvelope<T> { data: T }
interface KmbRoute { route: string; bound: string; service_type: string; orig_tc: string; dest_tc: string }
interface KmbStop { stop: string; name_tc: string; lat: string; long: string }
interface KmbRouteStop { route: string; bound: string; service_type: string; seq: number; stop: string }
interface CitybusRouteResponse { data: Array<{ route: string; orig_tc: string; dest_tc: string }> }
interface CitybusRouteStopResponse { data: Array<{ route?: string; dir?: string; stop: string; seq: number }> }
interface CitybusStopResponse { data: { stop: string; name_tc: string; lat: string; long: string } }
interface FareCollection { features?: Array<{ properties?: Record<string, unknown> }> }

interface DownloadedNetwork {
  routes: BusRoute[]
  stops: BusStop[]
  routeStops: RouteStop[]
  citybusIndex?: CitybusDatabaseStop[]
}

async function fetchOfficialJson<T>(url: string, timeoutMs = 120_000): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`官方資料服務回傳 HTTP ${response.status}`)
  return response.json() as Promise<T>
}

async function mapLimit<T, R>(items: T[], mapper: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, items.length)) }, worker))
  return results
}

function directionFromCode(value: string): BusDirection | null {
  const normalized = value.trim().toUpperCase()
  if (normalized === 'O' || normalized === 'OUTBOUND') return 'outbound'
  if (normalized === 'I' || normalized === 'INBOUND') return 'inbound'
  return null
}

export function parseFareCollection(collection: FareCollection): FareDatabaseRecord[] {
  const supportedCompanies = new Set(['KMB', 'LWB', 'CTB', 'KMB+CTB', 'LWB+CTB'])
  const routeDirections = new Map<string, FareDatabaseRecord>()
  for (const feature of collection.features ?? []) {
    const item = feature.properties ?? {}
    const companyCode = String(item.companyCode ?? '')
    const fare = Number(item.fullFare)
    const routeSequence = Number(item.routeSeq)
    if (!supportedCompanies.has(companyCode) || !Number.isFinite(fare) || (routeSequence !== 1 && routeSequence !== 2)) continue
    const route = String(item.routeNameC ?? '').trim().toUpperCase()
    if (!route) continue
    const sourceRouteId = String(item.routeId ?? '').trim()
    const key = `${sourceRouteId || `${route}:${companyCode}:${item.serviceMode ?? ''}:${item.specialType ?? ''}`}:${routeSequence}`
    if (routeDirections.has(key)) continue
    routeDirections.set(key, {
      route,
      direction: routeSequence === 1 ? 'outbound' : 'inbound',
      destination: String(routeSequence === 1 ? item.locEndNameC : item.locStartNameC).trim(),
      fare,
      companies: companyCode.split('+'),
      serviceMode: String(item.serviceMode ?? ''),
      special: Number(item.specialType ?? 0) !== 0,
      updatedAt: String(item.lastUpdateDate ?? ''),
    })
  }
  return [...routeDirections.values()]
}

export class DatabaseUpdateService {
  private status: Omit<DatabaseUpdateStatus, 'stats'> = {
    state: 'idle', phase: 'ready', message: '資料庫已準備好。', progress: 0,
    startedAt: null, completedAt: null, error: null,
  }
  private pending: Promise<void> | null = null

  constructor(
    private readonly database: BusDatabase = busDatabase,
    private readonly busData: BusDataService = busDataService,
    private readonly geometries: RouteGeometryService = routeGeometryService,
  ) {}

  getStatus(): DatabaseUpdateStatus {
    return { ...this.status, stats: this.database.getStats() }
  }

  start() {
    if (this.pending) return this.getStatus()
    const startedAt = new Date().toISOString()
    this.status = {
      state: 'running', phase: 'fares', message: '正在下載運輸署車費資料…', progress: 2,
      startedAt, completedAt: null, error: null,
    }
    this.pending = this.run().finally(() => { this.pending = null })
    return this.getStatus()
  }

  private async run() {
    try {
      const fareCollection = await fetchOfficialJson<FareCollection>(FARE_SOURCE, 180_000)
      const fares = parseFareCollection(fareCollection)
      if (fares.length < 1_000) throw new Error('下載的車費資料筆數不合理，已保留原有資料。')
      this.database.replaceFares(fares, FARE_SOURCE, new Date().toISOString())

      this.update('kmb-network', '正在下載九巴及龍運路線、車站與站序…', 20)
      const kmb = await this.downloadKmbNetwork()
      this.validateNetwork('九巴及龍運', kmb, { routes: 500, stops: 3_000, routeStops: 10_000 })

      this.update('citybus-network', '正在下載城巴路線及站序…', 48)
      const citybus = await this.downloadCitybusNetwork()
      this.validateNetwork('城巴', citybus, { routes: 300, stops: 1_000, routeStops: 5_000 })

      const generatedAt = new Date().toISOString()
      this.update('database', '正在驗證並寫入最新巴士資料…', 83)
      this.database.replaceNetwork(
        [...kmb.routes, ...citybus.routes],
        [
          { operator: 'kmb-lwb', stops: kmb.stops, routeStops: kmb.routeStops },
          { operator: 'citybus', stops: citybus.stops, routeStops: citybus.routeStops },
        ],
        generatedAt,
      )
      this.database.replaceCitybusNetwork(citybus.citybusIndex ?? [], `${CITYBUS_BASE_URL}/route/${CITYBUS_COMPANY}`, generatedAt)
      this.busData.clearCache()

      this.update('geometry', '正在更新已儲存的官方路線線形…', 90)
      await this.refreshStoredGeometries()
      this.status = {
        ...this.status,
        state: 'complete', phase: 'complete', message: '官方資料已更新並寫入資料庫。', progress: 100,
        completedAt: new Date().toISOString(), error: null,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新官方資料時發生錯誤。'
      this.status = {
        ...this.status,
        state: 'failed',
        message: '更新未能完成；未成功替換的資料仍保留原有版本。',
        completedAt: new Date().toISOString(), error: message,
      }
    }
  }

  private async downloadKmbNetwork(): Promise<DownloadedNetwork> {
    const [routeResponse, stopResponse, routeStopResponse] = await Promise.all([
      fetchOfficialJson<ApiEnvelope<KmbRoute[]>>(`${KMB_BASE_URL}/route/`, 120_000),
      fetchOfficialJson<ApiEnvelope<KmbStop[]>>(`${KMB_BASE_URL}/stop`, 120_000),
      fetchOfficialJson<ApiEnvelope<KmbRouteStop[]>>(`${KMB_BASE_URL}/route-stop`, 180_000),
    ])
    const routes = routeResponse.data.flatMap((item): BusRoute[] => {
      const direction = directionFromCode(item.bound)
      return direction ? [{
        route: item.route, origin: item.orig_tc.trim(), destination: item.dest_tc.trim(), direction,
        serviceType: String(item.service_type), internalOperator: 'kmb-lwb',
      }] : []
    })
    const stops = stopResponse.data.map((item): BusStop => ({
      stopId: item.stop, stopName: item.name_tc.trim(), latitude: Number(item.lat), longitude: Number(item.long),
      internalOperator: 'kmb-lwb',
    })).filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
    const stopIndex = new Map(stops.map((stop) => [stop.stopId, stop]))
    const routeStops = routeStopResponse.data.flatMap((item): RouteStop[] => {
      const stop = stopIndex.get(item.stop)
      const direction = directionFromCode(item.bound)
      return stop && direction ? [{
        ...stop, route: item.route, direction, serviceType: String(item.service_type), sequence: Number(item.seq),
      }] : []
    })
    return { routes, stops, routeStops }
  }

  private async downloadCitybusNetwork(): Promise<DownloadedNetwork> {
    const existingStops = new Map(this.database.getCitybusStops().map((stop) => [stop.stopId, stop]))
    const routeResponse = await fetchOfficialJson<CitybusRouteResponse>(`${CITYBUS_BASE_URL}/route/${CITYBUS_COMPANY}`)
    const routes = routeResponse.data.flatMap((route): BusRoute[] => [
      { route: route.route, origin: route.orig_tc.trim(), destination: route.dest_tc.trim(), direction: 'outbound', serviceType: '1', internalOperator: 'citybus' },
      { route: route.route, origin: route.dest_tc.trim(), destination: route.orig_tc.trim(), direction: 'inbound', serviceType: '1', internalOperator: 'citybus' },
    ])
    const directions = routes.map((route) => ({
      route: route.route, direction: route.direction, destination: route.destination, serviceType: route.serviceType,
    }))
    const routeGroups = (await mapLimit(directions, async (entry, index) => {
      if (index % 30 === 0) {
        const progress = 48 + Math.round((index / Math.max(1, directions.length)) * 17)
        this.update('citybus-network', `正在下載城巴站序 ${index}/${directions.length}…`, progress)
      }
      try {
        const response = await fetchOfficialJson<CitybusRouteStopResponse>(
          `${CITYBUS_BASE_URL}/route-stop/${CITYBUS_COMPANY}/${encodeURIComponent(entry.route)}/${entry.direction}`,
          30_000,
        )
        return response.data.map((item) => ({
          stopId: item.stop,
          membership: {
            route: entry.route, direction: directionFromCode(item.dir ?? '') ?? entry.direction,
            destination: entry.destination, serviceType: entry.serviceType, sequence: Number(item.seq),
          } satisfies CitybusDatabaseMembership,
        }))
      } catch {
        return []
      }
    })).flat()

    const memberships = new Map<string, CitybusDatabaseMembership[]>()
    for (const item of routeGroups) {
      const group = memberships.get(item.stopId) ?? []
      group.push(item.membership)
      memberships.set(item.stopId, group)
    }
    const stopIds = [...memberships.keys()]
    const citybusIndex = await mapLimit(stopIds, async (stopId, index) => {
      if (index % 50 === 0) {
        const progress = 65 + Math.round((index / Math.max(1, stopIds.length)) * 17)
        this.update('citybus-network', `正在下載城巴車站 ${index}/${stopIds.length}…`, progress)
      }
      try {
        const response = await fetchOfficialJson<CitybusStopResponse>(`${CITYBUS_BASE_URL}/stop/${encodeURIComponent(stopId)}`, 30_000)
        return {
          stopId: response.data.stop, stopName: response.data.name_tc.trim(),
          latitude: Number(response.data.lat), longitude: Number(response.data.long), routes: memberships.get(stopId) ?? [],
        } satisfies CitybusDatabaseStop
      } catch (error) {
        const existing = existingStops.get(stopId)
        if (!existing) throw error
        return { ...existing, routes: memberships.get(stopId) ?? [] }
      }
    })
    const stops = citybusIndex.map((item): BusStop => ({
      stopId: item.stopId, stopName: item.stopName, latitude: item.latitude, longitude: item.longitude,
      internalOperator: 'citybus',
    }))
    const stopIndex = new Map(stops.map((stop) => [stop.stopId, stop]))
    const routeStops = routeGroups.flatMap((item): RouteStop[] => {
      const stop = stopIndex.get(item.stopId)
      return stop ? [{
        ...stop, route: item.membership.route, direction: item.membership.direction,
        serviceType: item.membership.serviceType, sequence: item.membership.sequence,
      }] : []
    })
    return { routes, stops, routeStops, citybusIndex }
  }

  private validateNetwork(
    label: string,
    network: DownloadedNetwork,
    minimum: { routes: number; stops: number; routeStops: number },
  ) {
    if (
      network.routes.length < minimum.routes ||
      network.stops.length < minimum.stops ||
      network.routeStops.length < minimum.routeStops
    ) {
      throw new Error(`${label}官方資料筆數不合理，已保留原有資料。`)
    }
  }

  private async refreshStoredGeometries() {
    const stored = this.database.listStoredRouteGeometries()
    for (let index = 0; index < stored.length; index += 1) {
      const item = stored[index]
      const progress = 90 + Math.round(((index + 1) / Math.max(1, stored.length)) * 9)
      this.update('geometry', `正在更新官方路線線形 ${index + 1}/${stored.length}…`, progress)
      try {
        const stops = (await this.busData.getRouteStops(item.operator, {
          route: item.route, direction: item.direction, serviceType: '1',
        })).data as RouteStop[]
        await this.geometries.getGeometry(item.operator, item.route, item.direction, stops, true)
      } catch {
        // Individual failures retain the previously stored geometry.
      }
    }
  }

  private update(phase: string, message: string, progress: number) {
    this.status = { ...this.status, phase, message, progress: Math.max(this.status.progress, progress) }
  }
}

export const databaseUpdateService = new DatabaseUpdateService()
