import { describe, expect, it } from 'vitest'
import { parseTrafficNotices } from './service-notice-service.ts'

const message = (number: string, detail: string, content: string) => `<message>
  <INCIDENT_NUMBER>${number}</INCIDENT_NUMBER>
  <INCIDENT_HEADING_CN>交通事故</INCIDENT_HEADING_CN>
  <INCIDENT_DETAIL_CN>${detail}</INCIDENT_DETAIL_CN>
  <LOCATION_CN>測試道路</LOCATION_CN>
  <ANNOUNCEMENT_DATE>2026-08-12T11:55:00</ANNOUNCEMENT_DATE>
  <CONTENT_CN>${content}</CONTENT_CN>
</message>`

const liveMessage = (number: string, content: string, date = '2026/8/13 下午 03:02:05') => `<message>
  <msgID>${number}</msgID>
  <CurrentStatus>3</CurrentStatus>
  <ChinText>${content}</ChinText>
  <ChinShort>${content}</ChinShort>
  <ReferenceDate> ${date}</ReferenceDate>
</message>`

describe('運輸署特別交通消息', () => {
  it('解析 Data.gov.hk 現行格式並顯示一般特別交通消息', () => {
    const xml = `<body>
      ${liveMessage('BUS-1', '渡輪班次改由巴士服務(路線NR338S)代替營運。')}
      ${liveMessage('ROAD-1', '因緊急維修，部份行車線封閉，現時交通繁忙。')}
    </body>`
    const notices = parseTrafficNotices(xml)

    expect(notices).toHaveLength(2)
    expect(notices[0]).toMatchObject({
      id: '運輸署-BUS-1',
      routeLabel: '路線 NR338S',
      title: '巴士服務安排',
      updatedAt: '2026-08-13T07:02:05.000Z',
      priority: 'other',
    })
    expect(notices[1]).toMatchObject({ id: '運輸署-ROAD-1', routeLabel: '交通消息', title: '道路及行車安排' })
  })

  it('繼續兼容舊格式，沒有路線號碼時不建立路線連結', () => {
    const notices = parseTrafficNotices(`<list>${message('STOP-1', '巴士站暫停使用', '現有巴士站暫停使用，請使用臨時巴士站。')}</list>`)
    expect(notices[0].relatedRoute).toBeNull()
    expect(notices[0].routeLabel).toBe('測試道路')
  })

  it('解碼 CDATA 及數字 XML entity，並略過空白消息', () => {
    const notices = parseTrafficNotices(`<body>
      ${liveMessage('ENTITY-1', '<![CDATA[道路已重開 &#039;測試路段&#039;。]]>')}
      <message><msgID>EMPTY</msgID><ChinText> </ChinText></message>
    </body>`)

    expect(notices).toHaveLength(1)
    expect(notices[0].summary).toBe("道路已重開 '測試路段'。")
  })
})
