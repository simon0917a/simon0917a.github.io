import { describe, expect, it } from 'vitest'
import type { BusRoute } from '../types/bus'
import { availableRouteLetters, filterRoutes, ROUTE_LETTERS } from './route-search'

const routes: BusRoute[] = [
  { route: '101', origin: '觀塘', destination: '堅尼地城', direction: 'outbound', serviceType: '1', internalOperator: 'kmb-lwb' },
  { route: '101', origin: '觀塘', destination: '堅尼地城', direction: 'outbound', serviceType: '1', internalOperator: 'citybus' },
  { route: '101', origin: '堅尼地城', destination: '觀塘', direction: 'inbound', serviceType: '1', internalOperator: 'citybus' },
  { route: '10', origin: '北角', destination: '堅尼地城', direction: 'outbound', serviceType: '1', internalOperator: 'citybus' },
  { route: 'A10', origin: '鴨脷洲', destination: '機場', direction: 'outbound', serviceType: '1', internalOperator: 'citybus' },
]

describe('路線號碼搜尋', () => {
  it('只按路線號碼前綴篩選', () => {
    expect(filterRoutes(routes, '堅尼地城')).toEqual([])
    expect(filterRoutes(routes, 'A').map((route) => route.route)).toEqual(['A10'])
  })

  it('同一路線不同方向分開、相同方向跨來源去重', () => {
    const results = filterRoutes(routes, '101')
    expect(results).toHaveLength(2)
    expect(results.map((route) => route.destination).sort()).toEqual(['堅尼地城', '觀塘'])
  })

  it('空白輸入不顯示結果', () => {
    expect(filterRoutes(routes, '')).toEqual([])
  })

  it('自訂鍵盤提供完整 A 至 Z 字母', () => {
    expect(ROUTE_LETTERS).toHaveLength(26)
    expect(ROUTE_LETTERS).toContain('M')
    expect([...ROUTE_LETTERS].sort().join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    expect([...ROUTE_LETTERS].join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  })

  it('輸入路線前綴後只提供仍可使用的下一個字母', () => {
    const routesWithSuffix = [
      ...routes,
      { route: '91', origin: '清水灣', destination: '鑽石山站', direction: 'outbound', serviceType: '1', internalOperator: 'kmb-lwb' },
      { route: '91M', origin: '寶林', destination: '鑽石山站', direction: 'outbound', serviceType: '1', internalOperator: 'kmb-lwb' },
      { route: '91P', origin: '香港科技大學', destination: '彩虹站', direction: 'outbound', serviceType: '1', internalOperator: 'kmb-lwb' },
    ] satisfies BusRoute[]

    expect(availableRouteLetters(routesWithSuffix, '91')).toEqual(['M', 'P'])
    expect(availableRouteLetters(routesWithSuffix, '101')).toEqual([])
    expect(availableRouteLetters(routesWithSuffix, '')).toHaveLength(26)
  })
})
