'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { PriceChartCard } from '@/components/markets/PriceChartCard'
import { SourceLine } from '@/components/ui/SourceLine'
import { RATES_CATEGORY_INFO, formatRatesQuote, getRatesEntry } from '@/lib/data/ratesCatalog'
import { getFund } from '@/lib/data/fundCatalog'
import { STALE_TIME_SHORT } from '@/lib/constants'

// Rates instrument detail — live quote, history chart, and instrument facts.
// Yield indices chart the yield itself; futures chart the price in points.

interface Quote { price: number | null; change: number | null; changePercent: number | null; previousClose: number | null }
interface QuotesResponse { ok: boolean; quotes?: Record<string, Quote> }

export function RatesDetailClient({ slug }: { slug: string }) {
  // Slug validity is guaranteed by the server wrapper (notFound otherwise).
  const entry = getRatesEntry(slug)!
  const info = RATES_CATEGORY_INFO[entry.category]
  const isYield = entry.quoteBasis === 'pct'

  const { data: quote, isLoading } = useQuery<Quote | null>({
    queryKey: ['rates-quote', entry.symbol],
    queryFn: async () => {
      const res = await fetch(`/live-data/security-quotes?symbols=${encodeURIComponent(entry.symbol)}`)
      const json: QuotesResponse = await res.json()
      return json.quotes?.[entry.symbol] ?? null
    },
    staleTime: STALE_TIME_SHORT,
    refetchInterval: 1000 * 60 * 2,
  })

  const up = (quote?.changePercent ?? 0) >= 0
  // For a yield, "up" means borrowing costs rose — color it neutral-informative
  // rather than pretending higher yields are unambiguously good or bad.
  const changeColor = isYield
    ? (up ? 'text-amber-400' : 'text-accent-blue')
    : (up ? 'text-emerald-400' : 'text-red-400')
  const proxies = entry.etfProxies
    .map((symbol) => ({ symbol, fund: getFund(symbol) }))
    .filter((p) => p.fund != null)

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <Link href="/macro/rates" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
        <ArrowLeft size={13} aria-hidden /> Bonds &amp; Rates
      </Link>

      {/* Header + live quote */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-text-primary">{entry.name}</h1>
            <span className="font-mono text-sm text-text-muted">{entry.symbol}</span>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border border-border text-text-secondary">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
              {info.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            {isYield ? 'CBOE yield index · quoted as the yield itself' : 'CBOT futures · front-month continuous, points of par'}
          </p>
        </div>
        <div className="text-right">
          {quote?.price != null ? (
            <>
              <p className="text-2xl font-mono tabular-nums font-semibold text-text-primary">
                {formatRatesQuote(entry, quote.price)}
              </p>
              {quote.changePercent != null && (
                <p className={clsx('text-sm font-mono tabular-nums', changeColor)}>
                  {up ? '+' : ''}{quote.changePercent.toFixed(2)}% today
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-text-muted">{isLoading ? 'Fetching live quote…' : 'Live quote unavailable'}</p>
          )}
        </div>
      </div>

      {/* Provenance for the live quote above. Detail pages carried no
          SourceLine while every registry page did, so the page with the most
          specific numbers was the one with no attribution. */}
      <SourceLine id="macro-quotes" />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <PriceChartCard symbol={entry.symbol} valueFormat="plain" />
        </div>

        <div className="space-y-4">
          <div className="rounded-card border border-border bg-bg-card p-4">
            <h2 className="text-sm font-medium text-text-secondary mb-3">Instrument</h2>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between"><dt className="text-text-muted">Type</dt><dd className="text-text-primary">{info.label}</dd></div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Quoted as</dt>
                <dd className="text-text-primary font-mono">{isYield ? 'yield, %' : 'price, points of par'}</dd>
              </div>
              {quote?.previousClose != null && (
                <div className="flex justify-between"><dt className="text-text-muted">Previous close</dt><dd className="text-text-primary font-mono tabular-nums">{formatRatesQuote(entry, quote.previousClose)}</dd></div>
              )}
            </dl>
            <p className="mt-3 pt-3 border-t border-border/60 text-xs text-text-muted leading-relaxed">{entry.description}</p>
            <p className="mt-3 text-[11px] text-text-muted leading-relaxed">
              {isYield
                ? 'A rising yield means falling bond prices — and vice versa. The chart tracks the yield itself.'
                : 'Futures prices move inversely to yields: this contract rallies when rates fall.'}
            </p>
          </div>

          {/* Duration-matched funds */}
          <div className="rounded-card border border-border bg-bg-card p-4">
            <h2 className="text-sm font-medium text-text-secondary mb-3">Duration-Matched Funds</h2>
            {proxies.length > 0 ? (
              <div className="space-y-2">
                {proxies.map(({ symbol, fund }) => (
                  <Link key={symbol} href={`/funds/${symbol.toLowerCase()}`}
                    className="flex items-center gap-2 text-xs group">
                    <span className="font-mono font-semibold text-text-primary group-hover:text-accent-blue transition-colors w-12">{symbol}</span>
                    <span className="text-text-muted flex-1 truncate">{fund!.name}</span>
                    <ExternalLink size={11} className="text-text-muted group-hover:text-accent-blue transition-colors" aria-hidden />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted leading-relaxed">
                No fund in the catalog matches this maturity band closely enough to list here.
              </p>
            )}
            <p className="mt-3 pt-3 border-t border-border/60 text-[11px] text-text-muted leading-relaxed">
              Nobody buys &ldquo;the {entry.name.toLowerCase()}&rdquo; directly — these funds hold Treasuries in
              the same maturity band, which is how this point on the curve is actually invested in.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
