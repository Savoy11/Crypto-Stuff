'use client'

import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { useAlertStore } from '@/store/useAlertStore'
import type { AlertSeverity, AlertType } from '@/types/alert'

const SEVERITIES: Array<{ value: AlertSeverity | 'all'; label: string }> = [
  { value: 'all', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'info', label: 'Info' },
]

const ALERT_TYPES: Array<{ value: AlertType | 'all'; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'peg_deviation', label: 'Peg Deviation' },
  { value: 'risk_score_change', label: 'Risk Score' },
  { value: 'reserve_ratio', label: 'Reserve Ratio' },
  { value: 'liquidity_drop', label: 'Liquidity' },
  { value: 'whale_movement', label: 'Whale Movement' },
  { value: 'smart_contract', label: 'Smart Contract' },
  { value: 'regulatory', label: 'Regulatory' },
  { value: 'system', label: 'System' },
]

const READ_STATES: Array<{ value: boolean | null; label: string }> = [
  { value: null, label: 'All' },
  { value: false, label: 'Unread' },
  { value: true, label: 'Read' },
]

const SEVERITY_COLORS: Record<AlertSeverity | 'all', string> = {
  all: 'text-text-secondary border-border hover:bg-bg-elevated',
  critical: 'bg-red-500/10 text-red-400 border-red-500/30',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  info: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
}

export function AlertFilters() {
  const { filters, setFilter, resetFilters } = useAlertStore()
  const hasActive = filters.severity !== 'all' || filters.alertType !== 'all' || filters.isRead !== null

  return (
    <aside className="space-y-5" aria-label="Alert filters">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Filters</h3>
        {hasActive && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-accent-blue transition-colors"
          >
            <X size={11} aria-hidden />
            Reset
          </button>
        )}
      </div>

      {/* Read state */}
      <div>
        <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Status</div>
        <div className="flex flex-col gap-1">
          {READ_STATES.map(({ value, label }) => (
            <button
              key={String(value)}
              onClick={() => setFilter('isRead', value)}
              className={clsx(
                'w-full text-left px-2.5 py-1.5 rounded text-xs border transition-colors',
                filters.isRead === value
                  ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/20'
                  : 'text-text-secondary border-transparent hover:bg-bg-elevated'
              )}
              aria-pressed={filters.isRead === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Severity */}
      <div>
        <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Severity</div>
        <div className="flex flex-col gap-1">
          {SEVERITIES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter('severity', value as AlertSeverity | 'all')}
              className={clsx(
                'w-full text-left px-2.5 py-1.5 rounded text-xs border transition-colors',
                filters.severity === value
                  ? value === 'all'
                    ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/20'
                    : SEVERITY_COLORS[value]
                  : 'text-text-secondary border-transparent hover:bg-bg-elevated'
              )}
              aria-pressed={filters.severity === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Alert types */}
      <div>
        <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Type</div>
        <div className="flex flex-col gap-1">
          {ALERT_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter('alertType', value as AlertType | 'all')}
              className={clsx(
                'w-full text-left px-2.5 py-1.5 rounded text-xs border transition-colors',
                filters.alertType === value
                  ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/20'
                  : 'text-text-secondary border-transparent hover:bg-bg-elevated'
              )}
              aria-pressed={filters.alertType === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
