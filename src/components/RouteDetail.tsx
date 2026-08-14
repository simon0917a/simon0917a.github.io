import { useEffect, useRef, useState } from 'react'
import type { AlternativeStop, NearestRouteResult, RouteGeometry, RouteSelection, RouteStop } from '../types/bus'
import { getRouteArrivals } from '../services/bus-api'
import { formatArrivalTime, formatFare } from './BusListItem'
import { etaMinutesAt, isEtaCurrent, isEtaDataStale, updatedLabel } from '../services/eta-time'
import { useMinuteClock } from '../hooks/useMinuteClock'
import { RouteMap } from './RouteMap'
import { RotateCcwIcon, StarCheckIcon, StarIcon } from './Icons'

export function RouteDetail({ detail, routeGeometry, onBack, favorite, onToggleFavorite, stale = false, refreshing = false, refreshBlocked = false, onRefresh }: {
  detail: NearestRouteResult
  routeGeometry?: RouteGeometry
  onBack: () => void
  favorite: boolean
  onToggleFavorite: (route: RouteSelection) => void
  stale?: boolean
  refreshing?: boolean
  refreshBlocked?: boolean
  onRefresh?: () => void
}) {
  const [displayedDetail, setDisplayedDetail] = useState(detail)
  const [stopLoadingId, setStopLoadingId] = useState<string | null>(null)
  const [stopError, setStopError] = useState<string | null>(null)
  const now = useMinuteClock()
  const stop = displayedDetail.selectedStop
  const dataStale = stale || isEtaDataStale(displayedDetail.updatedAt, now)

  useEffect(() => {
    setDisplayedDetail(detail)
    if (detail.arrivals.length) setStopError(null)
  }, [detail])

  const selectStop = (routeStop: RouteStop | AlternativeStop) => {
    setStopLoadingId(routeStop.stopId)
    setStopError(null)
    getRouteArrivals(detail.route, routeStop.stopId, detail.serviceType, detail.internalOperator)
      .then((arrivals) => {
        const matching = arrivals.filter((arrival) => arrival.direction === detail.direction).slice(0, 3)
        if (!matching.length) {
          setStopError('這個車站暫時沒有即時到站資料。')
          return
        }
        setDisplayedDetail({
          ...detail,
          selectedStop: { ...routeStop, distanceMeters: 'distanceMeters' in routeStop ? routeStop.distanceMeters : 0 },
          arrivals: matching,
          fare: matching[0]?.fare ?? detail.fare,
          updatedAt: matching[0]?.updatedAt ?? detail.updatedAt,
          alternatives: [],
        })
      })
      .catch(() => setStopError('暫時無法取得這個車站的到站時間。'))
      .finally(() => setStopLoadingId(null))
  }

  return (
    <div className={`detail-page ${detail.internalOperator === 'citybus' ? 'citybus' : 'kmb'}`}>
      <div className="detail-topbar">
        <button className="back-button" type="button" onClick={onBack}>‹ 返回</button>
        <header className={`detail-heading ${detail.internalOperator === 'citybus' ? 'citybus' : 'kmb'}`}>
          <div><span className="detail-route-wrap"><strong className="detail-route">{detail.route}</strong><small>{detail.internalOperator === 'citybus' ? '城巴' : '九巴・龍運'}</small></span><p>往 {detail.destination}</p></div>
          <button className={`favorite-button${favorite ? ' selected' : ''}`} type="button" aria-label={favorite ? '取消收藏' : '加入收藏'} aria-pressed={favorite} onClick={() => onToggleFavorite(detail)}>{favorite ? <StarCheckIcon className="favorite-icon" /> : <StarIcon className="favorite-icon" />}</button>
        </header>
      </div>

      <RouteMap stops={detail.routeStops} geometry={routeGeometry} selectedStopId={stop?.stopId ?? null} operator={detail.internalOperator} />

      {refreshBlocked && <p className="refresh-message" role="status">剛剛已重新整理，請稍候再試。</p>}
      {detail.routeStops.length
        ? <RouteStopList detail={displayedDetail} selectedStopId={stop?.stopId ?? null} loadingId={stopLoadingId} error={stopError} onSelect={selectStop} now={now} stale={dataStale} refreshing={refreshing} onRefresh={onRefresh} />
        : <div className="route-stops-loading" role="status"><strong>正在載入沿途車站</strong><span>路線資料準備好後會立即顯示。</span></div>}
    </div>
  )
}

function RouteStopList({ detail, selectedStopId, loadingId, error, onSelect, now, stale = false, refreshing = false, onRefresh }: {
  detail: NearestRouteResult
  selectedStopId: string | null
  loadingId: string | null
  error: string | null
  onSelect: (stop: RouteStop) => void
  now: number
  stale?: boolean
  refreshing?: boolean
  onRefresh?: () => void
}) {
  const selectedRef = useRef<HTMLLIElement>(null)
  const currentArrivals = stale ? [] : detail.arrivals.filter((arrival) => isEtaCurrent(arrival.etaTime, now)).slice(0, 3)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'center' })
  }, [selectedStopId, detail.arrivals.length])

  return (
    <section className="route-stop-section" aria-labelledby="route-stops-title">
      <div className="route-stop-heading"><div><span>完整路線</span><h2 id="route-stops-title">沿途車站</h2></div><strong>{detail.routeStops.length} 站</strong></div>
      {error && <p className="route-stop-inline-error" role="alert">{error}</p>}
      <ol className="route-stop-list">
        {detail.routeStops.map((routeStop, index) => {
          const selected = routeStop.stopId === selectedStopId
          return <li ref={selected ? selectedRef : undefined} className={selected ? 'selected' : ''} key={`${routeStop.stopId}-${routeStop.sequence}`}>
            <button className="route-stop-button" type="button" onClick={() => onSelect(routeStop)} disabled={loadingId !== null} aria-current={selected ? 'location' : undefined}>
              <span className="stop-line"><i>{index + 1}</i></span>
              <span className="stop-copy"><strong>{routeStop.stopName}</strong>{selected && <small>{formatFare(detail.fare)}</small>}</span>
              {loadingId === routeStop.stopId ? <span className="stop-action">載入中</span> : selected ? <span className="nearest-badge">最近</span> : <span className="stop-chevron" aria-hidden="true">›</span>}
            </button>
            {selected && <div className="inline-arrivals" aria-label={`${routeStop.stopName} 即時到站`}>
              {currentArrivals.length ? currentArrivals.map((arrival, arrivalIndex) => <div className={`inline-eta${arrivalIndex === 0 ? ' primary' : ''}`} key={`${arrival.etaTime}-${arrivalIndex}`}><time dateTime={arrival.etaTime}>{formatArrivalTime(arrival.etaTime)}</time><strong>{etaMinutesAt(arrival.etaTime, now)} 分鐘</strong></div>) : <p className={stale ? 'stale-eta-warning' : ''}>{stale ? '到站資料已過期，請重新整理。' : '暫時未有即將到站班次。'}</p>}
              <footer><span className={stale ? 'stale-label' : ''}>{updatedLabel(detail.updatedAt, now, stale)}</span>{onRefresh && <button className={`inline-refresh${refreshing ? ' refreshing' : ''}`} type="button" onClick={onRefresh} disabled={refreshing} aria-label={refreshing ? '正在更新到站資料' : '重新整理到站資料'} title="重新整理到站資料"><RotateCcwIcon className="refresh-icon" /></button>}</footer>
            </div>}
          </li>
        })}
      </ol>
    </section>
  )
}
