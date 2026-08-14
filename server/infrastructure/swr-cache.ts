import type { CacheMetadata, CacheState, DataEnvelope } from '../domain/bus.ts'

interface CacheEntry<T> {
  value: T
  updatedAt: number
  freshUntil: number
  staleUntil: number
}

export interface CachePolicy {
  freshForMs: number
  staleForMs: number
}

export interface SwrCacheOptions {
  now?: () => number
}

export class SwrCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>()
  private readonly inFlight = new Map<string, Promise<unknown>>()
  private readonly now: () => number

  constructor(options: SwrCacheOptions = {}) {
    this.now = options.now ?? Date.now
  }

  async get<T>(key: string, loader: () => Promise<T>, policy: CachePolicy): Promise<DataEnvelope<T>> {
    const entry = this.entries.get(key) as CacheEntry<T> | undefined
    const now = this.now()

    if (entry && now < entry.freshUntil) {
      return this.envelope(entry, 'fresh')
    }

    if (entry && now < entry.staleUntil) {
      void this.refresh(key, loader, policy).catch(() => undefined)
      return this.envelope(entry, 'stale')
    }

    try {
      const refreshed = await this.refresh(key, loader, policy)
      return this.envelope(refreshed, 'miss')
    } catch (error) {
      if (entry) return this.envelope(entry, 'stale')
      throw error
    }
  }

  async force<T>(key: string, loader: () => Promise<T>, policy: CachePolicy): Promise<DataEnvelope<T>> {
    const previous = this.entries.get(key) as CacheEntry<T> | undefined
    try {
      const refreshed = await this.refresh(key, loader, policy)
      return this.envelope(refreshed, 'miss')
    } catch (error) {
      if (previous) return this.envelope(previous, 'stale')
      throw error
    }
  }

  clear() {
    this.entries.clear()
    this.inFlight.clear()
  }

  private async refresh<T>(key: string, loader: () => Promise<T>, policy: CachePolicy) {
    const existing = this.inFlight.get(key) as Promise<CacheEntry<T>> | undefined
    if (existing) return existing

    const pending = loader().then((value) => {
      const updatedAt = this.now()
      const entry: CacheEntry<T> = {
        value,
        updatedAt,
        freshUntil: updatedAt + policy.freshForMs,
        staleUntil: updatedAt + policy.staleForMs,
      }
      this.entries.set(key, entry)
      return entry
    })

    this.inFlight.set(key, pending)
    try {
      return await pending
    } finally {
      this.inFlight.delete(key)
    }
  }

  private envelope<T>(entry: CacheEntry<T>, state: CacheState): DataEnvelope<T> {
    const metadata: CacheMetadata = {
      state,
      isStale: state === 'stale',
      updatedAt: new Date(entry.updatedAt).toISOString(),
      expiresAt: new Date(entry.freshUntil).toISOString(),
    }
    return { data: entry.value, cache: metadata }
  }
}
