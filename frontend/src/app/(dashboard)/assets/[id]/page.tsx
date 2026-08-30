'use client'

import { ModuleGate } from '@/components/layout/ModuleGate'
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  Copy, CheckCircle, ExternalLink, ChevronLeft, TrendingUp, TrendingDown,
  Clock, Globe, Shield, Activity, BookOpen, Newspaper, Zap,
  RefreshCw, ChevronDown, SlidersHorizontal, X,
  CandlestickChart as CandlestickIcon, AreaChart, BarChart2,
  LineChart, GitBranch, Layers,
} from 'lucide-react'
import {
  ema, computeSignalSummary, fibRetracement,
  type OhlcvCandle, type SignalSummary, type Signal,
} from '@/lib/utils/indicators'
import type { ChartType } from '@/components/charts/CandlestickChart'
import type { LucideIcon } from 'lucide-react'

const TACandlestickChart = dynamic(
  () => import('@/components/charts/CandlestickChart'),
  { ssr: false }
)

const EMBED_RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'MAX'] as const
type EmbedRange = typeof EMBED_RANGES[number]

const EMBED_CHART_TYPES: { type: ChartType; label: string; desc: string; Icon: LucideIcon }[] = [
  { type: 'candlestick', label: 'Candlestick',  desc: 'Standard OHLC candles',                    Icon: CandlestickIcon },
  { type: 'hollow',      label: 'Hollow',        desc: 'Up candles outlined, down filled',          Icon: CandlestickIcon },
  { type: 'heikin-ashi', label: 'Heikin Ashi',  desc: 'Smoothed noise-filtering candles',          Icon: Activity },
  { type: 'bars',        label: 'OHLC Bars',    desc: 'Traditional open/high/low/close bars',      Icon: BarChart2 },
  { type: 'line',        label: 'Line',          desc: 'Simple close-price line',                   Icon: LineChart },
  { type: 'step-line',   label: 'Step Line',     desc: 'Stepped close-price line',                  Icon: GitBranch },
  { type: 'area',        label: 'Area',          desc: 'Filled area under close price',             Icon: AreaChart },
  { type: 'baseline',    label: 'Baseline',      desc: 'Green/red vs. first period close',          Icon: Layers },
]
import { clsx } from 'clsx'
import { useAsset } from '@/hooks/useAssets'
import { PegDeviationChart } from '@/components/analytics/PegDeviationChart'
import { ReserveComposition } from '@/components/analytics/ReserveComposition'
import { ReserveProvenance, normalisePegMechanism } from '@/components/analytics/reserves'
import { LiquidityDepthChart } from '@/components/analytics/LiquidityDepthChart'
import { WalletConcentration } from '@/components/analytics/WalletConcentration'
import { VelocityChart } from '@/components/analytics/VelocityChart'
import { PriceHistoryChart } from '@/components/analytics/PriceHistoryChart'
import { MetricCard } from '@/components/ui/MetricCard'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { SourceLine } from '@/components/ui/SourceLine'
import { formatCompact, formatAddress, formatBps, formatDate, formatAssetPrice, formatOrNA, timeAgoCompact, NA_LABEL } from '@/lib/utils/format'
import { getPegDeviationColorClass } from '@/lib/utils/risk'
import { ASSET_TYPE_LABELS, BLOCKCHAIN_LABELS, LIVE_DATA } from '@/lib/constants'
import { PumpReportTab } from '@/components/pump-report/PumpReportTab'
import { LiveUnavailable } from '@/components/ui/LiveUnavailable'
import { useQuery } from '@tanstack/react-query'
import { NEWS_CATEGORIES } from '@/lib/data/newsCategories'
import type { NewsCategory } from '@/lib/data/newsCategories'
import type { LiveNewsArticle } from '@/app/live-data/news/route'
import type { LiveReserveAsset } from '@/app/live-data/reserves/route'
import { Loader2 } from 'lucide-react'

type Tab = 'overview' | 'news' | 'technical-analysis' | 'reserves' | 'pump-report'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'news', label: 'News' },
  { id: 'technical-analysis', label: 'Technical Analysis' },
  { id: 'reserves', label: 'Reserves' },
  // No Risk History tab. It was cut as review defect D-6 (its API returned a
  // hardcoded [] and the chart drew "Avg: 0.0 / Latest: 0.0"), and RP-4 then
  // declined the score-history persistence that would have made it real. Both
  // are now moot: per-coin risk scoring was removed entirely on 2026-08-29
  // (RP-6), so there is no score whose history could be charted.
  { id: 'pump-report', label: 'Pump Report' },
]

// Asset IDs supported by the TA chart
const TA_ASSETS = new Set(['btc', 'eth', 'usdt', 'usdc', 'bnb', 'sol', 'xrp', 'ada', 'dai'])

const EMBED_INDICATORS = [
  { key: 'ema20',    label: 'EMA 20',          group: 'overlay' },
  { key: 'ema50',    label: 'EMA 50',          group: 'overlay' },
  { key: 'ema200',   label: 'EMA 200',         group: 'overlay' },
  { key: 'sma20',    label: 'SMA 20',          group: 'overlay' },
  { key: 'bb',       label: 'Bollinger Bands', group: 'overlay' },
  { key: 'vwap',     label: 'VWAP',            group: 'overlay' },
  { key: 'rsi',      label: 'RSI (14)',         group: 'panel' },
  { key: 'macd',     label: 'MACD',            group: 'panel' },
  { key: 'stochrsi', label: 'Stoch RSI',       group: 'panel' },
  { key: 'volume',   label: 'Volume',          group: 'panel' },
  { key: 'obv',      label: 'OBV',             group: 'panel' },
  { key: 'atr',      label: 'ATR (14)',        group: 'panel' },
] as const

