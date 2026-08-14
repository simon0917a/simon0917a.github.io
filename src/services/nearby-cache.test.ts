import { describe, expect, it } from 'vitest'
import { createNearbyCache, readNearbyCache } from './nearby-cache'

describe('附近巴士最後成功資料', () => {
  it('可讀取 24 小時內的資料', () => {
    const now = Date.parse('2026-08-12T08:00:00Z')
    const position = { latitude: 22.3, longitude: 114.2 }
    const cache = createNearbyCache([], position, '2026-08-12T07:00:00Z')
    expect(readNearbyCache(JSON.stringify(cache), position, now)).toEqual(cache)
  })

  it('忽略損壞或超過 24 小時的資料', () => {
    const now = Date.parse('2026-08-12T08:00:00Z')
    const position = { latitude: 22.3, longitude: 114.2 }
    expect(readNearbyCache('損壞', position, now)).toBeNull()
    expect(readNearbyCache(JSON.stringify(createNearbyCache([], position, '2026-08-10T07:00:00Z')), position, now)).toBeNull()
  })

  it('位置相距太遠時不顯示舊區域資料', () => {
    const cachedPosition = { latitude: 22.3, longitude: 114.2 }
    const newPosition = { latitude: 22.4, longitude: 114.2 }
    expect(readNearbyCache(JSON.stringify(createNearbyCache([], cachedPosition)), newPosition)).toBeNull()
  })
})
