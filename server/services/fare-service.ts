import type { BusDirection, InternalOperator } from '../domain/bus.ts'
import { busDatabase, type BusDatabase } from '../database/bus-database.ts'

interface FareRecord {
  route: string
  direction: BusDirection
  destination: string
  fare: number
  companies: string[]
  serviceMode: string
  special: boolean
  updatedAt: string
}

function normalizePlace(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '')
    .replace(/[\s()（）/／,，.。-]/g, '')
    .replace(/巴士總站|總站|巴士站|邨|村/g, '')
    .toUpperCase()
}

function companyMatches(operator: InternalOperator, companies: string[]) {
  return operator === 'citybus'
    ? companies.includes('CTB')
    : companies.includes('KMB') || companies.includes('LWB')
}

export class FareService {
  constructor(private readonly database: BusDatabase = busDatabase) {}

  getFare(operator: InternalOperator, route: string, direction: BusDirection | null, destination: string) {
    if (!direction) return null
    const normalizedRoute = route.trim().toUpperCase()
    const rows = this.database.getFareRecords(normalizedRoute, [direction, direction === 'outbound' ? 'inbound' : 'outbound'])
    const records = rows.map((row) => ({
      route: row.route,
      direction: row.direction,
      destination: row.destination,
      fare: Number(row.fare),
      companies: JSON.parse(row.companies) as string[],
      serviceMode: row.service_mode,
      special: Boolean(row.special),
      updatedAt: row.updated_at,
    })) satisfies FareRecord[]
    const sameDirection = records.filter((record) => record.direction === direction)
      .filter((record) => companyMatches(operator, record.companies))
    const oppositeDirection = records.filter((record) => record.direction !== direction)
      .filter((record) => companyMatches(operator, record.companies))
    const candidates = [...sameDirection, ...oppositeDirection]
    if (!candidates.length) return null

    const wanted = normalizePlace(destination)
    const exact = candidates.filter((record) => normalizePlace(record.destination) === wanted)
    const containing = candidates.filter((record) => {
      const value = normalizePlace(record.destination)
      return value.includes(wanted) || wanted.includes(value)
    })
    const matches = exact.length ? exact : containing
    if (!matches.length) return null

    const fares = [...new Set(matches.map((record) => record.fare))]
    return fares.length === 1 ? fares[0] : null
  }
}

export const fareService = new FareService()
