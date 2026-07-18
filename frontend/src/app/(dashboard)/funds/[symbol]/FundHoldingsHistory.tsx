'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ChevronDown, ChevronUp, History, KeyRound } from 'lucide-react'
import { EQUITY_BY_SYMBOL } from '@/lib/data/equityCatalog'
import { STALE_TIME_LONG } from '@/lib/constants'
import type { ChangeAction, FundHoldingsHistoryResponse } from '@/app/live-data/fund-holdings-history/route'

// History of changes in the fund's underlying investments — diffs two SEC
// N-PORT disclosure quarters (via FMP) into adds, exits, and weight shifts.

const COLLAPSED_ROWS = 20

const ACTION_STYLE: Record<ChangeAction, { label: string; className: string }> = {
  added:     { label: 'NEW',   className: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  exited:    { label: 'EXIT',  className: 'text-red-400 bg-red-400/10 border-red-500/20' },
  increased: { label: 'ADD',   className: 'text-accent-blue bg-accent-blue/10 border-accent-blue/20' },
  decreased: { label: 'TRIM',  className: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
}

function weightLabel(pct: number | null): string {
  if (pct == null) return '—'
  return pct >= 0.01 ? `${pct.toFixed(2)}%` : '<0.01%'
}

export function FundHoldingsHistory({ symbol }: { symbol: string }) {
  const [currentPeriod, setCurrentPeriod] = useState<string | null>(null)
  const [previousPeriod, setPreviousPeriod] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const { data, isLoading, isFetching } = useQuery<FundHoldingsHistoryResponse>({
    queryKey: ['fund-holdings-history', symbol, currentPeriod, previousPeriod],
    queryFn: () => {
      const p = new URLSearchParams({ symbol })
      if (currentPeriod) p.set('current', currentPeriod)
      if (previousPeriod) p.set('previous', previousPeriod)
      return fetch(`/live-data/fund-holdings-history?${p.toString()}`).then((r) => r.json())
    },
    staleTime: STALE_TIME_LONG,
  })

  if (isLoading) {
    return (
      <div className="rounded-card border border-border bg-bg-card p-4">
        <h2 className="text-sm font-medium text-text-secondary mb-3">Holdings Change History</h2>
        <div className="h-32 animate-pulse rounded bg-bg-elevated/60" />
      </div>
    )
  }

  if (!data) return null

  if (!data.configured) {
    return (
      <div className="rounded-card border border-border bg-bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <History size={14} className="text-text-muted" aria-hidden />
          <h2 className="text-sm font-medium text-text-secondary">Holdings Change History</h2>
        </div>
        <div className="flex items-start gap-3 rounded border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <KeyRound size={14} className="mt-0.5 text-amber-400/70 flex-shrink-0" aria-hidden />
          <p className="text-xs text-text-muted leading-relaxed">
            Quarter-over-quarter changes are built from SEC N-PORT disclosures, fetched directly
            from EDGAR with no API key. EDGAR couldn&rsquo;t match this ticker to a disclosure
            series — setting <code className="font-mono text-text-secondary">FMP_API_KEY</code> in{' '}
            <code className="font-mono text-text-secondary">frontend/.env.local</code> enables an
            aggregator fallback for it.
          </p>
        </div>
      </div>
    )
  }

  const changes = data.changes
  const visible = expanded ? changes : changes.slice(0, COLLAPSED_ROWS)

  return (
    <div className="rounded-card border border-border bg-bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <History size={14} className="text-text-muted" aria-hidden />
          <h2 className="text-sm font-medium text-text-secondary">Holdings Change History</h2>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-border bg-bg-elevated text-text-muted">
            SEC N-PORT disclosures
          </span>
        </div>

        {data.periods.length >= 2 && (
          <div className="flex items-center gap-2 text-xs">
            <select
              value={data.previous?.label ?? ''}
              onChange={(e) => setPreviousPeriod(e.target.value)}
              className="rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
              aria-label="Previous disclosure period"
            >
              {data.periods.map((p) => (
                <option key={p.label} value={p.label} disabled={p.label === data.current?.label}>{p.label}</option>
              ))}
            </select>
            <span className="text-text-muted">→</span>
            <select
              value={data.current?.label ?? ''}
              onChange={(e) => setCurrentPeriod(e.target.value)}
              className="rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
              aria-label="Current disclosure period"
            >
              {data.periods.map((p) => (
                <option key={p.label} value={p.label} disabled={p.label === data.previous?.label}>{p.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {data.error || !data.summary ? (
        <p className="text-xs text-text-muted">{data.error ?? 'No comparison available for this fund.'}</p>
      ) : (
        <div className={clsx(isFetching && 'opacity-60 transition-opacity')}>
          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div className="rounded border border-border/60 bg-bg-elevated/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">New Positions</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums text-emerald-400">{data.summary.added}</p>
            </div>
            <div className="rounded border border-border/60 bg-bg-elevated/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Exited</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums text-red-400">{data.summary.exited}</p>
            </div>
            <div className="rounded border border-border/60 bg-bg-elevated/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Increased</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums text-text-primary">{data.summary.increased}</p>
            </div>
            <div className="rounded border border-border/60 bg-bg-elevated/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Trimmed</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums text-text-primary">{data.summary.decreased}</p>
            </div>
            <div className="rounded border border-border/60 bg-bg-elevated/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Est. Turnover</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums text-text-primary">{data.summary.turnoverPct}%</p>
            </div>
          </div>

          {changes.length === 0 ? (
            <p className="text-xs text-text-muted">
              No material weight changes between {data.previous?.label} and {data.current?.label} —
              the portfolio composition held steady.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-text-muted border-b border-border">
                      <th className="py-2 pr-3 font-medium w-14">Change</th>
                      <th className="py-2 pr-3 font-medium">Security</th>
                      <th className="py-2 pr-3 font-medium text-right">{data.previous?.label}</th>
                      <th className="py-2 pr-3 font-medium text-right">{data.current?.label}</th>
                      <th className="py-2 font-medium text-right w-20">Δ Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((c, i) => {
                      const style = ACTION_STYLE[c.action]
                      const inEquities = c.symbol != null && !!EQUITY_BY_SYMBOL[c.symbol]
                      return (
                        <tr key={`${c.symbol ?? c.name}-${i}`} className="border-b border-border/40 last:border-0">
                          <td className="py-1.5 pr-3">
                            <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold border', style.className)}>
                              {style.label}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3">
                            <div className="flex items-baseline gap-2 min-w-0">
                              {c.symbol && (
                                inEquities ? (
                                  <Link
                                    href={`/equities/${c.symbol.toLowerCase()}`}
                                    className="font-mono text-xs font-medium text-accent-blue hover:underline flex-shrink-0"
                                  >
                                    {c.symbol}
                                  </Link>
                                ) : (
                                  <span className="font-mono text-xs font-medium text-text-primary flex-shrink-0">{c.symbol}</span>
                                )
                              )}
                              <span className="text-xs text-text-muted truncate">{c.name}</span>
                            </div>
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums text-text-muted">
                            {weightLabel(c.prevWeightPct)}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums text-text-secondary">
                            {weightLabel(c.weightPct)}
                          </td>
                          <td className={clsx('py-1.5 text-right font-mono text-xs tabular-nums',
                            c.deltaPct > 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {c.deltaPct > 0 ? '+' : ''}{c.deltaPct.toFixed(2)}pp
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {changes.length > COLLAPSED_ROWS && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-3 flex w-full items-center justify-center gap-1 rounded border border-border bg-bg-elevated/40 py-2 text-xs text-text-secondary hover:bg-bg-elevated transition-colors"
                >
                  {expanded ? (
                    <>Show top {COLLAPSED_ROWS} changes <ChevronUp size={12} aria-hidden /></>
                  ) : (
                    <>Show all {changes.length} changes <ChevronDown size={12} aria-hidden /></>
                  )}
                </button>
              )}

              <p className="mt-3 text-[11px] text-text-muted">
                Comparing {data.summary.previousCount} positions ({data.previous?.label}) against{' '}
                {data.summary.currentCount} ({data.current?.label}) · weight shifts under 0.02pp counted as unchanged
                ({data.summary.unchanged}) · disclosures lag holdings by up to a quarter
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
