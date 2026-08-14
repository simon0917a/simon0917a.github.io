import { describe, expect, it } from 'vitest'
import { etaMinutesAt, isEtaCurrent, isEtaDataStale, updatedLabel } from './eta-time'

describe('本機 ETA 時間', () => {
  it('按目前時間重算分鐘而不使用舊倒數', () => {
    const now = Date.parse('2026-08-12T08:00:00+08:00')
    expect(etaMinutesAt('2026-08-12T08:02:01+08:00', now)).toBe(3)
    expect(etaMinutesAt('2026-08-12T07:59:00+08:00', now)).toBe(0)
  })

  it('失效資料清楚標示為上次成功資料', () => {
    const now = Date.parse('2026-08-12T08:05:00+08:00')
    expect(updatedLabel('2026-08-12T08:00:00+08:00', now, true)).toContain('上次成功資料')
  })

  it('超過十分鐘的整組到站資料視為過期', () => {
    const now = Date.parse('2026-08-12T08:11:01+08:00')
    expect(isEtaDataStale('2026-08-12T08:00:00+08:00', now)).toBe(true)
    expect(isEtaDataStale('2026-08-12T08:02:00+08:00', now)).toBe(false)
  })

  it('只保留剛到站或未來班次，不把很久以前的 ETA 當成零分鐘', () => {
    const now = Date.parse('2026-08-12T14:30:00+08:00')
    expect(isEtaCurrent('2026-08-12T14:29:15+08:00', now)).toBe(true)
    expect(isEtaCurrent('2026-08-12T14:28:59+08:00', now)).toBe(false)
    expect(isEtaCurrent('2026-08-12T14:52:00+08:00', now)).toBe(true)
  })
})
