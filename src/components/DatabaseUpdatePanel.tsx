import { useCallback, useEffect, useRef, useState } from 'react'
import { getDatabaseStatus, updateDatabase } from '../services/bus-api'
import type { DatabaseUpdateStatus } from '../types/bus'
import { RotateCcwIcon } from './Icons'

function formatUpdatedAt(value: string | null) {
  if (!value) return '尚未更新'
  return new Intl.DateTimeFormat('zh-HK', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

export function DatabaseUpdatePanel() {
  const [status, setStatus] = useState<DatabaseUpdateStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [requestError, setRequestError] = useState<string | null>(null)
  const pollingRef = useRef<number | null>(null)

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) window.clearTimeout(pollingRef.current)
    pollingRef.current = null
  }, [])

  const loadStatus = useCallback(async (repeat = true) => {
    try {
      const latest = await getDatabaseStatus()
      setStatus(latest)
      setRequestError(null)
      if (repeat && latest.state === 'running') {
        pollingRef.current = window.setTimeout(() => { void loadStatus(true) }, 1_000)
      } else {
        stopPolling()
      }
    } catch {
      setRequestError('暫時無法讀取資料庫狀態。')
      stopPolling()
    } finally {
      setLoading(false)
    }
  }, [stopPolling])

  useEffect(() => {
    void loadStatus(true)
    return stopPolling
  }, [loadStatus, stopPolling])

  const startUpdate = async () => {
    stopPolling()
    setRequestError(null)
    try {
      const latest = await updateDatabase()
      setStatus(latest)
      pollingRef.current = window.setTimeout(() => { void loadStatus(true) }, 600)
    } catch {
      setRequestError('未能開始更新，請稍後再試。')
    }
  }

  const updating = status?.state === 'running'
  const lastUpdated = [status?.stats.fareUpdatedAt, status?.stats.networkUpdatedAt, status?.stats.citybusUpdatedAt, status?.stats.geometryUpdatedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null

  return (
    <section className="database-panel" aria-labelledby="database-title">
      <div className="database-panel-heading">
        <div>
          <p className="database-kicker">本機 SQLite</p>
          <h2 id="database-title">官方資料庫</h2>
        </div>
        <span className={`database-state ${updating ? 'running' : status?.state ?? 'idle'}`}>
          {updating ? '更新中' : status?.state === 'failed' ? '需注意' : '已連接'}
        </span>
      </div>

      {loading && <p className="database-message">正在讀取資料庫狀態…</p>}
      {!loading && status && (
        <>
          <div className="database-stats" aria-label="資料庫記錄數量">
            <span><strong>{status.stats.fares.toLocaleString('zh-HK')}</strong><small>車費</small></span>
            <span><strong>{status.stats.operatorRoutes.toLocaleString('zh-HK')}</strong><small>路線方向</small></span>
            <span><strong>{status.stats.operatorStops.toLocaleString('zh-HK')}</strong><small>全部車站</small></span>
            <span><strong>{status.stats.routeGeometries.toLocaleString('zh-HK')}</strong><small>路線線形</small></span>
          </div>
          <p className={`database-message${status.state === 'failed' ? ' error' : ''}`} aria-live="polite">
            {status.message}
          </p>
          {status.error && <p className="database-error" role="alert">{status.error}</p>}
          {updating && (
            <div className="database-progress" role="progressbar" aria-label="資料更新進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={status.progress}>
              <span style={{ width: `${status.progress}%` }} />
            </div>
          )}
          <div className="database-footer">
            <small>最近資料：{formatUpdatedAt(lastUpdated)}</small>
            <button className={updating ? 'refreshing' : ''} type="button" onClick={startUpdate} disabled={updating}>
              <RotateCcwIcon className="refresh-icon" />
              <span>{updating ? `${status.progress}%` : '更新官方資料'}</span>
            </button>
          </div>
        </>
      )}
      {requestError && <p className="database-error" role="alert">{requestError}</p>}
    </section>
  )
}
