import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BusListItem } from './components/BusListItem'
import { FavoritesPage } from './components/FavoritesPage'
import { RouteDetail } from './components/RouteDetail'
import { useGeolocation } from './hooks/useGeolocation'
import { useFavorites } from './hooks/useFavorites'
import { useServiceAlerts } from './hooks/useServiceAlerts'
import { useMinuteClock } from './hooks/useMinuteClock'
import { getCurrentPosition, getNearbyBuses, getNearestRoute, getRouteGeometry, getRouteStops } from './services/bus-api'
import { createNearbyCache, NEARBY_CACHE_KEY, readNearbyCache } from './services/nearby-cache'
import { updatedLabel } from './services/eta-time'
import { sortNearbyBuses } from './services/route-order'
import type { NearbyBus, NearestRouteResult, RouteGeometry, RouteSelection } from './types/bus'
import { RotateCcwIcon, StarIcon } from './components/Icons'

const SearchPage = lazy(() => import('./components/SearchPage'))
const NotificationCenter = lazy(() => import('./components/NotificationCenter'))

type Tab = 'home' | 'favorites' | 'search'
type IconProps = { className?: string }

function HomeIcon({ className }: IconProps) { return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.8 12 3.7l8.5 7.1v8.4a1.3 1.3 0 0 1-1.3 1.3h-4.4v-6h-5.6v6H4.8a1.3 1.3 0 0 1-1.3-1.3v-8.4Z" /></svg> }
function SearchIcon({ className }: IconProps) { return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.3 4.3" /></svg> }
function BellIcon() { return <svg className="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 9.8c0-3.7-2.1-6.1-5.2-6.5V2h-2.2v1.3C7.8 3.7 5.7 6.1 5.7 9.8c0 4-1.6 5.1-2.2 6.2h17c-.6-1.1-2.2-2.2-2.2-6.2ZM9.3 18.2a2.8 2.8 0 0 0 5.4 0" /></svg> }
function BusMark() {
  return <svg className="bus-mark" viewBox="0 0 64 72" aria-hidden="true">
    <path className="bus-mark-body" d="M14 5h36a8 8 0 0 1 8 8v44a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5V13a8 8 0 0 1 8-8Z" />
    <path className="bus-mark-window" d="M12 14h40v15H12zM12 34h40v15H12z" />
    <path className="bus-mark-divider" d="M32 14v15M32 34v15" />
    <path className="bus-mark-detail" d="M4 24H1v15h5M60 24h3v15h-5M22 55h20" />
    <circle cx="16" cy="55" r="3" /><circle cx="48" cy="55" r="3" />
    <path className="bus-mark-wheel" d="M13 62v4h9v-4M42 62v4h9v-4" />
  </svg>
}

function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return <header className="page-header"><BusMark /><div><p className="eyebrow">HK BUS <span>LIVE</span></p><h1>{title}</h1></div>{action}</header>
}

function LocationEmptyState({ requesting, onRequest }: { requesting: boolean; onRequest: () => void }) {
  if (requesting) {
    return (
      <section className="location-loading" aria-labelledby="location-loading-title" aria-live="polite">
        <div className="location-orbit" aria-hidden="true">
          <span className="location-pulse" />
          <span className="location-pin"><i /></span>
        </div>
        <p className="location-kicker">正在準備附近巴士</p>
        <h2 id="location-loading-title">正在取得你的位置</h2>
        <p>只會用來尋找附近車站，不會顯示或儲存你的精確位置。</p>
        <div className="location-progress" aria-hidden="true"><span /></div>
        <small>通常只需幾秒</small>
      </section>
    )
  }
  return (
    <section className="location-empty" aria-labelledby="location-title">
      <div className="location-visual" aria-hidden="true">
        <span className="location-road"><i /><i /><i /></span>
        <span className="location-bus"><b /><b /><em /><em /></span>
        <span className="location-stop-sign">⌖</span>
      </div>
      <p className="location-kicker">即時巴士・就在附近</p>
      <h2 id="location-title">開啟定位後，即可查看附近巴士的到站時間。</h2>
      <p>位置只用於自動找出最近可乘搭的車站。</p>
      <button className="primary-button" type="button" onClick={onRequest}>開啟定位</button>
    </section>
  )
}

function HomePage({ onOpenDetail, onOpenNotifications, unreadCount }: {
  onOpenDetail: (bus: NearbyBus) => void
  onOpenNotifications: () => void
  unreadCount: number
}) {
  const { status, position, requestLocation } = useGeolocation()
  const [buses, setBuses] = useState<NearbyBus[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [stale, setStale] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshBlocked, setRefreshBlocked] = useState(false)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const lastManualRefresh = useRef(0)
  const now = useMinuteClock()
  const sortedBuses = useMemo(() => sortNearbyBuses(buses), [buses])

  const applyCachedFares = (latest: NearbyBus[], cachedBuses: NearbyBus[] | undefined) => latest.map((bus) => {
    if (bus.fare != null) return bus
    const match = cachedBuses?.find((cachedBus) =>
      cachedBus.internalOperator === bus.internalOperator && cachedBus.route === bus.route &&
      cachedBus.direction === bus.direction && cachedBus.destination === bus.destination,
    )
    return match?.fare == null ? bus : { ...bus, fare: match.fare }
  })

  useEffect(() => {
    if (!position) return
    const controller = new AbortController()
    const cached = readNearbyCache(localStorage.getItem(NEARBY_CACHE_KEY), position)
    if (cached) {
      setBuses(cached.buses)
      setUpdatedAt(cached.savedAt)
      setStale(true)
    } else {
      setLoading(true)
    }
    setError(false)
    const saveLatest = (latest: NearbyBus[], savedAt = new Date().toISOString()) => {
      const enriched = applyCachedFares(latest, cached?.buses)
      setBuses(enriched)
      setUpdatedAt(savedAt)
      setStale(false)
      setError(false)
      localStorage.setItem(NEARBY_CACHE_KEY, JSON.stringify(createNearbyCache(enriched, position, savedAt)))
    }
    const refresh = async (force = false, quick = false) => {
      if (document.visibilityState !== 'visible') return Promise.resolve()
      if (force) setRefreshing(true)
      try {
        const latest = await getNearbyBuses(position, controller.signal, force, quick)
        const firstSavedAt = new Date().toISOString()
        saveLatest(latest, firstSavedAt)
        setLoading(false)
        if (quick && !controller.signal.aborted) {
          const complete = await getNearbyBuses(position, controller.signal)
          saveLatest(complete.length >= latest.length ? complete : latest, firstSavedAt)
        }
      } catch (requestError: unknown) {
        if (requestError instanceof Error && requestError.name === 'AbortError') return
        setError(true)
        if (cached) setStale(true)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }
    void refresh(refreshNonce > 0, !cached && refreshNonce === 0)
    const interval = window.setInterval(() => { void refresh(true) }, 25_000)
    const visibility = () => { if (document.visibilityState === 'visible') void refresh(true) }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      controller.abort()
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [position, refreshNonce])

  const manualRefresh = () => {
    const current = Date.now()
    if (current - lastManualRefresh.current < 10_000) {
      setRefreshBlocked(true)
      window.setTimeout(() => setRefreshBlocked(false), 2_000)
      return
    }
    lastManualRefresh.current = current
    setRefreshNonce((value) => value + 1)
  }

  return (
    <>
      <PageHeader title="附近巴士" action={<button className="icon-button notification-button" type="button" aria-label={`開啟通知中心${unreadCount ? `，${unreadCount} 則未讀` : ''}`} onClick={onOpenNotifications}><BellIcon />{unreadCount > 0 && <span className="notification-dot" aria-hidden="true" />}</button>} />
      {status !== 'ready' && <LocationEmptyState requesting={status === 'requesting'} onRequest={requestLocation} />}
      {status === 'ready' && loading && <div className="content-status" role="status"><strong>正在尋找附近巴士</strong><span>取得最新到站時間，請稍候。</span></div>}
      {status === 'ready' && error && !buses.length && <div className="content-status error" role="alert"><strong>暫時無法取得巴士資料</strong><span>請稍後再試。</span></div>}
      {status === 'ready' && !loading && !error && buses.length === 0 && <div className="content-status"><strong>附近暫未有到站資料</strong><span>可稍後再查看。</span></div>}
      {status === 'ready' && !loading && buses.length > 0 && (
        <>
          <div className="list-toolbar">
            <span className={stale || error ? 'stale-label' : ''}><i aria-hidden="true" />{updatedLabel(updatedAt, now, stale || error)}</span>
            <button className={refreshing ? 'refreshing' : ''} type="button" onClick={manualRefresh} disabled={refreshing}><RotateCcwIcon className="refresh-icon" /><span>{refreshing ? '更新中…' : '重新整理'}</span></button>
          </div>
          <div className="nearby-station-heading">
            <div><span>當前站點</span><strong>{buses[0]?.stopName || '附近巴士站'}</strong></div>
            <small>{buses.length} 條路線</small>
          </div>
          {refreshBlocked && <p className="refresh-message" role="status">剛剛已重新整理，請稍候再試。</p>}
          <section className="bus-list" aria-label="附近巴士到站時間">
            {sortedBuses.map((bus) => <BusListItem key={`${bus.internalOperator}-${bus.route}-${bus.destination}-${bus.direction}`} bus={bus} onSelect={onOpenDetail} now={now} />)}
          </section>
        </>
      )}
    </>
  )
}


const tabs: Array<{ id: Tab; label: string; icon: typeof HomeIcon }> = [
  { id: 'home', label: '首頁', icon: HomeIcon }, { id: 'favorites', label: '收藏', icon: StarIcon }, { id: 'search', label: '搜尋', icon: SearchIcon },
]

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [detail, setDetail] = useState<NearestRouteResult | null>(null)
  const [routeGeometry, setRouteGeometry] = useState<RouteGeometry>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [hasPosition, setHasPosition] = useState(false)
  const [detailContext, setDetailContext] = useState<{ route: RouteSelection; position: { latitude: number; longitude: number } } | null>(null)
  const [detailRefreshing, setDetailRefreshing] = useState(false)
  const [detailStale, setDetailStale] = useState(false)
  const [detailRefreshBlocked, setDetailRefreshBlocked] = useState(false)
  const lastDetailManualRefresh = useRef(0)
  const detailRequestId = useRef(0)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const { favorites, isFavorite, toggleFavorite } = useFavorites()
  const preloadTestAlerts = import.meta.env.DEV && new URLSearchParams(window.location.search).get('testAlerts') === '1'
  const { alerts, loaded: alertsLoaded, unreadCount, markAllRead } = useServiceAlerts(notificationOpen || preloadTestAlerts)

  useEffect(() => {
    if (notificationOpen && alertsLoaded) markAllRead()
  }, [notificationOpen, alertsLoaded])

  const openDetail = (route: RouteSelection) => {
    const requestId = ++detailRequestId.current
    let rendered = false
    setRouteGeometry([])
    setDetail({
      ...route,
      selectedStop: null,
      arrivals: [],
      fare: null,
      updatedAt: null,
      alternatives: [],
      routeStops: [],
    })
    setDetailLoading(false)
    setDetailError(false)
    const positionPromise = getCurrentPosition().then((position) => {
      if (requestId === detailRequestId.current) {
        setHasPosition(true)
        setDetailContext({ route, position })
      }
      return position
    })
    const stopsPromise = getRouteStops(route.route, route.direction, route.serviceType, route.internalOperator)
    void getRouteGeometry(route.route, route.direction, route.serviceType, route.internalOperator)
      .then((geometry) => {
        if (requestId === detailRequestId.current) setRouteGeometry(geometry)
      })
      .catch(() => undefined)

    const previewPromise = stopsPromise.then((routeStops) => {
      if (requestId !== detailRequestId.current || !routeStops.length) return
      const source = route as RouteSelection & Partial<NearbyBus>
      const matchedStop = source.stopId ? routeStops.find((stop) => stop.stopId === source.stopId) : undefined
      const hasExistingArrivals = Boolean(
        matchedStop && typeof source.distanceMeters === 'number' && source.distanceMeters <= 850 && source.arrivals?.length,
      )
      rendered = true
      setDetail({
        route: route.route,
        destination: route.destination,
        direction: route.direction,
        serviceType: route.serviceType,
        internalOperator: route.internalOperator,
        selectedStop: hasExistingArrivals && matchedStop
          ? { ...matchedStop, distanceMeters: source.distanceMeters! }
          : null,
        arrivals: hasExistingArrivals ? source.arrivals! : [],
        fare: typeof source.fare === 'number' ? source.fare : null,
        updatedAt: hasExistingArrivals ? source.updatedAt ?? null : null,
        alternatives: [],
        routeStops,
      })
      setDetailLoading(false)
    })

    const finalPromise = positionPromise
      .then((position) => getNearestRoute(
        position, route.route, route.direction, route.serviceType, route.internalOperator,
      ))
      .then((latest) => {
        if (requestId !== detailRequestId.current) return
        rendered = true
        setDetail(latest)
        setDetailLoading(false)
      })

    void Promise.allSettled([previewPromise, finalPromise]).then(() => {
      if (requestId !== detailRequestId.current || rendered) return
      setDetail(null)
      setHasPosition(false)
      setDetailError(true)
      setDetailLoading(false)
    })
  }

  const refreshDetail = (force = true) => {
    if (!detailContext || document.visibilityState !== 'visible') return Promise.resolve()
    setDetailRefreshing(true)
    return getNearestRoute(
      detailContext.position,
      detailContext.route.route,
      detailContext.route.direction,
      detailContext.route.serviceType,
      detailContext.route.internalOperator,
      undefined,
      force,
    ).then((latest) => {
      setDetail(latest)
      setDetailStale(false)
    }).catch(() => setDetailStale(true)).finally(() => setDetailRefreshing(false))
  }

  const manualDetailRefresh = () => {
    const current = Date.now()
    if (current - lastDetailManualRefresh.current < 10_000) {
      setDetailRefreshBlocked(true)
      window.setTimeout(() => setDetailRefreshBlocked(false), 2_000)
      return
    }
    lastDetailManualRefresh.current = current
    void refreshDetail(true)
  }

  useEffect(() => {
    if (!detail || !detailContext) return
    const interval = window.setInterval(() => { void refreshDetail(true) }, 25_000)
    const visibility = () => { if (document.visibilityState === 'visible') void refreshDetail(true) }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [Boolean(detail), detailContext?.route.route, detailContext?.route.direction])

  const closeDetail = () => {
    detailRequestId.current += 1
    setDetail(null)
    setDetailContext(null)
    setDetailError(false)
    setDetailLoading(false)
    setDetailStale(false)
    setDetailRefreshBlocked(false)
    lastDetailManualRefresh.current = 0
  }

  if (notificationOpen) return <div className="app-shell"><main className="page-content detail-content"><Suspense fallback={<div className="content-status"><strong>正在開啟通知</strong></div>}><NotificationCenter alerts={alerts} loaded={alertsLoaded} onBack={() => setNotificationOpen(false)} onSelect={(route) => { setNotificationOpen(false); openDetail(route) }} /></Suspense></main></div>

  if (detail) return <div className="app-shell"><main className="page-content detail-content"><RouteDetail detail={detail} routeGeometry={routeGeometry} onBack={closeDetail} favorite={isFavorite(detail)} onToggleFavorite={toggleFavorite} stale={detailStale} refreshing={detailRefreshing} refreshBlocked={detailRefreshBlocked} onRefresh={manualDetailRefresh} /></main></div>
  if (detailLoading) return <div className="app-shell"><main className="page-content detail-content"><button className="back-button" type="button" onClick={closeDetail}>‹ 返回</button><div className="content-status"><strong>正在尋找最近可乘搭車站</strong><span>確認正確方向及到站時間。</span></div></main></div>
  if (detailError) return <div className="app-shell"><main className="page-content detail-content"><button className="back-button" type="button" onClick={closeDetail}>‹ 返回</button><div className="content-status error"><strong>未能開啟路線詳情</strong><span>{hasPosition ? '暫時無法取得到站資料。' : '請開啟定位後再試。'}</span></div></main></div>

  return (
    <div className="app-shell">
      <main className="page-content" id="main-content">
        {activeTab === 'home' && <HomePage onOpenDetail={openDetail} onOpenNotifications={() => setNotificationOpen(true)} unreadCount={unreadCount} />}
        {activeTab === 'favorites' && <><PageHeader title="收藏" /><FavoritesPage favorites={favorites} onSelect={openDetail} /></>}
        {activeTab === 'search' && <Suspense fallback={<div className="content-status" role="status"><strong>正在開啟搜尋</strong></div>}><SearchPage onSelect={openDetail} /></Suspense>}
      </main>
      <nav className="bottom-nav" aria-label="主要導覽">
        {tabs.map(({ id, label, icon: Icon }) => <button className={`nav-item${activeTab === id ? ' active' : ''}`} type="button" key={id} aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)}><Icon className="nav-icon" /><span>{label}</span></button>)}
      </nav>
    </div>
  )
}

export default App
