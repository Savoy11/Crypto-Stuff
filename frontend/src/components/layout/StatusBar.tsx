'use client'

import { useFeedStore } from '@/store/useFeedStore'
import { useAlertStore } from '@/store/useAlertStore'
import { clsx } from 'clsx'
import { formatDate } from '@/lib/utils/format'
import { APP_VERSION } from '@/lib/constants'

export function StatusBar() {
  const feedStatus = useFeedStore((s) => s.status)
  const failedCount = useFeedStore((s) => s.failedCount)
  const lastDataAt = useFeedStore((s) => s.lastDataAt)
  const { unreadCount, alerts } = useAlertStore()

  const criticalCount = alerts.filter((a) => a.severity === 'critical' && !a.isRead).length
  const highCount = alerts.filter((a) => a.severity === 'high' && !a.isRead).length

  const statusColor: string = {
    live: 'text-emerald-400',
    connecting: 'text-amber-400',
    degraded: 'text-orange-400',
    offline: 'text-red-400',
  }[feedStatus]

  // Live-only mode serves data via REST polling, not a websocket — label it
  // honestly rather than claiming a stream that isn't there. `degraded` is the
  // reading the old always-'connected' shim could never produce.
  const statusText: string = {
    live: 'LIVE (polling)',
    connecting: 'LOADING',
    degraded: `DEGRADED (${failedCount} failing)`,
    offline: 'OFFLINE',
  }[feedStatus]

  return (
    <div
      className="fixed bottom-0 right-0 left-0 lg:left-sidebar h-statusbar flex items-center justify-between gap-4 px-4 sm:px-6 bg-bg-secondary border-t border-border z-20 text-[11px] font-mono text-text-muted"
      role="status"
      aria-label="System status"
    >
      {/* Left — secondary details drop out at smaller widths so items never overlap.
          Two fabrications used to live here, both caught by the 2026-07-30
          findings and removed 2026-09-04:
          - "Market Status: OPEN" was a green string literal — no session state,
            no exchange calendar. It is NOT replaced with a computed session,
            because without a holiday calendar the computation shows OPEN on
            Thanksgiving (the same lie on fewer days), and in a multi-asset
            suite "the market" is not even one thing — crypto never closes.
            No source, no claim.
          - "Updated:" was a setInterval wall clock, asserting per-second
            freshness the feeds may not have. It now renders lastDataAt — the
            newest dataUpdatedAt across the queries this screen is actually
            observing — so it only moves when data does. */}
      <div className="flex items-center gap-4 whitespace-nowrap">
        <span className="hidden md:inline">
          Updated:{' '}
          <span className="text-text-secondary">
            {lastDataAt != null ? formatDate(new Date(lastDataAt), 'HH:mm:ss') : '—'}
          </span>
        </span>
        <span className="hidden md:inline text-border">|</span>
        <span className={statusColor}>Data: {statusText}</span>
      </div>

      {/* Right — alert counts stay visible; version label hidden on narrow screens */}
      <div className="flex items-center gap-4 whitespace-nowrap shrink-0">
        {criticalCount > 0 && (
          <span className="text-red-400 animate-pulse">
            {criticalCount} CRITICAL
          </span>
        )}
        {highCount > 0 && (
          <span className="text-orange-400">
            {highCount} HIGH
          </span>
        )}
        {unreadCount > 0 && (
          <span>
            {unreadCount} unread alerts
          </span>
        )}
        <span className="hidden lg:inline text-border">|</span>
        <span className="hidden lg:inline">FN v{APP_VERSION}</span>
      </div>
    </div>
  )
}
