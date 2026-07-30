'use client'

import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Layers, AlertTriangle } from 'lucide-react'
import { computeFundOverlap, type FundHoldings } from '@/lib/data/lookThrough'
import { STALE_TIME_LONG } from '@/lib/constants'
import type { FundHoldingsResponse } from '@/app/live-data/fund-holdings/route'

// Pairwise holdings overlap between the funds selected on /compare (W4-B1).
//
// The question this answers is the one the correlation matrix above it only
// hints at: two funds can correlate at 0.98 because they hold the same
// companies, or because they track the same economy. Correlation cannot tell
// those apart; shared holdings can.
//
// Only funds are fetched — a stock has no holdings, and asking would be a
// wasted round-trip per selection.

const SOURCE_LABEL: Record<string, string> = {
  sec: 'SEC N-PORT',
  fmp: 'FMP',
  yahoo: 'Yahoo top 10',
  catalog: 'catalog snapshot',
}

/** Overlap bands. Above ~50% two funds are substantially the same bet. */
function overlapTone(pct: number): string {
  if (pct >= 50) return 'text-orange-400'
  if (pct >= 20) return 'text-amber-400'
  return 'text-emerald-400'
}

export function FundOverlapSection({ symbols }: { symbols: string[] }) {
  const queries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['fund-holdings', symbol],
      queryFn: (): Promise<FundHoldingsResponse> =>
        fetch(`/live-data/fund-holdings?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()),
      staleTime: STALE_TIME_LONG,
      retry: 1,
    })),
  })

  const loading = queries.some((q) => q.isLoading)

  // Hoisted so the dependency list below is simple expressions — same pattern
  // the Compare page uses for its parallel chart queries.
  const symbolKey = symbols.join(',')
  const dataKey = queries.map((q) => q.dataUpdatedAt).join(',')

  const holdings = useMemo(() => {
    const out: FundHoldings[] = []
    queries.forEach((q, i) => {
      const d = q.data
      if (!d?.ok || !d.holdings?.length) return
      out.push({
        symbol: symbols[i],
        holdings: d.holdings.map((h) => ({ symbol: h.symbol, name: h.name, weightPct: h.weightPct })),
        source: d.source,
        full: d.full,
        asOf: d.asOf,
        holdingsCount: d.holdingsCount,
      })
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolKey, dataKey])

  const pairs = useMemo(() => {
    const out = []
    for (let i = 0; i < holdings.length; i++) {
      for (let j = i + 1; j < holdings.length; j++) {
        out.push(computeFundOverlap(holdings[i], holdings[j]))
      }
    }
    return out.sort((a, b) => b.overlapPct - a.overlapPct)
  }, [holdings])

  if (symbols.length < 2) return null

  if (loading) {
    return (
      <div className="rounded-card border border-border bg-bg-card p-4">
        <h2 className="text-sm font-medium text-text-secondary">Holdings overlap</h2>
        <p className="mt-1 text-xs text-text-muted">Fetching fund portfolios…</p>
      </div>
    )
  }

  if (pairs.length === 0) {
    return (
      <div className="rounded-card border border-border bg-bg-card p-4">
        <h2 className="text-sm font-medium text-text-secondary">Holdings overlap</h2>
        <p className="mt-1 text-xs text-text-muted">
          Holdings couldn’t be retrieved for enough of the selected funds to compare portfolios.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-card border border-border bg-bg-card">
      <div className="flex items-center gap-2 px-4 pt-4 pb-1">
        <Layers size={14} className="text-text-muted" aria-hidden />
        <h2 className="text-sm font-medium text-text-secondary">
          Holdings overlap{' '}
          <span className="text-text-muted font-normal">— how much of each pair is the same companies</span>
        </h2>
      </div>
      <p className="px-4 pb-3 text-xs text-text-muted leading-relaxed">
        Weight held in common: for every company in both funds, the smaller of the two weights, summed.
        Two funds can correlate closely because they hold the same companies or because they track the
        same economy — correlation can’t tell those apart, and this can.
      </p>

      <div className="divide-y divide-border/60">
        {pairs.map((pair) => (
          <div key={`${pair.a}-${pair.b}`} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-sm font-semibold text-text-primary">
                {pair.a} <span className="text-text-muted font-normal">vs</span> {pair.b}
              </span>
              <span className={clsx('font-mono tabular-nums text-lg font-semibold', overlapTone(pair.overlapPct))}>
                {pair.comparable ? '' : '≥'}{pair.overlapPct.toFixed(1)}%
              </span>
            </div>

            {/* Coverage travels with the number — a full N-PORT list and a Yahoo
                top-10 are not the same object, and blending them unlabelled
                would breach the coverage rule. */}
            <p className="mt-1 text-[11px] text-text-muted">
              {pair.coverage.map((c) => (
                <span key={c.symbol} className="mr-3">
                  {c.symbol}: {SOURCE_LABEL[c.source] ?? c.source}
                  {c.holdingsCount != null && `, ${c.holdingsCount} positions`}
                  {c.asOf && `, as of ${c.asOf}`}
                </span>
              ))}
            </p>

            {!pair.comparable && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-400">
                <AlertTriangle size={12} className="mt-px shrink-0" aria-hidden />
                <span>
                  At least one side is a partial holdings list, so this is a <strong>floor</strong>, not
                  the real figure — true overlap can only be higher. Two top-10 lists cap out near 30%
                  however similar the funds actually are.
                </span>
              </p>
            )}

            {pair.shared.length > 0 && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-text-muted uppercase tracking-wider text-[10px]">
                      <th className="text-left font-medium py-1">Shared holding</th>
                      <th className="text-right font-medium py-1">{pair.a}</th>
                      <th className="text-right font-medium py-1">{pair.b}</th>
                      <th className="text-right font-medium py-1">In common</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {pair.shared.slice(0, 10).map((row) => (
                      <tr key={row.symbol ?? row.name}>
                        <td className="py-1.5 pr-2">
                          {row.symbol && <span className="font-mono font-semibold text-text-primary">{row.symbol}</span>}
                          <span className={clsx('text-text-muted', row.symbol && 'ml-2')}>{row.name}</span>
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-text-muted">{row.aPct.toFixed(2)}%</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-text-muted">{row.bPct.toFixed(2)}%</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-text-secondary">{row.sharedPct.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pair.shared.length > 10 && (
                  <p className="mt-1 text-[11px] text-text-muted">
                    + {pair.shared.length - 10} more shared {pair.shared.length - 10 === 1 ? 'holding' : 'holdings'}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
