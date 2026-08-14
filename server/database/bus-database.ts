import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import fareSeed from '../data/bus-fares.json' with { type: 'json' }
import citybusSeed from '../data/citybus-network.json' with { type: 'json' }
import type { BusDirection, BusRoute, BusStop, InternalOperator, RouteGeometry, RouteStop } from '../domain/bus.ts'

export interface FareDatabaseRecord {
  route: string
  direction: BusDirection
  destination: string
  fare: number
  companies: string[]
  serviceMode: string
  special: boolean
  updatedAt: string
}

export interface CitybusDatabaseMembership {
  route: string
  direction: BusDirection
  destination: string
  serviceType: string
  sequence: number
}

export interface CitybusDatabaseStop {
  stopId: string
  stopName: string
  latitude: number
  longitude: number
  routes: CitybusDatabaseMembership[]
}

export interface StoredRouteGeometry {
  operator: InternalOperator
  route: string
  direction: BusDirection
  geometry: RouteGeometry
  updatedAt: string
}

export interface BusDatabaseStats {
  fares: number
  citybusStops: number
  citybusMemberships: number
  routeGeometries: number
  operatorRoutes: number
  operatorStops: number
  operatorRouteStops: number
  fareUpdatedAt: string | null
  citybusUpdatedAt: string | null
  geometryUpdatedAt: string | null
  networkUpdatedAt: string | null
}

export interface OperatorNetworkDataset {
  operator: InternalOperator
  stops: BusStop[]
  routeStops: RouteStop[]
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const defaultDatabasePath = resolve(moduleDirectory, '../data/bus-data.sqlite')
const databasePath = process.env.BUS_DATABASE_PATH || defaultDatabasePath
mkdirSync(dirname(databasePath), { recursive: true })

function scalarNumber(value: unknown) {
  return Number((value as { count?: number | bigint } | undefined)?.count ?? 0)
}

export class BusDatabase {
  readonly path: string
  private readonly database: DatabaseSync
  private citybusCache: CitybusDatabaseStop[] | null = null

  constructor(path = databasePath) {
    this.path = path
    mkdirSync(dirname(path), { recursive: true })
    this.database = new DatabaseSync(path)
    this.database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    this.createSchema()
    this.seedWhenEmpty()
  }

  close() {
    this.database.close()
  }

  getFareRecords(route: string, directions: BusDirection[]) {
    const placeholders = directions.map(() => '?').join(', ')
    return this.database.prepare(`
      SELECT route, direction, destination, fare, companies, service_mode, special, updated_at
      FROM fares
      WHERE route = ? AND direction IN (${placeholders})
    `).all(route, ...directions) as unknown as Array<{
      route: string
      direction: BusDirection
      destination: string
      fare: number
      companies: string
      service_mode: string
      special: number
      updated_at: string
    }>
  }

