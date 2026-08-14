export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

export async function fetchJson<T>(url: string, timeoutMs = 8_000): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new UpstreamError(`上游資料服務回傳 ${response.status}。`, response.status)
    }

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof UpstreamError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new UpstreamError('上游資料服務逾時。')
    }
    throw new UpstreamError('無法連接上游資料服務。')
  } finally {
    clearTimeout(timeout)
  }
}
