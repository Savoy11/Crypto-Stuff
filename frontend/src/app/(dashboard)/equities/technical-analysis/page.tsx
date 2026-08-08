'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useQuery, useQueries } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Activity,
  CandlestickChart as CandlestickIcon, AreaChart as AreaIcon, BarChart2,
  LineChart as LineIcon, Layers, GitBranch,
  Loader2, Search,
} from 'lucide-react'
import { clsx } from 'clsx'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { LiveUnavailable } from '@/components/ui/LiveUnavailable'
import type { ChartType, DrawingTool, Drawing } from '@/components/charts/CandlestickChart'
import { ALL_INDICATORS } from '@/components/charts/indicatorRegistry'
import { IndicatorPicker } from '@/components/charts/IndicatorPicker'
import { DrawingToolbar } from '@/components/charts/DrawingToolbar'
import type { LucideIcon } from 'lucide-react'
import {
  rsi, sma, computeSignalSummary, detectPatterns,
  type Signal, type DetectedPattern,
} from '@/lib/utils/indicators'
import { EQUITY_CATALOG, SECTOR_INFO } from '@/lib/data/equityCatalog'
import { FUND_CATALOG } from '@/lib/data/fundCatalog'
import type { SecurityOhlcvResponse } from '@/app/live-data/security-ohlcv/route'
import type { StockUniverseResponse } from '@/app/live-data/stock-universe/route'

const CandlestickChart = dynamic(() => import('@/components/charts/CandlestickChart'), { ssr: false })

// ─── Symbol search ───────────────────────────────────────────────────────────
// Combobox over the Stock Registry universe (all active common stocks when an
// FMP key is configured, curated catalog otherwise) plus the ETF catalog —
// with free-text passthrough, because the OHLCV chain (Tiingo → FMP) charts
// far more than the suggestion list: any US-listed stock, ETF, ADR, mutual
// fund (daily NAV), or international listing with an exchange suffix
// (7203.T, BMW.DE). An unknown ticker simply tries; no data shows the
// honest "no OHLCV source" notice rather than being blocked up front.

interface SymbolOption {
  symbol: string
  name: string
  kind: 'stock' | 'etf' | 'mutual'
}

function SymbolSearch({ symbol, onSelect }: { symbol: string; onSelect: (s: string) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const { data: universe } = useQuery<StockUniverseResponse>({
    queryKey: ['stock-universe'],
    queryFn: () => fetch('/live-data/stock-universe').then((r) => r.json()),
    staleTime: 1000 * 60 * 60, // server caches daily; don't refetch while typing
    enabled: open,
  })

  const options = useMemo<SymbolOption[]>(() => {
    const stocks: SymbolOption[] = (universe?.entries ?? EQUITY_CATALOG.map((e) => ({ symbol: e.symbol, name: e.name })))
      .map((e) => ({ symbol: e.symbol, name: e.name, kind: 'stock' as const }))
    const funds: SymbolOption[] = FUND_CATALOG.map((f) => ({
      symbol: f.symbol, name: f.name, kind: f.type === 'etf' ? 'etf' as const : 'mutual' as const,
    }))
    return [...stocks, ...funds]
  }, [universe])

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return []
    // Symbol prefix matches first (what traders type), then name substring.
    const bySymbol = options.filter((o) => o.symbol.toUpperCase().startsWith(q))
    const byName = options.filter((o) =>
      !o.symbol.toUpperCase().startsWith(q) && o.name.toUpperCase().includes(q))
    return [...bySymbol, ...byName].slice(0, 12)
  }, [options, query])

  const pick = (s: string) => {
    onSelect(s.toUpperCase())
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 bg-bg-secondary border border-border rounded px-2 py-1.5 focus-within:border-accent-blue/60">
        <Search size={13} className="text-text-muted flex-shrink-0" aria-hidden />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, matches.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
            else if (e.key === 'Enter' && query.trim()) {
              e.preventDefault()
              pick(matches[highlight]?.symbol ?? query.trim())
            } else if (e.key === 'Escape') setOpen(false)
          }}
          placeholder={symbol}
          aria-label="Search any ticker"
          className="w-40 bg-transparent text-sm text-text-primary font-mono placeholder:text-text-primary focus:outline-none"
        />
      </div>
      {open && query.trim() && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-80 bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {matches.map((m, i) => (
            <button
              key={`${m.kind}:${m.symbol}`}
              onMouseDown={(e) => { e.preventDefault(); pick(m.symbol) }}
              onMouseEnter={() => setHighlight(i)}
              className={clsx('w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                i === highlight ? 'bg-accent-blue/10' : 'hover:bg-bg-elevated')}
            >
              <span className="font-mono font-semibold text-text-primary w-16 flex-shrink-0">{m.symbol}</span>
              <span className="text-xs text-text-muted flex-1 truncate">{m.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-text-muted">{m.kind}</span>
            </button>
          ))}
          <button
            onMouseDown={(e) => { e.preventDefault(); pick(query.trim()) }}
            className={clsx('w-full px-3 py-2 text-left text-xs border-t border-border/60 transition-colors',
              matches.length === 0 || highlight >= matches.length ? 'bg-accent-blue/10' : 'hover:bg-bg-elevated')}
          >
            <span className="text-text-secondary">Chart </span>
            <span className="font-mono font-semibold text-text-primary">{query.trim().toUpperCase()}</span>
            <span className="text-text-muted"> directly — anything the configured provider covers works (ADRs, international suffixes like 7203.T)</span>
          </button>
        </div>
      )}
    </div>
  )
}

