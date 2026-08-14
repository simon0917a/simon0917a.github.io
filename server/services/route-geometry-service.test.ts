import { describe, expect, it } from 'vitest'
import type { RouteStop } from '../domain/bus.ts'
import { selectBestRouteGeometry, type CsdiRouteFeature } from './route-geometry-service.ts'

const stops: RouteStop[] = [
  { stopId: 'A', stopName: '起點', latitude: 22.3, longitude: 114.1, internalOperator: 'kmb-lwb', route: '16', direction: 'outbound', serviceType: '1', sequence: 1 },
  { stopId: 'B', stopName: '終點', latitude: 22.31, longitude: 114.2, internalOperator: 'kmb-lwb', route: '16', direction: 'outbound', serviceType: '1', sequence: 2 },
]

function feature(company: string, coordinates: number[][]): CsdiRouteFeature {
  return {
    properties: { COMPANY_CODE: company, ROUTE_NAMEE: '16', ROUTE_SEQ: 1 },
    geometry: { type: 'MultiLineString', coordinates: [coordinates] },
  }
}

describe('selectBestRouteGeometry', () => {
  it('prefers the matching operator and closest endpoints', () => {
    const selected = selectBestRouteGeometry([
      feature('CTB', [[114.1, 22.3], [114.2, 22.31]]),
      feature('KMB', [[114.5, 22.5], [114.6, 22.6]]),
      feature('KMB', [[114.1, 22.3], [114.15, 22.305], [114.2, 22.31]]),
    ], 'kmb-lwb', stops)

    expect(selected).toEqual([[[114.1, 22.3], [114.15, 22.305], [114.2, 22.31]]])
  })

  it('accepts a LineString response', () => {
    const selected = selectBestRouteGeometry([{
      properties: { COMPANY_CODE: 'KMB' },
      geometry: { type: 'LineString', coordinates: [[114.1, 22.3], [114.2, 22.31]] },
    }], 'kmb-lwb', stops)

    expect(selected).toEqual([[[114.1, 22.3], [114.2, 22.31]]])
  })
})
