import { busDatabase } from '../database/bus-database.ts'
import type {
  AlternativeStop,
  BusArrival,
  BusDirection,
  BusStop,
  InternalOperator,
  NearbyBus,
  NearestRouteResult,
} from '../domain/bus.ts'
import { busDataService, type BusDataService } from './bus-data-service.ts'
import { fareService, type FareService } from './fare-service.ts'
import { sortByDistance, type Coordinate } from './geospatial.ts'

interface CitybusMembership {
  route: string
  direction: BusDirection
  destination: string
  serviceType: string
  sequence: number
}

interface CitybusIndexedStop extends Coordinate {
  stopId: string
  stopName: string
  routes: CitybusMembership[]
}

const NEARBY_STOP_LIMIT_PER_OPERATOR = 10
const CITYBUS_ETA_REQUEST_LIMIT = 64
const NEARBY_DISTANCE_METERS = 850
const NEARBY_FALLBACK_STOP_COUNT = 3
const NEARBY_ROUTE_RESULT_LIMIT = 60
const QUICK_STOP_LIMIT_PER_OPERATOR = 4
const QUICK_CITYBUS_ETA_REQUEST_LIMIT = 18
const QUICK_ROUTE_RESULT_LIMIT = 24
const NEAREST_ROUTE_DISTANCE_METERS = 850
const NEAREST_ROUTE_STOP_LIMIT = 6

export class NearbyBusService {
  constructor(private readonly data = busDataService, private readonly fares: FareService = fareService) {}

  async getNearby(origin: Coordinate, force = false, quick = false): Promise<NearbyBus[]> {
    const kmbStops = (await this.data.getStops()).data.filter((stop) => stop.internalOperator === 'kmb-lwb')
    const stopLimit = quick ? QUICK_STOP_LIMIT_PER_OPERATOR : NEARBY_STOP_LIMIT_PER_OPERATOR
    const nearbyKmb = this.pickNearby(origin, kmbStops, stopLimit)
    const nearbyCitybus = this.pickNearby(origin, busDatabase.getCitybusStops() as CitybusIndexedStop[], stopLimit)

    const kmbResults = await Promise.allSettled(
      nearbyKmb.map(async (stop) => ({ stop, arrivals: (await this.data.getStopArrivals('kmb-lwb', stop.stopId, force)).data })),
    )
    const rawCitybusCandidates = nearbyCitybus
      .flatMap((stop) => stop.routes.map((route) => ({ stop, route })))
      .sort((left, right) => left.stop.distanceMeters - right.stop.distanceMeters)
    const nearestCitybusRoute = new Map<string, (typeof rawCitybusCandidates)[number]>()
    for (const candidate of rawCitybusCandidates) {
      const key = `${candidate.route.route}:${candidate.route.destination}:${candidate.route.direction}`
      if (!nearestCitybusRoute.has(key)) nearestCitybusRoute.set(key, candidate)
    }
    const citybusRequestLimit = quick ? QUICK_CITYBUS_ETA_REQUEST_LIMIT : CITYBUS_ETA_REQUEST_LIMIT
    const citybusCandidates = [...nearestCitybusRoute.values()].slice(0, citybusRequestLimit)
    const citybusResults = await Promise.allSettled(
      citybusCandidates.map(async ({ stop, route }) => ({
        stop,
        route,
        arrivals: (await this.data.getArrivals('citybus', {
          route: route.route,
          stopId: stop.stopId,
          serviceType: route.serviceType,
        }, force)).data,
      })),
    )

    const candidates: NearbyBus[] = []
    for (const result of kmbResults) {
      if (result.status !== 'fulfilled') continue
      const groups = this.groupArrivals(result.value.arrivals)
      for (const arrivals of groups.values()) {
        const first = arrivals[0]
        if (!first.direction) continue
        candidates.push(this.toNearby(first, arrivals, result.value.stop.distanceMeters))
      }
    }
    for (const result of citybusResults) {
      if (result.status !== 'fulfilled') continue
      const arrivals = result.value.arrivals
        .filter((arrival) => arrival.direction === result.value.route.direction)
        .sort(this.compareEta)
      if (!arrivals.length) continue
      candidates.push(this.toNearby(arrivals[0], arrivals, result.value.stop.distanceMeters, result.value.route.direction))
    }

    const bestByRoute = new Map<string, NearbyBus>()
    for (const candidate of candidates) {
      const key = `${candidate.route}:${this.normalizePlace(candidate.destination)}:${candidate.direction}`
      const existing = bestByRoute.get(key)
      if (!existing || candidate.distanceMeters < existing.distanceMeters) bestByRoute.set(key, candidate)
    }
    return [...bestByRoute.values()].sort((left, right) => {
      const etaDifference = (left.arrivals[0]?.etaMinutes ?? Infinity) - (right.arrivals[0]?.etaMinutes ?? Infinity)
      return etaDifference || left.distanceMeters - right.distanceMeters
    }).slice(0, quick ? QUICK_ROUTE_RESULT_LIMIT : NEARBY_ROUTE_RESULT_LIMIT)
  }

