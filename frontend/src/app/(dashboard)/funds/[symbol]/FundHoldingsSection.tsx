'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ChevronDown, ChevronUp, Layers, PieChart, Search } from 'lucide-react'
import { EQUITY_BY_SYMBOL } from '@/lib/data/equityCatalog'
import { formatCompact } from '@/lib/utils/format'
import { STALE_TIME_LONG } from '@/lib/constants'
import type { FundHoldingsResponse } from '@/app/live-data/fund-holdings/route'

// Full breakdown of a fund's underlying investments: every disclosed position
// (FMP), or the top-10 + sector/asset mix (Yahoo), or the catalog's indicative
// list as a last resort — always labelled with its source.

const COLLAPSED_ROWS = 25

const ALLOCATION_COLORS: Record<string, string> = {
  Stocks: '#3b82f6',
  Bonds: '#64748b',
  Cash: '#22c55e',
  Preferred: '#8b5cf6',
  Convertible: '#f59e0b',
  Other: '#a16207',
}

const SECTOR_BAR_COLOR = '#3b82f6'

function sourceLabel(data: FundHoldingsResponse): string {
  if (data.source === 'sec') {
    return `Full portfolio · SEC N-PORT filing${data.asOf ? ` · as of ${data.asOf}` : ''}`
  }
  if (data.source === 'fmp') {
    return `Full holdings via FMP${data.asOf ? ` · as of ${data.asOf}` : ''}`
  }
  if (data.source === 'yahoo') return 'Top holdings via Yahoo Finance'
  return 'Indicative holdings — live sources unreachable'
}

type HoldingsSourceChoice = 'auto' | 'sec' | 'fmp' | 'yahoo'

const SOURCE_OPTIONS: Array<[HoldingsSourceChoice, string, string]> = [
  ['auto', 'Auto', 'Best available: SEC N-PORT, then FMP, then Yahoo'],
  ['sec', 'SEC', 'The fund’s own N-PORT filing — complete, authoritative, quarterly'],
  ['fmp', 'FMP', 'Aggregator holdings (requires FMP API key; ETFs only)'],
  ['yahoo', 'Yahoo', 'Top-10 holdings + sector weights, keyless'],
]

