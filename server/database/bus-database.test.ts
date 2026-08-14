import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { BusRoute, BusStop, RouteStop } from '../domain/bus.ts'
import { BusDatabase } from './bus-database.ts'

const temporaryFiles: string[] = []

afterEach(() => {
  for (const file of temporaryFiles.splice(0)) {
    for (const suffix of ['', '-shm', '-wal']) rmSync(`${file}${suffix}`, { force: true })
  }
})

function createDatabase() {
  const file = join(tmpdir(), `bus-data-test-${crypto.randomUUID()}.sqlite`)
  temporaryFiles.push(file)
  return new BusDatabase(file)
}

describe('SQLite bus database', () => {
  it('migrates bundled fare and Citybus seeds on first use', () => {
    const database = createDatabase()
    const stats = database.getStats()
    expect(stats.fares).toBeGreaterThan(1_000)
    expect(stats.citybusStops).toBeGreaterThan(1_000)
    database.close()
  })

  it('replaces and reads a complete operator network transactionally', () => {
    const database = createDatabase()
    const route: BusRoute = {
      route: '91M', origin: '寶林', destination: '鑽石山站', direction: 'outbound',
      serviceType: '1', internalOperator: 'kmb-lwb',
    }
    const stop: BusStop = {
      stopId: 'TEST-STOP', stopName: '測試車站', latitude: 22.32, longitude: 114.25,
      internalOperator: 'kmb-lwb',
    }
    const routeStop: RouteStop = { ...stop, route: '91M', direction: 'outbound', serviceType: '1', sequence: 1 }

    database.replaceNetwork([route], [{ operator: 'kmb-lwb', stops: [stop], routeStops: [routeStop] }], '2026-08-13T00:00:00.000Z')

    expect(database.getRoutes()).toEqual([route])
    expect(database.getOperatorStops('kmb-lwb')).toEqual([stop])
    expect(database.getRouteStops('kmb-lwb', '91M', 'outbound', '1')).toEqual([routeStop])
    expect(database.getStats()).toMatchObject({ operatorRoutes: 1, operatorStops: 1, operatorRouteStops: 1 })
    database.close()
  })

  it('stores downloaded route stops together with their stop details', () => {
    const database = createDatabase()
    const routeStop: RouteStop = {
      route: '1', direction: 'inbound', serviceType: '1', sequence: 2,
      stopId: 'CITY-STOP', stopName: '中環', latitude: 22.281, longitude: 114.158,
      internalOperator: 'citybus',
    }
    database.replaceRouteStopsForService('citybus', [routeStop])
    expect(database.getRouteStops('citybus', '1', 'inbound', '1')).toEqual([routeStop])
    database.close()
  })
})
