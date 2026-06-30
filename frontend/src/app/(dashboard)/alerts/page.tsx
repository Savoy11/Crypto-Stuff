'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bell, Filter, CheckCheck, AlertTriangle, AlertOctagon,
  Info, Loader2, RefreshCw, TrendingDown, TrendingUp, Minus,
} from 'lucide-react'
import { AlertFeed } from '@/components/alerts/AlertFeed'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAlertStore } from '@/store/useAlertStore'
import { LIVE_DATA } from '@/lib/constants'
import { clsx } from 'clsx'
import type { LiveAlert, AlertSeverity } from '@/app/live-data/alerts/route'

// ─── Live alert fetch ─────────────────────────────────────────────────────────

async function fetchLiveAlerts(): Promise<{ alerts: LiveAlert[]; checkedAt: string; assetsChecked: number }> {
  const res = await fetch('/live-data/alerts')
  if (!res.ok) throw new Error('Failed to fetch alerts')
  return res.json()
}

// ─── Severity config ──────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<AlertSeverity, {
  label: string
  icon: React.ElementType
  cardStyle: string
  badgeStyle: string
  iconColor: string
}> = {
  critical: {
    label: 'Critical',
    icon: AlertOctagon,
    cardStyle: 'border-red-500/40 bg-red-500/5',
    badgeStyle: 'text-red-400 bg-red-400/10 border-red-500/20',
    iconColor: 'text-red-400',
  },
  warning: {
    label: 'Warning',
    icon: AlertTriangle,
    cardStyle: 'border-amber-500/40 bg-amber-500/5',
    badgeStyle: 'text-amber-400 bg-amber-400/10 border-amber-500/20',
    iconColor: 'text-amber-400',
  },
  info: {
    label: 'Monitor',
    icon: Info,
    cardStyle: 'border-blue-500/30 bg-blue-500/5',
    badgeStyle: 'text-blue-400 bg-blue-400/10 border-blue-500/20',
    iconColor: 'text-blue-400',
  },
}

// ─── Live alert card ──────────────────────────────────────────────────────────

