'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { useMarketOverview } from '@/hooks/useMarketData'
import { useAlertStats } from '@/hooks/useAlerts'
import { RiskHeatmap } from '@/components/dashboard/RiskHeatmap'
import { formatCompact, formatScore, formatOrNA, NA_LABEL } from '@/lib/utils/format'
import { getScoreColor } from '@/lib/utils/risk'
import type { PopoutKey } from '@/store/usePopoutStore'

// ─── Live Prices ──────────────────────────────────────────────────────────────

const TRACKED_COINS = [
  { id: 'bitcoin',  symbol: 'BTC' },
  { id: 'ethereum', symbol: 'ETH' },
  { id: 'solana',   symbol: 'SOL' },
  { id: 'binancecoin', symbol: 'BNB' },
  { id: 'ripple',   symbol: 'XRP' },
  { id: 'cardano',  symbol: 'ADA' },
  { id: 'tether',   symbol: 'USDT' },
  { id: 'usd-coin', symbol: 'USDC' },
]

function LivePrices() {
  const ids = TRACKED_COINS.map((c) => c.id).join(',')
  const { data, isLoading } = useQuery({
    queryKey: ['popout-prices', ids],
    queryFn: async () => {
      const res = await fetch(`/live-data/portfolio-prices?ids=${ids}`)
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ prices: Record<string, number | null> }>
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  return (
    <div className="p-3 space-y-1">
      {TRACKED_COINS.map(({ id, symbol }) => {
        const price = data?.prices?.[id] ?? null
        return (
          <div key={id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-bg-elevated transition-colors">
            <span className="font-mono text-xs font-semibold text-text-primary w-12">{symbol}</span>
            <span className="font-mono text-xs text-text-secondary tabular-nums">
              {isLoading ? '—' : price != null ? `$${price.toLocaleString(undefined, { maximumFractionDigits: price > 1 ? 2 : 6 })}` : 'N/A'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Market Overview ──────────────────────────────────────────────────────────

function MarketOverviewPopout() {
  const { data: overview } = useMarketOverview()
  const { data: alertStats } = useAlertStats()

  const items = [
    { label: 'Assets Monitored', value: overview?.totalAssets?.toString() ?? '—' },
    { label: 'Avg Risk Score', value: overview?.avgRiskScore != null ? formatScore(overview.avgRiskScore) : NA_LABEL },
    { label: 'High / Critical', value: overview?.criticalHighCount?.toString() ?? NA_LABEL },
    { label: 'Active Alerts', value: alertStats?.unread?.toString() ?? '—' },
    { label: 'Total Market Cap', value: overview?.totalMarketCap != null ? formatCompact(overview.totalMarketCap) : NA_LABEL },
  ]

  return (
    <div className="p-4 grid grid-cols-2 gap-3">
      {items.map(({ label, value }) => (
        <div key={label} className="rounded-lg border border-border bg-bg-elevated p-3">
          <p className="text-[10px] text-text-muted uppercase tracking-wide">{label}</p>
          <p className="mt-1 text-lg font-mono font-bold text-text-primary">{value}</p>
        </div>
      ))}
    </div>
  )
}

// ─── News Feed ────────────────────────────────────────────────────────────────

const SENTIMENT_DOT: Record<string, string> = {
  positive: 'bg-emerald-400',
  neutral:  'bg-slate-400',
  negative: 'bg-red-400',
}

function NewsFeed() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['popout-news'],
    queryFn: async () => {
      const res = await fetch('/live-data/news?limit=20')
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ articles: Array<{ id: string; headline: string; source: string; sentiment: string; publishedAt: string; url: string }> }>
    },
    staleTime: 120_000,
    refetchInterval: 5 * 60_000,
  })

  if (isLoading) return <div className="p-4 text-xs text-text-muted text-center">Loading news…</div>
  const articles = data?.articles ?? []

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-[10px] text-text-muted">{articles.length} stories</span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 px-2 py-0.5 rounded border border-border text-[10px] text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors disabled:opacity-50"
        >
          <RefreshCw size={9} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
      <div className="divide-y divide-border overflow-auto flex-1">
      {articles.slice(0, 15).map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex gap-2 px-3 py-2.5 hover:bg-bg-elevated transition-colors group"
        >
          <span className={clsx('mt-1.5 size-1.5 rounded-full flex-shrink-0', SENTIMENT_DOT[a.sentiment] ?? 'bg-slate-400')} />
          <div className="min-w-0">
            <p className="text-xs text-text-primary leading-snug line-clamp-2 group-hover:text-accent-blue transition-colors">{a.headline}</p>
            <p className="text-[10px] text-text-muted mt-0.5">{a.source}</p>
          </div>
        </a>
      ))}
      </div>
    </div>
  )
}

// ─── Staking Rates ────────────────────────────────────────────────────────────

const PROTOCOL_LABELS: Record<string, { protocol: string; symbol: string }> = {
  lido_eth:      { protocol: 'Lido',      symbol: 'ETH' },
  rocketpool_eth:{ protocol: 'Rocket Pool', symbol: 'ETH' },
  marinade_sol:  { protocol: 'Marinade',  symbol: 'SOL' },
  jito_sol:      { protocol: 'Jito',      symbol: 'SOL' },
  stride_atom:   { protocol: 'Stride',    symbol: 'ATOM' },
  ankr_eth:      { protocol: 'Ankr',      symbol: 'ETH' },
  coinbase_eth:  { protocol: 'Coinbase',  symbol: 'ETH' },
  kraken_eth:    { protocol: 'Kraken',    symbol: 'ETH' },
  binance_eth:   { protocol: 'Binance',   symbol: 'ETH' },
}

function StakingRates() {
  const { data, isLoading } = useQuery({
    queryKey: ['popout-staking'],
    queryFn: async () => {
      const res = await fetch('/live-data/staking-rates')
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ rates: Record<string, number> }>
    },
    staleTime: 5 * 60_000,
  })

  const rows = data?.rates
    ? Object.entries(data.rates).map(([key, apy]) => ({
        key,
        protocol: PROTOCOL_LABELS[key]?.protocol ?? key,
        symbol:   PROTOCOL_LABELS[key]?.symbol   ?? key.split('_')[1]?.toUpperCase() ?? '—',
        apy,
      }))
    : []

  return (
    <div className="p-3">
      <div className="grid grid-cols-3 text-[10px] text-text-muted uppercase px-2 pb-1">
        <span>Asset</span><span>Protocol</span><span className="text-right">APY</span>
      </div>
      <div className="space-y-0.5">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-bg-elevated animate-pulse" />
            ))
          : rows.map((r) => (
              <div key={r.key} className="grid grid-cols-3 items-center px-2 py-1.5 rounded hover:bg-bg-elevated transition-colors">
                <span className="font-mono text-xs font-semibold text-text-primary">{r.symbol}</span>
                <span className="text-xs text-text-muted truncate">{r.protocol}</span>
                <span className="font-mono text-xs text-emerald-400 text-right">{r.apy.toFixed(2)}%</span>
              </div>
            ))}
      </div>
    </div>
  )
}

// ─── Risk Heatmap ─────────────────────────────────────────────────────────────

function RiskHeatmapPopout() {
  return (
    <div className="p-2 overflow-auto">
      <RiskHeatmap />
    </div>
  )
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export function PopoutContent({ contentKey }: { contentKey: PopoutKey }) {
  switch (contentKey) {
    case 'prices':          return <LivePrices />
    case 'market-overview': return <MarketOverviewPopout />
    case 'news-feed':       return <NewsFeed />
    case 'staking-rates':   return <StakingRates />
    case 'risk-heatmap':    return <RiskHeatmapPopout />
    default:                return null
  }
}
