'use client'

import { useState, useEffect } from 'react'
import { useStreamStore } from '@/store/useStreamStore'
import { useAlertStore } from '@/store/useAlertStore'
import { clsx } from 'clsx'
import { formatDate } from '@/lib/utils/format'

export function StatusBar() {
  const { connectionStatus } = useStreamStore()
  const { unreadCount, alerts } = useAlertStore()
  const [time, setTime] = useState<string | null>(null)

  useEffect(() => {
    setTime(formatDate(new Date(), 'HH:mm:ss'))
    const id = setInterval(() => setTime(formatDate(new Date(), 'HH:mm:ss')), 1000)
    return () => clearInterval(id)
  }, [])

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
      className="fixed bottom-0 right-0 left-0 lg:left-sidebar h-statusbar flex items-center justify-between gap-4 px-4 sm:px-6 bg-bg-secondary border-t border-border z-20 text-[11px] font-mono text-text-muted"
      role="status"
      aria-label="System status"
    >
      {/* Left — secondary details drop out at smaller widths so items never overlap */}
      <div className="flex items-center gap-4 whitespace-nowrap">
        <span className="hidden lg:inline">
          Market Status:{' '}
          <span className="text-accent-green">OPEN</span>
        </span>
        <span className="hidden lg:inline text-border">|</span>
        <span className="hidden md:inline">
          Updated: <span className="text-text-secondary">{time ?? '—'}</span>
        </span>
        <span className="hidden md:inline text-border">|</span>
        <span className={statusColor}>
          Stream: {connectionStatus.toUpperCase()}
        </span>
      </div>

      {/* Right — alert counts always visible; version label hidden on narrow screens */}
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
            {unreadCount} <span className="hidden xs:inline">unread </span>alerts
          </span>
        )}
        <span className="hidden lg:inline text-border">|</span>
        <span className="hidden lg:inline">CAEP v1.0</span>
      </div>
    </div>
  )
}
