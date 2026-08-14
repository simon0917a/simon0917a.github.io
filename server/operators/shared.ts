import type { BusDirection } from '../domain/bus.ts'

export interface ApiEnvelope<T> {
  type: string
  version: string
  generated_timestamp: string
  data: T
}

export function parseCoordinate(value: string | number): number {
  const coordinate = Number(value)
  if (!Number.isFinite(coordinate)) throw new Error('上游巴士站座標無效。')
  return coordinate
}

export function directionFromCode(value?: string): BusDirection | null {
  const code = value?.trim().toUpperCase()
  if (code === 'O' || code === 'OUTBOUND') return 'outbound'
  if (code === 'I' || code === 'INBOUND') return 'inbound'
  return null
}

export function directionToPath(direction: BusDirection) {
  return direction
}

export function etaMinutes(etaTime: string, now = Date.now()): number {
  const eta = Date.parse(etaTime)
  if (!Number.isFinite(eta)) return 0
  return Math.max(0, Math.ceil((eta - now) / 60_000))
}

export function isCurrentEta(etaTime: string, now = Date.now(), pastGraceMs = 60_000): boolean {
  const eta = Date.parse(etaTime)
  return Number.isFinite(eta) && eta >= now - pastGraceMs
}

export function cleanText(value?: string | null): string | null {
  const cleaned = value?.trim()
  return cleaned ? cleaned : null
}
