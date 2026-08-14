import { describe, expect, it } from 'vitest'
import { compareRouteNames } from './route-order'

describe('首頁路線自然排序', () => {
  it('先按數字大小，再按英文字母尾碼排列', () => {
    const routes = ['A10', '91M', '10', '2', '91', '1A', '1', '91P']
    expect(routes.sort(compareRouteNames)).toEqual(['1', '1A', '2', '10', '91', '91M', '91P', 'A10'])
  })
})
