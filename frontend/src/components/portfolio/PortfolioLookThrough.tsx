'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useQueries } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Layers, AlertTriangle, Link2 } from 'lucide-react'
import {
  computeLookThrough, type FundHoldings, type LookThroughPosition,
} from '@/lib/data/lookThrough'
import { INSTRUMENT_BY_KEY } from '@/lib/data/instruments'
import type { Portfolio } from '@/lib/data/portfolioUtils'
import { STALE_TIME_LONG } from '@/lib/constants'
import type { FundHoldingsResponse } from '@/app/live-data/fund-holdings/route'

// What you actually own underneath your funds (W4-B1).
//
// Weights are the portfolio's TARGET allocations, stated plainly below. Using
// live marked-to-market weights would be better in principle, but a portfolio
// can only be marked where every position has both a price and a cost basis —
// see the W4-C1 fix in portfolioBuilder.ts. Target allocation is always
// available and always means one thing, so the basis is honest either way.

const SOURCE_LABEL: Record<string, string> = {
  sec: 'SEC N-PORT',
  fmp: 'FMP',
  yahoo: 'Yahoo top 10',
  catalog: 'catalog snapshot',
}

const isFundClass = (key: string): boolean => {
  const cls = INSTRUMENT_BY_KEY[key]?.class
  return cls === 'etf' || cls === 'mutual'
}

