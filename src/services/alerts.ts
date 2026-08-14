import type { BusServiceAlert } from '../types/bus'

export const READ_ALERTS_STORAGE_KEY = '香港巴士已讀通知'
const PRIORITY = { favorite: 0, nearby: 1, other: 2 } as const

export function sortAlerts(alerts: BusServiceAlert[]) {
  return [...alerts].sort((left, right) =>
    PRIORITY[left.priority] - PRIORITY[right.priority] || Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  )
}

export function parseReadAlertIds(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}
