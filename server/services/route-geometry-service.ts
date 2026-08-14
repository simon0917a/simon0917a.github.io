import type { BusDirection, InternalOperator, RouteGeometry, RouteStop } from '../domain/bus.ts'
import { busDatabase, type BusDatabase } from '../database/bus-database.ts'
import { fetchJson } from '../infrastructure/fetch-json.ts'
import { SwrCache, type CachePolicy } from '../infrastructure/swr-cache.ts'
import { distanceMeters } from './geospatial.ts'

const CSDI_ROUTE_QUERY_URL =
  'https://portal.csdi.gov.hk/server/rest/services/common/td_rcd_1638844988873_41214/MapServer/0/query'
const DAY = 24 * 60 * 60 * 1_000
const GEOMETRY_POLICY: CachePolicy = { freshForMs: 14 * DAY, staleForMs: 45 * DAY }

export interface CsdiRouteFeature {
  geometry?: {
    type?: string
    coordinates?: unknown
  }
  properties?: {
    ROUTE_ID?: number
    ROUTE_SEQ?: number
    COMPANY_CODE?: string
    ROUTE_NAMEE?: string
  }
}

interface CsdiRouteCollection {
  features?: CsdiRouteFeature[]
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 &&
    Number.isFinite(value[0]) && Number.isFinite(value[1])
}

function normalizeGeometry(feature: CsdiRouteFeature): RouteGeometry {
  const coordinates = feature.geometry?.coordinates
  if (!Array.isArray(coordinates)) return []
  const paths = feature.geometry?.type === 'LineString' ? [coordinates] : coordinates
  return paths.flatMap((path) => {
    if (!Array.isArray(path)) return []
    const valid = path.filter(isCoordinate).map(([longitude, latitude]) => [longitude, latitude] as [number, number])
    return valid.length >= 2 ? [valid] : []
  })
}

function companyMatches(operator: InternalOperator, companyCode = '') {
  const companies = companyCode.toUpperCase().split('+')
  return operator === 'citybus' ? companies.includes('CTB') : companies.some((company) => company === 'KMB' || company === 'LWB')
}

function endpointScore(geometry: RouteGeometry, stops: RouteStop[]) {
  const firstPath = geometry[0]
  const lastPath = geometry[geometry.length - 1]
  if (!firstPath?.length || !lastPath?.length || !stops.length) return Number.POSITIVE_INFINITY
  const first = firstPath[0]
  const last = lastPath[lastPath.length - 1]
  const startStop = stops[0]
  const endStop = stops[stops.length - 1]
  const forward = distanceMeters(
    { latitude: startStop.latitude, longitude: startStop.longitude },
    { latitude: first[1], longitude: first[0] },
  ) + distanceMeters(
    { latitude: endStop.latitude, longitude: endStop.longitude },
    { latitude: last[1], longitude: last[0] },
  )
  const reverse = distanceMeters(
    { latitude: startStop.latitude, longitude: startStop.longitude },
    { latitude: last[1], longitude: last[0] },
  ) + distanceMeters(
    { latitude: endStop.latitude, longitude: endStop.longitude },
    { latitude: first[1], longitude: first[0] },
  )
  return Math.min(forward, reverse)
}

export function selectBestRouteGeometry(
  features: CsdiRouteFeature[], operator: InternalOperator, stops: RouteStop[],
): RouteGeometry {
  const matchingCompany = features.filter((feature) => companyMatches(operator, feature.properties?.COMPANY_CODE))
  const candidates = matchingCompany.length ? matchingCompany : features
  return candidates
    .map((feature) => ({ geometry: normalizeGeometry(feature), feature }))
    .filter((candidate) => candidate.geometry.length)
    .sort((left, right) => endpointScore(left.geometry, stops) - endpointScore(right.geometry, stops))[0]?.geometry ?? []
}

export class RouteGeometryService {
  constructor(private readonly cache = new SwrCache(), private readonly database: BusDatabase = busDatabase) {}

  getGeometry(
    operator: InternalOperator,
    route: string,
    direction: BusDirection,
    stops: RouteStop[],
    force = false,
  ) {
    const stored = this.database.getRouteGeometry(operator, route, direction)
    if (stored && !force) {
      const updatedAt = new Date(stored.updatedAt).getTime()
      return Promise.resolve({
        data: stored.geometry,
        cache: {
          state: 'fresh' as const,
          isStale: false,
          updatedAt: stored.updatedAt,
          expiresAt: new Date(updatedAt + 14 * DAY).toISOString(),
        },
      })
    }
    const routeSequence = direction === 'outbound' ? 1 : 2
    const key = `route-geometry:${operator}:${route}:${routeSequence}`
    return this.cache.get<RouteGeometry>(key, async () => {
      const parameters = new URLSearchParams({
        where: `ROUTE_NAMEE = '${route}' AND ROUTE_SEQ = ${routeSequence}`,
        outFields: 'ROUTE_ID,ROUTE_SEQ,COMPANY_CODE,ROUTE_NAMEE',
        returnGeometry: 'true',
        outSR: '4326',
        geometryPrecision: '6',
        maxAllowableOffset: '0.00001',
        resultRecordCount: '20',
        f: 'geojson',
      })
      const collection = await fetchJson<CsdiRouteCollection>(`${CSDI_ROUTE_QUERY_URL}?${parameters.toString()}`, 12_000)
      const geometry = selectBestRouteGeometry(collection.features ?? [], operator, stops)
      if (geometry.length) this.database.upsertRouteGeometry(operator, route, direction, geometry)
      return geometry
    }, GEOMETRY_POLICY)
  }
}

export const routeGeometryService = new RouteGeometryService()
