import { describe, expect, it } from 'vitest'
import { fareService } from './fare-service.ts'

describe('運輸署巴士全程車費', () => {
  it('配對城巴路線、方向及目的地', () => {
    expect(fareService.getFare('citybus', '720', 'inbound', '西灣河(嘉亨灣)')).toBe(8.7)
    expect(fareService.getFare('citybus', '788', 'inbound', '小西灣藍灣半島')).toBe(8.7)
  })

  it('配對九巴及聯營路線', () => {
    expect(fareService.getFare('kmb-lwb', '1', 'outbound', '尖沙咀碼頭')).toBe(6.7)
    expect(fareService.getFare('kmb-lwb', '182', 'outbound', '中環(港澳碼頭)')).toBe(20.8)
    expect(fareService.getFare('citybus', '182', 'outbound', '沙田(愉翠苑)')).toBe(20.8)
  })

  it('目的地不確定時不猜測車費', () => {
    expect(fareService.getFare('citybus', '18X', 'outbound', '不存在的目的地')).toBeNull()
    expect(fareService.getFare('citybus', '18X', null, '堅尼地城')).toBeNull()
  })
})
