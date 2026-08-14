import { useEffect, useMemo, useState } from 'react'
import { getServiceAlerts } from '../services/bus-api'
import { parseReadAlertIds, READ_ALERTS_STORAGE_KEY, sortAlerts } from '../services/alerts'

export function useServiceAlerts(enabled: boolean) {
  const [alerts, setAlerts] = useState<Awaited<ReturnType<typeof getServiceAlerts>>>([])
  const [readIds, setReadIds] = useState<string[]>(() => parseReadAlertIds(localStorage.getItem(READ_ALERTS_STORAGE_KEY)))
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!enabled || loaded) return
    const controller = new AbortController()
    getServiceAlerts(controller.signal)
      .then((items) => setAlerts(sortAlerts(items)))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        setAlerts([])
      })
      .finally(() => setLoaded(true))
    return () => controller.abort()
  }, [enabled, loaded])

  useEffect(() => {
    localStorage.setItem(READ_ALERTS_STORAGE_KEY, JSON.stringify(readIds))
  }, [readIds])

  const unreadCount = useMemo(() => alerts.filter((alert) => !readIds.includes(alert.id)).length, [alerts, readIds])
  const markAllRead = () => setReadIds(alerts.map((alert) => alert.id))

  return { alerts, loaded, unreadCount, markAllRead }
}
