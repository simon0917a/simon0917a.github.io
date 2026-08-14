import { DIRECTIONS, OPERATORS, type BusDirection, type InternalOperator } from './bus.ts'

const ROUTE_PATTERN = /^[0-9A-Z]{1,8}$/
const STOP_PATTERN = /^[0-9A-Z]{1,32}$/
const SERVICE_TYPE_PATTERN = /^[0-9]{1,3}$/

export class RequestValidationError extends Error {
  statusCode = 400
}

export function requireOperator(value: string | null): InternalOperator {
  if (!value || !OPERATORS.includes(value as InternalOperator)) {
    throw new RequestValidationError('缺少或不支援的內部營辦商識別碼。')
  }
  return value as InternalOperator
}

export function requireDirection(value: string | null): BusDirection {
  if (!value || !DIRECTIONS.includes(value as BusDirection)) {
    throw new RequestValidationError('缺少或不支援的路線方向。')
  }
  return value as BusDirection
}

export function requireRoute(value: string | null): string {
  const normalized = value?.trim().toUpperCase() ?? ''
  if (!ROUTE_PATTERN.test(normalized)) {
    throw new RequestValidationError('缺少或無效的路線號碼。')
  }
  return normalized
}

export function requireStopId(value: string | null): string {
  const normalized = value?.trim().toUpperCase() ?? ''
  if (!STOP_PATTERN.test(normalized)) {
    throw new RequestValidationError('缺少或無效的巴士站識別碼。')
  }
  return normalized
}

export function optionalServiceType(value: string | null): string {
  const normalized = value?.trim() || '1'
  if (!SERVICE_TYPE_PATTERN.test(normalized)) {
    throw new RequestValidationError('服務類別必須為數字。')
  }
  return normalized
}

export function requireCoordinate(value: string | null, kind: 'latitude' | 'longitude'): number {
  const coordinate = Number(value)
  const limit = kind === 'latitude' ? 90 : 180
  if (!value || !Number.isFinite(coordinate) || Math.abs(coordinate) > limit) {
    throw new RequestValidationError(kind === 'latitude' ? '緯度無效。' : '經度無效。')
  }
  return coordinate
}
