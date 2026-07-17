'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowLeft, Calculator, TrendingDown, TrendingUp } from 'lucide-react'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { FundHoldingsSection } from './FundHoldingsSection'
import { PriceChartCard, FiftyTwoWeekBar } from '@/components/markets/PriceChartCard'
import { MarketNewsList } from '@/components/markets/MarketNewsList'
import { computeFeeDrag, FUND_CATEGORY_INFO, getFund } from '@/lib/data/fundCatalog'
import { formatCompact, formatCurrency, formatPercent } from '@/lib/utils/format'
import { STALE_TIME_SHORT } from '@/lib/constants'
import type { SecurityQuotesResponse } from '@/app/live-data/security-quotes/route'

// ─── Fee drag analyzer ────────────────────────────────────────────────────────
// Projects what this fund's expense ratio costs versus a 0.03% benchmark fund
// at an assumed gross return — the compounding cost most fund pages hide.

const HORIZONS = [10, 20, 30] as const

function FeeDragCard({ expenseRatioPct, symbol }: { expenseRatioPct: number; symbol: string }) {
  const [principal, setPrincipal] = useState(10_000)
  const [annualReturn, setAnnualReturn] = useState(7)

  return (
    <div className="rounded-card border border-border bg-bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Calculator size={14} className="text-text-muted" aria-hidden />
        <h2 className="text-sm font-medium text-text-secondary">Fee Drag Analyzer</h2>
      </div>
      <p className="text-xs text-text-muted leading-relaxed mb-4">
        What {symbol}&rsquo;s {expenseRatioPct}% expense ratio costs versus a 0.03% index fund,
        assuming {annualReturn}% gross annual return.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <label className="block">
          <span className="text-[11px] text-text-muted uppercase tracking-wider">Investment</span>
          <div className="mt-1 flex items-center rounded border border-border bg-bg-elevated px-2">
            <span className="text-xs text-text-muted">$</span>
            <input
              type="number"
              min={100}
              step={1000}
              value={principal}
              onChange={(e) => setPrincipal(Math.max(0, Number(e.target.value)))}
              className="w-full bg-transparent px-1.5 py-1.5 text-sm font-mono text-text-primary focus:outline-none"
            />
          </div>
        </label>
        <label className="block">
          <span className="text-[11px] text-text-muted uppercase tracking-wider">Gross Return %</span>
          <input
            type="number"
            min={0}
            max={20}
            step={0.5}
            value={annualReturn}
            onChange={(e) => setAnnualReturn(Math.min(20, Math.max(0, Number(e.target.value))))}
            className="mt-1 w-full rounded border border-border bg-bg-elevated px-2.5 py-1.5 text-sm font-mono text-text-primary focus:border-accent-blue/50 focus:outline-none"
          />
        </label>
      </div>

      <div className="space-y-2">
        {HORIZONS.map((years) => {
          const series = computeFeeDrag(principal, expenseRatioPct, years, annualReturn)
          const final = series[series.length - 1]
          if (!final) return null
          const dragPct = final.withBenchmarkFee > 0 ? (final.feesPaid / final.withBenchmarkFee) * 100 : 0
          return (
            <div key={years} className="rounded border border-border/60 bg-bg-elevated/40 px-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted">{years} years</span>
                <span className="font-mono tabular-nums text-text-primary">{formatCurrency(final.withFee, 0)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-text-muted">cost vs 0.03% fund</span>
                <span className={clsx('font-mono tabular-nums', dragPct > 5 ? 'text-orange-400' : dragPct > 1 ? 'text-amber-400' : 'text-emerald-400')}>
                  −{formatCurrency(Math.max(0, final.feesPaid), 0)} ({dragPct.toFixed(1)}%)
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FundDetailPage() {
  const params = useParams<{ symbol: string }>()
  const symbol = (params.symbol ?? '').toUpperCase()
  const entry = getFund(symbol)

  const { data } = useQuery<SecurityQuotesResponse>({
    queryKey: ['security-quotes', symbol],
    queryFn: () => fetch(`/live-data/security-quotes?symbols=${encodeURIComponent(symbol)}`).then((r) => r.json()),
    staleTime: STALE_TIME_SHORT,
    refetchInterval: 60_000,
    enabled: !!entry,
  })

  if (!entry) {
    return (
      <ModuleGate module="funds">
        <div className="max-w-md mx-auto mt-24 rounded-card border border-border bg-bg-card p-8 text-center">
          <p className="text-sm font-medium text-text-primary">Unknown fund “{symbol}”</p>
          <p className="mt-1 text-xs text-text-muted">This ticker isn’t in the fund catalog yet.</p>
          <Link href="/funds" className="inline-block mt-4 text-xs text-accent-blue hover:underline">
            ← Back to Fund Registry
          </Link>
        </div>
      </ModuleGate>
    )
  }

  const quote = data?.quotes?.[symbol]
  const live = !!quote && data?.source !== 'reference' && !quote.reference
  const price = quote?.price ?? entry.referencePrice
  const change = live ? quote?.changePercent ?? null : null
  const category = FUND_CATEGORY_INFO[entry.category]

  const facts: Array<{ label: string; value: string }> = [
    { label: 'Issuer', value: entry.issuer },
    { label: 'Type', value: entry.type === 'etf' ? 'Exchange-Traded Fund' : 'Mutual Fund' },
    { label: 'Expense Ratio', value: `${entry.expenseRatioPct}%` },
    { label: 'AUM', value: formatCompact(entry.aumB * 1e9) },
    { label: 'Distribution Yield', value: entry.yieldPct != null ? `${entry.yieldPct.toFixed(2)}%` : '—' },
    { label: 'Inception', value: String(entry.inceptionYear) },
    { label: 'Index', value: entry.indexTracked ?? 'Actively managed' },
  ]

  return (
    <ModuleGate module="funds">
      <div className="space-y-6 max-w-screen-xl mx-auto">
        {/* Header */}
        <div>
          <Link href="/funds" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <ArrowLeft size={12} aria-hidden /> Fund Registry
          </Link>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-text-primary">{entry.name}</h1>
                <span className="font-mono text-sm text-text-muted">{symbol}</span>
                <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold border',
                  entry.type === 'etf'
                    ? 'text-accent-blue bg-accent-blue/10 border-accent-blue/20'
                    : 'text-violet-400 bg-violet-400/10 border-violet-500/20')}>
                  {entry.type === 'etf' ? 'ETF' : 'MUTUAL FUND'}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border border-border text-text-secondary">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />
                  {category.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted">{entry.description}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-3xl font-bold text-text-primary tabular-nums">
                {formatCurrency(price)}
                {!live && <span className="ml-2 text-xs text-amber-400/80 align-middle font-sans" title="Reference price — live source unreachable">ref</span>}
              </p>
              {change != null && (
                <p className={clsx('mt-0.5 flex items-center justify-end gap-1 font-mono text-sm tabular-nums',
                  change >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {change >= 0 ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
                  {formatPercent(change, 2)} today
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Chart + facts */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-4">
            <PriceChartCard symbol={symbol} />
            <FiftyTwoWeekBar symbol={symbol} price={price} />
          </div>

          <div className="space-y-4">
            <div className="rounded-card border border-border bg-bg-card p-4">
              <h2 className="text-sm font-medium text-text-secondary mb-3">Fund Facts</h2>
              <dl className="space-y-2.5">
                {facts.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-text-muted flex-shrink-0">{label}</dt>
                    <dd className="font-mono tabular-nums text-text-primary text-right text-xs">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <FeeDragCard expenseRatioPct={entry.expenseRatioPct} symbol={symbol} />
          </div>
        </div>

        {/* Full breakdown of underlying investments */}
        <FundHoldingsSection symbol={symbol} />

        {/* News — mutual funds rarely have ticker news, show general market feed */}
        <MarketNewsList symbol={entry.type === 'etf' ? symbol : undefined} limit={8} />

        <p className="text-[11px] text-text-muted text-center">
          Fund facts are reference snapshots from issuer disclosures ·
          Quotes: {data?.source === 'reference' || !data ? 'reference prices' : `live via ${data.source}`}
        </p>
      </div>
    </ModuleGate>
  )
}