// Equities counterpart of the crypto Technical Analysis page. Reuses the
// shared CandlestickChart, indicator registry, signal engine, and pattern
// detector — fed by /live-data/security-ohlcv instead of the crypto route.

// Daily bars only, starting at 1M. The crypto surface offers 1H/4H on purpose
// and this one does not: equities trade a ~6.5h session, so an intraday series
// is dominated by open/close effects and overnight gaps rather than trend. Not
// an oversight — see the note on the crypto page's RANGES.
const RANGES = ['1M', '3M', '6M', '1Y', '5Y', 'MAX'] as const
type Range = typeof RANGES[number]

const CHART_TYPES: { type: ChartType; label: string; Icon: LucideIcon }[] = [
  { type: 'candlestick', label: 'Candlestick', Icon: CandlestickIcon },
  { type: 'hollow',      label: 'Hollow',      Icon: CandlestickIcon },
  { type: 'heikin-ashi', label: 'Heikin Ashi', Icon: Activity },
  { type: 'bars',        label: 'OHLC Bars',   Icon: BarChart2 },
  { type: 'line',        label: 'Line',        Icon: LineIcon },
  { type: 'step-line',   label: 'Step Line',   Icon: GitBranch },
  { type: 'area',        label: 'Area',        Icon: AreaIcon },
  { type: 'baseline',    label: 'Baseline',    Icon: Layers },
]

// Indicators and drawing tools come from the shared TA engine, not a private
// list. This page used to declare 18 of the 62 the engine can render and 5 of
// the 6 drawing tools — not by decision, but because three pages each kept
// their own copy and only crypto's was ever extended.
//
// Stocks and ETFs carry real volume, so the full set applies here.
const SIGNAL_STYLES: Record<Signal, { label: string; color: string; Icon: LucideIcon }> = {
  strong_buy:  { label: 'Strong Buy',  color: 'text-emerald-400', Icon: TrendingUp },
  buy:         { label: 'Buy',         color: 'text-emerald-400', Icon: TrendingUp },
  neutral:     { label: 'Neutral',     color: 'text-slate-400',   Icon: Minus },
  sell:        { label: 'Sell',        color: 'text-red-400',     Icon: TrendingDown },
  strong_sell: { label: 'Strong Sell', color: 'text-red-400',     Icon: TrendingDown },
}

// Bounded list for the screener — one OHLCV fetch per symbol.
const SCREENER_SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO',
  'BRK-B', 'JPM', 'V', 'LLY', 'UNH', 'XOM', 'WMT', 'HD',
  'COST', 'PG', 'NFLX', 'AMD', 'CAT', 'GE', 'BA', 'PLTR',
]

