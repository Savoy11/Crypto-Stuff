'use client'

import { useStreamStore } from '@/store/useStreamStore'
import { useAlertStore } from '@/store/useAlertStore'
import { clsx } from 'clsx'
import { formatDate } from '@/lib/utils/format'

export function StatusBar() {
  const { connectionStatus } = useStreamStore()
  const { unreadCount, alerts } = useAlertStore()

  const criticalCount = alerts.filter((a) => a.severity === 'critical' && !a.isRead).length
  const highCount = alerts.filter((a) => a.severity === 'high' && !a.isRead).length

  const statusColor = {
    connected: 'text-emerald-400',
    connecting: 'text-amber-400',
    disconnected: 'text-slate-500',
    error: 'text-red-400',
  }[connectionStatus]

  return (
    <div
      className="fixed bottom-0 right-0 left-sidebar h-statusbar flex items-center justify-between px-6 bg-bg-secondary border-t border-border z-20 text-[11px] font-mono text-text-muted"
      role="status"
      aria-label="System status"
    >
      {/* Left */}
      <div className="flex items-center gap-4">
        <span>
          Market Status:{' '}
          <span className="text-accent-green">OPEN</span>
        </span>
        <span className="text-border">|</span>
        <span>
          Updated: <span className="text-text-secondary">{formatDate(new Date(), 'HH:mm:ss')}</span>
        </span>
        <span className="text-border">|</span>
        <span className={statusColor}>
          Stream: {connectionStatus.toUpperCase()}
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
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
        <span className="text-border">|</span>
        <span>CAEP v1.0</span>
      </div>
    </div>
  )
}
