import { describe, expect, it } from 'vitest'
import type { BusServiceAlert } from '../types/bus'
import { parseReadAlertIds, sortAlerts } from './alerts'

const base = { routeLabel: '路線', title: '消息', summary: '摘要', updatedAt: '2026-08-12T10:00:00+08:00', relatedRoute: null }
const alerts: BusServiceAlert[] = [
  { ...base, id: '其他', priority: 'other' },
  { ...base, id: '附近', priority: 'nearby' },
  { ...base, id: '收藏', priority: 'favorite' },
]

describe('巴士通知', () => {
  it('按收藏、附近、其他次序排列', () => {
    expect(sortAlerts(alerts).map((alert) => alert.id)).toEqual(['收藏', '附近', '其他'])
  })

  it('安全處理已讀資料', () => {
    expect(parseReadAlertIds('["一",3]')).toEqual(['一'])
    expect(parseReadAlertIds('損壞')).toEqual([])
  })
})
