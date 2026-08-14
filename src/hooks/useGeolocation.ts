import { useCallback, useEffect, useRef, useState } from 'react'
import type { Position } from '../types/bus'
import { getCurrentPosition } from '../services/bus-api'

type LocationStatus = 'requesting' | 'ready' | 'denied' | 'unavailable'

export function useGeolocation() {
  const [status, setStatus] = useState<LocationStatus>('requesting')
  const [position, setPosition] = useState<Position | null>(null)
  const mounted = useRef(true)
  const requested = useRef(false)

  const requestLocation = useCallback(() => {
    requested.current = true
    setStatus('requesting')
    getCurrentPosition().then(
      (currentPosition) => {
        if (!mounted.current) return
        setPosition(currentPosition)
        setStatus('ready')
      },
      () => {
        if (!mounted.current) return
        setPosition(null)
        setStatus('denied')
      },
    )
  }, [])

  useEffect(() => {
    mounted.current = true
    if (!requested.current) requestLocation()
    return () => { mounted.current = false }
  }, [requestLocation])

  return { status, position, requestLocation }
}
