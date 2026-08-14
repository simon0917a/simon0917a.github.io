import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_URL = 'https://rt.data.gov.hk/v2/transport/citybus'
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../server/data/citybus-network.json')
const CONCURRENCY = 20

async function fetchJson(path, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (response.ok) return response.json()
    if (response.status === 422 || response.status === 404) return null
    if (attempt === attempts) throw new Error(`${path} 回傳 ${response.status}`)
    await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 500))
  }
}

async function mapLimit(items, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
  return results
}

const routeResponse = await fetchJson('/route/CTB')
const directions = routeResponse.data.flatMap((route) => [
  { route: route.route, direction: 'outbound', destination: route.dest_tc },
  { route: route.route, direction: 'inbound', destination: route.orig_tc },
])

const routeGroups = (await mapLimit(directions, async (entry, index) => {
  if (index % 100 === 0) console.log(`正在讀取城巴站序：${index}/${directions.length}`)
  const response = await fetchJson(`/route-stop/CTB/${encodeURIComponent(entry.route)}/${entry.direction}`)
  if (!response?.data?.length) return []
  return response.data.map((item) => ({
    route: entry.route,
    direction: entry.direction,
    destination: entry.destination,
    sequence: Number(item.seq),
    stopId: item.stop,
  }))
})).flat()

const stopIds = [...new Set(routeGroups.map((item) => item.stopId))]
const stops = await mapLimit(stopIds, async (stopId, index) => {
  if (index % 250 === 0) console.log(`正在讀取城巴站點：${index}/${stopIds.length}`)
  const response = await fetchJson(`/stop/${encodeURIComponent(stopId)}`)
  const stop = response.data
  return {
    stopId: stop.stop,
    stopName: stop.name_tc.trim(),
    latitude: Number(stop.lat),
    longitude: Number(stop.long),
  }
})

const routeMemberships = new Map()
for (const item of routeGroups) {
  const memberships = routeMemberships.get(item.stopId) ?? []
  memberships.push({
    route: item.route,
    direction: item.direction,
    destination: item.destination,
    serviceType: '1',
    sequence: item.sequence,
  })
  routeMemberships.set(item.stopId, memberships)
}

const index = {
  generatedAt: new Date().toISOString(),
  source: `${BASE_URL}/route/CTB`,
  stops: stops.map((stop) => ({ ...stop, routes: routeMemberships.get(stop.stopId) ?? [] })),
}

await mkdir(dirname(OUTPUT), { recursive: true })
await writeFile(OUTPUT, `${JSON.stringify(index)}\n`, 'utf8')
console.log(`已建立 ${index.stops.length} 個城巴站點及 ${routeGroups.length} 筆路線站序：${OUTPUT}`)
