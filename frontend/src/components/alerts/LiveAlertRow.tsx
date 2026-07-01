import type { LiveAlert, AlertSeverity } from '@/app/live-data/alerts/route'

export function severityColor(severity: AlertSeverity): string {
  return severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f59e0b' : '#3b82f6'
}

/** Compact one-line alert row shared by the TopBar bell dropdown and the Dashboard widget. */
export function LiveAlertRow({ alert }: { alert: LiveAlert }) {
  return (
    <div className="px-4 py-2.5 flex items-start gap-2.5">
      <span
        className="mt-1 size-2 rounded-full flex-shrink-0"
        style={{ background: severityColor(alert.severity) }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-text-primary truncate">{alert.title}</span>
          <span className="text-[10px] text-text-muted font-mono flex-shrink-0">
            {new Date(alert.triggeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">{alert.message}</p>
      </div>
    </div>
  )
}
