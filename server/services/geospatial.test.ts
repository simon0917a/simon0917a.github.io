import { describe, expect, it } from 'vitest'
import { distanceMeters, sortByDistance } from './geospatial.ts'

describe('地理距離計算', () => {
  it('相同位置距離為零', () => {
    expect(distanceMeters({ latitude: 22.3, longitude: 114.2 }, { latitude: 22.3, longitude: 114.2 })).toBe(0)
  })

  it('按距離由近至遠排列', () => {
    const origin = { latitude: 22.3, longitude: 114.2 }
    const sorted = sortByDistance(origin, [
      { id: '遠', latitude: 22.31, longitude: 114.2 },
      { id: '近', latitude: 22.301, longitude: 114.2 },
    ])
    expect(sorted.map((item) => item.id)).toEqual(['近', '遠'])
    expect(sorted[0].distanceMeters).toBeGreaterThan(0)
  })
})
