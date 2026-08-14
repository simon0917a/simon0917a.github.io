import type { NearbyBus, Position } from '../types/bus'

export const NEARBY_CACHE_KEY = '香港巴士最後成功附近資料'
const MAX_CACHE_AGE = 24 * 60 * 60 * 1_000

export interface NearbyCache {
  buses: NearbyBus[]
  savedAt: string
  position: Position
}

function distanceMeters(a: Position, b: Position) {
  const toRadians = (value: number) => value * Math.PI / 180
  const latitudeDelta = toRadians(b.latitude - a.latitude)
  const longitudeDelta = toRadians(b.longitude - a.longitude)
  const firstLatitude = toRadians(a.latitude)
  const secondLatitude = toRadians(b.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine))
}

export function readNearbyCache(value: string | null, position: Position, now = Date.now()): NearbyCache | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<NearbyCache>
    if (!Array.isArray(parsed.buses) || typeof parsed.savedAt !== 'string' || !parsed.position) return null
    const savedAt = Date.parse(parsed.savedAt)
    if (!Number.isFinite(savedAt) || now - savedAt > MAX_CACHE_AGE) return null
    if (distanceMeters(position, parsed.position) > 1_000) return null
    return { buses: parsed.buses as NearbyBus[], savedAt: parsed.savedAt, position: parsed.position }
  } catch {
    return null
  }
}

export function createNearbyCache(buses: NearbyBus[], position: Position, savedAt = new Date().toISOString()): NearbyCache {
  return { buses, position, savedAt }
}
