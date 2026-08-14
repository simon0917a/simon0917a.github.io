import { describe, expect, it, vi } from 'vitest'
import { SwrCache } from './swr-cache.ts'

const policy = { freshForMs: 1_000, staleForMs: 10_000 }

describe('SwrCache', () => {
  it('共用相同快取鍵的同時請求', async () => {
    let resolveLoader!: (value: string) => void
    const loader = vi.fn(() => new Promise<string>((resolve) => { resolveLoader = resolve }))
    const cache = new SwrCache()

    const first = cache.get('same', loader, policy)
    const second = cache.get('same', loader, policy)
    resolveLoader('資料')

    await expect(first).resolves.toMatchObject({ data: '資料' })
    await expect(second).resolves.toMatchObject({ data: '資料' })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('在失效期間先回傳舊資料並在背景更新', async () => {
    let now = 0
    const loader = vi.fn().mockResolvedValueOnce('舊資料').mockResolvedValueOnce('新資料')
    const cache = new SwrCache({ now: () => now })

    await cache.get('swr', loader, policy)
    now = 1_500
    const stale = await cache.get('swr', loader, policy)

    expect(stale.data).toBe('舊資料')
    expect(stale.cache.isStale).toBe(true)
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
  })

  it('更新失敗時保留最後成功資料並明確標示失效', async () => {
    let now = 0
    const loader = vi.fn().mockResolvedValueOnce('最後成功資料').mockRejectedValueOnce(new Error('上游失敗'))
    const cache = new SwrCache({ now: () => now })

    await cache.get('fallback', loader, policy)
    now = 20_000
    const fallback = await cache.get('fallback', loader, policy)

    expect(fallback.data).toBe('最後成功資料')
    expect(fallback.cache.state).toBe('stale')
    expect(fallback.cache.isStale).toBe(true)
  })

  it('強制更新會繞過仍然新鮮的快取', async () => {
    const loader = vi.fn().mockResolvedValueOnce('第一版').mockResolvedValueOnce('第二版')
    const cache = new SwrCache()

    await cache.get('force', loader, policy)
    const refreshed = await cache.force('force', loader, policy)

    expect(loader).toHaveBeenCalledTimes(2)
    expect(refreshed.data).toBe('第二版')
    expect(refreshed.cache.state).toBe('miss')
  })

  it('強制更新失敗時仍回傳最後成功資料', async () => {
    const loader = vi.fn().mockResolvedValueOnce('最後成功資料').mockRejectedValueOnce(new Error('上游失敗'))
    const cache = new SwrCache()

    await cache.get('force-fallback', loader, policy)
    const fallback = await cache.force('force-fallback', loader, policy)

    expect(fallback.data).toBe('最後成功資料')
    expect(fallback.cache.state).toBe('stale')
    expect(fallback.cache.isStale).toBe(true)
  })
})
