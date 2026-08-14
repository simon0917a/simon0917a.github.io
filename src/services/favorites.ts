import type { FavoriteRoute, RouteSelection } from '../types/bus'

export const FAVORITES_STORAGE_KEY = '香港巴士收藏路線'

export function favoriteId(route: RouteSelection) {
  return [route.internalOperator, route.route, route.direction, route.serviceType, route.destination].join('|')
}

export function toFavorite(route: RouteSelection): FavoriteRoute {
  return { ...route, id: favoriteId(route) }
}

export function parseFavorites(value: string | null): FavoriteRoute[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is FavoriteRoute => {
      if (!item || typeof item !== 'object') return false
      const route = item as Partial<FavoriteRoute>
      return typeof route.id === 'string' && typeof route.route === 'string' &&
        typeof route.destination === 'string' &&
        (route.direction === 'outbound' || route.direction === 'inbound') &&
        typeof route.serviceType === 'string' &&
        (route.internalOperator === 'kmb-lwb' || route.internalOperator === 'citybus')
    })
  } catch {
    return []
  }
}

export function moveFavorite(items: FavoriteRoute[], index: number, offset: -1 | 1) {
  const target = index + offset
  if (target < 0 || target >= items.length) return items
  const reordered = [...items]
  const [item] = reordered.splice(index, 1)
  reordered.splice(target, 0, item)
  return reordered
}
