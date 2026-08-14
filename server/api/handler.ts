import type { IncomingMessage, ServerResponse } from 'node:http'
import { RequestValidationError, optionalServiceType, requireCoordinate, requireDirection, requireOperator, requireRoute, requireStopId } from '../domain/validation.ts'
import { UpstreamError } from '../infrastructure/fetch-json.ts'
import { busDataService } from '../services/bus-data-service.ts'
import { databaseUpdateService } from '../services/database-update-service.ts'
import { nearbyBusService } from '../services/nearby-bus-service.ts'
import { routeGeometryService } from '../services/route-geometry-service.ts'
import { serviceNoticeService } from '../services/service-notice-service.ts'

type ApiRequest = Pick<IncomingMessage, 'method' | 'url' | 'headers'>
type ApiResponse = Pick<ServerResponse, 'setHeader' | 'writeHead' | 'end'>

function sendJson(response: ApiResponse, status: number, body: unknown, cacheControl = 'no-store') {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Access-Control-Allow-Origin', process.env.BUS_API_ALLOWED_ORIGIN || '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bus-Data-Update')
  response.setHeader('Cache-Control', cacheControl)
  response.writeHead(status)
  response.end(JSON.stringify(body))
}

export async function handleBusApi(request: ApiRequest, response: ApiResponse, next?: (error?: unknown) => void) {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, null)
    return
  }
  const url = new URL(request.url || '/', 'http://localhost')
  const action = url.searchParams.get('action')
  const updateRequest = action === 'updateDatabase'
  if ((updateRequest && request.method !== 'POST') || (!updateRequest && request.method !== 'GET')) {
    sendJson(response, 405, { error: '只支援讀取巴士資料。' })
    return
  }

  try {
    if (action === 'routes') {
      sendJson(response, 200, await busDataService.getRoutes(), 'public, max-age=3600, stale-while-revalidate=604800')
      return
    }
    if (action === 'stops') {
      sendJson(response, 200, await busDataService.getStops(), 'public, max-age=3600, stale-while-revalidate=604800')
      return
    }
    if (action === 'routeStops') {
      const operator = requireOperator(url.searchParams.get('operator'))
      const route = requireRoute(url.searchParams.get('route'))
      const direction = requireDirection(url.searchParams.get('direction'))
      const serviceType = optionalServiceType(url.searchParams.get('serviceType'))
      sendJson(response, 200, await busDataService.getRouteStops(operator, { route, direction, serviceType }), 'public, max-age=3600, stale-while-revalidate=604800')
      return
    }
    if (action === 'routeGeometry') {
      const operator = requireOperator(url.searchParams.get('operator'))
      const route = requireRoute(url.searchParams.get('route'))
      const direction = requireDirection(url.searchParams.get('direction'))
      const serviceType = optionalServiceType(url.searchParams.get('serviceType'))
      const stops = (await busDataService.getRouteStops(operator, { route, direction, serviceType })).data
      sendJson(
        response,
        200,
        await routeGeometryService.getGeometry(operator, route, direction, stops),
        'public, max-age=86400, stale-while-revalidate=1209600',
      )
      return
    }
    if (action === 'eta') {
      const operator = requireOperator(url.searchParams.get('operator'))
      const route = requireRoute(url.searchParams.get('route'))
      const stopId = requireStopId(url.searchParams.get('stopId'))
      const serviceType = optionalServiceType(url.searchParams.get('serviceType'))
      sendJson(response, 200, await busDataService.getArrivals(operator, { route, stopId, serviceType }), 'public, max-age=20, stale-while-revalidate=120')
      return
    }
    if (action === 'nearby') {
      const latitude = requireCoordinate(url.searchParams.get('latitude'), 'latitude')
      const longitude = requireCoordinate(url.searchParams.get('longitude'), 'longitude')
      const force = url.searchParams.get('refresh') === '1'
      const quick = url.searchParams.get('quick') === '1'
      sendJson(response, 200, { data: await nearbyBusService.getNearby({ latitude, longitude }, force, quick) }, 'no-store')
      return
    }
    if (action === 'nearestRoute') {
      const operator = requireOperator(url.searchParams.get('operator'))
      const route = requireRoute(url.searchParams.get('route'))
      const direction = requireDirection(url.searchParams.get('direction'))
      const serviceType = optionalServiceType(url.searchParams.get('serviceType'))
      const latitude = requireCoordinate(url.searchParams.get('latitude'), 'latitude')
      const longitude = requireCoordinate(url.searchParams.get('longitude'), 'longitude')
      const force = url.searchParams.get('refresh') === '1'
      sendJson(response, 200, { data: await nearbyBusService.getNearestRoute(
        { latitude, longitude }, operator, route, direction, serviceType, force,
      ) }, 'no-store')
      return
    }
    if (action === 'alerts') {
      sendJson(response, 200, await serviceNoticeService.getNotices(), 'public, max-age=300')
      return
    }
    if (action === 'databaseStatus') {
      sendJson(response, 200, { data: databaseUpdateService.getStatus() }, 'no-store')
      return
    }
    if (action === 'updateDatabase') {
      if (request.headers?.['x-bus-data-update'] !== 'requested-by-app') {
        sendJson(response, 403, { error: '更新請求未通過應用程式驗證。' })
        return
      }
      sendJson(response, 202, { data: databaseUpdateService.start() }, 'no-store')
      return
    }

    sendJson(response, 404, { error: '找不到指定的巴士資料功能。' })
  } catch (error) {
    if (error instanceof RequestValidationError) {
      sendJson(response, error.statusCode, { error: error.message })
      return
    }
    if (error instanceof UpstreamError) {
      sendJson(response, 502, { error: error.message })
      return
    }
    if (next) {
      next(error)
      return
    }
    sendJson(response, 500, { error: '巴士資料服務暫時無法使用。' })
  }
}
