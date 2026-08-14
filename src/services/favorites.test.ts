import { describe, expect, it } from 'vitest'
import { favoriteId, moveFavorite, parseFavorites, toFavorite } from './favorites'

const first = toFavorite({ route: '101', destination: '堅尼地城', direction: 'inbound', serviceType: '1', internalOperator: 'kmb-lwb' })
const second = toFavorite({ route: '112', destination: '蘇屋', direction: 'outbound', serviceType: '1', internalOperator: 'citybus' })

describe('收藏路線資料', () => {
  it('識別碼只由路線及方向資料組成', () => {
    expect(first.id).toBe(favoriteId(first))
    expect(first).not.toHaveProperty('stopId')
  })

  it('安全忽略損壞的本機資料', () => {
    expect(parseFavorites('不是 JSON')).toEqual([])
    expect(parseFavorites(JSON.stringify([{ route: '101' }]))).toEqual([])
  })

  it('支援向上及向下調整排序', () => {
    expect(moveFavorite([first, second], 0, 1).map((item) => item.route)).toEqual(['112', '101'])
    expect(moveFavorite([first, second], 0, -1)).toEqual([first, second])
  })
})
