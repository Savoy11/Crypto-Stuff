'use client'

import { useEffect, useState } from 'react'
import { readWatchlistBias, EMPTY_BIAS, type WatchlistBias } from './bias'

/**
 * Read the watchlist for feed biasing.
 *
 * Starts at EMPTY_BIAS and fills in after mount rather than reading
 * localStorage during render. EMPTY_BIAS makes every bias operation a no-op, so
 * the first client render matches the server's unbiased output — the same rule
 * the entitlement store had to learn, where a synchronous localStorage read cost
 * the whole tree to a hydration mismatch.
 *
 * Re-reads on focus and on cross-tab storage events, so editing the watchlist in
 * another tab reflects here without a reload.
 */
export function useWatchlistBias(): WatchlistBias {
  const [bias, setBias] = useState<WatchlistBias>(EMPTY_BIAS)

  useEffect(() => {
    const refresh = () => setBias(readWatchlistBias())
    refresh()

    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('caep:watchlists')) refresh()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return bias
}
