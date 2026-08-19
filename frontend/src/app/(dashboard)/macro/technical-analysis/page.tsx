'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useQuery, useQueries } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Activity,
  CandlestickChart as CandlestickIcon, AreaChart as AreaIcon, BarChart2,
  LineChart as LineIcon, Layers, Loader2,
} from 'lucide-react'
import { clsx } from 'clsx'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { LiveUnavailable } from '@/components/ui/LiveUnavailable'
import type { ChartType, DrawingTool, Drawing } from '@/components/charts/CandlestickChart'
import { indicatorsFor, VOLUME_INDICATORS } from '@/components/charts/indicatorRegistry'
import { IndicatorPicker } from '@/components/charts/IndicatorPicker'
import { DrawingToolbar } from '@/components/charts/DrawingToolbar'
import type { LucideIcon } from 'lucide-react'
import {
  rsi, sma, computeSignalSummary, detectPatterns,
  type Signal, type DetectedPattern,
} from '@/lib/utils/indicators'
import {
  MACRO_INSTRUMENTS, BY_SYMBOL, GROUPS, fmtLevel,
  type MacroGroup, type MacroInstrument,
} from '../macroInstruments'
import type { SecurityOhlcvResponse } from '@/app/live-data/security-ohlcv/route'

// Macro technical analysis (W4-B2) — the third-module TA gap.
//
// Crypto and Equities each have a TA page on the shared candlestick/indicator
// engine; Macro had none, despite all 45 of its instruments already charting
// through /live-data/security-ohlcv. ROADMAP item 2 under "What must be built"
// specified a "shared TA page parameterized over macro symbols"; the 2026-07-21
// SHIPPED note claimed everything in that list was done, which was not true of
// this one. That note is corrected in the same change as this page.
//
// No new data route: macro symbols go through exactly the
// same OHLCV path the equities TA page uses.

const CandlestickChart = dynamic(() => import('@/components/charts/CandlestickChart'), { ssr: false })

// ─── Controls ─────────────────────────────────────────────────────────────────

// No intraday, for the same reason as equities. Also no MAX: these are
// continuous front-month futures and provider FX series, so the far end of a
// "max" window is stitched across rolled contracts and reads as one price
// history when it is not. 5Y is the longest window the stitching stays honest
// over. (The comment used to say "Yahoo FX series" — Yahoo was removed
// 2026-08-06; the stitching problem is provider-independent.)
// No 2Y: security-ohlcv's vocabulary is 1M/3M/6M/1Y/5Y/MAX, and this page used
// to offer a 2Y button whose request the route 400'd on every instrument — with
// the failure rendered as a provider-coverage notice, misdirecting the user
// from what was a client/server range mismatch (review defect D-2). If a 2Y
// view is ever wanted, add the range to the route first.
type Range = '3M' | '6M' | '1Y' | '5Y'
const RANGES: Range[] = ['3M', '6M', '1Y', '5Y']

const CHART_TYPES: Array<{ type: ChartType; label: string; Icon: LucideIcon }> = [
  { type: 'candlestick', label: 'Candlestick', Icon: CandlestickIcon },
  { type: 'bars',        label: 'OHLC Bars',   Icon: BarChart2 },
  { type: 'heikin-ashi', label: 'Heikin Ashi', Icon: CandlestickIcon },
  { type: 'line',        label: 'Line',        Icon: LineIcon },
  { type: 'area',        label: 'Area',        Icon: AreaIcon },
  { type: 'baseline',    label: 'Baseline',    Icon: Layers },
]

// Indicators come from the shared TA engine. Macro instruments price through the
// same OHLCV path as equities, but FX pairs and yield indices carry no meaningful
// volume, so the 11 volume-derived indicators are withheld rather than shown
// drawing a flat or nonsense series. The picker names them, so the omission is
// visible instead of just looking like a shorter menu.
const MACRO_INDICATORS = indicatorsFor(false)

const VOLUME_EXCLUDED_NOTE =
  `Not offered here: ${VOLUME_INDICATORS.map((i) => i.label).join(', ')}. ` +
  `These read candle volume, which FX pairs and yield indices do not carry.`

