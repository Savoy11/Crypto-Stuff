'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowLeft, ExternalLink, TrendingDown, TrendingUp } from 'lucide-react'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PriceChartCard, FiftyTwoWeekBar } from '@/components/markets/PriceChartCard'
import { MarketNewsList } from '@/components/markets/MarketNewsList'
import { getEquity, SECTOR_INFO } from '@/lib/data/equityCatalog'
import { formatCompact, formatCurrency, formatPercent } from '@/lib/utils/format'
import { STALE_TIME_SHORT } from '@/lib/constants'
import type { SecurityQuotesResponse } from '@/app/live-data/security-quotes/route'

export default function EquityDetailPage() {
  const params = useParams<{ symbol: string }>()
  const symbol = (params.symbol ?? '').toUpperCase()
  const entry = getEquity(symbol)

  const { data } = useQuery<SecurityQuotesResponse>({
    queryKey: ['security-quotes', symbol],
    queryFn: () => fetch(`/live-data/security-quotes?symbols=${encodeURIComponent(symbol)}`).then((r) => r.json()),
    staleTime: STALE_TIME_SHORT,
    refetchInterval: 60_000,
    enabled: !!entry,
  })

  if (!entry) {
    return (
      <ModuleGate module="equities">
        <div className="max-w-md mx-auto mt-24 rounded-card border border-border bg-bg-card p-8 text-center">
          <p className="text-sm font-medium text-text-primary">Unknown symbol “{symbol}”</p>
          <p className="mt-1 text-xs text-text-muted">This ticker isn’t in the equity catalog yet.</p>
          <Link href="/equities" className="inline-block mt-4 text-xs text-accent-blue hover:underline">
            ← Back to Stock Registry
          </Link>
        </div>
      </ModuleGate>
    )
  }

  const quote = data?.quotes?.[symbol]
  const live = !!quote && data?.source !== 'reference' && !quote.reference
  const price = quote?.price ?? entry.referencePrice
  const change = live ? quote?.changePercent ?? null : null
  const sector = SECTOR_INFO[entry.sector]

  const stats: Array<{ label: string; value: string; note?: string }> = [
    { label: 'Market Cap', value: formatCompact(quote?.marketCap ?? entry.marketCapB * 1e9), note: quote?.marketCap ? undefined : 'reference' },
    { label: 'P/E (TTM)', value: entry.peRatio != null ? entry.peRatio.toFixed(0) : '—', note: 'reference' },
    { label: 'Dividend Yield', value: entry.dividendYieldPct != null ? `${entry.dividendYieldPct.toFixed(2)}%` : 'None', note: 'reference' },
    { label: 'Beta (5Y)', value: entry.beta.toFixed(2), note: 'reference' },
  ]

  return (
    <ModuleGate module="equities">
      <div className="space-y-6 max-w-screen-xl mx-auto">
        {/* Header */}
        <div>
          <Link href="/equities" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <ArrowLeft size={12} aria-hidden /> Stock Registry
          </Link>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-text-primary">{entry.name}</h1>
                <span className="font-mono text-sm text-text-muted">{symbol}</span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border border-border text-text-secondary">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: sector.color }} aria-hidden />
                  {sector.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {entry.industry}
                {' · '}
                <a href={entry.website} target="_blank" rel="noopener noreferrer" className="text-accent-blue/80 hover:text-accent-blue inline-flex items-center gap-0.5">
                  {entry.website.replace(/^https?:\/\/(www\.)?/, '')} <ExternalLink size={10} aria-hidden />
                </a>
              </p>
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

        {/* Chart + stats */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-4">
            <PriceChartCard symbol={symbol} />
            <FiftyTwoWeekBar symbol={symbol} price={price} />
          </div>
          <div className="space-y-4">
            <div className="rounded-card border border-border bg-bg-card p-4">
              <h2 className="text-sm font-medium text-text-secondary mb-3">Key Statistics</h2>
              <dl className="space-y-2.5">
                {stats.map(({ label, value, note }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <dt className="text-text-muted">{label}</dt>
                    <dd className="font-mono tabular-nums text-text-primary">
                      {value}
                      {note && <span className="ml-1.5 text-[9px] text-amber-400/70 align-top">{note}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="rounded-card border border-border bg-bg-card p-4">
              <h2 className="text-sm font-medium text-text-secondary mb-2">About</h2>
              <p className="text-sm text-text-secondary leading-relaxed">{entry.description}</p>
            </div>
          </div>
        </div>

        {/* News */}
        <MarketNewsList symbol={symbol} limit={8} />

        <p className="text-[11px] text-text-muted text-center">
          Fundamentals marked “ref” are approximate reference values pending a fundamentals feed ·
          Quotes: {data?.source === 'reference' || !data ? 'reference prices' : `live via ${data.source}`}
        </p>
      </div>
    </ModuleGate>
  )
}
