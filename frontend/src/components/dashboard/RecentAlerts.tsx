'use client'

import { CheckCheck } from 'lucide-react'
import { useLiveAlerts } from '@/hooks/useLiveAlerts'
import { LiveAlertRow } from '@/components/alerts/LiveAlertRow'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'

export function RecentAlerts() {
  const { alerts, isLoading } = useLiveAlerts()

  return (
    <div className="rounded-card border border-border bg-bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <h3 className="text-sm font-semibold text-text-primary">Recent Alerts</h3>
        <span className="text-[10px] text-text-muted">peg &amp; price moves</span>
      </div>

      <div className="divide-y divide-border/50">
        {isLoading ? (
          Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="px-4 py-3 flex gap-3">
              <LoadingSkeleton className="size-6 rounded flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <LoadingSkeleton className="h-4 w-4/5" />
                <LoadingSkeleton className="h-3 w-3/5" />
              </div>
            </div>
          ))
        ) : alerts.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <CheckCheck size={20} className="mx-auto mb-2 text-emerald-400/60" aria-hidden />
            <p className="text-xs text-text-muted">All monitored assets within range</p>
          </div>
        ) : (
          alerts.slice(0, 8).map((alert) => <LiveAlertRow key={alert.id} alert={alert} />)
        )}
      </div>
    </div>
  )
}
