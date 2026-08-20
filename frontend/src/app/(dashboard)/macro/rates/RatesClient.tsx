'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ExternalLink, Percent } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { MetricCard } from '@/components/ui/MetricCard'
import { LineChart } from '@/components/charts/LineChart'
import {
  BOND_ETF_SHELF_GROUPS, RATES_CATALOG, RATES_CATEGORY_INFO, formatRatesQuote,
} from '@/lib/data/ratesCatalog'
import { getFund } from '@/lib/data/fundCatalog'
import { STALE_TIME_SHORT, STALE_TIME_LONG } from '@/lib/constants'
import type { YieldCurveResponse } from '@/app/live-data/treasury-yield-curve/route'

// Bonds & Rates — Macro Markets module. Official treasury yield curve with
// lookback comparisons, live yield indices and bond futures, and the bond
// ETF shelf. CUSIP-level bond quotes are licensed data — stated plainly below.

interface Quote { price: number | null; changePercent: number | null }
interface QuotesResponse { ok: boolean; quotes?: Record<string, Quote> }

const ALL_SYMBOLS = RATES_CATALOG.map((r) => r.symbol)

const SHAPE_INFO: Record<NonNullable<YieldCurveResponse['shape']>, { label: string; color: string; blurb: string }> = {
  normal:   { label: 'Normal',   color: 'text-emerald-400', blurb: 'long yields above short — the usual upward slope' },
  flat:     { label: 'Flat',     color: 'text-amber-400',   blurb: 'little slope between 2Y and 10Y — a transition state' },
  inverted: { label: 'Inverted', color: 'text-red-400',     blurb: 'short yields above long — the classic recession signal' },
}

