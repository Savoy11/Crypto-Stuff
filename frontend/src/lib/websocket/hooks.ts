'use client'

import { useEffect } from 'react'
import { useStreamStore } from '@/store/useStreamStore'

// Live-only mode has no backend WebSocket — data is served over the /live-data
// REST routes via React Query. The reconnect/backoff client this used to drive
// (lib/websocket/client.ts) was removed in the M8 sweep: every path into it sat
// behind a `LIVE_DATA` early return, and `LIVE_DATA` is a hardcoded `true`.
// Along with it went useWsChannel/useWsMessage, which had no consumers at all.
//
// What remains is the status shim the Sidebar and StatusBar read. If a backend
// socket ever comes back, this is the seam to reopen — see git history for the
// client (subscribe/unsubscribe, heartbeat, exponential backoff).
export function useWebSocket() {
  const { setConnectionStatus } = useStreamStore()

  useEffect(() => {
    setConnectionStatus('connected')
  }, [setConnectionStatus])
}
