export const ETA_STALE_AFTER_MS = 10 * 60_000
export const ETA_PAST_GRACE_MS = 60_000

export function isEtaDataStale(updatedAt: string | null | undefined, now: number, maxAgeMs = ETA_STALE_AFTER_MS) {
  if (!updatedAt) return true
  const updated = Date.parse(updatedAt)
  if (!Number.isFinite(updated)) return true
  return now - updated > maxAgeMs
}

export function etaMinutesAt(etaTime: string, now: number) {
  const eta = Date.parse(etaTime)
  if (!Number.isFinite(eta)) return 0
  return Math.max(0, Math.ceil((eta - now) / 60_000))
}

export function isEtaCurrent(etaTime: string, now: number, pastGraceMs = ETA_PAST_GRACE_MS) {
  const eta = Date.parse(etaTime)
  return Number.isFinite(eta) && eta >= now - pastGraceMs
}

export function updatedLabel(updatedAt: string | null, now: number, stale = false) {
  if (!updatedAt) return stale ? '上次成功資料' : '暫未有更新時間'
  const minutes = Math.max(0, Math.floor((now - Date.parse(updatedAt)) / 60_000))
  const age = minutes < 1 ? '剛才' : `${minutes} 分鐘前`
  return stale ? `上次成功資料，更新於${age}` : `資料更新於${age}`
}
