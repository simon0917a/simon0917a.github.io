import { useEffect, useMemo, useState } from 'react'
import { getRoutes } from '../services/bus-api'
import { availableRouteLetters, filterRoutes, ROUTE_LETTERS, ROUTE_NUMBERS } from '../services/route-search'
import type { BusRoute, RouteSelection } from '../types/bus'
import { DeleteIcon, XIcon } from './Icons'

const MAX_QUERY_LENGTH = 8
const SEARCH_HISTORY_KEY = 'hk-bus-search-history-v1'
const MAX_SEARCH_HISTORY = 6
const POPULAR_ROUTES = ['11X', '601', '88', '95'] as const

function routeKey(route: RouteSelection) {
  return [route.internalOperator, route.route, route.direction, route.serviceType, route.destination].join('|')
}

function readSearchHistory() {
  try {
    const value = JSON.parse(window.localStorage.getItem(SEARCH_HISTORY_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is BusRoute => Boolean(item && typeof item.route === 'string' && typeof item.destination === 'string')).slice(0, MAX_SEARCH_HISTORY) : []
  } catch {
    return []
  }
}

export default function SearchPage({ onSelect }: { onSelect: (route: RouteSelection) => void }) {
  const [routes, setRoutes] = useState<BusRoute[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [searchHistory, setSearchHistory] = useState<BusRoute[]>(readSearchHistory)
  const results = useMemo(() => filterRoutes(routes, query), [routes, query])
  const letters = useMemo(() => availableRouteLetters(routes, query), [routes, query])
  const popularRoutes = useMemo(() => {
    const available = new Set(routes.map((route) => route.route.toUpperCase()))
    return POPULAR_ROUTES.filter((route) => available.has(route))
  }, [routes])

  useEffect(() => {
    const controller = new AbortController()
    getRoutes(controller.signal)
      .then(setRoutes)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === 'AbortError') return
        setError(true)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  const append = (value: string) => setQuery((current) => current.length < MAX_QUERY_LENGTH ? `${current}${value}` : current)
  const remove = () => setQuery((current) => current.slice(0, -1))
  const selectRoute = (route: BusRoute) => {
    const next = [route, ...searchHistory.filter((item) => routeKey(item) !== routeKey(route))].slice(0, MAX_SEARCH_HISTORY)
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next))
    setSearchHistory(next)
    onSelect(route)
  }
  const clearSearchHistory = () => {
    window.localStorage.removeItem(SEARCH_HISTORY_KEY)
    setSearchHistory([])
  }

  return (
    <div className="search-page">
      <header className="search-header">
        <p className="eyebrow">HK BUS <span>ROUTE FINDER</span></p>
        <h1>搜尋路線</h1>
      </header>

      <div className="route-input-row">
        <div className={`route-input-display${query ? '' : ' empty'}`} role="textbox" aria-label="已輸入路線號碼" aria-readonly="true">
          {query || '輸入路線號碼'}
        </div>
        {query && <button type="button" className="input-clear" onClick={() => setQuery('')} aria-label="清除路線號碼"><XIcon className="x-icon" /></button>}
      </div>

      <section className={`search-results${query ? ' has-query' : ` has-quick${searchHistory.length ? ' has-history' : ' has-popular'}`}`} aria-label="路線搜尋結果" aria-live="polite">
        {loading && <p className="search-message">正在載入路線…</p>}
        {error && <p className="search-message error">暫時無法載入路線。</p>}
        {!loading && !error && !query && (searchHistory.length > 0
          ? <div className="search-quick search-history">
              <div className="search-quick-heading"><span>最近搜尋</span><button type="button" onClick={clearSearchHistory}>清除</button></div>
              {searchHistory.map((route) => <button className="quick-route" type="button" key={routeKey(route)} onClick={() => selectRoute(route)}><strong>{route.route}</strong><span>往 {route.destination}</span><small>{route.direction === 'outbound' ? '去程' : '回程'}</small><i>›</i></button>)}
            </div>
          : <div className="search-quick popular-routes">
              <div className="search-quick-heading popular-heading"><span>熱門路線 <small>（點擊直接查看）</small></span></div>
              <div className="popular-route-grid">
                {(popularRoutes.length ? popularRoutes : POPULAR_ROUTES).map((route) => <button type="button" key={route} onClick={() => setQuery(route)}>{route}</button>)}
              </div>
            </div>
        )}
        {!loading && !error && query && !results.length && <p className="search-message">找不到符合「{query}」的巴士路線。</p>}
        {results.map((route) => (
          <button className={`search-result ${route.internalOperator === 'citybus' ? 'citybus' : 'kmb'}`} type="button" key={`${route.internalOperator}-${route.route}-${route.destination}-${route.direction}`} onClick={() => selectRoute(route)}>
            <strong>{route.route}</strong>
            <span><b><i aria-hidden="true">{route.direction === 'outbound' ? '↑' : '↓'}</i> 往 {route.destination}</b><small>{route.direction === 'outbound' ? '去程' : '回程'} · {route.internalOperator === 'citybus' ? '城巴' : '九巴・龍運'}</small></span>
          </button>
        ))}
      </section>

      <section className="route-keyboard" aria-label="路線號碼鍵盤">
        <div className="number-pad" aria-label="數字鍵盤">
          {ROUTE_NUMBERS.slice(0, 9).map((number) => <button type="button" key={number} onClick={() => append(number)}>{number}</button>)}
          <button type="button" className="zero-key" onClick={() => append('0')}>0</button>
          <button type="button" className="keyboard-backspace" onClick={remove} disabled={!query} aria-label="刪除最後一個字元"><DeleteIcon className="delete-icon" /></button>
        </div>
        <div className={`letter-pad${query ? ' filtered' : ''}`} aria-label="字母鍵盤">
          {(query ? letters : ROUTE_LETTERS).map((letter) => <button type="button" key={letter} onClick={() => append(letter)}>{letter}</button>)}
          {!loading && query && letters.length === 0 && <p className="letter-empty">這個號碼沒有其他英文字母尾碼</p>}
        </div>
      </section>
    </div>
  )
}