export function RatesClient() {
  const { data: curve } = useQuery<YieldCurveResponse>({
    queryKey: ['treasury-yield-curve'],
    queryFn: () => fetch('/live-data/treasury-yield-curve').then((r) => r.json()),
    staleTime: STALE_TIME_LONG,
  })

  const { data: quotes, isLoading } = useQuery<Record<string, Quote>>({
    queryKey: ['rates-quotes'],
    queryFn: async () => {
      const res = await fetch(`/live-data/security-quotes?symbols=${encodeURIComponent(ALL_SYMBOLS.join(','))}`)
      const json: QuotesResponse = await res.json()
      if (!json.ok || !json.quotes) throw new Error('quotes unavailable')
      return json.quotes
    },
    staleTime: STALE_TIME_SHORT,
    refetchInterval: 1000 * 60 * 2,
  })

  // Merge the three curve snapshots into per-maturity rows for the chart.
  const curveRows = useMemo(() => {
    if (!curve?.ok || !curve.latest) return []
    const rows = new Map<string, Record<string, unknown>>()
    const put = (key: string, snapshot: NonNullable<YieldCurveResponse['latest']>) => {
      for (const p of snapshot.points) {
        const row = rows.get(p.label) ?? { label: p.label, years: p.years }
        row[key] = p.yieldPct
        rows.set(p.label, row)
      }
    }
    put('latest', curve.latest)
    if (curve.monthAgo) put('monthAgo', curve.monthAgo)
    if (curve.yearStart) put('yearStart', curve.yearStart)
    return Array.from(rows.values()).sort((a, b) => (a.years as number) - (b.years as number))
  }, [curve])

  const tnx = quotes?.['^TNX']
  const shape = curve?.ok ? curve.shape : undefined

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-slate-500/10 border border-slate-500/20 flex items-center justify-center">
          <Percent size={18} className="text-slate-400" aria-hidden />
        </div>
        <PageHeader
          title="Bonds & Rates"
          subtitle="The official treasury curve, live yields, futures, and the bond ETF shelf"
          description="The yield curve below is the US Treasury's official daily par curve — 13 maturities, not an approximation. Yield indices and bond futures quote live intraday. Individual corporate and municipal bond quotes are licensed data with no free source, so this page deliberately does not show them."
        />
      </div>

      {/* Data provenance */}
      <SourceLine id="treasury-yield-curve" />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="10-Year Yield"
          value={tnx?.price != null ? `${tnx.price.toFixed(2)}%` : '—'}
          subtitle={tnx?.changePercent != null
            ? `${tnx.changePercent >= 0 ? '+' : ''}${tnx.changePercent.toFixed(2)}% today`
            : tnx?.price != null
              ? 'live intraday'
              : 'no live quote — needs a configured provider key'}
          accentColor="#3b82f6"
        />
        <MetricCard
          title="2s10s Spread"
          value={curve?.ok && curve.spread2s10s != null ? `${curve.spread2s10s > 0 ? '+' : ''}${curve.spread2s10s.toFixed(2)}` : '—'}
          subtitle="10Y − 2Y, percentage points"
          accentColor={curve?.ok && curve.spread2s10s != null && curve.spread2s10s < 0 ? '#ef4444' : '#10b981'}
        />
        <MetricCard
          title="3M–10Y Spread"
          value={curve?.ok && curve.spread3m10y != null ? `${curve.spread3m10y > 0 ? '+' : ''}${curve.spread3m10y.toFixed(2)}` : '—'}
          subtitle="the Fed’s preferred version"
          accentColor="#8b5cf6"
        />
        <MetricCard
          title="Curve Shape"
          value={shape ? SHAPE_INFO[shape].label : '—'}
          subtitle={shape ? SHAPE_INFO[shape].blurb : 'from the official curve'}
          accentColor={shape === 'inverted' ? '#ef4444' : shape === 'flat' ? '#f59e0b' : '#10b981'}
        />
      </div>

      {/* Yield curve */}
      <div className="rounded-card border border-border bg-bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-medium text-text-secondary">Treasury Par Yield Curve</h2>
          {curve?.ok && curve.latest && (
            <span className="text-[11px] font-mono text-text-muted">as of {curve.latest.date}</span>
          )}
        </div>
        {curve?.ok && curveRows.length > 0 ? (
          <>
            <LineChart
              data={curveRows}
              series={[
                { key: 'latest', label: `Latest (${curve.latest!.date})`, color: '#3b82f6', strokeWidth: 2 },
                ...(curve.monthAgo ? [{ key: 'monthAgo', label: `1M ago (${curve.monthAgo.date})`, color: '#f59e0b', dashed: true }] : []),
                ...(curve.yearStart ? [{ key: 'yearStart', label: `Year start (${curve.yearStart.date})`, color: '#64748b', dashed: true }] : []),
              ]}
              xKey="label"
              yFormatter={(v) => `${Number(v).toFixed(1)}%`}
              tooltipFormatter={(v, name) => [`${Number(v).toFixed(2)}%`, name]}
              height={280}
              showLegend
              connectNulls
            />
            <p className="mt-2 text-[11px] text-text-muted leading-relaxed">
              Source: US Treasury daily par yield curve (official, keyless). Maturities are evenly spaced for
              readability, not to scale — the gap from 1M to 30Y spans two orders of magnitude.
            </p>
          </>
        ) : (
          <p className="py-10 text-center text-xs text-text-muted">
            {curve && !curve.ok ? 'The treasury.gov curve feed could not be reached — the curve returns when it recovers.' : 'Loading official curve…'}
          </p>
        )}
      </div>

      {/* Live instruments */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-card border border-border bg-bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-medium text-text-secondary">Yields &amp; Futures</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted uppercase tracking-wider text-[10px] border-b border-border">
                <th className="text-left font-medium py-2 px-4">Instrument</th>
                <th className="text-left font-medium py-2 px-4">Type</th>
                <th className="text-right font-medium py-2 px-4">Quote</th>
                <th className="text-right font-medium py-2 px-4">Day</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {RATES_CATALOG.map((r) => {
                const q = quotes?.[r.symbol]
                const up = (q?.changePercent ?? 0) >= 0
                const info = RATES_CATEGORY_INFO[r.category]
                return (
                  <tr key={r.slug} className="hover:bg-bg-elevated/50 transition-colors">
                    <td className="py-2.5 px-4">
                      <Link href={`/macro/rates/${r.slug}`} className="group flex items-center gap-2.5">
                        <span className="font-medium text-text-primary group-hover:text-accent-blue transition-colors">{r.name}</span>
                        <span className="font-mono text-[11px] text-text-muted">{r.symbol}</span>
                      </Link>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
                        {info.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-text-primary">
                      {q?.price != null ? formatRatesQuote(r, q.price) : isLoading ? '…' : '—'}
                    </td>
                    <td className={clsx('py-2.5 px-4 text-right font-mono tabular-nums text-xs',
                      q?.changePercent == null ? 'text-text-muted' : up ? 'text-emerald-400' : 'text-red-400')}>
                      {q?.changePercent != null ? `${up ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="px-4 py-2.5 border-t border-border/60 text-[11px] text-text-muted leading-relaxed">
            Futures prices move inversely to yields: a rising ZN=F means the 10-year yield is falling.
          </p>
        </div>

        {/* Bond ETF shelf */}
        <div className="rounded-card border border-border bg-bg-card p-4 self-start">
          <h2 className="text-sm font-medium text-text-secondary mb-3">Bond ETF Shelf</h2>
          {/* Grouped by type (W3-8): the flat list hid the categories people
              actually look for — the owner read it as corporate/junk/muni/
              international being absent when all four were present. */}
          <div className="space-y-3">
            {BOND_ETF_SHELF_GROUPS.map((group) => (
              <div key={group.label}>
                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">{group.label}</h3>
                <div className="space-y-1.5">
                  {group.funds.map(({ symbol, role }) => {
                    const fund = getFund(symbol)
                    if (!fund) return null
                    return (
                      <Link key={symbol} href={`/funds/${symbol.toLowerCase()}`} className="flex items-start gap-2.5 text-xs group">
                        <span className="font-mono font-semibold text-text-primary group-hover:text-accent-blue transition-colors w-10 flex-shrink-0">{symbol}</span>
                        <span className="text-text-muted flex-1 leading-snug">{role}</span>
                        <ExternalLink size={11} className="text-text-muted group-hover:text-accent-blue transition-colors flex-shrink-0 mt-0.5" aria-hidden />
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 pt-3 border-t border-border/60 text-[11px] text-text-muted leading-relaxed">
            The practical way to own duration or credit without a bond desk. Full fund pages live in ETFs &amp; Funds.
          </p>
        </div>
      </div>

      <p className="text-[11px] text-text-muted text-center leading-relaxed">
        Yield curve: US Treasury (official daily par rates). Intraday yields and futures via the suite&rsquo;s live
        quote route. Individual bond quotes (CUSIPs) require licensed data and are intentionally absent.
      </p>
    </div>
  )
}