  async getNearestRoute(
    origin: Coordinate,
    operator: InternalOperator,
    route: string,
    direction: BusDirection,
    serviceType: string,
    force = false,
  ): Promise<NearestRouteResult> {
    const routeStops = (await this.data.getRouteStops(operator, { route, direction, serviceType })).data
    const nearest = sortByDistance(origin, routeStops)
    const nearbyCandidates = nearest
      .filter((stop) => stop.distanceMeters <= NEAREST_ROUTE_DISTANCE_METERS)
      .slice(0, NEAREST_ROUTE_STOP_LIMIT)
    let selected: { stop: (typeof nearest)[number]; arrivals: BusArrival[] } | null = null
    const batchSize = NEAREST_ROUTE_STOP_LIMIT
    for (let index = 0; index < nearbyCandidates.length && !selected; index += batchSize) {
      const batch = nearbyCandidates.slice(index, index + batchSize)
      const etaResults = await Promise.allSettled(
        batch.map(async (stop) => ({
          stop,
          arrivals: (await this.data.getArrivals(operator, { route, stopId: stop.stopId, serviceType }, force)).data
            .filter((arrival) => arrival.direction === direction)
            .sort(this.compareEta),
        })),
      )
      const available = etaResults.flatMap((result) =>
        result.status === 'fulfilled' && result.value.arrivals.length > 0 ? [result.value] : [],
      )
        .sort((left, right) => left.stop.distanceMeters - right.stop.distanceMeters)
      selected = available[0] ?? null
    }
    const routeInfo = (await this.data.getRoutes()).data.find(
      (item) => item.internalOperator === operator && item.route === route && item.direction === direction && item.serviceType === serviceType,
    )

    if (selected) {
      return {
        route,
        destination: selected.arrivals[0].destination || routeInfo?.destination || '',
        direction,
        serviceType,
        selectedStop: selected.stop,
        arrivals: selected.arrivals.slice(0, 3),
        fare: selected.arrivals[0].fare ?? this.fares.getFare(operator, route, direction, selected.arrivals[0].destination),
        updatedAt: selected.arrivals[0].updatedAt,
        alternatives: [],
        routeStops,
        internalOperator: operator,
      }
    }

    return {
      route,
      destination: routeInfo?.destination || '',
      direction,
      serviceType,
      selectedStop: null,
      arrivals: [],
      fare: null,
      updatedAt: null,
      alternatives: nearest.slice(0, 3),
      routeStops,
      internalOperator: operator,
    }
  }

  private pickNearby<T extends Coordinate>(origin: Coordinate, stops: T[], limit = NEARBY_STOP_LIMIT_PER_OPERATOR) {
    const sorted = sortByDistance(origin, stops)
    const withinRange = sorted.filter((stop) => stop.distanceMeters <= NEARBY_DISTANCE_METERS)
    return (withinRange.length ? withinRange : sorted.slice(0, NEARBY_FALLBACK_STOP_COUNT)).slice(0, limit)
  }

  private groupArrivals(arrivals: BusArrival[]) {
    const groups = new Map<string, BusArrival[]>()
    for (const arrival of arrivals) {
      if (!arrival.direction) continue
      const key = `${arrival.route}:${arrival.destination}:${arrival.direction}:${arrival.serviceType}`
      const group = groups.get(key) ?? []
      group.push(arrival)
      groups.set(key, group)
    }
    for (const group of groups.values()) group.sort(this.compareEta)
    return groups
  }

  private toNearby(
    first: BusArrival,
    arrivals: BusArrival[],
    distance: number,
    direction = first.direction as BusDirection,
  ): NearbyBus {
    return {
      route: first.route,
      destination: first.destination,
      stopName: first.stopName,
      stopId: first.stopId,
      latitude: first.latitude,
      longitude: first.longitude,
      distanceMeters: distance,
      fare: first.fare ?? this.fares.getFare(first.internalOperator, first.route, direction, first.destination),
      arrivals: arrivals.slice(0, 2),
      serviceAlert: first.serviceAlert,
      updatedAt: first.updatedAt,
      internalOperator: first.internalOperator,
      direction,
      serviceType: first.serviceType,
    }
  }

  private compareEta(left: BusArrival, right: BusArrival) {
    return Date.parse(left.etaTime) - Date.parse(right.etaTime)
  }

  private normalizePlace(value: string) {
    return value.replace(/[\s()（）]/g, '').toUpperCase()
  }
}

export const nearbyBusService = new NearbyBusService()