export function FundHoldingsSection({ symbol }: { symbol: string }) {
  const [expanded, setExpanded] = useState(false)
  const [filter, setFilter] = useState('')
  const [sourceChoice, setSourceChoice] = useState<HoldingsSourceChoice>('auto')

  const { data, isLoading, isFetching } = useQuery<FundHoldingsResponse>({
    queryKey: ['fund-holdings', symbol, sourceChoice],
    queryFn: () => {
      const p = new URLSearchParams({ symbol })
      if (sourceChoice !== 'auto') p.set('source', sourceChoice)
      return fetch(`/live-data/fund-holdings?${p.toString()}`).then((r) => r.json())
    },
    staleTime: STALE_TIME_LONG,
  })

  const holdings = useMemo(() => data?.holdings ?? [], [data])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return holdings
    return holdings.filter(
      (h) => h.symbol?.toLowerCase().includes(q) || h.name.toLowerCase().includes(q)
    )
  }, [holdings, filter])

  const visible = expanded || filter ? filtered : filtered.slice(0, COLLAPSED_ROWS)
  const maxWeight = holdings[0]?.weightPct ?? 0
  const top10Weight = holdings.slice(0, 10).reduce((sum, h) => sum + h.weightPct, 0)
  const hasShares = holdings.some((h) => h.shares != null)
  const hasValue = holdings.some((h) => h.marketValue != null)

  if (isLoading) {
    return (
      <div className="rounded-card border border-border bg-bg-card p-4">
        <h2 className="text-sm font-medium text-text-secondary mb-3">Underlying Investments</h2>
        <div className="h-40 animate-pulse rounded bg-bg-elevated/60" />
      </div>
    )
  }

  const sourcePills = (
    <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5" role="group" aria-label="Holdings data source">
      {SOURCE_OPTIONS.map(([value, label, hint]) => (
        <button
          key={value}
          onClick={() => setSourceChoice(value)}
          title={hint}
          className={clsx('px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
            sourceChoice === value ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
        >
          {label}
        </button>
      ))}
    </div>
  )

  if (!data || (holdings.length === 0 && data.sectorWeights.length === 0 && data.assetAllocation.length === 0)) {
    return (
      <div className="rounded-card border border-border bg-bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h2 className="text-sm font-medium text-text-secondary">Underlying Investments</h2>
          {sourcePills}
        </div>
        <p className="text-xs text-text-muted">
          {data?.error ?? 'No holdings disclosure available for this fund — bond, commodity, and some active funds don’t publish a per-security breakdown through our data sources.'}
        </p>
      </div>
    )
  }

  return (
    <div className={clsx('rounded-card border border-border bg-bg-card p-4', isFetching && 'opacity-70 transition-opacity')}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-text-muted" aria-hidden />
          <h2 className="text-sm font-medium text-text-secondary">Underlying Investments</h2>
          <span
            className={clsx(
              'px-1.5 py-0.5 rounded text-[10px] font-medium border',
              data.source === 'catalog'
                ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                : 'text-text-muted bg-bg-elevated border-border'
            )}
          >
            {sourceLabel(data)}
          </span>
          {sourcePills}
        </div>
        {holdings.length > 8 && (
          <div className="flex items-center rounded border border-border bg-bg-elevated px-2">
            <Search size={12} className="text-text-muted" aria-hidden />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter holdings…"
              className="w-40 bg-transparent px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>
        )}
      </div>

      {data.error && (
        <p className="mb-3 rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400/90">{data.error}</p>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded border border-border/60 bg-bg-elevated/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Positions</p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-text-primary">
            {data.full && data.holdingsCount != null ? data.holdingsCount : holdings.length > 0 ? `top ${holdings.length}` : '—'}
          </p>
        </div>
        <div className="rounded border border-border/60 bg-bg-elevated/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Top 10 Weight</p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-text-primary">
            {holdings.length > 0 ? `${top10Weight.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="rounded border border-border/60 bg-bg-elevated/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Largest Position</p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-text-primary truncate">
            {holdings[0] ? `${holdings[0].symbol ?? holdings[0].name} · ${holdings[0].weightPct.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="rounded border border-border/60 bg-bg-elevated/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Sectors Disclosed</p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-text-primary">
            {data.sectorWeights.length > 0 ? data.sectorWeights.length : '—'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Sector + asset mix */}
        {(data.sectorWeights.length > 0 || data.assetAllocation.length > 0) && (
          <div className="space-y-4">
            {data.assetAllocation.length > 0 && (
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-2">
                  <PieChart size={12} className="text-text-muted" aria-hidden /> Asset Allocation
                </h3>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-bg-elevated">
                  {data.assetAllocation.map((slice) => (
                    <div
                      key={slice.class}
                      title={`${slice.class} ${slice.weightPct.toFixed(1)}%`}
                      style={{ width: `${Math.min(100, slice.weightPct)}%`, backgroundColor: ALLOCATION_COLORS[slice.class] }}
                    />
                  ))}
                </div>
                <ul className="mt-2 space-y-1">
                  {data.assetAllocation.map((slice) => (
                    <li key={slice.class} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-text-muted">
                        <span className="size-2 rounded-sm" style={{ backgroundColor: ALLOCATION_COLORS[slice.class] }} aria-hidden />
                        {slice.class}
                      </span>
                      <span className="font-mono tabular-nums text-text-secondary">{slice.weightPct.toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.sectorWeights.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-text-secondary mb-2">Sector Weights</h3>
                <ul className="space-y-1.5">
                  {data.sectorWeights.map((sw) => {
                    const max = data.sectorWeights[0]?.weightPct ?? 1
                    return (
                      <li key={sw.sector} className="flex items-center gap-2 text-xs">
                        <span className="w-36 truncate text-text-muted flex-shrink-0">{sw.sector}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-bg-elevated">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${max > 0 ? (sw.weightPct / max) * 100 : 0}%`, backgroundColor: SECTOR_BAR_COLOR, opacity: 0.7 }}
                          />
                        </div>
                        <span className="w-12 text-right font-mono tabular-nums text-text-secondary flex-shrink-0">
                          {sw.weightPct.toFixed(1)}%
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Holdings table */}
        {holdings.length > 0 && (
          <div className={clsx(data.sectorWeights.length > 0 || data.assetAllocation.length > 0 ? 'xl:col-span-2' : 'xl:col-span-3')}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-text-muted border-b border-border">
                    <th className="py-2 pr-2 font-medium w-8">#</th>
                    <th className="py-2 pr-3 font-medium">Security</th>
                    {hasShares && <th className="py-2 pr-3 font-medium text-right">Shares</th>}
                    {hasValue && <th className="py-2 pr-3 font-medium text-right">Market Value</th>}
                    <th className="py-2 font-medium text-right w-44">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((h, i) => {
                    const rank = filter ? holdings.indexOf(h) + 1 : i + 1
                    const inEquities = h.symbol != null && !!EQUITY_BY_SYMBOL[h.symbol]
                    return (
                      <tr key={`${h.symbol ?? h.name}-${rank}`} className="border-b border-border/40 last:border-0">
                        <td className="py-1.5 pr-2 font-mono text-xs tabular-nums text-text-muted">{rank}</td>
                        <td className="py-1.5 pr-3">
                          <div className="flex items-baseline gap-2 min-w-0">
                            {h.symbol && (
                              inEquities ? (
                                <Link
                                  href={`/equities/${h.symbol.toLowerCase()}`}
                                  className="font-mono text-xs font-medium text-accent-blue hover:underline flex-shrink-0"
                                >
                                  {h.symbol}
                                </Link>
                              ) : (
                                <span className="font-mono text-xs font-medium text-text-primary flex-shrink-0">{h.symbol}</span>
                              )
                            )}
                            <span className="text-xs text-text-muted truncate">{h.name}</span>
                          </div>
                        </td>
                        {hasShares && (
                          <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums text-text-secondary">
                            {h.shares != null ? formatCompact(h.shares).replace('$', '') : '—'}
                          </td>
                        )}
                        {hasValue && (
                          <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums text-text-secondary">
                            {h.marketValue != null ? formatCompact(h.marketValue) : '—'}
                          </td>
                        )}
                        <td className="py-1.5">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-24 h-1.5 rounded-full bg-bg-elevated">
                              <div
                                className="h-full rounded-full bg-accent-blue/60"
                                style={{ width: `${maxWeight > 0 ? Math.min(100, (h.weightPct / maxWeight) * 100) : 0}%` }}
                              />
                            </div>
                            <span className="w-14 text-right font-mono text-xs tabular-nums text-text-secondary">
                              {h.weightPct >= 0.01 ? `${h.weightPct.toFixed(2)}%` : '<0.01%'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {filter && filtered.length === 0 && (
              <p className="py-4 text-center text-xs text-text-muted">No holdings match &ldquo;{filter}&rdquo;</p>
            )}

            {!filter && filtered.length > COLLAPSED_ROWS && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-3 flex w-full items-center justify-center gap-1 rounded border border-border bg-bg-elevated/40 py-2 text-xs text-text-secondary hover:bg-bg-elevated transition-colors"
              >
                {expanded ? (
                  <>Show top {COLLAPSED_ROWS} <ChevronUp size={12} aria-hidden /></>
                ) : (
                  <>Show all {holdings.length} holdings <ChevronDown size={12} aria-hidden /></>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