const SIG_COLORS: Record<Signal, string> = {
  strong_buy:  'text-emerald-400 bg-emerald-400/10 border-emerald-500/30',
  buy:         'text-green-400 bg-green-400/10 border-green-500/30',
  neutral:     'text-slate-400 bg-slate-400/10 border-slate-500/30',
  sell:        'text-orange-400 bg-orange-400/10 border-orange-500/30',
  strong_sell: 'text-red-400 bg-red-400/10 border-red-500/30',
}
const SIG_LABELS: Record<Signal, string> = {
  strong_buy: 'Strong Buy', buy: 'Buy', neutral: 'Neutral', sell: 'Sell', strong_sell: 'Strong Sell',
}

function EmbedSignalSummary({ summary }: { summary: SignalSummary }) {
  const total = summary.buy + summary.neutral + summary.sell
  const buyPct  = total > 0 ? (summary.buy     / total) * 100 : 0
  const neuPct  = total > 0 ? (summary.neutral / total) * 100 : 0
  const sellPct = total > 0 ? (summary.sell    / total) * 100 : 0
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Signal Summary</span>
        <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold', SIG_COLORS[summary.overall])}>
          {summary.overall === 'strong_buy' || summary.overall === 'buy' ? <TrendingUp size={11} /> : summary.overall === 'strong_sell' || summary.overall === 'sell' ? <TrendingDown size={11} /> : null}
          {SIG_LABELS[summary.overall]}
        </span>
      </div>
      <div className="space-y-1">
        <div className="h-2 rounded-full overflow-hidden flex gap-px">
          <div className="bg-emerald-500 transition-all" style={{ width: `${buyPct}%` }} />
          <div className="bg-slate-600 transition-all" style={{ width: `${neuPct}%` }} />
          <div className="bg-red-500 transition-all"    style={{ width: `${sellPct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-text-muted">
          <span className="text-emerald-400">{summary.buy} Buy</span>
          <span>{summary.neutral} Neutral</span>
          <span className="text-red-400">{summary.sell} Sell</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {summary.signals.map((sig) => (
          <div key={sig.name} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-text-primary truncate">{sig.name}</p>
              <p className="text-[10px] text-text-muted truncate">{sig.description}</p>
            </div>
            <span className={clsx('shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border', SIG_COLORS[sig.signal])}>
              {SIG_LABELS[sig.signal]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmbedKeyLevels({ candles }: { candles: OhlcvCandle[] }) {
  if (candles.length < 20) return null
  const fib  = fibRetracement(candles, Math.min(candles.length, 100))
  const last = candles[candles.length - 1].close
  const closes = candles.map((c) => c.close)
  const ema20 = ema(closes, 20)[candles.length - 1]
  const ema50 = ema(closes, 50)[candles.length - 1]
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Key Levels</span>
      <div>
        <p className="text-[10px] text-text-muted mb-1.5 uppercase tracking-wide">Fibonacci Retracement</p>
        <div className="space-y-0.5">
          {fib.levels.map((l) => {
            const isAbove   = l.price > last
            const isCurrent = Math.abs(l.price - last) / last < 0.005
            return (
              <div key={l.ratio} className={clsx('flex items-center justify-between px-2 py-0.5 rounded text-[11px]', isCurrent ? 'bg-accent-blue/10 border border-accent-blue/30' : 'hover:bg-bg-elevated')}>
                <span className={clsx('font-mono text-text-muted', isCurrent && 'text-accent-blue')}>{l.label}</span>
                <span className={clsx('font-mono font-semibold', isAbove ? 'text-red-400' : 'text-emerald-400', isCurrent && '!text-accent-blue')}>
                  ${l.price.toLocaleString(undefined, { maximumFractionDigits: l.price > 100 ? 2 : 4 })}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-text-muted mb-1.5 uppercase tracking-wide">Moving Averages</p>
        {[{ label: 'EMA 20', value: ema20, color: '#f59e0b' }, { label: 'EMA 50', value: ema50, color: '#8b5cf6' }].map(({ label, value, color }) =>
          value !== null && (
            <div key={label} className="flex items-center justify-between px-2 py-0.5 rounded hover:bg-bg-elevated text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full inline-block" style={{ background: color }} />
                <span className="text-text-muted">{label}</span>
              </div>
              <span className={clsx('font-mono font-semibold', last > value ? 'text-emerald-400' : 'text-red-400')}>
                ${value.toLocaleString(undefined, { maximumFractionDigits: value > 100 ? 2 : 4 })}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  )
}

function TechnicalAnalysisTab({ asset }: { asset: NonNullable<ReturnType<typeof useAsset>['data']> }) {
  const canChart = TA_ASSETS.has(asset.id)
  const [range, setRange] = useState<EmbedRange>('1Y')
  const [chartType, setChartType] = useState<ChartType>('candlestick')
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(['ema20', 'ema50', 'volume', 'rsi']))
  const [menuOpen, setMenuOpen] = useState(false)
  const [chartTypeMenuOpen, setChartTypeMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const chartTypeMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen && !chartTypeMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
      if (chartTypeMenuRef.current && !chartTypeMenuRef.current.contains(e.target as Node)) setChartTypeMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen, chartTypeMenuOpen])

  const { data, isFetching } = useQuery({
    queryKey: ['ta-ohlcv-embed', asset.id, range],
    queryFn: async () => {
      const res = await fetch(`/live-data/ohlcv?id=${asset.id}&range=${range}`)
      if (!res.ok) throw new Error('fetch failed')
      return res.json() as Promise<{ ok: boolean; candles: OhlcvCandle[] }>
    },
    enabled: canChart,
    staleTime: range === '1M' ? 300_000 : 900_000,
  })

  const candles = useMemo<OhlcvCandle[]>(() => data?.candles ?? [], [data])
  const summary = useMemo(() => candles.length >= 50 ? computeSignalSummary(candles) : null, [candles])

  function toggleIndicator(key: string) {
    setActiveIndicators((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  return (
    <div className="space-y-6">
      {/* ── Candlestick chart section ── */}
      {canChart ? (
        <div className="rounded-card border border-border bg-bg-card p-4 space-y-3">
          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Range selector */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              {EMBED_RANGES.map((r) => (
                <button key={r} onClick={() => setRange(r)}
                  className={clsx('px-2.5 py-1.5 text-xs font-medium transition-colors',
                    range === r ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
                  )}>
                  {r}
                </button>
              ))}
            </div>

            {/* Chart type dropdown */}
            <div className="relative" ref={chartTypeMenuRef}>
              {(() => {
                const current = EMBED_CHART_TYPES.find((c) => c.type === chartType) ?? EMBED_CHART_TYPES[0]
                return (
                  <button
                    onClick={() => setChartTypeMenuOpen((v) => !v)}
                    className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                      chartTypeMenuOpen ? 'border-accent-blue/60 bg-accent-blue/10 text-accent-blue' : 'border-border text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                    )}
                  >
                    <current.Icon size={12} />
                    {current.label}
                    <ChevronDown size={11} className={clsx('transition-transform', chartTypeMenuOpen && 'rotate-180')} />
                  </button>
                )
              })()}
              {chartTypeMenuOpen && (
                <div className="absolute top-full left-0 mt-1.5 z-50 bg-bg-card border border-border rounded-xl shadow-2xl w-52 p-1.5">
                  {EMBED_CHART_TYPES.map(({ type, label, desc, Icon }) => (
                    <button
                      key={type}
                      onClick={() => { setChartType(type); setChartTypeMenuOpen(false) }}
                      className={clsx('w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
                        chartType === type ? 'bg-accent-blue/10 text-accent-blue' : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                      )}
                    >
                      <Icon size={13} className="mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs font-medium">{label}</div>
                        <div className="text-[10px] text-text-muted leading-tight mt-0.5">{desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Indicator dropdown */}
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((v) => !v)}
                className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                  menuOpen ? 'border-accent-blue/60 bg-accent-blue/10 text-accent-blue' : 'border-border text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                )}>
                <SlidersHorizontal size={12} />
                Indicators
                {activeIndicators.size > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-accent-blue/20 text-accent-blue text-[10px] font-bold">
                    {activeIndicators.size}
                  </span>
                )}
                <ChevronDown size={11} className={clsx('transition-transform', menuOpen && 'rotate-180')} />
              </button>
              {menuOpen && (
                <div className="absolute top-full left-0 mt-1.5 z-50 bg-bg-card border border-border rounded-xl shadow-2xl w-72 p-3 space-y-3">
                  {(['overlay', 'panel'] as const).map((grp) => (
                    <div key={grp}>
                      <div className={clsx('text-[10px] font-semibold uppercase tracking-wider mb-2', grp === 'overlay' ? 'text-amber-400/80' : 'text-violet-400/80')}>
                        {grp === 'overlay' ? 'Overlays' : 'Panels'}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {EMBED_INDICATORS.filter((i) => i.group === grp).map(({ key, label }) => (
                          <button key={key} onClick={() => toggleIndicator(key)}
                            className={clsx('px-2 py-0.5 rounded border text-[11px] font-medium transition-colors',
                              activeIndicators.has(key)
                                ? grp === 'overlay' ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-violet-500/40 bg-violet-500/10 text-violet-400'
                                : 'border-border text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
                            )}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {activeIndicators.size > 0 && (
                    <div className="pt-2 border-t border-border flex justify-end">
                      <button onClick={() => setActiveIndicators(new Set())} className="text-[11px] text-text-muted hover:text-red-400 transition-colors">Clear all</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Active chips */}
            {Array.from(activeIndicators).map((key) => {
              const ind = EMBED_INDICATORS.find((i) => i.key === key)
              if (!ind) return null
              return (
                <span key={key} className={clsx('inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded border text-[11px] font-medium',
                  ind.group === 'overlay' ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-violet-500/40 bg-violet-500/10 text-violet-400'
                )}>
                  {ind.label}
                  <button onClick={() => toggleIndicator(key)} className="opacity-60 hover:opacity-100 transition-opacity"><X size={9} /></button>
                </span>
              )
            })}

            {isFetching && <RefreshCw size={12} className="animate-spin text-text-muted ml-auto" />}
          </div>

          {/* Chart + right panel */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-3">
            <div className="rounded-xl border border-border overflow-hidden" style={{ height: 460 }}>
              {candles.length > 0 ? (
                <TACandlestickChart candles={candles} activeIndicators={activeIndicators} chartType={chartType} />
              ) : (
                <div className="flex items-center justify-center h-full gap-2 text-text-muted">
                  {isFetching
                    ? <><RefreshCw size={16} className="animate-spin" /><span className="text-sm">Loading chart…</span></>
                    : <span className="text-sm">No data available</span>}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3">
              {summary && <EmbedSignalSummary summary={summary} />}
              {candles.length >= 20 && <EmbedKeyLevels candles={candles} />}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-card border border-border bg-bg-card p-8 text-center">
          <Activity size={24} className="mx-auto mb-2 text-text-muted" aria-hidden />
          <p className="text-sm font-medium text-text-secondary">Chart not available for {asset.symbol}</p>
          <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
            Candlestick data is supported for BTC, ETH, SOL, BNB, XRP, ADA, USDT, USDC, and DAI.
          </p>
        </div>
      )}

      {/* ── On-chain analytics (existing) ── */}
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">On-Chain Analytics</h3>
        <AnalyticsTab asset={asset} />
      </div>
    </div>
  )
}

function AssetHeader({ asset }: { asset: NonNullable<ReturnType<typeof useAsset>['data']> }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(asset.contractAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [asset.contractAddress])

  const priceUp = (asset.latestMarketData?.priceChange24h ?? 0) >= 0
  const pegClass = getPegDeviationColorClass(asset.pegDeviationBps ?? asset.pegDeviation)

  return (
    <div className="rounded-card border border-border bg-bg-card p-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        {/* Left: identity */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-mono font-extrabold text-3xl text-text-primary">{asset.symbol}</h1>
            {/* The risk-band pill went with the score gauge (2026-08-29): a
                verdict word pinned to the asset's identity is the same rating
                as the number, just spelled out, and equally uninterrogable
                here. The band still renders in the Composite Risk panel beside
                the pillars that produced it. */}
            <span className="px-2.5 py-1 text-xs rounded border border-border bg-bg-elevated text-text-secondary font-mono">
              {ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType}
            </span>
            <span className="px-2.5 py-1 text-xs rounded border border-border bg-bg-elevated text-text-secondary font-mono">
              {BLOCKCHAIN_LABELS[asset.blockchain] ?? asset.blockchain}
            </span>
            {!asset.isActive && (
              <span className="px-2 py-0.5 text-xs rounded bg-red-500/10 text-red-400 border border-red-500/30 font-mono">
                INACTIVE
              </span>
            )}
          </div>

          <div className="text-text-secondary text-sm">{asset.name}</div>
          {asset.description && (
            <p className="text-xs text-text-muted max-w-xl leading-relaxed">{asset.description}</p>
          )}

          {/* Contract address — sentinel placeholders (0x000…000N) must not
              display as a real address */}
          {/^0x0{30,}[0-9a-fA-F]*$/.test(asset.contractAddress) ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Contract:</span>
              <span className="text-xs text-text-muted italic">not on file</span>
            </div>
          ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Contract:</span>
            <code className="font-mono text-xs text-text-secondary">
              {formatAddress(asset.contractAddress, 6)}
            </code>
            <button
              onClick={handleCopy}
              className="text-text-muted hover:text-text-secondary transition-colors"
              aria-label="Copy contract address"
            >
              {copied
                ? <CheckCircle size={12} className="text-emerald-400" aria-hidden />
                : <Copy size={12} aria-hidden />}
            </button>
            {asset.website && (
              <a
                href={asset.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-text-muted hover:text-accent-blue hover:bg-accent-blue/10 border border-border hover:border-accent-blue/30 transition-all"
                aria-label={`Visit ${asset.name} website`}
              >
                <Globe size={11} aria-hidden />
                Website
              </a>
            )}
            {asset.whitepaper && (
              <a
                href={asset.whitepaper}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-text-muted hover:text-accent-blue hover:bg-accent-blue/10 border border-border hover:border-accent-blue/30 transition-all"
                aria-label={`Read ${asset.name} whitepaper`}
              >
                <BookOpen size={11} aria-hidden />
                Whitepaper
              </a>
            )}
          </div>
          )}
        </div>

        {/* The 5xl "Safety Score" gauge that used to sit here was REMOVED
            2026-08-29 (owner). A large colour-coded number beside the price,
            with no pillars, weights, coverage or evidence next to it, is a
            rating — it states a verdict the reader cannot interrogate. The
            same figure still renders further down inside the Composite Risk
            panel, where it arrives with its methodology, its confidence, its
            data coverage and its evidence; that panel is the explanatory
            surface item 4 deliberately kept (RP-3: scoring what the reader
            opened is explanation, publishing a bare rating is not).
            TO RESTORE: this block and the score row in components/ui/
            SearchInput.tsx are the two removals. */}
        <div className="flex items-center gap-6 flex-shrink-0">
          {/* Quick stats */}
          <div className="flex flex-col gap-2 min-w-32">
            <div>
              <div className="text-[10px] text-text-muted uppercase">Price</div>
              <div className="font-mono text-sm text-text-primary">
                {formatOrNA(asset.price, formatAssetPrice)}
                <span className={clsx('ml-2 text-xs', priceUp ? 'text-emerald-400' : 'text-red-400')}>
                  {priceUp ? '+' : ''}{(asset.latestMarketData?.priceChange24h ?? 0).toFixed(asset.assetType === 'layer1' ? 1 : 3)}%
                </span>
              </div>
            </div>
            <div>
              {asset.assetType === 'layer1' ? (
                <>
                  <div className="text-[10px] text-text-muted uppercase">24h Change</div>
                  <div className={clsx('font-mono text-sm', priceUp ? 'text-emerald-400' : 'text-red-400')}>
                    {priceUp ? '+' : ''}{(asset.latestMarketData?.priceChange24h ?? 0).toFixed(1)}%
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[10px] text-text-muted uppercase">Peg Dev</div>
                  <div className={clsx('font-mono text-sm', pegClass)}>
                    {formatOrNA(asset.pegDeviationBps ?? asset.pegDeviation, formatBps)}
                  </div>
                </>
              )}
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase">Market Cap</div>
              <div className="font-mono text-sm text-text-primary">{formatOrNA(asset.marketCap, formatCompact)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Issuer + last updated */}
      {(asset.issuer) && (
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border text-xs text-text-muted">
          <div className="flex items-center gap-1.5">
            <Shield size={11} aria-hidden />
            <span>Issuer: <span className="text-text-secondary">{asset.issuer}</span></span>
          </div>
          {/* This is the date the *reference metadata* (issuer, contract,
              links, description) was last revised — not a price timestamp.
              Labelled explicitly because it sits beside live prices, and a bare
              "Updated" here reads as though the quotes were what refreshed.
              Day precision, since that is the precision the catalog has. */}
          <div className="flex items-center gap-1.5">
            <Clock size={11} aria-hidden />
            <span>Reference data as of: <span className="text-text-secondary font-mono">{formatDate(asset.updatedAt, 'MMM dd, yyyy')}</span></span>
          </div>
        </div>
      )}
    </div>
  )
}

function OverviewTab({ asset }: { asset: NonNullable<ReturnType<typeof useAsset>['data']> }) {
  const { latestMarketData: md } = asset

  return (
    <div className="space-y-6">
      {/* Market metrics */}
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Market Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Market Cap"
            value={formatOrNA(md.marketCap, formatCompact)}
            icon={<Activity size={14} />}
            accentColor="#3b82f6"
          />
          <MetricCard
            title="24h Volume"
            value={formatOrNA(md.volume24h, formatCompact)}
            icon={<TrendingUp size={14} />}
            accentColor="#10b981"
          />
          <MetricCard
            title="Circulating Supply"
            value={formatOrNA(md.circulatingSupply, formatCompact)}
            icon={<Globe size={14} />}
            accentColor="#f59e0b"
          />
          {asset.assetType === 'layer1' ? (
            <MetricCard
              title="Consensus"
              value={asset.consensusMechanism ?? '—'}
              icon={<Shield size={14} />}
              accentColor="#8b5cf6"
            />
          ) : (
            <MetricCard
              title="Reserve Ratio"
              value={asset.reserveRatio === null ? NA_LABEL : `${(asset.reserveRatio * 100).toFixed(2)}%`}
              icon={<Shield size={14} />}
              accentColor={(asset.reserveRatio ?? 0) >= 1 ? '#10b981' : '#ef4444'}
            />
          )}
        </div>
      </div>

      {/* L1 network metrics */}
      {asset.assetType === 'layer1' && (
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Network Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {asset.stakingAPY != null && (
              <MetricCard title="Staking APY" value={`${asset.stakingAPY.toFixed(1)}%`} accentColor="#10b981" />
            )}
            {asset.validatorCount != null && (
              <MetricCard title="Validators" value={asset.validatorCount.toLocaleString()} accentColor="#3b82f6" />
            )}
            {asset.maxTPS != null && (
              <MetricCard title="Max TPS" value={asset.maxTPS.toLocaleString()} accentColor="#f59e0b" />
            )}
            {asset.marketDominance != null && (
              <MetricCard title="Dominance" value={`${asset.marketDominance.toFixed(2)}%`} accentColor="#8b5cf6" />
            )}
          </div>
        </div>
      )}

    </div>
  )
}

// Per-coin risk scoring was REMOVED ENTIRELY on 2026-08-29 (owner, RP-6).
// What stood here was the Composite Risk panel — score, band, confidence,
// coverage and a weighted pillar breakdown, computed by lib/risk from live
// market data. It was the last per-coin risk surface, and the most defensible
// one; it goes because publishing any risk figure for an asset a reader is
// looking at may read as a recommendation, and that is a regulated activity.
//
// Also deleted with it: /live-data/risk-scores, lib/api/live/riskScores.ts,
// useRiskScoreIndex, RiskScoreBadge, and Asset.riskScore / Asset.riskBand —
// nothing populated those but the composite, so leaving them would have left
// permanently-null fields and three unreachable filters behind.
//
// lib/risk/ ITSELF STAYS. It is a general framework, and its other consumers
// are untouched and were separately decided: the options Trade Risk Scorer
// (/equities/options), staking provider risk (curated, lib/data/
// stakingProviders.ts), and the macro/equity profiles. This removal is about
// publishing a per-coin score, not about the engine that computed it.
//
// TO RESTORE: git history at this commit carries the panel, the route and the
// index join intact — and lib/risk/__tests__/riskScoringRemoved.test.ts
// enumerates every surface that would have to come back.

const SENTIMENT_STYLES = {
  positive: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  neutral:  'bg-text-muted/10 text-text-muted border-border',
  negative: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const PROVIDER_BADGE_STYLES: Record<string, string> = {
  cryptopanic: 'text-orange-400 bg-orange-400/10 border-orange-500/20',
  messari:     'text-purple-400 bg-purple-400/10 border-purple-500/20',
  newsapi:     'text-sky-400 bg-sky-400/10 border-sky-500/20',
}

function NewsTab({ assetId }: { assetId: string }) {
  const [catFilter, setCatFilter] = useState<NewsCategory | 'all'>('all')

  const { data: liveData, isLoading } = useQuery({
    queryKey: ['live-news-asset', assetId],
    queryFn: async (): Promise<{ articles: LiveNewsArticle[]; providers: { id: string; name: string }[] }> => {
      const res = await fetch(`/live-data/news?asset=${assetId}&limit=30`)
      if (!res.ok) return { articles: [], providers: [] }
      return res.json()
    },
    enabled: LIVE_DATA,
    staleTime: 2 * 60 * 1000,
  })

  const liveArticles = (liveData?.articles ?? []).filter(
    (a) => catFilter === 'all' || a.category === catFilter
  )
  const articles = liveArticles
  const noProviders = !isLoading && (liveData?.providers ?? []).length === 0

  if (noProviders) {
    return (
      <LiveUnavailable message="No news sources are configured. Add a news source in Integrations to see live news for this asset." />
    )
  }

  return (
    <div className="space-y-5">
      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {NEWS_CATEGORIES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setCatFilter(value)}
            className={clsx(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              catFilter === value
                ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                : 'bg-bg-elevated border-border text-text-muted hover:text-text-secondary hover:border-border-strong'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-8 justify-center text-text-muted">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading news…</span>
        </div>
      )}

      {!isLoading && articles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="size-12 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
            <Newspaper size={20} className="text-text-muted" aria-hidden />
          </div>
          <p className="text-sm text-text-muted">No news articles found for this asset.</p>
        </div>
      )}

      {!isLoading && articles.length > 0 && (
        <div className="space-y-3">
          {articles.map((article) => {
            const providerLabel = 'providerLabel' in article ? article.providerLabel : null
            const provider = 'provider' in article ? (article as LiveNewsArticle).provider : 'unknown'
            const badgeStyle = PROVIDER_BADGE_STYLES[provider]
            return (
              <article
                key={article.id}
                className="rounded-card border border-border bg-bg-card p-5 hover:border-border-strong transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {article.isBreaking && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
                        <Zap size={9} aria-hidden /> Breaking
                      </span>
                    )}
                    <span className={clsx('px-2 py-0.5 rounded border text-[10px] font-medium capitalize', SENTIMENT_STYLES[article.sentiment])}>
                      {article.sentiment}
                    </span>
                    <span className="px-2 py-0.5 rounded border border-border bg-bg-elevated text-[10px] text-text-muted capitalize">
                      {article.category}
                    </span>
                    {providerLabel && badgeStyle && (
                      <span className={clsx('px-2 py-0.5 rounded border text-[10px] font-medium', badgeStyle)}>
                        via {providerLabel}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-text-muted flex-shrink-0 font-mono">
                    {timeAgoCompact(article.publishedAt)}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-text-primary leading-snug mb-2">{article.headline}</h3>
                <p className="text-xs text-text-muted leading-relaxed line-clamp-3 mb-3">{article.summary}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-text-secondary">{article.source}</span>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-accent-blue hover:text-blue-300 transition-colors"
                  >
                    Read more <ExternalLink size={10} aria-hidden />
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AnalyticsTab({ asset }: { asset: NonNullable<ReturnType<typeof useAsset>['data']> }) {
  const [pegRange, setPegRange] = useState<import('@/types/api').TimeRange>('7d')
  const { analyticsBundle } = asset

  return (
    <div className="space-y-6">
      {/* Full price history — top of analytics */}
      <ErrorBoundary>
        <PriceHistoryChart assetId={asset.id} symbol={asset.symbol} pegTarget={asset.pegTarget} />
      </ErrorBoundary>

      {analyticsBundle === null ? (
        <div className="rounded-card border border-border bg-bg-card p-8 text-center">
          <Activity size={24} className="mx-auto text-text-muted" aria-hidden />
          <p className="mt-3 text-sm font-medium text-text-secondary">On-chain analytics not available</p>
          <p className="mt-1 text-xs text-text-muted max-w-md mx-auto">
            Peg history, liquidity depth, wallet concentration, and transfer velocity are
            derived metrics with no free real-time source, so they are not shown in live mode.
          </p>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {asset.assetType !== 'layer1' && (
          <ErrorBoundary>
            <PegDeviationChart
              data={analyticsBundle.pegHistory}
              assetSymbol={asset.symbol}
              timeRange={pegRange}
              onTimeRangeChange={setPegRange}
            />
          </ErrorBoundary>
        )}

        <ErrorBoundary>
          <LiquidityDepthChart
            data={analyticsBundle.liquidityDepth}
            currentPrice={asset.price ?? undefined}
          />
        </ErrorBoundary>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary>
          <WalletConcentration data={analyticsBundle.walletConcentration} />
        </ErrorBoundary>

        <ErrorBoundary>
          <VelocityChart data={analyticsBundle.transferVelocity} />
        </ErrorBoundary>
      </div>
      </>
      )}
    </div>
  )
}

function LiveReservesView({ liveAsset }: { liveAsset: LiveReserveAsset }) {
  const ratio = liveAsset.collateralizationRatio // null = issuer does not disclose
  const ratioColor = ratio == null ? '#64748b' : ratio >= 1.0 ? '#10b981' : ratio >= 0.95 ? '#f59e0b' : '#ef4444'
  const composition = liveAsset.composition.length > 0
    ? liveAsset.composition
    : [{ category: 'Undisclosed', percentage: 100, amount: liveAsset.circulatingUsd, description: '' }]

  return (
    <div className="space-y-6">
      {/* Same disclosure the Coins tab carries. This surface showed attester,
          attestation date and collateralization — all from a curated snapshot —
          with no age on them at all, which is the pattern audit findings H2, M5
          and L2 were each about: a static snapshot rendered beside live data
          reads as live. */}
      <ReserveProvenance />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Circulating Supply"
          value={formatCompact(liveAsset.circulatingUsd)}
          accentColor="#10b981"
        />
        <MetricCard
          title="Collateralization"
          value={ratio != null ? `${(ratio * 100).toFixed(1)}%` : 'N/D'}
          accentColor={ratioColor}
        />
        <MetricCard
          title="Peg Mechanism"
          // `.replace('_', '-')` replaced only the FIRST underscore, so a
          // hypothetical multi-word key would half-convert. Shared normaliser
          // handles every separator and lower-cases, matching the badge on the
          // Coins tab so one coin never reads two ways in two places.
          value={normalisePegMechanism(liveAsset.pegMechanism)}
          accentColor="#8b5cf6"
        />
        <MetricCard
          title="Chains"
          value={liveAsset.chains.length > 0 ? liveAsset.chains.length.toString() : '—'}
          subtitle={liveAsset.chains.slice(0, 3).join(', ')}
          accentColor="#3b82f6"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary>
          <ReserveComposition
            composition={composition}
            collateralizationRatio={ratio ?? undefined}
            totalReserves={liveAsset.circulatingUsd}
          />
        </ErrorBoundary>

        <div className="rounded-card border border-border bg-bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">Attestation</h3>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-text-muted">Attester</span>
              <span className="text-text-secondary text-right max-w-[200px]">{liveAsset.attester}</span>
            </div>
            {liveAsset.lastAttestedDate && (
              <div className="flex justify-between gap-2">
                <span className="text-text-muted">Last Attested</span>
                <span className="text-text-secondary font-mono">{formatDate(liveAsset.lastAttestedDate, 'MMM dd, yyyy')}</span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-text-muted">Collateralization</span>
              <span className="font-mono" style={{ color: ratioColor }}>
                {ratio != null ? `${(ratio * 100).toFixed(1)}%` : 'Not disclosed'}
              </span>
            </div>
            {liveAsset.chains.length > 0 && (
              <div className="flex justify-between gap-2 items-start">
                <span className="text-text-muted flex-shrink-0">Active Chains</span>
                <span className="text-text-secondary text-right">{liveAsset.chains.slice(0, 6).join(', ')}</span>
              </div>
            )}
          </div>

          {composition.map((item) => (
            <div key={item.category} className="flex flex-col gap-1">
              <div className="flex justify-between text-xs">
                <span className="text-text-secondary">{item.category}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-text-muted">{formatCompact(item.amount)}</span>
                  <span className="font-mono text-text-primary w-12 text-right">{item.percentage.toFixed(1)}%</span>
                </div>
              </div>
              <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent-blue"
                  style={{ width: `${item.percentage}%` }}
                  role="progressbar"
                  aria-valuenow={Math.round(item.percentage)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </div>
          ))}

          {liveAsset.attestationUrl && liveAsset.attestationUrl !== '#' && (
            <a
              href={liveAsset.attestationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-accent-blue hover:text-blue-300 transition-colors pt-1"
            >
              <ExternalLink size={12} aria-hidden />
              View Attestation Report
            </a>
          )}
        </div>
      </div>

      <p className="text-[11px] text-text-muted text-center">
        Circulating supply via DefiLlama Stablecoins API · Composition breakdowns are approximate
      </p>
    </div>
  )
}

function ReservesTab({ asset }: { asset: NonNullable<ReturnType<typeof useAsset>['data']> }) {
  const { latestReserve } = asset

  const { data: liveReserveData, isLoading: liveLoading } = useQuery({
    queryKey: ['live-reserves-asset', asset.symbol],
    queryFn: async (): Promise<{ assets: LiveReserveAsset[] }> => {
      const res = await fetch('/live-data/reserves')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: LIVE_DATA && latestReserve === null && asset.assetType !== 'layer1',
    staleTime: 5 * 60 * 1000,
  })

  const liveAsset = liveReserveData?.assets.find(
    (a) => a.symbol.toUpperCase() === asset.symbol.toUpperCase()
  )

  if (asset.assetType === 'layer1') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="size-14 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
          <Shield size={24} className="text-text-muted" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium text-text-secondary">Reserve Attestation Not Applicable</p>
          <p className="text-xs text-text-muted mt-1 max-w-sm">
            Layer 1 native assets are not backed by external reserves. Supply is governed by protocol consensus rules.
          </p>
        </div>
        {asset.consensusMechanism && (
          <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
            {asset.consensusMechanism}
          </span>
        )}
      </div>
    )
  }

  if (liveLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-text-muted">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading reserve data…</span>
      </div>
    )
  }

  if (LIVE_DATA && latestReserve === null && liveAsset) {
    return <LiveReservesView liveAsset={liveAsset} />
  }

  if (LIVE_DATA && latestReserve === null && !liveAsset) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="size-14 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
          <Shield size={24} className="text-text-muted" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium text-text-secondary">Reserve data not tracked</p>
          <p className="text-xs text-text-muted mt-1 max-w-sm">
            This asset is not in the DefiLlama stablecoins index. Reserve attestations are not available for live monitoring.
          </p>
        </div>
      </div>
    )
  }

  // Fallback for a non-live build. The old code continued past this guard into
  // a full legacy render of latestReserve — permanently dead since LIVE_DATA
  // was hardcoded true (overlay.ts sets latestReserve to null on every asset),
  // and it still carried the "Verified by {attestor}" copy the M5 audit
  // scrubbed from every reachable surface. Deleted rather than kept (review
  // defect D-21): a dead branch with banned copy is a regression waiting for
  // whoever revives it.
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="size-14 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
        <Shield size={24} className="text-text-muted" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-medium text-text-secondary">Reserve data not available</p>
        <p className="text-xs text-text-muted mt-1 max-w-sm">
          Reserve attestations and collateralization ratios are not available in this mode.
        </p>
      </div>
    </div>
  )
}

function AssetDetailPageInner() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const { data: rawAsset, isLoading, isError, refetch } = useAsset(params.id)
  // R2 Phase 2: join the live risk composite so the gauge below reads a real
  // score instead of N/A. Unscored assets stay null. (Same-page live composite
  // panel and this gauge now draw from one source — resolving the old contradiction.)
  const asset = rawAsset

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-screen-2xl mx-auto">
        <LoadingSkeleton className="h-48 rounded-card" />
        <div className="flex gap-4">
          {TABS.map((t) => <LoadingSkeleton key={t.id} className="h-8 w-24 rounded" />)}
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => <LoadingSkeleton key={i} className="h-28 rounded-card" />)}
        </div>
      </div>
    )
  }

  if (isError || !asset) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="text-sm text-text-muted">Coin not found or failed to load</p>
        <div className="flex gap-3">
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded text-xs bg-bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
          >
            Retry
          </button>
          <button
            onClick={() => router.push('/assets')}
            className="px-3 py-1.5 rounded text-xs bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20 transition-colors"
          >
            Back to Coins
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push('/assets')}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
        aria-label="Back to coins list"
      >
        <ChevronLeft size={14} aria-hidden />
        All Coins
      </button>

      {/* Header */}
      <ErrorBoundary>
        <AssetHeader asset={asset} />
      </ErrorBoundary>

      {/* Provenance for the price above. Detail pages carried no SourceLine
          while every registry page did, so the page with the most specific
          numbers was the one with no attribution. */}
      <SourceLine id="markets" />

      {/* Tabs */}
      <div className="flex items-center gap-0.5 border-b border-border" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === id
                ? 'border-accent-blue text-accent-blue'
                : 'border-transparent text-text-muted hover:text-text-secondary hover:border-border-strong'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div role="tabpanel">
        {activeTab === 'overview' && (
          <ErrorBoundary>
            <OverviewTab asset={asset} />
          </ErrorBoundary>
        )}
        {activeTab === 'news' && (
          <ErrorBoundary>
            <NewsTab assetId={asset.id} />
          </ErrorBoundary>
        )}
        {activeTab === 'technical-analysis' && (
          <ErrorBoundary>
            <TechnicalAnalysisTab asset={asset} />
          </ErrorBoundary>
        )}
        {activeTab === 'reserves' && (
          <ErrorBoundary>
            <ReservesTab asset={asset} />
          </ErrorBoundary>
        )}
        {activeTab === 'pump-report' && (
          <ErrorBoundary>
            <PumpReportTab
              targets={[{ type: 'coin', id: asset.id, label: `${asset.name} (${asset.symbol})` }]}
              coinId={asset.id}
              symbol={asset.symbol}
              agentIntro={`I'm your Pump Report AI Agent focused on ${asset.name} (${asset.symbol}). I can search the web for fraud allegations, pump-and-dump activity, wash trading, and collapse risk. What would you like to investigate?`}
            />
          </ErrorBoundary>
        )}
      </div>
    </div>
  )
}

// Entitlement gate. Wrapping here rather than inside AssetDetailPageInner's JSX is
// deliberate: a disabled module must not mount the component at all, so its
// queries and stores never run for a user who cannot see the results.
export default function AssetDetailPage() {
  return (
    <ModuleGate module="crypto">
      <AssetDetailPageInner />
    </ModuleGate>
  )
}
