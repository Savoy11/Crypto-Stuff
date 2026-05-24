'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { Check, CheckCheck, ExternalLink } from 'lucide-react'
import type { Alert } from '@/types/alert'
import { AlertBadge } from './AlertBadge'
import { timeAgo, formatCurrency } from '@/lib/utils/format'
import { useAlertStore } from '@/store/useAlertStore'
import { useMarkAlertRead, useMarkAllAlertsRead } from '@/hooks/useAlerts'
import { ALERT_TYPE_LABELS } from './alertConstants'

interface AlertFeedProps {
  alerts: Alert[]
  loading?: boolean
}

function AlertRow({ alert }: { alert: Alert }) {
  const router = useRouter()
  const { markRead } = useAlertStore()
  const { mutate: apiMarkRead } = useMarkAlertRead()

  const handleClick = useCallback(() => {
    if (!alert.isRead) {
      markRead(alert.id)
      apiMarkRead(alert.id)
    }
  }, [alert.id, alert.isRead, markRead, apiMarkRead])

  const handleAssetClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (alert.assetId) router.push(`/assets/${alert.assetId}`)
  }, [alert.assetId, router])

  return (
    <div
      onClick={handleClick}
      className={clsx(
        'flex gap-3 px-4 py-3.5 border-b border-border/50 cursor-pointer transition-colors group',
        !alert.isRead && 'bg-bg-secondary/40 hover:bg-bg-elevated',
        alert.isRead && 'hover:bg-bg-elevated/50',
        alert.severity === 'critical' && !alert.isRead && 'animate-pulse-critical border-l-2 border-l-red-500/50'
      )}
      role="listitem"
      aria-label={`${alert.severity} alert: ${alert.title}${!alert.isRead ? ' (unread)' : ''}`}
    >
      {/* Severity icon */}
      <div className="flex-shrink-0 mt-0.5">
        <AlertBadge severity={alert.severity} iconOnly />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className={clsx('text-sm font-medium truncate', !alert.isRead ? 'text-text-primary' : 'text-text-secondary')}>
              {alert.title}
            </span>
            {!alert.isRead && (
              <span className="size-1.5 rounded-full bg-accent-blue flex-shrink-0" aria-hidden />
            )}
          </div>
          <span className="text-[10px] text-text-muted font-mono flex-shrink-0">{timeAgo(alert.createdAt)}</span>
        </div>

        <p className="text-xs text-text-muted leading-relaxed mb-2 line-clamp-2">{alert.message}</p>

        <div className="flex items-center gap-3 flex-wrap">
          <AlertBadge severity={alert.severity} />

          {alert.assetSymbol && (
            <button
              onClick={handleAssetClick}
              className="flex items-center gap-1 text-[11px] font-mono text-accent-blue/80 hover:text-accent-blue transition-colors"
            >
              {alert.assetSymbol}
              <ExternalLink size={10} aria-hidden />
            </button>
          )}

          <span className="text-[10px] text-text-muted capitalize">
            {ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType.replace('_', ' ')}
          </span>

          {alert.metadata.previousValue !== undefined && alert.metadata.currentValue !== undefined && (
            <span className="text-[10px] font-mono text-text-muted">
              {alert.metadata.previousValue.toFixed(4)} → {alert.metadata.currentValue.toFixed(4)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function AlertFeed({ alerts, loading }: AlertFeedProps) {
  const { markAllRead } = useAlertStore()
  const { mutate: apiMarkAllRead } = useMarkAllAlertsRead()

  const unreadCount = alerts.filter((a) => !a.isRead).length

  const handleMarkAllRead = useCallback(() => {
    markAllRead()
    apiMarkAllRead()
  }, [markAllRead, apiMarkAllRead])

  if (loading) {
    return (
      <div className="space-y-0 divide-y divide-border">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="px-4 py-3.5 flex gap-3">
            <div className="size-6 rounded bg-bg-elevated animate-shimmer bg-shimmer-gradient bg-[length:200%_100%]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-bg-elevated animate-shimmer bg-shimmer-gradient bg-[length:200%_100%]" />
              <div className="h-3 w-full rounded bg-bg-elevated animate-shimmer bg-shimmer-gradient bg-[length:200%_100%]" />
              <div className="h-3 w-2/3 rounded bg-bg-elevated animate-shimmer bg-shimmer-gradient bg-[length:200%_100%]" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Feed header */}
      {unreadCount > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-secondary/30">
          <span className="text-xs text-text-muted">
            <span className="text-text-primary font-semibold">{unreadCount}</span> unread
          </span>
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-blue transition-colors"
            aria-label="Mark all alerts as read"
          >
            <CheckCheck size={12} aria-hidden />
            Mark all read
          </button>
        </div>
      )}

      {/* Alert rows */}
      <div role="list" aria-label="Alert feed">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Check size={24} className="text-emerald-400" />
            <p className="text-sm text-text-muted">No alerts match the current filters</p>
          </div>
        ) : (
          alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)
        )}
      </div>
    </div>
  )
}