  replaceFares(records: FareDatabaseRecord[], source: string, generatedAt: string) {
    const insert = this.database.prepare(`
      INSERT INTO fares (route, direction, destination, fare, companies, service_mode, special, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    this.transaction(() => {
      this.database.exec('DELETE FROM fares')
      for (const record of records) {
        insert.run(
          record.route,
          record.direction,
          record.destination,
          record.fare,
          JSON.stringify(record.companies),
          record.serviceMode,
          record.special ? 1 : 0,
          record.updatedAt,
        )
      }
      this.setMetadata('fares.source', source)
      this.setMetadata('fares.updatedAt', generatedAt)
    })
  }

  getCitybusStops(): CitybusDatabaseStop[] {
    if (this.citybusCache) return this.citybusCache
    const stops = this.database.prepare(`
      SELECT stop_id, stop_name, latitude, longitude
      FROM citybus_stops ORDER BY stop_id
    `).all() as unknown as Array<{ stop_id: string; stop_name: string; latitude: number; longitude: number }>
    const memberships = this.database.prepare(`
      SELECT stop_id, route, direction, destination, service_type, sequence
      FROM citybus_memberships ORDER BY stop_id, route, direction, sequence
    `).all() as unknown as Array<{
      stop_id: string
      route: string
      direction: BusDirection
      destination: string
      service_type: string
      sequence: number
    }>
    const byStop = new Map<string, CitybusDatabaseMembership[]>()
    for (const item of memberships) {
      const group = byStop.get(item.stop_id) ?? []
      group.push({
        route: item.route,
        direction: item.direction,
        destination: item.destination,
        serviceType: item.service_type,
        sequence: item.sequence,
      })
      byStop.set(item.stop_id, group)
    }
    this.citybusCache = stops.map((stop) => ({
      stopId: stop.stop_id,
      stopName: stop.stop_name,
      latitude: Number(stop.latitude),
      longitude: Number(stop.longitude),
      routes: byStop.get(stop.stop_id) ?? [],
    }))
    return this.citybusCache
  }

  replaceCitybusNetwork(stops: CitybusDatabaseStop[], source: string, generatedAt: string) {
    const insertStop = this.database.prepare(`
      INSERT INTO citybus_stops (stop_id, stop_name, latitude, longitude) VALUES (?, ?, ?, ?)
    `)
    const insertMembership = this.database.prepare(`
      INSERT INTO citybus_memberships (stop_id, route, direction, destination, service_type, sequence)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    this.transaction(() => {
      this.database.exec('DELETE FROM citybus_memberships; DELETE FROM citybus_stops;')
      for (const stop of stops) {
        insertStop.run(stop.stopId, stop.stopName, stop.latitude, stop.longitude)
        for (const route of stop.routes) {
          insertMembership.run(
            stop.stopId,
            route.route,
            route.direction,
            route.destination,
            route.serviceType,
            route.sequence,
          )
        }
      }
      this.setMetadata('citybus.source', source)
      this.setMetadata('citybus.updatedAt', generatedAt)
    })
    this.citybusCache = null
  }

  getRoutes(): BusRoute[] {
    return (this.database.prepare(`
      SELECT operator, route, origin, destination, direction, service_type
      FROM operator_routes ORDER BY route, operator, direction, service_type
    `).all() as unknown as Array<{
      operator: InternalOperator
      route: string
      origin: string
      destination: string
      direction: BusDirection
      service_type: string
    }>).map((item) => ({
      route: item.route,
      origin: item.origin,
      destination: item.destination,
      direction: item.direction,
      serviceType: item.service_type,
      internalOperator: item.operator,
    }))
  }

  getOperatorStops(operator: InternalOperator): BusStop[] {
    return (this.database.prepare(`
      SELECT stop_id, stop_name, latitude, longitude FROM operator_stops
      WHERE operator = ? ORDER BY stop_id
    `).all(operator) as unknown as Array<{
      stop_id: string
      stop_name: string
      latitude: number
      longitude: number
    }>).map((item) => ({
      stopId: item.stop_id,
      stopName: item.stop_name,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      internalOperator: operator,
    }))
  }

  getRouteStops(operator: InternalOperator, route: string, direction: BusDirection, serviceType: string): RouteStop[] {
    return (this.database.prepare(`
      SELECT rs.stop_id, s.stop_name, s.latitude, s.longitude, rs.sequence
      FROM operator_route_stops rs
      JOIN operator_stops s ON s.operator = rs.operator AND s.stop_id = rs.stop_id
      WHERE rs.operator = ? AND rs.route = ? AND rs.direction = ? AND rs.service_type = ?
      ORDER BY rs.sequence
    `).all(operator, route, direction, serviceType) as unknown as Array<{
      stop_id: string
      stop_name: string
      latitude: number
      longitude: number
      sequence: number
    }>).map((item) => ({
      stopId: item.stop_id,
      stopName: item.stop_name,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      internalOperator: operator,
      route,
      direction,
      serviceType,
      sequence: Number(item.sequence),
    }))
  }

  replaceRoutes(routes: BusRoute[], generatedAt = new Date().toISOString()) {
    const insert = this.database.prepare(`
      INSERT INTO operator_routes (operator, route, origin, destination, direction, service_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    this.transaction(() => {
      this.database.exec('DELETE FROM operator_routes')
      for (const route of routes) {
        insert.run(route.internalOperator, route.route, route.origin, route.destination, route.direction, route.serviceType)
      }
      this.setMetadata('network.updatedAt', generatedAt)
    })
  }

  replaceNetwork(routes: BusRoute[], networks: OperatorNetworkDataset[], generatedAt = new Date().toISOString()) {
    const insertRoute = this.database.prepare(`
      INSERT INTO operator_routes (operator, route, origin, destination, direction, service_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const insertStop = this.database.prepare(`
      INSERT INTO operator_stops (operator, stop_id, stop_name, latitude, longitude) VALUES (?, ?, ?, ?, ?)
    `)
    const insertRouteStop = this.database.prepare(`
      INSERT INTO operator_route_stops (operator, route, direction, service_type, sequence, stop_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    this.transaction(() => {
      this.database.exec('DELETE FROM operator_route_stops; DELETE FROM operator_stops; DELETE FROM operator_routes;')
      for (const route of routes) {
        insertRoute.run(route.internalOperator, route.route, route.origin, route.destination, route.direction, route.serviceType)
      }
      for (const network of networks) {
        for (const stop of network.stops) {
          insertStop.run(network.operator, stop.stopId, stop.stopName, stop.latitude, stop.longitude)
        }
        for (const stop of network.routeStops) {
          insertRouteStop.run(network.operator, stop.route, stop.direction, stop.serviceType, stop.sequence, stop.stopId)
        }
        this.setMetadata(`network.${network.operator}.stops.updatedAt`, generatedAt)
        this.setMetadata(`network.${network.operator}.routeStops.updatedAt`, generatedAt)
      }
      this.setMetadata('network.updatedAt', generatedAt)
    })
  }

  replaceOperatorStops(operator: InternalOperator, stops: BusStop[], generatedAt = new Date().toISOString()) {
    const insert = this.database.prepare(`
      INSERT INTO operator_stops (operator, stop_id, stop_name, latitude, longitude) VALUES (?, ?, ?, ?, ?)
    `)
    this.transaction(() => {
      this.database.prepare('DELETE FROM operator_stops WHERE operator = ?').run(operator)
      for (const stop of stops) insert.run(operator, stop.stopId, stop.stopName, stop.latitude, stop.longitude)
      this.setMetadata(`network.${operator}.stops.updatedAt`, generatedAt)
    })
  }

  replaceOperatorRouteStops(operator: InternalOperator, routeStops: RouteStop[], generatedAt = new Date().toISOString()) {
    const insert = this.database.prepare(`
      INSERT INTO operator_route_stops (operator, route, direction, service_type, sequence, stop_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    this.transaction(() => {
      this.database.prepare('DELETE FROM operator_route_stops WHERE operator = ?').run(operator)
      for (const stop of routeStops) {
        insert.run(operator, stop.route, stop.direction, stop.serviceType, stop.sequence, stop.stopId)
      }
      this.setMetadata(`network.${operator}.routeStops.updatedAt`, generatedAt)
      this.setMetadata('network.updatedAt', generatedAt)
    })
  }

  replaceRouteStopsForService(operator: InternalOperator, routeStops: RouteStop[]) {
    if (!routeStops.length) return
    const first = routeStops[0]
    const upsertStop = this.database.prepare(`
      INSERT INTO operator_stops (operator, stop_id, stop_name, latitude, longitude)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(operator, stop_id) DO UPDATE SET
        stop_name = excluded.stop_name,
        latitude = excluded.latitude,
        longitude = excluded.longitude
    `)
    const insert = this.database.prepare(`
      INSERT INTO operator_route_stops (operator, route, direction, service_type, sequence, stop_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    this.transaction(() => {
      this.database.prepare(`
        DELETE FROM operator_route_stops WHERE operator = ? AND route = ? AND direction = ? AND service_type = ?
      `).run(operator, first.route, first.direction, first.serviceType)
      for (const stop of routeStops) {
        upsertStop.run(operator, stop.stopId, stop.stopName, stop.latitude, stop.longitude)
        insert.run(operator, stop.route, stop.direction, stop.serviceType, stop.sequence, stop.stopId)
      }
    })
  }

  getRouteGeometry(operator: InternalOperator, route: string, direction: BusDirection): StoredRouteGeometry | null {
    const row = this.database.prepare(`
      SELECT operator, route, direction, geometry, updated_at
      FROM route_geometries WHERE operator = ? AND route = ? AND direction = ?
    `).get(operator, route, direction) as unknown as {
      operator: InternalOperator
      route: string
      direction: BusDirection
      geometry: string
      updated_at: string
    } | undefined
    if (!row) return null
    try {
      return { ...row, geometry: JSON.parse(row.geometry) as RouteGeometry, updatedAt: row.updated_at }
    } catch {
      return null
    }
  }

  upsertRouteGeometry(
    operator: InternalOperator,
    route: string,
    direction: BusDirection,
    geometry: RouteGeometry,
    updatedAt = new Date().toISOString(),
  ) {
    this.database.prepare(`
      INSERT INTO route_geometries (operator, route, direction, geometry, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(operator, route, direction) DO UPDATE SET geometry = excluded.geometry, updated_at = excluded.updated_at
    `).run(operator, route, direction, JSON.stringify(geometry), updatedAt)
    this.setMetadata('geometry.updatedAt', updatedAt)
  }

  listStoredRouteGeometries() {
    return this.database.prepare(`
      SELECT operator, route, direction, updated_at
      FROM route_geometries ORDER BY operator, route, direction
    `).all() as unknown as Array<{
      operator: InternalOperator
      route: string
      direction: BusDirection
      updated_at: string
    }>
  }

  getStats(): BusDatabaseStats {
    const count = (table: string) => scalarNumber(this.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get())
    return {
      fares: count('fares'),
      citybusStops: count('citybus_stops'),
      citybusMemberships: count('citybus_memberships'),
      routeGeometries: count('route_geometries'),
      operatorRoutes: count('operator_routes'),
      operatorStops: count('operator_stops'),
      operatorRouteStops: count('operator_route_stops'),
      fareUpdatedAt: this.getMetadata('fares.updatedAt'),
      citybusUpdatedAt: this.getMetadata('citybus.updatedAt'),
      geometryUpdatedAt: this.getMetadata('geometry.updatedAt'),
      networkUpdatedAt: this.getMetadata('network.updatedAt'),
    }
  }

  private createSchema() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route TEXT NOT NULL,
        direction TEXT NOT NULL,
        destination TEXT NOT NULL,
        fare REAL NOT NULL,
        companies TEXT NOT NULL,
        service_mode TEXT NOT NULL,
        special INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS fares_route_direction ON fares(route, direction);
      CREATE TABLE IF NOT EXISTS citybus_stops (
        stop_id TEXT PRIMARY KEY,
        stop_name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS citybus_stop_location ON citybus_stops(latitude, longitude);
      CREATE TABLE IF NOT EXISTS citybus_memberships (
        stop_id TEXT NOT NULL REFERENCES citybus_stops(stop_id) ON DELETE CASCADE,
        route TEXT NOT NULL,
        direction TEXT NOT NULL,
        destination TEXT NOT NULL,
        service_type TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        PRIMARY KEY (stop_id, route, direction, destination, service_type, sequence)
      );
      CREATE INDEX IF NOT EXISTS citybus_membership_route ON citybus_memberships(route, direction);
      CREATE TABLE IF NOT EXISTS route_geometries (
        operator TEXT NOT NULL,
        route TEXT NOT NULL,
        direction TEXT NOT NULL,
        geometry TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (operator, route, direction)
      );
      CREATE TABLE IF NOT EXISTS operator_routes (
        operator TEXT NOT NULL,
        route TEXT NOT NULL,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        direction TEXT NOT NULL,
        service_type TEXT NOT NULL,
        PRIMARY KEY (operator, route, direction, service_type, destination)
      );
      CREATE INDEX IF NOT EXISTS operator_routes_route ON operator_routes(route, direction);
      CREATE TABLE IF NOT EXISTS operator_stops (
        operator TEXT NOT NULL,
        stop_id TEXT NOT NULL,
        stop_name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        PRIMARY KEY (operator, stop_id)
      );
      CREATE INDEX IF NOT EXISTS operator_stops_location ON operator_stops(operator, latitude, longitude);
      CREATE TABLE IF NOT EXISTS operator_route_stops (
        operator TEXT NOT NULL,
        route TEXT NOT NULL,
        direction TEXT NOT NULL,
        service_type TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        stop_id TEXT NOT NULL,
        PRIMARY KEY (operator, route, direction, service_type, sequence)
      );
      CREATE INDEX IF NOT EXISTS operator_route_stops_lookup ON operator_route_stops(operator, route, direction, service_type);
    `)
  }

  private seedWhenEmpty() {
    const fareCount = scalarNumber(this.database.prepare('SELECT COUNT(*) AS count FROM fares').get())
    if (!fareCount) {
      this.replaceFares(
        fareSeed.records as FareDatabaseRecord[],
        String(fareSeed.source),
        String(fareSeed.generatedAt),
      )
    }
    const citybusCount = scalarNumber(this.database.prepare('SELECT COUNT(*) AS count FROM citybus_stops').get())
    if (!citybusCount) {
      this.replaceCitybusNetwork(
        citybusSeed.stops as CitybusDatabaseStop[],
        String(citybusSeed.source),
        String(citybusSeed.generatedAt),
      )
    }
  }

  private getMetadata(key: string) {
    const row = this.database.prepare('SELECT value FROM metadata WHERE key = ?').get(key) as unknown as { value: string } | undefined
    return row?.value ?? null
  }

  private setMetadata(key: string, value: string) {
    this.database.prepare(`
      INSERT INTO metadata (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value)
  }

  private transaction(action: () => void) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      action()
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

export const busDatabase = new BusDatabase()
