import type { BusArrival, BusDirection, BusRoute, BusServiceAlert, DatabaseUpdateStatus, InternalOperator, NearbyBus, NearestRouteResult, Position, RouteGeometry } from '../types/bus'

interface ApiPayload<T> {
  data: T
  error?: string
}

export class BusApiError extends Error {}

const POSITION_CACHE_MS = 10 * 60_000
let cachedPosition: { value: Position; savedAt: number } | null = null
let pendingPosition: Promise<Position> | null = null

async function request<T>(parameters: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/bus?${parameters.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  const payload = (await response.json()) as ApiPayload<T>
  if (!response.ok) throw new BusApiError(payload.error || '暫時無法取得巴士資料。')
  return payload.data
}

export function getNearbyBuses(position: Position, signal?: AbortSignal, force = false, quick = false) {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('testOffline') === '1') {
    return Promise.reject(new BusApiError('目前沒有網絡連線。'))
  }
  return request<NearbyBus[]>(new URLSearchParams({
    action: 'nearby',
    latitude: String(position.latitude),
    longitude: String(position.longitude),
    ...(force ? { refresh: '1' } : {}),
    ...(quick ? { quick: '1' } : {}),
  }), signal)
}

export function getRoutes(signal?: AbortSignal) {
  return request<BusRoute[]>(new URLSearchParams({ action: 'routes' }), signal)
}

export function getRouteStops(
  route: string,
  direction: BusDirection,
  serviceType: string,
  internalOperator: InternalOperator,
  signal?: AbortSignal,
) {
  return request<import('../types/bus').RouteStop[]>(new URLSearchParams({
    action: 'routeStops', route, direction, serviceType, operator: internalOperator,
  }), signal)
}

export function getRouteGeometry(
  route: string,
  direction: BusDirection,
  serviceType: string,
  internalOperator: InternalOperator,
  signal?: AbortSignal,
) {
  return request<RouteGeometry>(new URLSearchParams({
    action: 'routeGeometry', route, direction, serviceType, operator: internalOperator,
  }), signal)
}

export function getServiceAlerts(signal?: AbortSignal) {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('testAlerts') === '1') {
    const now = Date.now()
    return Promise.resolve<BusServiceAlert[]>([
      {
        id: '測試-18X', routeLabel: '18X', title: '路線改道測試消息',
        summary: '只供開發驗收通知中心，不會出現在正式版本。', updatedAt: new Date(now).toISOString(),
        priority: 'favorite',
        relatedRoute: { route: '18X', destination: '筲箕灣', direction: 'outbound', serviceType: '1', internalOperator: 'citybus' },
      },
      {
        id: '測試-附近站', routeLabel: '中環附近巴士站', title: '巴士站遷移測試消息',
        summary: '驗證附近車站消息排序及未讀紅點。', updatedAt: new Date(now - 60_000).toISOString(),
        priority: 'nearby', relatedRoute: null,
      },
      {
        id: '測試-特別服務', routeLabel: '特別服務', title: '特別服務安排測試消息',
        summary: '驗證其他巴士服務消息排序。', updatedAt: new Date(now - 120_000).toISOString(),
        priority: 'other', relatedRoute: null,
      },
    ])
  }
  return request<BusServiceAlert[]>(new URLSearchParams({ action: 'alerts' }), signal)
}

export function getDatabaseStatus(signal?: AbortSignal) {
  return request<DatabaseUpdateStatus>(new URLSearchParams({ action: 'databaseStatus' }), signal)
}

export function updateDatabase(signal?: AbortSignal) {
  return fetch('/api/bus?action=updateDatabase', {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Bus-Data-Update': 'requested-by-app' },
    signal,
  }).then(async (response) => {
    const payload = (await response.json()) as ApiPayload<DatabaseUpdateStatus>
    if (!response.ok) throw new BusApiError(payload.error || '暫時無法開始更新資料庫。')
    return payload.data
  })
}

export function getNearestRoute(
  position: Position,
  route: string,
  direction: BusDirection,
  serviceType: string,
  internalOperator: InternalOperator,
  signal?: AbortSignal,
  force = false,
) {
  return request<NearestRouteResult>(new URLSearchParams({
    action: 'nearestRoute',
    latitude: String(position.latitude),
    longitude: String(position.longitude),
    route,
    direction,
    serviceType,
    operator: internalOperator,
    ...(force ? { refresh: '1' } : {}),
  }), signal)
}

export function getRouteArrivals(
  route: string,
  stopId: string,
  serviceType: string,
  internalOperator: InternalOperator,
  signal?: AbortSignal,
) {
  return request<BusArrival[]>(new URLSearchParams({
    action: 'eta', route, stopId, serviceType, operator: internalOperator,
  }), signal)
}

export function getCurrentPosition(): Promise<Position> {
  if (import.meta.env.DEV) {
    const testLocation = new URLSearchParams(window.location.search).get('testLocation')
    if (testLocation === 'central') return Promise.resolve({ latitude: 22.288274, longitude: 114.150422 })
    if (testLocation === 'denied') return Promise.reject(new Error('定位未獲授權。'))
    if (testLocation === 'loading') return new Promise<Position>(() => undefined)
  }

  if (cachedPosition && Date.now() - cachedPosition.savedAt < POSITION_CACHE_MS) {
    return Promise.resolve(cachedPosition.value)
  }
  if (pendingPosition) return pendingPosition

  const positionRequest = new Promise<Position>((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('此瀏覽器不支援定位。'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const value = { latitude: coords.latitude, longitude: coords.longitude }
        cachedPosition = { value, savedAt: Date.now() }
        resolve(value)
      },
      reject,
      { enableHighAccuracy: false, timeout: 6_000, maximumAge: 10 * 60_000 },
    )
  }).finally(() => { pendingPosition = null })
  pendingPosition = positionRequest
  return positionRequest
}