function LiveAlertCard({ alert }: { alert: LiveAlert }) {
  const cfg = SEVERITY_CONFIG[alert.severity]
  const SeverityIcon = cfg.icon
  const isAbove = alert.deviation > 0
  const DeviationIcon = Math.abs(alert.deviation) < 0.05 ? Minus : isAbove ? TrendingUp : TrendingDown
  const deviationColor = Math.abs(alert.deviation) < 0.05
    ? 'text-slate-400'
    : alert.severity === 'critical' ? 'text-red-400'
    : alert.severity === 'warning' ? 'text-amber-400'
    : 'text-blue-400'

  return (
    <div className={clsx('rounded-xl border p-4 flex gap-4 transition-all', cfg.cardStyle)}>
      <div className={clsx('size-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-bg-card border', cfg.badgeStyle)}>
        <SeverityIcon size={16} className={cfg.iconColor} aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase', cfg.badgeStyle)}>
              {cfg.label}
            </span>
            <span className="font-mono text-xs font-bold text-text-primary">{alert.symbol}</span>
          </div>
          <span className="text-[10px] text-text-muted flex-shrink-0">
            {new Date(alert.triggeredAt).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-sm font-medium text-text-primary">{alert.title}</p>
        <p className="text-xs text-text-secondary mt-1 leading-relaxed">{alert.message}</p>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1">
            <DeviationIcon size={12} className={deviationColor} aria-hidden />
            <span className={clsx('font-mono text-xs font-bold', deviationColor)}>
              {alert.deviation > 0 ? '+' : ''}{alert.deviation.toFixed(3)}%
            </span>
          </div>
          <span className="text-[10px] text-text-muted">
            ${alert.value.toFixed(4)} vs ${alert.threshold.toFixed(2)} target
          </span>
          <span className="text-[10px] text-text-muted ml-auto">via {alert.source}</span>
        </div>
      </div>
    </div>
  )
}

// ─── All-clear state ──────────────────────────────────────────────────────────

function AllClearPanel({ checkedAt, assetsChecked }: { checkedAt: string; assetsChecked: number }) {
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
      <div className="size-12 rounded-full bg-emerald-400/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
        <CheckCheck size={22} className="text-emerald-400" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-emerald-300">All pegs within normal range</p>
      <p className="text-xs text-text-muted mt-1">
        {assetsChecked} assets checked · no deviation {'>'} 0.15% detected
      </p>
      <p className="text-[11px] text-text-muted/60 mt-2 font-mono">
        Last checked: {new Date(checkedAt).toLocaleTimeString()}
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [showFilters, setShowFilters] = useState(false)
  const { markAllRead, unreadCount } = useAlertStore()

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['live-alerts'],
    queryFn: fetchLiveAlerts,
    enabled: LIVE_DATA,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,  // re-check every 2 minutes
  })

  const liveAlerts = data?.alerts ?? []
  const criticalCount = liveAlerts.filter((a) => a.severity === 'critical').length
  const warningCount  = liveAlerts.filter((a) => a.severity === 'warning').length

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-blue-400" aria-hidden />
          <PageHeader
            title="Alert Center"
            subtitle={LIVE_DATA
              ? 'Live peg deviation monitoring via CoinGecko · checks every 2 minutes'
              : 'Real-time risk events and threshold breaches'}
            description="The Alert Center monitors all tracked assets for risk threshold breaches and peg stability issues. In live mode, peg deviations are checked every 2 minutes using CoinGecko price data. Alerts are ranked by severity so the most urgent issues surface first."
            details={[
              { label: 'Severity levels', text: 'Critical — immediate action needed (e.g. peg break >2%). Warning — approaching threshold. Info — monitoring only.' },
              { label: 'Live mode', text: 'Alerts fire when a stablecoin price deviates beyond the configured threshold. Risk score and reserve alerts require backend integration.' },
              { label: 'Mock mode', text: 'Pre-seeded alerts across all severity levels are shown for demonstration purposes.' },
            ]}
          />
          {LIVE_DATA && criticalCount > 0 && (
            <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-bold text-red-400 border border-red-500/30">
              {criticalCount} critical
            </span>
          )}
          {!LIVE_DATA && unreadCount > 0 && (
            <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-400">
              {unreadCount} unread
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {LIVE_DATA && (
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          )}
          {!LIVE_DATA && (
            <>
              <button
                onClick={() => setShowFilters((f) => !f)}
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <Filter className="h-4 w-4" />
                Filters
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  <CheckCheck className="h-4 w-4" />
                  Mark all read
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Live mode */}
      {LIVE_DATA && (
        <>
          {/* Summary KPIs when alerts exist */}
          {liveAlerts.length > 0 && !isLoading && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Critical', count: criticalCount, style: 'text-red-400 border-red-500/20 bg-red-500/5' },
                { label: 'Warning',  count: warningCount,  style: 'text-amber-400 border-amber-500/20 bg-amber-500/5' },
                { label: 'Monitor',  count: liveAlerts.filter((a) => a.severity === 'info').length, style: 'text-blue-400 border-blue-500/20 bg-blue-500/5' },
              ].map(({ label, count, style }) => (
                <div key={label} className={clsx('rounded-lg border p-3 text-center', style)}>
                  <div className="text-2xl font-bold font-mono">{count}</div>
                  <div className="text-xs mt-0.5 opacity-80">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Thresholds legend */}
          <div className="flex flex-wrap gap-3 text-[11px] text-text-muted">
            <span className="font-medium text-text-primary">Thresholds:</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-blue-400 inline-block" /> Monitor ≥ 0.15%</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-400 inline-block" /> Warning ≥ 0.50%</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-red-400 inline-block" /> Critical ≥ 1.00%</span>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Checking peg prices via CoinGecko…</span>
            </div>
          )}

          {isError && !isLoading && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
              <AlertTriangle className="mx-auto h-7 w-7 text-red-400/70" />
              <p className="mt-2 text-sm font-medium text-slate-200">Could not reach CoinGecko</p>
              <p className="mt-1 text-xs text-slate-400">Peg monitoring temporarily unavailable.</p>
              <button onClick={() => refetch()} className="mt-3 text-xs text-blue-400 hover:text-blue-300 underline">Retry</button>
            </div>
          )}

          {!isLoading && !isError && liveAlerts.length === 0 && data && (
            <AllClearPanel checkedAt={data.checkedAt} assetsChecked={data.assetsChecked} />
          )}

          {!isLoading && liveAlerts.length > 0 && (
            <div className="space-y-3">
              {liveAlerts.map((alert) => (
                <LiveAlertCard key={alert.id} alert={alert} />
              ))}
              <p className="text-[11px] text-text-muted text-center pt-2">
                Checked {data?.assetsChecked} assets · last updated {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
