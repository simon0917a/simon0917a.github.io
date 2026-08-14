import { useEffect, useState } from 'react'

export function useMinuteClock() {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const update = () => setNow(Date.now())
    const untilNextMinute = 60_000 - (Date.now() % 60_000)
    let interval: number | undefined
    const timeout = window.setTimeout(() => {
      update()
      interval = window.setInterval(update, 60_000)
    }, untilNextMinute)
    return () => {
      window.clearTimeout(timeout)
      if (interval) window.clearInterval(interval)
    }
  }, [])

  return now
}
