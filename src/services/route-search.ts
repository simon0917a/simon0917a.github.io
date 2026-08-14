import type { BusRoute } from '../types/bus'

// 字母鍵按使用者熟悉的 A–Z 順序排列；輸入路線前綴後仍會動態停用不適用的按鈕。
export const ROUTE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'] as const
export const ROUTE_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const

function normalizePlace(value: string) {
  return value.replace(/[\s()（）]/g, '').toUpperCase()
}

export function filterRoutes(routes: BusRoute[], query: string, limit = 80) {
  const normalized = query.trim().toUpperCase()
  if (!normalized) return []

  const unique = new Map<string, BusRoute>()
  for (const route of routes) {
    if (!route.route.toUpperCase().startsWith(normalized)) continue
    const key = `${route.route}:${normalizePlace(route.destination)}:${route.direction}`
    if (!unique.has(key)) unique.set(key, route)
  }

  return [...unique.values()]
    .sort((left, right) => left.route.localeCompare(right.route, 'zh-HK', { numeric: true }) || left.destination.localeCompare(right.destination, 'zh-HK'))
    .slice(0, limit)
}

export function availableRouteLetters(routes: BusRoute[], query: string) {
  const normalized = query.trim().toUpperCase()
  if (!normalized) return [...ROUTE_LETTERS]

  const available = new Set<string>()
  for (const route of routes) {
    const routeNumber = route.route.trim().toUpperCase()
    if (!routeNumber.startsWith(normalized)) continue
    const nextCharacter = routeNumber.charAt(normalized.length)
    if (/^[A-Z]$/.test(nextCharacter)) available.add(nextCharacter)
  }
  return ROUTE_LETTERS.filter((letter) => available.has(letter))
}