export function PortfolioLookThrough({ portfolio }: { portfolio: Portfolio }) {
  const fundSymbols = useMemo(
    () => portfolio.holdings.filter((h) => isFundClass(h.cgId)).map((h) => h.symbol.toUpperCase()),
    [portfolio.holdings],
  )

  const queries = useQueries({
    queries: fundSymbols.map((symbol) => ({
      queryKey: ['fund-holdings', symbol],
      queryFn: (): Promise<FundHoldingsResponse> =>
        fetch(`/live-data/fund-holdings?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()),
      staleTime: STALE_TIME_LONG,
      retry: 1,
    })),
  })

  const loading = queries.some((q) => q.isLoading)

  // Hoisted so the dependency lists below are simple expressions — same pattern
  // the Compare page uses for its parallel chart queries.
  const fundKey = fundSymbols.join(',')
  const dataKey = queries.map((q) => q.dataUpdatedAt).join(',')

  const result = useMemo(() => {
    const holdingsByFund: Record<string, FundHoldings> = {}
    queries.forEach((q, i) => {
      const d = q.data
      if (!d?.ok || !d.holdings?.length) return
      holdingsByFund[fundSymbols[i]] = {
        symbol: fundSymbols[i],
        holdings: d.holdings.map((h) => ({ symbol: h.symbol, name: h.name, weightPct: h.weightPct })),
        source: d.source,
        full: d.full,
        asOf: d.asOf,
        holdingsCount: d.holdingsCount,
      }
    })

    const positions: LookThroughPosition[] = portfolio.holdings.map((h) => ({
      symbol: h.symbol.toUpperCase(),
      weightPct: h.targetAlloc,
      isFund: isFundClass(h.cgId),
    }))

    return computeLookThrough(positions, holdingsByFund)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio.holdings, fundKey, dataKey])

  if (fundSymbols.length === 0) {
    return (
      <div className="rounded-card border border-border bg-bg-card p-4">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-text-muted" aria-hidden />
          <h2 className="text-sm font-medium text-text-secondary">Look-through</h2>
        </div>
        <p className="mt-2 text-xs text-text-muted leading-relaxed">
          This portfolio holds no ETFs or mutual funds, so there is nothing to look through —
          every position is already the thing you own.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="rounded-card border border-border bg-bg-card p-4">
        <h2 className="text-sm font-medium text-text-secondary">Look-through</h2>
        <p className="mt-1 text-xs text-text-muted">Fetching fund portfolios…</p>
      </div>
    )
  }

  const doubleCounted = result.issuers.filter((i) => i.heldDirectlyAndViaFund)
  const topFive = result.issuers.slice(0, 5).reduce((sum, i) => sum + i.weightPct, 0)

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-border bg-bg-card p-4">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-text-muted" aria-hidden />
          <h2 className="text-sm font-medium text-text-secondary">
            Look-through <span className="text-text-muted font-normal">— what you own underneath the funds</span>
          </h2>
        </div>
        <p className="mt-2 text-xs text-text-muted leading-relaxed">
          Each fund’s portfolio weights multiplied by this portfolio’s <strong>target allocation</strong>,
          then summed by company. Three funds can look like diversification while two of them are
          largely the same mega-caps — this is where that shows up.
        </p>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-text-muted">Companies</div>
            <div className="font-mono tabular-nums text-text-primary text-sm">{result.issuers.length}</div>
          </div>
          <div>
            <div className="text-text-muted">Top 5 weight</div>
            <div className="font-mono tabular-nums text-text-primary text-sm">{topFive.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-text-muted">Attributed</div>
            <div className="font-mono tabular-nums text-text-primary text-sm">{result.resolvedPct.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-text-muted">Not attributed</div>
            <div className={clsx('font-mono tabular-nums text-sm',
              result.unresolvedPct > 20 ? 'text-amber-400' : 'text-text-primary')}>
              {result.unresolvedPct.toFixed(1)}%
            </div>
          </div>
        </div>

        {result.partial && (
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-amber-400">
            <AlertTriangle size={12} className="mt-px shrink-0" aria-hidden />
            <span>
              Some funds returned a partial holdings list, so every weight below is a{' '}
              <strong>floor</strong> — real exposure can only be higher. Partial lists are never
              scaled up to look complete: a top-10 list covering 30% of a fund would otherwise
              triple every company in it.
            </span>
          </p>
        )}
      </div>

      {doubleCounted.length > 0 && (
        <div className="rounded-card border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-amber-400" aria-hidden />
            <h3 className="text-sm font-medium text-amber-300">Held twice over</h3>
          </div>
          <p className="mt-1 text-xs text-amber-300/80 leading-relaxed">
            You hold {doubleCounted.length === 1 ? 'this company' : 'these companies'} both directly and
            inside a fund. That is not a mistake by itself — but the direct position is on top of an
            exposure you already had, which is easy to miss when sizing it.
          </p>
          <ul className="mt-2 space-y-1">
            {doubleCounted.slice(0, 6).map((issuer) => (
              <li key={issuer.symbol ?? issuer.name} className="text-xs font-mono tabular-nums text-amber-200">
                {issuer.symbol ?? issuer.name} — {issuer.weightPct.toFixed(2)}% total
                <span className="text-amber-300/70 font-sans">
                  {' '}({issuer.contributions.map((c) => `${c.weightPct.toFixed(2)}% ${c.direct ? 'direct' : `via ${c.via}`}`).join(', ')})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-card border border-border bg-bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text-muted uppercase tracking-wider text-[10px]">
              <th className="px-4 py-2 text-left font-medium">Company</th>
              <th className="px-4 py-2 text-right font-medium">Weight</th>
              <th className="px-4 py-2 text-left font-medium">Held via</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {result.issuers.slice(0, 40).map((issuer) => (
              <tr key={issuer.symbol ?? issuer.name}>
                <td className="px-4 py-2">
                  {issuer.symbol ? (
                    <Link href={`/equities/${issuer.symbol.toLowerCase()}`} className="font-mono font-semibold text-accent-blue hover:underline">
                      {issuer.symbol}
                    </Link>
                  ) : (
                    <span className="font-mono font-semibold text-text-primary">—</span>
                  )}
                  <span className="ml-2 text-text-muted">{issuer.name}</span>
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-text-primary">
                  {issuer.weightPct.toFixed(2)}%
                </td>
                <td className="px-4 py-2 text-text-muted">
                  {issuer.contributions.map((c) => (c.direct ? 'direct' : c.via)).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.issuers.length > 40 && (
          <p className="px-4 py-2 text-[11px] text-text-muted">
            Showing the 40 largest of {result.issuers.length} companies.
          </p>
        )}
      </div>

      {/* Coverage travels with the numbers, per fund — a full N-PORT list and a
          Yahoo top-10 are different objects and must never be blended silently. */}
      <div className="rounded-card border border-border bg-bg-card p-4">
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">Coverage by fund</h3>
        <ul className="mt-2 space-y-1 text-[11px]">
          {result.coverage.map((c) => (
            <li key={c.symbol} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono font-semibold text-text-primary">{c.symbol}</span>
              {c.missing ? (
                <span className="text-amber-400">holdings unavailable — this fund’s weight is left unattributed</span>
              ) : (
                <span className="text-text-muted">
                  {SOURCE_LABEL[c.source] ?? c.source}
                  {c.full ? ' · complete' : ' · partial list'}
                  {c.holdingsCount != null && ` · ${c.holdingsCount} positions`}
                  {c.asOf && ` · as of ${c.asOf}`}
                  {` · explains ${c.explainedPct.toFixed(1)}% of the fund`}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
