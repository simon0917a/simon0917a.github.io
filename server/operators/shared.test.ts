import { describe, expect, it } from 'vitest'
import { directionFromCode, etaMinutes, isCurrentEta, parseCoordinate } from './shared.ts'

describe('營辦商共用資料轉換', () => {
  it('統一方向代碼', () => {
    expect(directionFromCode('O')).toBe('outbound')
    expect(directionFromCode('I')).toBe('inbound')
    expect(directionFromCode('unknown')).toBeNull()
  })

  it('計算 ETA 剩餘分鐘並避免負數', () => {
    const now = Date.parse('2026-08-12T08:00:00+08:00')
    expect(etaMinutes('2026-08-12T08:02:01+08:00', now)).toBe(3)
    expect(etaMinutes('2026-08-12T07:59:00+08:00', now)).toBe(0)
  })

  it('不接受已離站超過一分鐘的 ETA', () => {
    const now = Date.parse('2026-08-12T14:30:00+08:00')
    expect(isCurrentEta('2026-08-12T14:29:30+08:00', now)).toBe(true)
    expect(isCurrentEta('2026-08-12T14:28:59+08:00', now)).toBe(false)
  })

  it('只接受有效座標', () => {
    expect(parseCoordinate('22.3')).toBe(22.3)
    expect(() => parseCoordinate('錯誤')).toThrow()
  })
})
