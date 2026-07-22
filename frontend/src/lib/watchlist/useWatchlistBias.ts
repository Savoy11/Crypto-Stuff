'use client'

import { useEffect, useState } from 'react'
import { readWatchlistBias, EMPTY_BIAS, type WatchlistBias } from './bias'
import { hydrateWatchlists, useWatchlistStore } from '@/store/useWatchlistStore'

/**
 * Read the watchlist for feed biasing.
 *
 * Starts at EMPTY_BIAS and fills in after mount rather than reading the store
 * during render. EMPTY_BIAS makes every bias operation a no-op, so the first
 * client render matches the server's unbiased output — the same rule the
 * entitlement store had to learn, where a synchronous localStorage read cost
 * the whole tree to a hydration mismatch.
 *
 * Triggers store hydration (shared, deduped) and re-reads on every store
 * change, so edits on the watchlist page reflect here without a reload.
 */
export function useWatchlistBias(): WatchlistBias {
  const [bias, setBias] = useState<WatchlistBias>(EMPTY_BIAS)

  useEffect(() => {
    void hydrateWatchlists()
    setBias(readWatchlistBias())
    return useWatchlistStore.subscribe(() => setBias(readWatchlistBias()))
  }, [])

  return bias
}