function useOhlcv(symbol: string, range: Range, enabled = true) {
  return useQuery<SecurityOhlcvResponse>({
    queryKey: ['security-ohlcv', symbol, range],
    queryFn: () => fetch(`/live-data/security-ohlcv?symbol=${encodeURIComponent(symbol)}&range=${range}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

// ─── Chart tab ────────────────────────────────────────────────────────────────

function ChartTab() {
  const [symbol, setSymbol] = useState('AAPL')
  const [range, setRange] = useState<Range>('1Y')
  const [chartType, setChartType] = useState<ChartType>('candlestick')
  const [active, setActive] = useState<Set<string>>(new Set(['ema20', 'ema50', 'rsi', 'macd']))
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('none')
  const [drawings, setDrawings] = useState<Drawing[]>([])

  const { data, isLoading, isFetching, refetch } = useOhlcv(symbol, range)
  const candles = useMemo(() => data?.candles ?? [], [data])

  const summary = useMemo(() => candles.length >= 30 ? computeSignalSummary(candles) : null, [candles])
  const patterns: DetectedPattern[] = useMemo(() => candles.length >= 30 ? detectPatterns(candles) : [], [candles])

  const entry = EQUITY_CATALOG.find((e) => e.symbol === symbol)

  const toggleIndicator = (key: string) => {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        <SymbolSearch symbol={symbol} onSelect={(s) => { setSymbol(s); setDrawings([]) }} />
        {entry && <span className="text-xs text-text-muted hidden md:inline">{entry.name}</span>}

        <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={clsx('px-2 py-1 rounded text-[11px] font-mono font-medium transition-colors',
                range === r ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
            >
              {r}
            </button>
          ))}
        </div>

        <select
          value={chartType}
          onChange={(e) => setChartType(e.target.value as ChartType)}
          className="bg-bg-secondary border border-border rounded px-2 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-accent-blue/60"
        >
          {CHART_TYPES.map(({ type, label }) => (
            <option key={type} value={type}>{label}</option>
          ))}
        </select>

        <button
          onClick={() => refetch()}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-border bg-bg-elevated text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : undefined} aria-hidden /> Refresh
        </button>
      </div>

      {/* Indicators */}
      <IndicatorPicker
        indicators={ALL_INDICATORS}
        active={active}
        onToggle={toggleIndicator}
        onClearAll={() => setActive(new Set())}
      />

      {/* Drawing toolbar — its own row directly above the chart, matching the
          crypto and macro surfaces. It used to sit up in the controls row beside
          the symbol picker, so the same control lived in two different places
          depending on which asset class you were looking at. */}
      <DrawingToolbar
        active={drawingTool}
        onChange={setDrawingTool}
        drawings={drawings}
        onClear={() => setDrawings([])}
      />

      {/* Chart + sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3 rounded-card border border-border bg-bg-card p-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-[520px] gap-2 text-slate-500">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading {symbol} history…</span>
            </div>
          ) : candles.length > 0 ? (
            // Explicit height, same as the crypto TA page: CandlestickChart's
            // root is h-full, so without this the chart only got height when
            // the xl grid row happened to be stretched by the sidebar column —
            // and collapsed to nothing in single-column layouts.
            <div className="h-[520px]">
              <CandlestickChart
                candles={candles}
                activeIndicators={active}
                chartType={chartType}
                drawingTool={drawingTool}
                drawings={drawings}
                onDrawingComplete={(d: Drawing) => { setDrawings((prev) => [...prev, d]); setDrawingTool('none') }}
                patterns={patterns}
              />
            </div>
          ) : (
            <LiveUnavailable
              className="my-12"
              message="No OHLCV source is reachable. Candles now need an API key — the keyless source was withdrawn on terms grounds. Add a Tiingo or FMP key on the Integrations page."
            />
          )}
        </div>

        {/* Sidebar: signal summary + patterns */}
        <div className="space-y-4">
          <div className="rounded-card border border-border bg-bg-card p-4">
            <h2 className="text-sm font-medium text-text-secondary mb-3">Signal Summary</h2>
            {summary ? (
              <>
                {(() => {
                  const cfg = SIGNAL_STYLES[summary.overall]
                  return (
                    <div className="flex items-center gap-2 mb-3">
                      <cfg.Icon size={18} className={cfg.color} aria-hidden />
                      <span className={clsx('text-lg font-semibold', cfg.color)}>{cfg.label}</span>
                    </div>
                  )
                })()}
                <div className="flex gap-2 text-center text-xs mb-3">
                  <div className="flex-1 rounded bg-emerald-500/10 border border-emerald-500/20 py-1.5">
                    <div className="font-mono font-bold text-emerald-400">{summary.buy}</div>
                    <div className="text-text-muted text-[10px]">Buy</div>
                  </div>
                  <div className="flex-1 rounded bg-slate-500/10 border border-slate-500/20 py-1.5">
                    <div className="font-mono font-bold text-slate-300">{summary.neutral}</div>
                    <div className="text-text-muted text-[10px]">Neutral</div>
                  </div>
                  <div className="flex-1 rounded bg-red-500/10 border border-red-500/20 py-1.5">
                    <div className="font-mono font-bold text-red-400">{summary.sell}</div>
                    <div className="text-text-muted text-[10px]">Sell</div>
                  </div>
                </div>
                <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {summary.signals.map((sig) => {
                    const cfg = SIGNAL_STYLES[sig.signal]
                    return (
                      <li key={sig.name} className="flex items-center justify-between text-xs">
                        <span className="text-text-muted">{sig.name}</span>
                        <span className={clsx('font-medium', cfg.color)}>{cfg.label}</span>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <p className="text-xs text-text-muted">Needs at least 30 candles of history.</p>
            )}
          </div>

          <div className="rounded-card border border-border bg-bg-card p-4">
            <h2 className="text-sm font-medium text-text-secondary mb-3">Detected Patterns</h2>
            {patterns.length > 0 ? (
              <ul className="space-y-2">
                {patterns.slice(0, 5).map((p, i) => (
                  <li key={`${p.name}-${i}`} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className={clsx('font-medium',
                        p.type === 'bullish' ? 'text-emerald-400' : p.type === 'bearish' ? 'text-red-400' : 'text-slate-300')}>
                        {p.name}
                      </span>
                      <span className="font-mono text-text-muted">{Math.round(p.confidence * 100)}%</span>
                    </div>
                    <p className="text-text-muted leading-snug mt-0.5">{p.description}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-text-muted">No chart patterns detected in this range.</p>
            )}
          </div>

          {entry && (
            <Link
              href={`/equities/${symbol.toLowerCase()}`}
              className="block rounded-card border border-border bg-bg-card p-4 hover:border-accent-blue/40 transition-colors"
            >
              <p className="text-xs text-text-muted">Company profile</p>
              <p className="text-sm font-medium text-text-primary mt-0.5">{entry.name} →</p>
              <p className="text-[11px] text-text-muted mt-1">{SECTOR_INFO[entry.sector].label} · {entry.industry}</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Screener tab ─────────────────────────────────────────────────────────────

interface ScreenerRow {
  symbol: string
  name: string
  price: number
  rsi14: number | null
  vsSma50Pct: number | null
  overall: Signal | null
}

function ScreenerTab() {
  const queries = useQueries({
    queries: SCREENER_SYMBOLS.map((symbol) => ({
      queryKey: ['security-ohlcv', symbol, '6M'],
      queryFn: () => fetch(`/live-data/security-ohlcv?symbol=${encodeURIComponent(symbol)}&range=6M`).then((r) => r.json() as Promise<SecurityOhlcvResponse>),
      staleTime: 10 * 60 * 1000,
    })),
  })

  const loading = queries.some((q) => q.isLoading)

  const rows: ScreenerRow[] = useMemo(() => {
    return SCREENER_SYMBOLS.map((symbol, i) => {
      const entry = EQUITY_CATALOG.find((e) => e.symbol === symbol)
      const candles = queries[i].data?.candles ?? []
      if (candles.length < 30) {
        return { symbol, name: entry?.name ?? symbol, price: entry?.referencePrice ?? 0, rsi14: null, vsSma50Pct: null, overall: null }
      }
      const closes = candles.map((c) => c.close)
      const last = closes[closes.length - 1]
      const rsiVals = rsi(closes, 14)
      const smaVals = sma(closes, 50)
      const sma50 = smaVals[smaVals.length - 1]
      return {
        symbol,
        name: entry?.name ?? symbol,
        price: last,
        rsi14: rsiVals[rsiVals.length - 1],
        vsSma50Pct: sma50 ? ((last - sma50) / sma50) * 100 : null,
        overall: computeSignalSummary(candles).overall,
      }
    }).sort((a, b) => (b.rsi14 ?? -1) - (a.rsi14 ?? -1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.dataUpdatedAt).join(',')])

  const rsiColor = (value: number | null) =>
    value == null ? 'text-text-muted'
      : value >= 70 ? 'text-red-400'
      : value <= 30 ? 'text-emerald-400'
      : 'text-text-secondary'

  return (
    <div className="rounded-card border border-border bg-bg-card overflow-hidden">
      <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border bg-bg-elevated/40 text-xs font-medium uppercase tracking-wider text-text-muted">
        <span className="col-span-4">Company</span>
        <span className="col-span-2 text-right">Price</span>
        <span className="col-span-2 text-right">RSI (14)</span>
        <span className="col-span-2 text-right">vs SMA 50</span>
        <span className="col-span-2 text-right">Signal</span>
      </div>
      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-slate-500">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Screening {SCREENER_SYMBOLS.length} symbols…</span>
        </div>
      )}
      <div className="divide-y divide-border/60">
        {!loading && rows.map((row) => {
          const cfg = row.overall ? SIGNAL_STYLES[row.overall] : null
          return (
            <Link
              key={row.symbol}
              href={`/equities/${row.symbol.toLowerCase()}`}
              className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center hover:bg-bg-elevated/40 transition-colors"
            >
              <div className="col-span-4 min-w-0">
                <span className="font-mono font-semibold text-text-primary">{row.symbol}</span>
                <span className="ml-2 text-xs text-text-muted truncate">{row.name}</span>
              </div>
              <span className="col-span-2 text-right font-mono tabular-nums text-text-primary">
                {row.price ? `$${row.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
              </span>
              <span className={clsx('col-span-2 text-right font-mono tabular-nums', rsiColor(row.rsi14))}>
                {row.rsi14?.toFixed(1) ?? '—'}
              </span>
              <span className={clsx('col-span-2 text-right font-mono tabular-nums text-xs',
                row.vsSma50Pct == null ? 'text-text-muted' : row.vsSma50Pct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {row.vsSma50Pct == null ? '—' : `${row.vsSma50Pct >= 0 ? '+' : ''}${row.vsSma50Pct.toFixed(1)}%`}
              </span>
              <span className={clsx('col-span-2 text-right text-xs font-medium', cfg?.color ?? 'text-text-muted')}>
                {cfg?.label ?? 'No data'}
              </span>
            </Link>
          )
        })}
      </div>
      <p className="px-4 py-2.5 text-[11px] text-text-muted border-t border-border/60">
        RSI ≤ 30 (green) = oversold · RSI ≥ 70 (red) = overbought · Signal aggregates RSI, MACD, moving averages, and stochastic — not investment advice.
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function EquityTaContent() {
  const [tab, setTab] = useState<'chart' | 'screener'>('chart')

  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto">
      <PageHeader
        title="Equity Technical Analysis"
        subtitle="Candlestick charting, 18 indicators, pattern detection, and a momentum screener"
        description="The same TA engine as the crypto module — indicator registry, signal aggregation, and pattern detection — running on daily/weekly stock candles from Tiingo (FMP fallback). Both need an API key."
        details={[
          { label: 'Signals', text: 'The summary aggregates RSI, MACD, moving-average posture, and stochastic into buy/neutral/sell counts. Informational only.' },
          { label: 'Drawings', text: 'Trendlines, horizontal rays, rectangles, and Fibonacci retracements — click two points on the chart.' },
        ]}
      />

      {/* Data provenance */}
      <SourceLine id="security-ohlcv" />

      <div className="flex gap-1 border-b border-slate-800">
        {([['chart', 'Chart'], ['screener', 'Screener']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === id ? 'border-accent-blue text-accent-blue' : 'border-transparent text-text-muted hover:text-text-secondary')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'chart' ? <ChartTab /> : <ScreenerTab />}
    </div>
  )
}

export default function EquityTechnicalAnalysisPage() {
  return (
    <ModuleGate module="equities">
      <EquityTaContent />
    </ModuleGate>
  )
}
