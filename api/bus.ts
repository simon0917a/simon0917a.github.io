import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleBusApi } from '../server/api/handler.ts'

export default function handler(request: IncomingMessage, response: ServerResponse) {
  return handleBusApi(request, response)
}
