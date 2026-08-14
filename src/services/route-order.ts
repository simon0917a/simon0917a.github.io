import type { NearbyBus } from '../types/bus'

const routeCollator = new Intl.Collator('en-HK', {
  numeric: true,
  sensitivity: 'base',
})

/** Natural Hong Kong route order: 1, 1A, 2, 10, 91, 91M, A10… */
export function compareRouteNames(left: string, right: string) {
  return routeCollator.compare(left.trim(), right.trim())
}

export function sortNearbyBuses(buses: NearbyBus[]) {
  return [...buses].sort((left, right) =>
    compareRouteNames(left.route, right.route)
    || left.destination.localeCompare(right.destination, 'zh-HK')
    || left.direction.localeCompare(right.direction)
    || left.internalOperator.localeCompare(right.internalOperator),
  )
}
