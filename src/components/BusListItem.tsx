import type { NearbyBus } from '../types/bus'
import { etaMinutesAt, isEtaCurrent, isEtaDataStale } from '../services/eta-time'

function formatArrivalTime(value: string) {
  return new Intl.DateTimeFormat('zh-HK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function formatFare(fare: number | null) {
  return fare == null ? '車費未有資料' : `全程車費 $${fare.toFixed(fare % 1 ? 1 : 0)}`
}

export function BusListItem({ bus, onSelect, now = Date.now() }: { bus: NearbyBus; onSelect: (bus: NearbyBus) => void; now?: number }) {
  const operatorClass = bus.internalOperator === 'citybus' ? 'citybus' : 'kmb'
  const operatorLabel = bus.internalOperator === 'citybus' ? '城巴' : '九巴・龍運'
  const dataStale = isEtaDataStale(bus.updatedAt, now)
  const currentArrivals = dataStale ? [] : bus.arrivals.filter((arrival) => isEtaCurrent(arrival.etaTime, now)).slice(0, 2)
  return (
    <button className={`bus-list-item ${operatorClass}${dataStale ? ' data-stale' : ''}`} type="button" onClick={() => onSelect(bus)}>
      <span className="bus-list-main">
        <span className="route-identity"><strong className="route-number">{bus.route}</strong><small>{operatorLabel}</small></span>
        <span className="route-copy">
          <strong>往 {bus.destination}</strong>
          <small>{formatFare(bus.fare)}</small>
        </span>
        <span className="eta-column" aria-label="預計到站時間">
          <small className={`eta-label${dataStale ? ' stale-label' : ''}`}>{dataStale ? '資料已過期' : '預計抵站'}</small>
          {currentArrivals.map((arrival, index) => (
            <span className={`eta-row${index === 0 ? ' primary' : ''}`} key={`${arrival.etaTime}-${index}`}>
              <time dateTime={arrival.etaTime}>{formatArrivalTime(arrival.etaTime)}</time>
              <strong>{etaMinutesAt(arrival.etaTime, now)} 分鐘</strong>
            </span>
          ))}
          {!currentArrivals.length && <span className="eta-unavailable">{dataStale ? '請重新整理' : '暫未有班次'}</span>}
        </span>
      </span>
      {bus.serviceAlert && <span className="service-alert">{bus.serviceAlert.title}</span>}
    </button>
  )
}

export { formatArrivalTime, formatFare }
