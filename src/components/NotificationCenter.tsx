import type { BusServiceAlert, RouteSelection } from '../types/bus'
import { DatabaseUpdatePanel } from './DatabaseUpdatePanel'
import { BellIcon } from './Icons'

function formatNoticeTime(value: string) {
  return new Intl.DateTimeFormat('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

export default function NotificationCenter({ alerts, loaded, onBack, onSelect }: {
  alerts: BusServiceAlert[]
  loaded: boolean
  onBack: () => void
  onSelect: (route: RouteSelection) => void
}) {
  return (
    <div className="notification-page">
      <button className="back-button" type="button" onClick={onBack}>‹ 返回</button>
      <header className="notification-heading"><p className="eyebrow">運輸署即時消息</p><h1>交通通知</h1></header>
      <DatabaseUpdatePanel />
      {!loaded && <div className="content-status" role="status"><strong>正在載入通知</strong></div>}
      {loaded && !alerts.length && (
        <section className="notification-empty" aria-labelledby="notification-empty-title">
          <div aria-hidden="true"><BellIcon className="notification-empty-icon" /></div>
          <h2 id="notification-empty-title">暫時沒有特別交通消息</h2>
        <p>消息由運輸署開放數據平台即時提供。</p>
        </section>
      )}
      {alerts.length > 0 && <section className="notification-list" aria-label="特別交通消息列表">
        {alerts.map((alert) => {
          const content = <><span className="notice-route">{alert.routeLabel}</span><strong>{alert.title}</strong><p>{alert.summary}</p><time dateTime={alert.updatedAt}>{formatNoticeTime(alert.updatedAt)}</time></>
          return alert.relatedRoute
            ? <button className="notice-item" type="button" key={alert.id} onClick={() => onSelect(alert.relatedRoute!)}>{content}</button>
            : <article className="notice-item static" key={alert.id}>{content}</article>
        })}
      </section>}
    </div>
  )
}
