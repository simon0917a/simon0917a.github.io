import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SOURCE_URL = 'https://static.data.gov.hk/td/routes-fares-geojson/JSON_BUS.json'
const sourcePath = process.argv[2]
const outputPath = resolve('server/data/bus-fares.json')

const sourceText = sourcePath
  ? await readFile(resolve(sourcePath), 'utf8')
  : await fetch(SOURCE_URL).then((response) => {
      if (!response.ok) throw new Error(`下載失敗：HTTP ${response.status}`)
      return response.text()
    })
const collection = JSON.parse(sourceText.replace(/^\uFEFF/, ''))
const supportedCompanies = new Set(['KMB', 'LWB', 'CTB', 'KMB+CTB', 'LWB+CTB'])
const routeDirections = new Map()

for (const feature of collection.features ?? []) {
  const item = feature.properties ?? {}
  if (!supportedCompanies.has(item.companyCode) || !Number.isFinite(Number(item.fullFare))) continue
  const routeSequence = Number(item.routeSeq)
  if (routeSequence !== 1 && routeSequence !== 2) continue
  const key = `${item.routeId}:${routeSequence}`
  if (routeDirections.has(key)) continue
  routeDirections.set(key, {
    route: String(item.routeNameC ?? '').trim().toUpperCase(),
    direction: routeSequence === 1 ? 'outbound' : 'inbound',
    destination: String(routeSequence === 1 ? item.locEndNameC : item.locStartNameC).trim(),
    fare: Number(item.fullFare),
    companies: String(item.companyCode).split('+'),
    serviceMode: String(item.serviceMode ?? ''),
    special: Number(item.specialType ?? 0) !== 0,
    updatedAt: String(item.lastUpdateDate ?? ''),
  })
}

const records = [...routeDirections.values()].sort((left, right) =>
  left.route.localeCompare(right.route, 'en', { numeric: true }) ||
  left.direction.localeCompare(right.direction) ||
  left.destination.localeCompare(right.destination, 'zh-Hant-HK'),
)

await writeFile(outputPath, `${JSON.stringify({ source: SOURCE_URL, generatedAt: new Date().toISOString(), records })}\n`, 'utf8')
console.log(`已建立 ${records.length} 個巴士路線方向車費紀錄：${outputPath}`)
