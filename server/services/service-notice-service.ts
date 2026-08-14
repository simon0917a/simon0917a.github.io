import type { BusServiceNotice } from '../domain/bus.ts'

// Data.gov.hk「特別交通消息」資源的即時 XML 下載網址。
const TRAFFIC_NEWS_URL = 'https://resource.data.one.gov.hk/td/en/specialtrafficnews.xml'
const FRESH_FOR_MS = 5 * 60 * 1_000
const REQUEST_TIMEOUT_MS = 8_000

export interface ServiceNoticeResult {
  data: BusServiceNotice[]
  sourceStatus: 'available' | 'stale' | 'unavailable'
  checkedAt: string
  message: string
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function field(message: string, name: string) {
  return decodeXml(message.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '')
}

function firstField(message: string, names: string[]) {
  for (const name of names) {
    const value = field(message, name)
    if (value) return value
  }
  return ''
}

function parseNoticeDate(value: string) {
  const normalized = value.trim()
  const chineseDate = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s*(上午|下午)\s*(\d{1,2}):(\d{2}):(\d{2})$/)
  if (chineseDate) {
    const [, year, month, day, period, rawHour, minute, second] = chineseDate
    let hour = Number(rawHour) % 12
    if (period === '下午') hour += 12
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${minute}:${second}+08:00`
    return new Date(iso).toISOString()
  }

  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString()
}

function extractRouteLabels(content: string) {
  const labels = new Set<string>()
  const routeNumber = '([A-Z]{0,3}\\d{1,4}[A-Z]{0,2})'
  const patterns = [
    new RegExp(`(?:巴士路線|巴士服務[（(]?路線|路線)\\s*(?:第\\s*)?${routeNumber}(?=\\s|[)）]|、|，|,|及|和|號|線|$)`, 'gi'),
    new RegExp(`(?:九巴|龍運|城巴)\\s*${routeNumber}(?=\\s|[)）]|、|，|,|及|和|號|線|$)`, 'gi'),
  ]
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) labels.add(match[1].toUpperCase())
  }
  return [...labels].slice(0, 4)
}

function noticeTitle(content: string) {
  if (/(巴士|巴士站)/.test(content)) return '巴士服務安排'
  if (/(渡輪|航線|航班)/.test(content)) return '渡輪服務安排'
  if (/(港鐵|鐵路|列車)/.test(content)) return '鐵路服務安排'
  if (/(解封|重開|恢復通車)/.test(content)) return '道路恢復通車'
  if (/(封閉|封路|禁止駛入|只可使用餘下行車線)/.test(content)) return '道路及行車安排'
  if (/交通繁忙/.test(content)) return '交通繁忙'
  return '特別交通消息'
}

export function parseTrafficNotices(xml: string): BusServiceNotice[] {
  const messages = xml.match(/<message>[\s\S]*?<\/message>/gi) ?? []
  return messages.flatMap((message) => {
    // The current Data.gov.hk feed uses ChinText/ChinShort/msgID/ReferenceDate.
    // Keep the former field names as fallbacks so a source-side transition does not empty the app again.
    const content = firstField(message, ['ChinText', 'ChinShort', 'CONTENT_CN', 'CONTENT_TC'])
    const detail = firstField(message, ['INCIDENT_DETAIL_CN', 'INCIDENT_DETAIL_TC'])
    const summary = content || detail
    if (!summary) return []

    const combined = `${detail} ${content}`.trim()
    const incidentNumber = firstField(message, ['msgID', 'INCIDENT_NUMBER', 'IncidentRefNo', 'ID'])
    const heading = firstField(message, ['INCIDENT_HEADING_CN', 'INCIDENT_HEADING_TC']) || noticeTitle(combined)
    const location = firstField(message, ['LOCATION_CN', 'LOCATION_TC'])
    const updatedAt = firstField(message, ['ReferenceDate', 'ANNOUNCEMENT_DATE'])
    const routes = extractRouteLabels(combined)
    return [{
      id: `運輸署-${incidentNumber || updatedAt || summary.slice(0, 24)}`,
      routeLabel: routes.length ? `路線 ${routes.join('、')}` : (location || '交通消息'),
      title: location ? `${heading}｜${location}` : heading,
      summary,
      updatedAt: parseNoticeDate(updatedAt),
      priority: 'other' as const,
      relatedRoute: null,
    }]
  })
}

export class ServiceNoticeService {
  private cached: { data: BusServiceNotice[]; checkedAt: number } | null = null

  async getNotices(): Promise<ServiceNoticeResult> {
    const now = Date.now()
    if (this.cached && now - this.cached.checkedAt < FRESH_FOR_MS) {
      return this.result(this.cached.data, 'available', this.cached.checkedAt)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(TRAFFIC_NEWS_URL, {
        signal: controller.signal,
        headers: { Accept: 'application/xml, text/xml, */*' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = parseTrafficNotices(await response.text())
      this.cached = { data, checkedAt: now }
      return this.result(data, 'available', now)
    } catch {
      if (this.cached) return this.result(this.cached.data, 'stale', this.cached.checkedAt)
      return {
        data: [], sourceStatus: 'unavailable', checkedAt: new Date(now).toISOString(),
        message: '暫時無法讀取運輸署特別交通消息。',
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  private result(data: BusServiceNotice[], sourceStatus: 'available' | 'stale', checkedAt: number): ServiceNoticeResult {
    return {
      data,
      sourceStatus,
      checkedAt: new Date(checkedAt).toISOString(),
      message: data.length
        ? '顯示運輸署開放數據平台的最新特別交通消息。'
        : '目前沒有運輸署特別交通消息。',
    }
  }
}

export const serviceNoticeService = new ServiceNoticeService()
