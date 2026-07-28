'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowLeft, ExternalLink, FileText, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { SourceLine } from '@/components/ui/SourceLine'
import { PriceChartCard, FiftyTwoWeekBar } from '@/components/markets/PriceChartCard'
import { MarketNewsList } from '@/components/markets/MarketNewsList'
import { SecFilingsFeed } from '@/components/markets/SecFilingsFeed'
import { FinancialRatios } from '@/components/markets/FinancialRatios'
import { FundamentalsTrend } from '@/components/markets/FundamentalsTrend'
import { CompanyProfileCard } from '@/components/markets/CompanyProfileCard'
import { SectorPeers } from '@/components/markets/SectorPeers'
import { getEquity, secFilingsUrl, SECTOR_INFO, type SectorId } from '@/lib/data/equityCatalog'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { STALE_TIME_SHORT } from '@/lib/constants'
import type { SecurityQuotesResponse } from '@/app/live-data/security-quotes/route'
import type { StockUniverseResponse } from '@/app/live-data/stock-universe/route'

/** Only the fields the detail page needs — works for catalog and dynamic stocks. */
interface DetailEntry {
  symbol: string
  name: string
  sector: SectorId
  industry: string
  website: string
  referencePrice: number
}

export default function EquityDetailPage() {
  const params = useParams<{ symbol: string }>()
  const symbol = (params.symbol ?? '').toUpperCase()
  const staticEntry = getEquity(symbol)

  // Resolve non-catalog tickers from the live universe (FMP profile lookup).
  const { data: uniData, isLoading: uniLoading } = useQuery<StockUniverseResponse>({
    queryKey: ['stock-universe', symbol],
    queryFn: () => fetch(`/live-data/stock-universe?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()),
    enabled: !staticEntry && !!symbol,
    staleTime: 1000 * 60 * 30,
    retry: 1,
  })
  const dyn = uniData?.entries?.[0]

  const entry: DetailEntry | undefined = staticEntry
    ? { symbol: staticEntry.symbol, name: staticEntry.name, sector: staticEntry.sector, industry: staticEntry.industry, website: staticEntry.website, referencePrice: staticEntry.referencePrice }
    : dyn
      ? { symbol: dyn.symbol, name: dyn.name, sector: dyn.sector, industry: dyn.industry, website: dyn.website ?? '', referencePrice: dyn.referencePrice }
      : undefined

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
          {uniLoading ? (
            <>
              <p className="text-sm font-medium text-text-primary">Loading {symbol}…</p>
              <p className="mt-1 text-xs text-text-muted">Resolving this ticker from live data.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-text-primary">Unknown symbol “{symbol}”</p>
              <p className="mt-1 text-xs text-text-muted">Couldn’t resolve this ticker from the catalog or live data.</p>
              <Link href="/equities" className="inline-block mt-4 text-xs text-accent-blue hover:underline">
                ← Back to Stock Registry
              </Link>
            </>
          )}
        </div>
      </ModuleGate>
    )
  }

  const quote = data?.quotes?.[symbol]
  const live = !!quote && data?.source !== 'reference' && !quote.reference
  const price = quote?.price ?? entry.referencePrice
  const change = live ? quote?.changePercent ?? null : null
  const sector = SECTOR_INFO[entry.sector]

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
                {entry.website && (
                  <>
                    {' · '}
                    <a href={entry.website} target="_blank" rel="noopener noreferrer" className="text-accent-blue/80 hover:text-accent-blue inline-flex items-center gap-0.5">
                      {entry.website.replace(/^https?:\/\/(www\.)?/, '')} <ExternalLink size={10} aria-hidden />
                    </a>
                  </>
                )}
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
              <Link
                href={`/research?symbol=${encodeURIComponent(symbol)}`}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-xs font-medium text-white hover:bg-violet-500 transition-colors"
                title="Run the Equity Research Agent on this stock"
              >
                <Sparkles size={13} aria-hidden /> Analyze with AI
              </Link>
            </div>
          </div>
        </div>

        {/* Provenance for the quote above. Detail pages carried no SourceLine
            while every registry page did, so the page with the most specific
            numbers was the one with no attribution. */}
        <SourceLine id="security-quotes" />

        {/* Chart + stats */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-4">
            <PriceChartCard symbol={symbol} />
            <FiftyTwoWeekBar symbol={symbol} price={price} />
            <FinancialRatios symbol={symbol} price={price} priceIsLive={live} />
            <FundamentalsTrend symbol={symbol} />
          </div>
          <div className="space-y-4">
            <CompanyProfileCard symbol={symbol} name={entry.name} />
            <div className="rounded-card border border-border bg-bg-card p-4">
              <h2 className="text-sm font-medium text-text-secondary mb-3">Financial Statements</h2>
              <ul className="space-y-2.5">
                {[
                  { label: 'Annual Reports (10-K)',      type: '10-K' },
                  { label: 'Quarterly Reports (10-Q)',   type: '10-Q' },
                  { label: 'Proxy Statements (DEF 14A)', type: 'DEF 14A' },
                  { label: 'All SEC Filings',            type: '' },
                ].map(({ label, type }) => (
                  <li key={label}>
                    <a
                      href={secFilingsUrl(symbol, type)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between text-sm text-text-secondary hover:text-accent-blue transition-colors group"
                    >
                      <span className="flex items-center gap-2">
                        <FileText size={13} className="text-text-muted group-hover:text-accent-blue transition-colors" aria-hidden />
                        {label}
                      </span>
                      <ExternalLink size={11} className="text-text-muted group-hover:text-accent-blue transition-colors" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-text-muted">Audited statements filed with the SEC · opens EDGAR</p>
            </div>
            <SecFilingsFeed symbol={symbol} />
          </div>
        </div>

        {/* Peers */}
        <SectorPeers symbol={symbol} sector={entry.sector} />

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
