'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { PriceChartCard } from '@/components/markets/PriceChartCard'
import { SourceLine } from '@/components/ui/SourceLine'
import { CURRENCY_CATEGORY_INFO, formatFxRate, getCurrency } from '@/lib/data/currencyCatalog'
import { getFund } from '@/lib/data/fundCatalog'
import { STALE_TIME_SHORT } from '@/lib/constants'

// FX pair detail — live rate, history chart (shared markets shell), and
// pair facts including the inverse rate.

interface Quote { price: number | null; change: number | null; changePercent: number | null; previousClose: number | null }
interface QuotesResponse { ok: boolean; quotes?: Record<string, Quote> }

export function CurrencyDetailClient({ slug }: { slug: string }) {
  // Slug validity is guaranteed by the server wrapper (notFound otherwise).
  const entry = getCurrency(slug)!
  const info = CURRENCY_CATEGORY_INFO[entry.category]
  const isIndex = entry.category === 'index'

  const { data: quote, isLoading } = useQuery<Quote | null>({
    queryKey: ['currency-quote', entry.symbol],
    queryFn: async () => {
      const res = await fetch(`/live-data/security-quotes?symbols=${encodeURIComponent(entry.symbol)}`)
      const json: QuotesResponse = await res.json()
      return json.quotes?.[entry.symbol] ?? null
    },
    staleTime: STALE_TIME_SHORT,
    refetchInterval: 1000 * 60 * 2,
  })

  const up = (quote?.changePercent ?? 0) >= 0
  const proxies = entry.etfProxies
    .map((symbol) => ({ symbol, fund: getFund(symbol) }))
    .filter((p) => p.fund != null)

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <Link href="/macro/currencies" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
        <ArrowLeft size={13} aria-hidden /> Currencies
      </Link>

      {/* Header + live rate */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-text-primary font-mono">{entry.name}</h1>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border border-border text-text-secondary">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
              {info.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            {isIndex ? 'Basket index · ICE futures settlement' : `1 ${entry.base} in ${entry.quote} · spot`}
          </p>
        </div>
        <div className="text-right">
          {quote?.price != null ? (
            <>
              <p className="text-2xl font-mono tabular-nums font-semibold text-text-primary">
                {formatFxRate(entry, quote.price)}
              </p>
              {quote.changePercent != null && (
                <p className={clsx('text-sm font-mono tabular-nums', up ? 'text-emerald-400' : 'text-red-400')}>
                  {up ? '+' : ''}{quote.changePercent.toFixed(2)}% today
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-text-muted">{isLoading ? 'Fetching live rate…' : 'Live rate unavailable'}</p>
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
            <h2 className="text-sm font-medium text-text-secondary mb-3">{isIndex ? 'Index' : 'Pair'}</h2>
            <dl className="space-y-2 text-xs">
              {!isIndex && (
                <>
                  <div className="flex justify-between"><dt className="text-text-muted">Base</dt><dd className="text-text-primary font-mono">{entry.base}</dd></div>
                  <div className="flex justify-between"><dt className="text-text-muted">Quote</dt><dd className="text-text-primary font-mono">{entry.quote}</dd></div>
                </>
              )}
              <div className="flex justify-between"><dt className="text-text-muted">Category</dt><dd className="text-text-primary">{info.label}</dd></div>
              {quote?.previousClose != null && (
                <div className="flex justify-between"><dt className="text-text-muted">Previous close</dt><dd className="text-text-primary font-mono tabular-nums">{formatFxRate(entry, quote.previousClose)}</dd></div>
              )}
              {!isIndex && quote?.price != null && quote.price > 0 && (
                <div className="flex justify-between">
                  <dt className="text-text-muted">Inverse</dt>
                  <dd className="text-text-primary font-mono tabular-nums">
                    1 {entry.quote} = {(1 / quote.price).toLocaleString(undefined, { maximumFractionDigits: 4 })} {entry.base}
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-3 pt-3 border-t border-border/60 text-xs text-text-muted leading-relaxed">{entry.description}</p>
            <p className="mt-3 text-[11px] text-text-muted leading-relaxed">
              A rising rate means a stronger {isIndex ? 'dollar' : entry.base} against the {isIndex ? 'basket' : entry.quote}.
            </p>
          </div>

          {/* ETF proxies */}
          <div className="rounded-card border border-border bg-bg-card p-4">
            <h2 className="text-sm font-medium text-text-secondary mb-3">ETF Proxies</h2>
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
                No fund in the catalog gives direct exposure to this {isIndex ? 'index' : 'pair'}. {isIndex ? '' : 'Exposure requires a forex account or futures contract.'}
              </p>
            )}
            <p className="mt-3 pt-3 border-t border-border/60 text-[11px] text-text-muted leading-relaxed">
              These funds hold currency deposits (or the index futures), not the FX spot market itself — a proxy, subject to its own expense ratio and tracking error.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
