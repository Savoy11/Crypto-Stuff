'use client'

import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useFeedStore, type FeedStatus } from '@/store/useFeedStore'

// Replaces lib/websocket/hooks.ts's useWebSocket(), which was a shim that set
// 'connected' once on mount and never again. It reported success and nothing
// else, so a failing feed still rendered a green "Live" dot — worse than no
// indicator, because it actively asserted health it had not checked.
//
// There is no socket to observe. The honest source of truth is React Query,
// which owns every /live-data fetch in the app, so this reads its cache.

/** How long to coalesce cache events before recomputing. */
const DEBOUNCE_MS = 300

interface Tally {
  ok: number
  failed: number
  pending: number
}

/**
 * Count only queries with at least one live observer — i.e. what the screen the
 * user is actually looking at depends on. The cache retains entries for GC_TIME
 * (10m) after unmount, and counting those would let a page the user left
 * minutes ago hold the indicator red.
 */
function tally(client: QueryClient): Tally {
  const t: Tally = { ok: 0, failed: 0, pending: 0 }

  for (const query of client.getQueryCache().getAll()) {
    if (query.getObserversCount() === 0) continue

    switch (query.state.status) {
      case 'error':
        t.failed++
        break
      case 'success':
        t.ok++
        break
      default:
        t.pending++
    }
  }

  return t
}

export function deriveFeedStatus({ ok, failed, pending }: Tally): FeedStatus {
  if (failed > 0) return ok > 0 ? 'degraded' : 'offline'
  if (ok > 0) return 'live'
  if (pending > 0) return 'connecting'
  // Nothing mounted yet — the shell renders before any page query registers.
  // 'connecting' is the honest reading; 'offline' would flash red on every
  // navigation.
  return 'connecting'
}

/**
 * Subscribes the feed-status store to React Query's cache. Mounted once, by the
 * dashboard layout.
 */
export function useFeedStatus() {
  const queryClient = useQueryClient()
  const setFeedState = useFeedStore((s) => s.setFeedState)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const recompute = () => {
      const t = tally(queryClient)
      setFeedState({
        status: deriveFeedStatus(t),
        okCount: t.ok,
        failedCount: t.failed,
      })
    }

    const schedule = () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        recompute()
      }, DEBOUNCE_MS)
    }

    recompute()
    const unsubscribe = queryClient.getQueryCache().subscribe(schedule)

    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [queryClient, setFeedState])
}