const SIGNAL_STYLES: Record<Signal, { label: string; color: string; Icon: LucideIcon }> = {
  strong_buy:  { label: 'Strong Buy',  color: 'text-emerald-400', Icon: TrendingUp },
  buy:         { label: 'Buy',         color: 'text-emerald-400', Icon: TrendingUp },
  neutral:     { label: 'Neutral',     color: 'text-slate-400',   Icon: Minus },
  sell:        { label: 'Sell',        color: 'text-red-400',     Icon: TrendingDown },
  strong_sell: { label: 'Strong Sell', color: 'text-red-400',     Icon: TrendingDown },
}

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
  const [symbol, setSymbol] = useState('GC=F')
  const [range, setRange] = useState<Range>('1Y')
  const [chartType, setChartType] = useState<ChartType>('candlestick')
  const [active, setActive] = useState<Set<string>>(new Set(['ema50', 'ema200', 'rsi', 'macd']))
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('none')
  const [drawings, setDrawings] = useState<Drawing[]>([])

  const { data, isLoading, isFetching, refetch } = useOhlcv(symbol, range)
  const candles = useMemo(() => data?.candles ?? [], [data])

  const summary = useMemo(() => (candles.length >= 30 ? computeSignalSummary(candles) : null), [candles])
  const patterns: DetectedPattern[] = useMemo(
    () => (candles.length >= 30 ? detectPatterns(candles) : []),
    [candles],
  )

  const entry = BY_SYMBOL.get(symbol)
  const last = candles.length > 0 ? candles[candles.length - 1].close : null

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
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* A grouped select, not a combobox: 45 fixed instruments across three
            named areas is a list to browse, not a universe to search. */}
        <select
          value={symbol}
          // Drawings are anchored to price levels, so they are meaningless once
          // the instrument changes — gold's trendline on a EUR/USD chart.
          onChange={(e) => { setSymbol(e.target.value); setDrawings([]) }}
          className="bg-bg-secondary border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-blue/60 min-w-[220px]"
          aria-label="Macro instrument"
        >
          {GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {MACRO_INSTRUMENTS.filter((m) => m.group === group).map((m) => (
                <option key={m.symbol} value={m.symbol}>
                  {m.name}{m.liquid ? '' : ' (thin)'}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {last != null && (
          <span className="font-mono tabular-nums text-sm text-text-primary">{fmtLevel(entry, last)}</span>
        )}

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
          aria-label="Chart type"
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
        indicators={MACRO_INDICATORS}
        active={active}
        onToggle={toggleIndicator}
        onClearAll={() => setActive(new Set())}
        footnote={VOLUME_EXCLUDED_NOTE}
      />

      {/* Drawing toolbar. This page shipped without one even though it renders
          the same CandlestickChart as the other two surfaces, so trendlines and
          Fibonacci were available on a stock but not on gold. */}
      <DrawingToolbar
        active={drawingTool}
        onChange={setDrawingTool}
        drawings={drawings}
        onClear={() => setDrawings([])}
      />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3 rounded-card border border-border bg-bg-card p-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-[520px] gap-2 text-slate-500">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading {entry?.name ?? symbol} history…</span>
            </div>
          ) : candles.length > 0 ? (
            // Explicit height, same as the crypto and equity TA pages:
            // CandlestickChart's root is h-full and collapses without it.
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
              message={`No OHLCV history came back for ${symbol}. Macro contracts chart through the same keyed provider ladder as equities, and coverage of futures, FX pairs and yield indices is narrower than it was before the keyless source was withdrawn on terms grounds — many macro symbols are simply not carried. Front-month futures and thin FX crosses can also gap over holidays.`}
            />
          )}
        </div>

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
              <p className="text-xs text-text-muted">Needs at least 30 sessions of history.</p>
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
              href={entry.detailPath}
              className="block rounded-card border border-border bg-bg-card p-4 hover:border-accent-blue/40 transition-colors"
            >
              <p className="text-xs text-text-muted">{entry.group}</p>
              <p className="text-sm font-medium text-text-primary mt-0.5">{entry.name} →</p>
              <p className="text-[11px] text-text-muted mt-1 font-mono">{entry.symbol}</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MacroTechnicalAnalysisPage() {
  return (
    <ModuleGate module="macro">
      <MacroTechnicalAnalysisInner />
    </ModuleGate>
  )
}

function MacroTechnicalAnalysisInner() {
  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-accent-blue" aria-hidden />
        <PageHeader
          title="Macro Technical Analysis"
          subtitle="Commodities, currencies and rates on the same indicator engine as crypto and equities"
        />
      </div>

      {/* `macro-quotes`, not `security-ohlcv`: the registry entry that covers
          futures/FX/yields through the shared quote+chart routes is the macro
          one, and it names the catalogs this page reads. */}
      <SourceLine id="macro-quotes" />

      <ChartTab />

      <p className="text-[11px] text-text-muted leading-relaxed">
        Levels use each market’s own quoting convention — grains in cents per bushel, yields in
        percent, bond futures in points of par, FX at its pair’s precision. A macro instrument
        rendered as a dollar price is an error, not a rounding choice: corn at 482.25¢/bu shown as
        “$482” overstates it roughly a hundredfold.
      </p>
    </div>
  )
}
