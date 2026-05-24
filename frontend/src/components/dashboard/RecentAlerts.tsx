'use client'

import Link from 'next/link'
import { useRecentAlerts, useMarkAlertRead } from '@/hooks/useAlerts'
import { AlertBadge } from '@/components/alerts/AlertBadge'
import { timeAgo } from '@/lib/utils/format'
import { clsx } from 'clsx'
import { ArrowRight } from 'lucide-react'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'

export function RecentAlerts() {
  const { data: alerts, isLoading } = useRecentAlerts(8)
  const { mutate: markRead } = useMarkAlertRead()

  return (
    <div className="rounded-card border border-border bg-bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <h3 className="text-sm font-semibold text-text-primary">Recent Alerts</h3>
        <Link
          href="/alerts"
          className="flex items-center gap-1 text-xs text-accent-blue hover:text-blue-300 transition-colors"
        >
          View all <ArrowRight size={12} aria-hidden />
        </Link>
      </div>

      <div className="divide-y divide-border/50">
        {isLoading
          ? Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="px-4 py-3 flex gap-3">
                <LoadingSkeleton className="size-6 rounded flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <LoadingSkeleton className="h-4 w-4/5" />
                  <LoadingSkeleton className="h-3 w-3/5" />
                </div>
              </div>
            ))
          : (alerts ?? []).map((alert) => (
              <button
                key={alert.id}
                onClick={() => markRead(alert.id)}
                className={clsx(
                  'w-full px-4 py-3 flex items-start gap-3 text-left transition-colors hover:bg-bg-elevated',
                  !alert.isRead && 'bg-bg-secondary/30'
                )}
                aria-label={`Alert: ${alert.title}${!alert.isRead ? ' (unread)' : ''}`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  <AlertBadge severity={alert.severity} iconOnly />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={clsx(
                        'text-xs font-medium truncate',
                        !alert.isRead ? 'text-text-primary' : 'text-text-secondary'
                      )}
                    >
                      {alert.title}
                    </span>
                    <span className="text-[10px] text-text-muted flex-shrink-0 font-mono">
                      {timeAgo(alert.createdAt)}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">{alert.message}</p>
                  {alert.assetSymbol && (
                    <span className="text-[10px] font-mono text-accent-blue/80 mt-0.5 block">
                      {alert.assetSymbol}
                    </span>
                  )}
                </div>
                {!alert.isRead && (
                  <span className="size-1.5 rounded-full bg-accent-blue flex-shrink-0 mt-2" aria-label="Unread" />
                )}
              </button>
            ))}
      </div>
    </div>
  )
}
