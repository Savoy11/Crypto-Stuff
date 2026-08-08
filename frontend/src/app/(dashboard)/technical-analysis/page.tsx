'use client'

import { ModuleGate } from '@/components/layout/ModuleGate'
import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown,
  Activity, Filter,
  CandlestickChart as CandlestickIcon, AreaChart, BarChart2,
  LineChart, GitBranch, Layers,
  PenLine, Trash2,
  Compass, Gauge, Waves, Target, ShieldAlert,
  CircleDollarSign, Scale, FlaskConical, MinusCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { ChartType, DrawingTool, Drawing } from '@/components/charts/CandlestickChart'
import { ALL_INDICATORS, type IndicatorKey } from '@/components/charts/indicatorRegistry'
import { IndicatorPicker } from '@/components/charts/IndicatorPicker'
import { DrawingToolbar } from '@/components/charts/DrawingToolbar'
import type { LucideIcon } from 'lucide-react'
import { runBacktest, STRATEGIES, type StrategyCategory } from '@/lib/utils/backtest'
import {
  rsi, macd, bollingerBands, ema, sma, stochasticRsi, atr, obv, vwap,
  ichimoku, fibRetracement, computeSignalSummary, detectPatterns,
  buildTechnicalRead, detectSupportResistance, patternProjection,
  type OhlcvCandle, type Signal, type SignalSummary, type DetectedPattern,
} from '@/lib/utils/indicators'
import { DataBadge } from '@/components/ui/DataBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { useThesisStore, computeRiskReward } from '@/store/useThesisStore'
import { COINGECKO_IDS } from '@/lib/api/live/coingeckoIds'
import type { CoinListResponse } from '@/lib/types/coinList'

const CandlestickChart = dynamic(() => import('@/components/charts/CandlestickChart'), { ssr: false })

// ─── Constants ────────────────────────────────────────────────────────────────

// All OHLCV-supported coin IDs (keyed by internal id, e.g. "btc", "eth")
const SUPPORTED_IDS = Object.keys(COINGECKO_IDS)

const RANGES = ['1H', '4H', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', '10Y', 'MAX'] as const
type Range = typeof RANGES[number]

const CHART_TYPES: { type: ChartType; label: string; desc: string; Icon: LucideIcon }[] = [
  { type: 'candlestick', label: 'Candlestick',  desc: 'Standard OHLC candles',                 Icon: CandlestickIcon },
  { type: 'hollow',      label: 'Hollow',        desc: 'Up candles outlined, down candles filled', Icon: CandlestickIcon },
  { type: 'heikin-ashi', label: 'Heikin Ashi',  desc: 'Smoothed candles that filter noise',    Icon: Activity },
  { type: 'bars',        label: 'OHLC Bars',    desc: 'Traditional open/high/low/close bars',  Icon: BarChart2 },
  { type: 'line',        label: 'Line',          desc: 'Simple close-price line',               Icon: LineChart },
  { type: 'step-line',   label: 'Step Line',     desc: 'Stepped close-price line',              Icon: GitBranch },
  { type: 'area',        label: 'Area',          desc: 'Filled area under close price',         Icon: AreaChart },
  { type: 'baseline',    label: 'Baseline',      desc: 'Green/red vs. first period close',      Icon: Layers },
]

// Indicators now live in the shared TA engine so /equities and /macro get the
// same set and the same explanations. This page was the only one that had all
// 62; the others had 18 and 16 purely because the list was declared three times.
const INDICATORS = ALL_INDICATORS

// ─── Signal UI helpers ─────────────────────────────────────────────────────────

const SIGNAL_META: Record<Signal, { label: string; color: string; icon: React.ReactNode }> = {
  strong_buy:  { label: 'Strong Buy',  color: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/30', icon: <TrendingUp size={13} /> },
  buy:         { label: 'Buy',         color: 'text-green-400 bg-green-400/10 border-green-500/30',       icon: <TrendingUp size={13} /> },
  neutral:     { label: 'Neutral',     color: 'text-slate-400 bg-slate-400/10 border-slate-500/30',       icon: <Minus size={13} /> },
  sell:        { label: 'Sell',        color: 'text-orange-400 bg-orange-400/10 border-orange-500/30',    icon: <TrendingDown size={13} /> },
  strong_sell: { label: 'Strong Sell', color: 'text-red-400 bg-red-400/10 border-red-500/30',             icon: <TrendingDown size={13} /> },
}

function SignalBadge({ signal }: { signal: Signal }) {
  const meta = SIGNAL_META[signal]
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold', meta.color)}>
      {meta.icon}{meta.label}
    </span>
  )
}

// ─── Technical Read panel (plain-English summary) ───────────────────────────────

function TechnicalReadPanel({ candles, summary }: { candles: OhlcvCandle[]; summary: SignalSummary }) {
  const read = useMemo(() => buildTechnicalRead(candles, summary), [candles, summary])

  const trendColor = read.trendBias.state === 'bullish' ? 'text-emerald-400'
    : read.trendBias.state === 'bearish' ? 'text-red-400' : 'text-slate-400'
  const momColor = read.momentum.state === 'overbought' ? 'text-red-400'
    : read.momentum.state === 'oversold' ? 'text-emerald-400'
    : read.momentum.state === 'strengthening' ? 'text-emerald-400'
    : read.momentum.state === 'weakening' ? 'text-amber-400' : 'text-slate-400'
  const volColor = read.volatility.state === 'expanding' ? 'text-amber-400'
    : read.volatility.state === 'contracting' ? 'text-blue-400' : 'text-slate-400'

  const rows: { icon: React.ReactNode; label: string; state: string; color: string; detail: string }[] = [
    { icon: <Compass size={13} />,    label: 'Trend bias',  state: read.trendBias.state,  color: trendColor, detail: read.trendBias.detail },
    { icon: <Gauge size={13} />,      label: 'Momentum',    state: read.momentum.state,   color: momColor,   detail: read.momentum.detail },
    { icon: <Waves size={13} />,      label: 'Volatility',  state: read.volatility.state, color: volColor,   detail: read.volatility.detail },
    { icon: <Target size={13} />,     label: 'Key level',   state: '',                    color: 'text-slate-400', detail: read.srProximity.detail },
  ]

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Technical Read</span>
        <div className="flex items-center gap-1.5" title="Agreement-weighted conviction across the indicator stack">
          <span className="text-[10px] text-text-muted">Confidence</span>
          <span className={clsx('text-xs font-bold font-mono', read.confidence >= 60 ? 'text-emerald-400' : read.confidence >= 30 ? 'text-amber-400' : 'text-slate-400')}>
            {read.confidence}%
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-2.5">
            <span className={clsx('mt-0.5 shrink-0', r.color)}>{r.icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-text-primary">{r.label}</span>
                {r.state && <span className={clsx('text-[10px] font-semibold uppercase tracking-wide', r.color)}>{r.state}</span>}
              </div>
              <p className="text-[11px] text-text-muted leading-snug">{r.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-text-muted/70 border-t border-border pt-2 leading-snug">{read.sourceExplanation}</p>
    </div>
  )
}

// ─── Auto Support / Resistance panel ────────────────────────────────────────────

function SupportResistancePanel({ candles }: { candles: OhlcvCandle[] }) {
  const levels = useMemo(() => detectSupportResistance(candles), [candles])
  if (levels.length === 0) return null
  const last = candles[candles.length - 1].close

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Support / Resistance</span>
        <span className="text-[10px] text-text-muted">auto-detected from swings</span>
      </div>
      <div className="space-y-1">
        {levels.map((l, i) => {
          const isRes = l.type === 'resistance'
          return (
            <div key={i} className="flex items-center justify-between px-2 py-1 rounded hover:bg-bg-elevated text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className={clsx('px-1 py-0.5 rounded text-[9px] font-semibold uppercase', isRes ? 'bg-red-400/10 text-red-400' : 'bg-emerald-400/10 text-emerald-400')}>
                  {isRes ? 'R' : 'S'}
                </span>
                {/* strength dots */}
                <span className="flex gap-0.5" title={`${l.strength} swing touches`}>
                  {Array.from({ length: Math.min(l.strength, 4) }).map((_, d) => (
                    <span key={d} className={clsx('inline-block size-1 rounded-full', isRes ? 'bg-red-400/60' : 'bg-emerald-400/60')} />
                  ))}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx('text-[10px]', l.distancePct >= 0 ? 'text-red-400/80' : 'text-emerald-400/80')}>
                  {l.distancePct >= 0 ? '+' : ''}{l.distancePct.toFixed(1)}%
                </span>
                <span className="font-mono font-semibold text-text-primary">
                  ${l.price.toLocaleString(undefined, { maximumFractionDigits: l.price > 100 ? 2 : 4 })}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-text-muted/70">Current ${last.toLocaleString(undefined, { maximumFractionDigits: last > 100 ? 2 : 4 })} · letters mark support (S) / resistance (R); dots = touch count.</p>
    </div>
  )
}

// ─── Signal Summary panel ──────────────────────────────────────────────────────

function SignalSummaryPanel({ summary }: { summary: SignalSummary }) {
  const total = summary.buy + summary.neutral + summary.sell
  const buyPct = total > 0 ? (summary.buy / total) * 100 : 0
  const sellPct = total > 0 ? (summary.sell / total) * 100 : 0
  const neuPct = total > 0 ? (summary.neutral / total) * 100 : 0

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Signal Summary</span>
        <SignalBadge signal={summary.overall} />
      </div>

      {/* Gauge bar */}
      <div className="space-y-1.5">
        <div className="h-2.5 rounded-full overflow-hidden flex gap-px">
          <div className="bg-emerald-500 transition-all" style={{ width: `${buyPct}%` }} />
          <div className="bg-slate-600 transition-all" style={{ width: `${neuPct}%` }} />
          <div className="bg-red-500 transition-all" style={{ width: `${sellPct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-text-muted">
          <span className="text-emerald-400">{summary.buy} Buy</span>
          <span>{summary.neutral} Neutral</span>
          <span className="text-red-400">{summary.sell} Sell</span>
        </div>
      </div>

      {/* Individual signals */}
      <div className="space-y-2">
        {summary.signals.map((sig) => (
          <div key={sig.name} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-text-primary">{sig.name}</p>
              <p className="text-[10px] text-text-muted truncate">{sig.description}</p>
            </div>
            <SignalBadge signal={sig.signal} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Patterns panel ────────────────────────────────────────────────────────────

function PatternsPanel({ patterns, candles }: { patterns: DetectedPattern[]; candles: OhlcvCandle[] }) {
  if (patterns.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
        <Activity size={28} className="mx-auto mb-2 text-text-muted/40" />
        <p className="text-xs text-text-muted">No clear patterns detected</p>
      </div>
    )
  }

  const fmt = (v: number) => '$' + v.toLocaleString(undefined, { maximumFractionDigits: v > 100 ? 2 : 4 })

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Detected Patterns</span>
      {patterns.map((p, i) => {
        const proj = patternProjection(p, candles)
        const last = candles[candles.length - 1].close
        const movePct = proj ? ((proj.measuredMoveTarget - last) / last) * 100 : null
        return (
          <div key={i} className={clsx('rounded-lg border p-3 flex flex-col gap-1.5', p.type === 'bullish' ? 'border-emerald-500/20 bg-emerald-500/5' : p.type === 'bearish' ? 'border-red-500/20 bg-red-500/5' : 'border-border bg-bg-elevated')}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text-primary">{p.name}</span>
              <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded', p.type === 'bullish' ? 'text-emerald-400 bg-emerald-400/10' : p.type === 'bearish' ? 'text-red-400 bg-red-400/10' : 'text-slate-400 bg-slate-400/10')}>
                {(p.confidence * 100).toFixed(0)}% conf.
              </span>
            </div>
            <p className="text-[11px] text-text-muted">{p.description}</p>
            {proj && (
              <div className="grid grid-cols-2 gap-1.5 mt-1 pt-1.5 border-t border-border/60">
                <div className="flex items-center gap-1.5" title="Measured-move target — pattern height projected from the break level">
                  <Target size={11} className="text-emerald-400 shrink-0" />
                  <span className="text-[10px] text-text-muted">Target</span>
                  <span className="text-[10px] font-mono font-semibold text-text-primary">{fmt(proj.measuredMoveTarget)}</span>
                  {movePct !== null && <span className={clsx('text-[9px]', movePct >= 0 ? 'text-emerald-400' : 'text-red-400')}>({movePct >= 0 ? '+' : ''}{movePct.toFixed(1)}%)</span>}
                </div>
                <div className="flex items-center gap-1.5" title="Invalidation — a close past this level voids the pattern">
                  <ShieldAlert size={11} className="text-amber-400 shrink-0" />
                  <span className="text-[10px] text-text-muted">Invalid</span>
                  <span className="text-[10px] font-mono font-semibold text-text-primary">{fmt(proj.invalidationLevel)}</span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Scanner (multi-asset setup detection) ──────────────────────────────────────

type SetupKey =
  | 'breakout' | 'oversold_bounce' | 'overbought_fade' | 'ma_cross'
  | 'volume_spike' | 'obv_divergence' | 'volatility_compression'

const SETUP_META: Record<SetupKey, { label: string; tone: string }> = {
  breakout:               { label: 'Breakout',        tone: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  oversold_bounce:        { label: 'Oversold bounce', tone: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  overbought_fade:        { label: 'Overbought fade', tone: 'bg-red-500/15 text-red-400 border-red-500/30' },
  ma_cross:               { label: 'MA cross',        tone: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  volume_spike:           { label: 'Volume spike',    tone: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  obv_divergence:         { label: 'OBV divergence',  tone: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  volatility_compression: { label: 'Vol. squeeze',    tone: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
}

const SETUP_KEYS = Object.keys(SETUP_META) as SetupKey[]

interface DetectedSetup { key: SetupKey; detail: string }

/** Detect named technical setups on a daily candle series. Pure derivation. */
function detectSetups(candles: OhlcvCandle[]): DetectedSetup[] {
  const n = candles.length
  if (n < 55) return []
  const closes = candles.map(c => c.close)
  const highs = candles.map(c => c.high)
  const vols = candles.map(c => c.volume)
  const last = closes[n - 1]
  const prev = closes[n - 2]
  const setups: DetectedSetup[] = []

  // Breakout — close above the prior 20-bar high
  const priorHigh = Math.max(...highs.slice(n - 21, n - 1))
  if (last > priorHigh) setups.push({ key: 'breakout', detail: `Closed above 20-bar high $${priorHigh.toLocaleString(undefined, { maximumFractionDigits: 2 })}` })

  // Oversold bounce — RSI < 38 and turning up
  const rsiVals = rsi(closes, 14)
  const rsiNow = rsiVals[n - 1]; const rsiPrev = rsiVals[n - 2]
  if (rsiNow !== null && rsiNow < 38 && last > prev && (rsiPrev === null || rsiNow > rsiPrev)) {
    setups.push({ key: 'oversold_bounce', detail: `RSI ${rsiNow.toFixed(0)} turning up off oversold` })
  }

  // Overbought fade — RSI > 68 and rolling over (bearish counterpart)
  if (rsiNow !== null && rsiNow > 68 && last < prev && (rsiPrev === null || rsiNow < rsiPrev)) {
    setups.push({ key: 'overbought_fade', detail: `RSI ${rsiNow.toFixed(0)} rolling over from overbought` })
  }

  // MA cross — EMA20/EMA50 crossed within the last ~2 bars
  const e20 = ema(closes, 20); const e50 = ema(closes, 50)
  const a20 = e20[n - 1], a50 = e50[n - 1], b20 = e20[n - 3], b50 = e50[n - 3]
  if (a20 !== null && a50 !== null && b20 !== null && b50 !== null) {
    if (b20 <= b50 && a20 > a50) setups.push({ key: 'ma_cross', detail: 'EMA20 crossed above EMA50 (golden)' })
    else if (b20 >= b50 && a20 < a50) setups.push({ key: 'ma_cross', detail: 'EMA20 crossed below EMA50 (death)' })
  }

  // Volume spike — last bar > 2× the 20-bar average
  const avgVol = vols.slice(n - 21, n - 1).reduce((a, b) => a + b, 0) / 20
  if (avgVol > 0 && vols[n - 1] > avgVol * 2) setups.push({ key: 'volume_spike', detail: `Volume ${(vols[n - 1] / avgVol).toFixed(1)}× its 20-bar average` })

  // OBV divergence — price made a lower low over ~14 bars but OBV held/rose,
  // i.e. accumulation under a falling price (bullish divergence).
  if (n >= 16) {
    const obvArr = obv(candles)
    const back = 14
    const priceChg = (last - closes[n - 1 - back]) / closes[n - 1 - back]
    const obvChg = obvArr[n - 1] - obvArr[n - 1 - back]
    if (priceChg < -0.03 && obvChg > 0) {
      setups.push({ key: 'obv_divergence', detail: `Price ${(priceChg * 100).toFixed(0)}% but OBV rising — accumulation` })
    }
  }

  // Volatility compression — Bollinger width near its 50-bar minimum (squeeze)
  const bb = bollingerBands(closes, 20, 2)
  const widths: number[] = []
  for (let i = Math.max(0, n - 50); i < n; i++) {
    const u = bb.upper[i], l = bb.lower[i], m = bb.middle[i]
    if (u !== null && l !== null && m !== null && m !== 0) widths.push((u - l) / m)
  }
  if (widths.length > 10) {
    const cur = widths[widths.length - 1]
    const min = Math.min(...widths)
    if (cur <= min * 1.1) setups.push({ key: 'volatility_compression', detail: 'Bollinger bands at a 50-bar squeeze' })
  }

  return setups
}

type ScanStatus = 'loading' | 'ok' | 'error'

interface ScanRow {
  assetId: string
  setups: DetectedSetup[]
  signal: SignalSummary | null
  status: ScanStatus
}

function formatPrice(price: number): string {
  if (price >= 1000) return '$' + price.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (price >= 1)    return '$' + price.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return '$' + price.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

// Run an async worker over items with bounded concurrency. Keeps the scanner
// from firing ~90 simultaneous OHLCV fetches (which rate-limits the CoinGecko
// fallback); a small pool drains the queue steadily instead.
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      await worker(items[i])
    }
  })
  await Promise.all(runners)
}

const SIGNAL_SCORE: Record<Signal, number> = {
  strong_buy: 2, buy: 1, neutral: 0, sell: -1, strong_sell: -2,
}
const signalRank = (s: SignalSummary | null): number =>
  s ? SIGNAL_SCORE[s.overall] : -99

// Daily history (1Y), weekly (3Y) and intraday (4H) windows the scanner runs on.
const SCAN_TIMEFRAMES = [
  { key: '4H', label: '4H', range: '4H' },
  { key: '1D', label: '1D', range: '1Y' },
  { key: '1W', label: '1W', range: '3Y' },
] as const
type ScanTimeframe = typeof SCAN_TIMEFRAMES[number]['key']

const SCAN_CONCURRENCY = 5
const SCAN_REFRESH_MS = 120_000

const SORT_OPTIONS = [
  { key: 'rank',    label: 'Market cap' },
  { key: 'setups',  label: 'Most setups' },
  { key: 'signal',  label: 'Signal' },
] as const
type SortKey = typeof SORT_OPTIONS[number]['key']

function ScannerPanel() {
  const { data: coinListData } = useQuery<CoinListResponse>({
    queryKey: ['coin-list'],
    queryFn: () => fetch('/live-data/coin-list').then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  })

  // Whole monitored universe, enriched with live names + market-cap rank.
  const universe = useMemo(() => {
    const coinMap = new Map((coinListData?.coins ?? []).map(c => [c.symbol.toUpperCase(), c]))
    return SUPPORTED_IDS.map(id => {
      const sym = id.toUpperCase()
      const live = coinMap.get(sym)
      return { id, symbol: sym, label: live?.name ?? sym, rank: live?.rank ?? 9999 }
    })
  }, [coinListData])
  const metaById = useMemo(() => new Map(universe.map(u => [u.id, u])), [universe])

  const [timeframe, setTimeframe] = useState<ScanTimeframe>('1D')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [activeScan, setActiveScan] = useState<SetupKey | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [rows, setRows] = useState<ScanRow[]>(
    () => SUPPORTED_IDS.map(id => ({ assetId: id, setups: [], signal: null, status: 'loading' as ScanStatus })),
  )
  const [scanning, setScanning] = useState(false)
  const [done, setDone] = useState(0)
  const [lastScan, setLastScan] = useState<Date | null>(null)
  const scanIdRef = useRef(0)

  const { data: marketsData } = useQuery({
    queryKey: ['scanner-prices'],
    queryFn: () => fetch('/live-data/markets').then(r => r.json()),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const runScan = useCallback(async () => {
    const myScan = ++scanIdRef.current
    const tf = SCAN_TIMEFRAMES.find(t => t.key === timeframe) ?? SCAN_TIMEFRAMES[1]
    setScanning(true)
    setDone(0)
    setRows(SUPPORTED_IDS.map(id => ({ assetId: id, setups: [], signal: null, status: 'loading' as ScanStatus })))

    await runPool(SUPPORTED_IDS, SCAN_CONCURRENCY, async (id) => {
      let patch: Partial<ScanRow>
      try {
        const res = await fetch(`/live-data/ohlcv?id=${id}&range=${tf.range}`)
        const json = await res.json()
        const candles: OhlcvCandle[] = json.candles ?? []
        if (!json.ok || candles.length === 0) {
          patch = { status: 'error' }
        } else {
          patch = {
            setups: detectSetups(candles),
            signal: candles.length >= 50 ? computeSignalSummary(candles) : null,
            status: 'ok',
          }
        }
      } catch {
        patch = { status: 'error' }
      }
      if (scanIdRef.current !== myScan) return // a newer scan superseded this one
      setRows(prev => prev.map(r => r.assetId === id ? { ...r, ...patch } : r))
      setDone(d => d + 1)
    })

    if (scanIdRef.current === myScan) {
      setScanning(false)
      setLastScan(new Date())
    }
  }, [timeframe])

  // Scan on mount and whenever the timeframe changes.
  useEffect(() => { runScan() }, [runScan])

  // Opt-in periodic rescan.
  useEffect(() => {
    if (!autoRefresh) return
    const iv = setInterval(() => runScan(), SCAN_REFRESH_MS)
    return () => clearInterval(iv)
  }, [autoRefresh, runScan])

  const counts = SETUP_KEYS.reduce<Record<string, number>>((acc, k) => {
    acc[k] = rows.filter(r => r.setups.some(s => s.key === k)).length
    return acc
  }, {})

  const failed = rows.filter(r => r.status === 'error').length

  const filtered = rows
    .filter(r => activeScan === 'all' ? r.setups.length > 0 : r.setups.some(s => s.key === activeScan))
    .map(r => ({ ...r, meta: metaById.get(r.assetId) }))
    .sort((a, b) => {
      if (sortKey === 'setups') return b.setups.length - a.setups.length
      if (sortKey === 'signal') return signalRank(b.signal) - signalRank(a.signal)
      return (a.meta?.rank ?? 9999) - (b.meta?.rank ?? 9999)
    })

  const total = SUPPORTED_IDS.length

  return (
    <div className="flex flex-col gap-4">
      {/* Controls: timeframe · sort · refresh */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Timeframe</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {SCAN_TIMEFRAMES.map(tf => (
              <button
                key={tf.key}
                onClick={() => setTimeframe(tf.key)}
                disabled={scanning}
                className={clsx('px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                  timeframe === tf.key ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated')}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-bg-elevated border border-border rounded-lg px-2 py-1 text-xs text-text-secondary focus:outline-none focus:border-accent-blue/40"
          >
            {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        <button
          onClick={() => setAutoRefresh(a => !a)}
          className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
            autoRefresh ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
          title={`Auto-rescan every ${SCAN_REFRESH_MS / 1000}s`}
        >
          Auto-refresh {autoRefresh ? 'on' : 'off'}
        </button>

        <button
          onClick={() => { if (!scanning) runScan() }}
          disabled={scanning}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-border text-text-secondary hover:bg-bg-elevated transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} /> Rescan
        </button>

        <div className="ml-auto text-[11px] text-text-muted">
          {scanning
            ? <span className="flex items-center gap-1.5"><RefreshCw size={11} className="animate-spin" /> Scanned {done}/{total}</span>
            : lastScan
              ? <span>Scanned {total} assets{failed > 0 ? ` · ${failed} unavailable` : ''} · {lastScan.toLocaleTimeString()}</span>
              : null}
        </div>
      </div>

      {/* Progress bar */}
      {scanning && (
        <div className="h-1 w-full rounded-full bg-bg-elevated overflow-hidden">
          <div className="h-full bg-accent-blue transition-all duration-200" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}

      {/* Scan-type filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={13} className="text-text-muted" />
        <button
          onClick={() => setActiveScan('all')}
          className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border', activeScan === 'all' ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30' : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
        >
          All setups
        </button>
        {SETUP_KEYS.map((k) => (
          <button
            key={k}
            onClick={() => setActiveScan(k)}
            className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border flex items-center gap-1.5', activeScan === k ? SETUP_META[k].tone : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
          >
            {SETUP_META[k].label}
            <span className="text-[10px] opacity-70">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>

      {!scanning && filtered.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          <Activity size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs">No assets currently match {activeScan === 'all' ? 'any setup' : SETUP_META[activeScan].label} on the {SCAN_TIMEFRAMES.find(t => t.key === timeframe)?.label} timeframe.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-bg-elevated">
                <th className="text-left px-4 py-2.5 text-text-muted font-medium">Asset</th>
                <th className="text-right px-3 py-2.5 text-text-muted font-medium">Price</th>
                <th className="text-center px-3 py-2.5 text-text-muted font-medium">Signal</th>
                <th className="text-left px-4 py-2.5 text-text-muted font-medium">Detected setups</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => (
                <tr key={row.assetId} className="hover:bg-bg-elevated transition-colors align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-text-primary">{row.meta?.symbol ?? row.assetId.toUpperCase()}</span>
                      <span className="text-text-muted">{row.meta?.label ?? ''}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sm text-text-primary whitespace-nowrap">
                    {(() => {
                      const price = marketsData?.quotes?.[row.assetId]?.price
                      return typeof price === 'number' ? formatPrice(price) : <span className="text-text-muted text-xs">—</span>
                    })()}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {row.signal ? <SignalBadge signal={row.signal.overall} /> : <span className="text-text-muted text-[10px]">N/A</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      {row.setups
                        .filter(s => activeScan === 'all' || s.key === activeScan)
                        .map((s, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className={clsx('px-1.5 py-0.5 rounded border text-[10px] font-medium shrink-0', SETUP_META[s.key].tone)}>
                              {SETUP_META[s.key].label}
                            </span>
                            <span className="text-[11px] text-text-muted">{s.detail}</span>
                          </div>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Key Levels panel ─────────────────────────────────────────────────────────

function KeyLevelsPanel({ candles }: { candles: OhlcvCandle[] }) {
  if (candles.length < 20) return null
  const fib = fibRetracement(candles, Math.min(candles.length, 100))
  const last = candles[candles.length - 1].close
  const ema20Now = ema(candles.map((c) => c.close), 20)[candles.length - 1]
  const ema50Now = ema(candles.map((c) => c.close), 50)[candles.length - 1]
  const ema200Now = ema(candles.map((c) => c.close), 200)[candles.length - 1]

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Key Levels</span>

      {/* Fibonacci */}
      <div>
        <p className="text-[10px] text-text-muted mb-2 uppercase tracking-wide">Fibonacci Retracement ({candles.length < 100 ? candles.length : 100} candles)</p>
        <div className="space-y-1">
          {fib.levels.map((l) => {
            const isAbove = l.price > last
            const isCurrent = Math.abs(l.price - last) / last < 0.005
            return (
              <div key={l.ratio} className={clsx('flex items-center justify-between px-2 py-1 rounded text-[11px]', isCurrent ? 'bg-accent-blue/10 border border-accent-blue/30' : 'hover:bg-bg-elevated')}>
                <span className={clsx('font-mono text-text-muted', isCurrent && 'text-accent-blue')}>{l.label}</span>
                <span className={clsx('font-mono font-semibold', isAbove ? 'text-red-400' : 'text-emerald-400', isCurrent && 'text-accent-blue')}>
                  ${l.price.toLocaleString(undefined, { maximumFractionDigits: l.price > 100 ? 2 : 4 })}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Moving Average levels */}
      <div>
        <p className="text-[10px] text-text-muted mb-2 uppercase tracking-wide">Moving Averages</p>
        <div className="space-y-1">
          {[
            { label: 'EMA 20', value: ema20Now, color: '#f59e0b' },
            { label: 'EMA 50', value: ema50Now, color: '#8b5cf6' },
            { label: 'EMA 200', value: ema200Now, color: '#ec4899' },
          ].map(({ label, value, color }) => value !== null && (
            <div key={label} className="flex items-center justify-between px-2 py-1 rounded hover:bg-bg-elevated text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full" style={{ background: color }} />
                <span className="text-text-muted">{label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx('text-[10px]', last > value ? 'text-emerald-400' : 'text-red-400')}>
                  {last > value ? '▲' : '▼'} {((last - value) / value * 100).toFixed(2)}%
                </span>
                <span className="font-mono font-semibold text-text-primary">
                  ${value.toLocaleString(undefined, { maximumFractionDigits: value > 100 ? 2 : 4 })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Multi-Timeframe Confluence Grid ──────────────────────────────────────────

const TF_ROWS = [
  { label: '15m', range: '15m' },
  { label: '1H',  range: '1H'  },
  { label: '4H',  range: '4H'  },
  { label: '1D',  range: '1Y'  },
  { label: '1W',  range: '3Y'  },
] as const

interface TFRow {
  label: string
  range: string
  summary: SignalSummary | null
  loading: boolean
}

function MultiTimeframeGrid({ assetId }: { assetId: string }) {
  const [rows, setRows] = useState<TFRow[]>(
    TF_ROWS.map(r => ({ ...r, summary: null, loading: true })),
  )

  useEffect(() => {
    setRows(TF_ROWS.map(r => ({ ...r, summary: null, loading: true })))
    let cancelled = false

    Promise.all(TF_ROWS.map(async (tf) => {
      try {
        const res  = await fetch(`/live-data/ohlcv?id=${assetId}&range=${tf.range}`)
        const json = await res.json()
        const candles: OhlcvCandle[] = json.candles ?? []
        const summary = candles.length >= 50 ? computeSignalSummary(candles) : null
        if (!cancelled)
          setRows(prev => prev.map(r => r.range === tf.range ? { ...r, summary, loading: false } : r))
      } catch {
        if (!cancelled)
          setRows(prev => prev.map(r => r.range === tf.range ? { ...r, loading: false } : r))
      }
    }))

    return () => { cancelled = true }
  }, [assetId])

  // Confluence: count loaded rows and how many agree
  const loaded  = rows.filter(r => !r.loading && r.summary)
  const bullish = loaded.filter(r => r.summary!.overall === 'buy' || r.summary!.overall === 'strong_buy').length
  const bearish = loaded.filter(r => r.summary!.overall === 'sell' || r.summary!.overall === 'strong_sell').length

  function confluenceLabel() {
    if (loaded.length < 3) return null
    if (bullish >= 4) return { text: `${bullish}/${loaded.length} timeframes bullish — strong confluence`, color: 'text-emerald-400' }
    if (bearish >= 4) return { text: `${bearish}/${loaded.length} timeframes bearish — strong confluence`, color: 'text-red-400' }
    if (bullish >= 3) return { text: `${bullish}/${loaded.length} timeframes bullish — moderate confluence`, color: 'text-green-400' }
    if (bearish >= 3) return { text: `${bearish}/${loaded.length} timeframes bearish — moderate confluence`, color: 'text-orange-400' }
    return { text: 'Mixed signals across timeframes — no clear confluence', color: 'text-text-muted' }
  }

  const confluence = confluenceLabel()

  // Plain-English per-timeframe agreement, e.g. "1D bullish · 4H overbought · 1H weakening"
  function tfPhrase(summary: SignalSummary): { word: string; color: string } {
    const rsiSig = summary.signals.find(s => s.name.startsWith('RSI'))
    const rsiVal = rsiSig?.value ?? null
    if (rsiVal !== null && rsiVal > 70) return { word: 'overbought', color: 'text-red-400' }
    if (rsiVal !== null && rsiVal < 30) return { word: 'oversold', color: 'text-emerald-400' }
    switch (summary.overall) {
      case 'strong_buy':  return { word: 'strong bull', color: 'text-emerald-400' }
      case 'buy':         return { word: 'bullish', color: 'text-emerald-400' }
      case 'sell':        return { word: 'bearish', color: 'text-red-400' }
      case 'strong_sell': return { word: 'strong bear', color: 'text-red-400' }
      default:            return { word: 'neutral', color: 'text-slate-400' }
    }
  }
  const agreement = loaded.length >= 2
    ? [...loaded].reverse().map(r => ({ label: r.label, ...tfPhrase(r.summary!) }))
    : null

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Multi-Timeframe Confluence
        </span>
        {confluence && (
          <span className={clsx('text-[11px] font-medium', confluence.color)}>
            {confluence.text}
          </span>
        )}
      </div>

      {/* Plain-English agreement line */}
      {agreement && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] -mt-1">
          {agreement.map((a, i) => (
            <span key={a.label} className="flex items-center gap-1.5">
              <span className="font-mono font-semibold text-text-secondary">{a.label}</span>
              <span className={clsx('font-medium', a.color)}>{a.word}</span>
              {i < agreement.length - 1 && <span className="text-text-muted/40">·</span>}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-5 gap-2">
        {rows.map((row) => {
          const total = row.summary ? row.summary.buy + row.summary.neutral + row.summary.sell : 0
          return (
            <div
              key={row.label}
              className="flex flex-col items-center gap-2 rounded-lg border border-border bg-bg-elevated p-3"
            >
              <span className="text-[11px] font-mono font-bold text-text-secondary">{row.label}</span>

              {row.loading ? (
                <div className="h-5 w-16 rounded-full bg-bg-card animate-pulse" />
              ) : row.summary ? (
                <>
                  <SignalBadge signal={row.summary.overall} />
                  <div className="h-1.5 w-full rounded-full overflow-hidden flex gap-px">
                    <div className="bg-emerald-500 transition-all" style={{ width: `${(row.summary.buy    / total) * 100}%` }} />
                    <div className="bg-slate-600 transition-all"   style={{ width: `${(row.summary.neutral / total) * 100}%` }} />
                    <div className="bg-red-500 transition-all"     style={{ width: `${(row.summary.sell   / total) * 100}%` }} />
                  </div>
                  <div className="flex gap-2 text-[10px]">
                    <span className="text-emerald-400">{row.summary.buy}B</span>
                    <span className="text-text-muted">{row.summary.neutral}N</span>
                    <span className="text-red-400">{row.summary.sell}S</span>
                  </div>
                </>
              ) : (
                <span className="text-[10px] text-text-muted">N/A</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Thesis Builder (save chart setups) ─────────────────────────────────────────

function ThesisBuilderPanel({ assetId, symbol, range, price, signal }: {
  assetId: string; symbol: string; range: string; price: number | null; signal: string | null
}) {
  const { theses, addThesis, removeThesis } = useThesisStore()
  const [open, setOpen] = useState(false)
  const [entryThesis, setEntryThesis] = useState('')
  const [target, setTarget] = useState('')
  const [invalidation, setInvalidation] = useState('')
  const [notes, setNotes] = useState('')

  const rr = price != null ? computeRiskReward(String(price), target, invalidation) : null
  const canSave = entryThesis.trim().length > 0

  function save() {
    if (!canSave) return
    addThesis({ assetId, symbol, range, priceAtSave: price, signalAtSave: signal, entryThesis: entryThesis.trim(), target: target.trim(), invalidation: invalidation.trim(), notes: notes.trim() })
    setEntryThesis(''); setTarget(''); setInvalidation(''); setNotes(''); setOpen(false)
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Chart Notes / Thesis</span>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-xs text-text-secondary hover:bg-bg-elevated transition-colors"
        >
          <PenLine size={12} /> {open ? 'Cancel' : `New thesis for ${symbol}`}
        </button>
      </div>

      {open && (
        <div className="rounded-lg border border-border bg-bg-elevated/40 p-3 flex flex-col gap-2.5">
          <div className="text-[10px] text-text-muted">
            Snapshot: {symbol} · {range} · {price != null ? '$' + price.toLocaleString(undefined, { maximumFractionDigits: price > 100 ? 2 : 4 }) : 'n/a'} · signal {signal ?? 'n/a'}
          </div>
          <textarea
            value={entryThesis} onChange={e => setEntryThesis(e.target.value)}
            placeholder="Entry thesis — why this setup? (required)"
            rows={2}
            className="w-full text-xs bg-bg-card border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue resize-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Target (e.g. 75000)" className="text-xs bg-bg-card border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue" />
            <input value={invalidation} onChange={e => setInvalidation(e.target.value)} placeholder="Invalidation (e.g. 58000)" className="text-xs bg-bg-card border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue" />
          </div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" className="text-xs bg-bg-card border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-muted">
              {rr != null ? <>Risk/Reward <span className={clsx('font-semibold', rr >= 2 ? 'text-emerald-400' : rr >= 1 ? 'text-amber-400' : 'text-red-400')}>{rr.toFixed(2)}:1</span></> : 'Enter numeric target + invalidation for R/R'}
            </span>
            <button
              onClick={save} disabled={!canSave}
              className="px-3 py-1.5 rounded-lg bg-accent-blue text-white text-xs font-medium disabled:opacity-40 hover:bg-blue-600 transition-colors"
            >
              Save thesis
            </button>
          </div>
        </div>
      )}

      {theses.length === 0 ? (
        <p className="text-[11px] text-text-muted text-center py-2">No saved theses yet. Saved locally in your browser.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {theses.map((t) => {
            const tRr = computeRiskReward(String(t.priceAtSave ?? ''), t.target, t.invalidation)
            return (
              <div key={t.id} className="rounded-lg border border-border bg-bg-elevated/40 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-bold text-xs text-text-primary">{t.symbol}</span>
                    <span className="text-[10px] text-text-muted">{t.range}</span>
                    {t.priceAtSave != null && <span className="text-[10px] text-text-muted">@ ${t.priceAtSave.toLocaleString(undefined, { maximumFractionDigits: t.priceAtSave > 100 ? 2 : 4 })}</span>}
                    {tRr != null && <span className={clsx('text-[10px] font-semibold', tRr >= 2 ? 'text-emerald-400' : tRr >= 1 ? 'text-amber-400' : 'text-red-400')}>{tRr.toFixed(1)}:1</span>}
                  </div>
                  <button onClick={() => removeThesis(t.id)} className="text-text-muted hover:text-red-400 transition-colors shrink-0" title="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
                <p className="text-[11px] text-text-secondary mt-1">{t.entryThesis}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-text-muted">
                  {t.target && <span><Target size={9} className="inline mb-0.5 text-emerald-400" /> {t.target}</span>}
                  {t.invalidation && <span><ShieldAlert size={9} className="inline mb-0.5 text-amber-400" /> {t.invalidation}</span>}
                  <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
                {t.notes && <p className="text-[10px] text-text-muted italic mt-1">{t.notes}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Market Structure panel (crypto-native overlays, feature #3) ─────────────────

function MarketStructurePanel({ symbol }: { symbol: string }) {
  const { data: funding } = useQuery({
    queryKey: ['ms-funding'],
    queryFn: () => fetch('/live-data/funding-rates').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
  const { data: reserves } = useQuery({
    queryKey: ['ms-reserves'],
    queryFn: () => fetch('/live-data/reserves').then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  })

  const row = (funding?.rates ?? []).find((r: { symbol: string }) => r.symbol?.toUpperCase() === symbol.toUpperCase())
  const stableTotal: number | null = reserves?.assets
    ? reserves.assets.reduce((a: number, s: { circulatingUsd?: number }) => a + (s.circulatingUsd ?? 0), 0)
    : null

  const fmtUsd = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toLocaleString()}`

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Market Structure</span>
        <DataBadge status={row || stableTotal ? 'live' : 'unavailable'} source="OKX · DefiLlama" />
      </div>

      <div className="space-y-2">
        {/* Funding rate */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-text-muted"><Gauge size={12} /> Funding (annualized)</span>
          {row ? (
            <span className={clsx('font-mono font-semibold', row.annualized >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {row.annualized >= 0 ? '+' : ''}{row.annualized.toFixed(2)}% <span className="text-text-muted font-normal">({row.exchange})</span>
            </span>
          ) : <span className="text-text-muted">n/a</span>}
        </div>
        {/* Open interest */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-text-muted"><Scale size={12} /> Open interest</span>
          {row?.openInterestUsd ? <span className="font-mono font-semibold text-text-primary">{fmtUsd(row.openInterestUsd)}</span> : <span className="text-text-muted">n/a</span>}
        </div>
        {/* Long/short ratio */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-text-muted"><Compass size={12} /> Long/short ratio</span>
          {row?.longShortRatio != null ? <span className="font-mono font-semibold text-text-primary">{row.longShortRatio.toFixed(2)}</span> : <span className="text-text-muted">n/a — not provided</span>}
        </div>
        {/* Stablecoin supply (market-wide) */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-text-muted"><CircleDollarSign size={12} /> Total stablecoin supply</span>
          {stableTotal ? <span className="font-mono font-semibold text-text-primary">{fmtUsd(stableTotal)}</span> : <span className="text-text-muted">n/a</span>}
        </div>
      </div>

      {/* Honest unavailable markers — no free real-time source */}
      <div className="border-t border-border pt-2 space-y-1">
        {['Liquidation heatmap', 'Exchange in/out-flows'].map((label) => (
          <div key={label} className="flex items-center justify-between text-[10px] text-text-muted/70">
            <span className="flex items-center gap-1.5"><MinusCircle size={11} /> {label}</span>
            <span>not available (paid feed)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Strategy Backtest panel (feature #7) ───────────────────────────────────────

const CAT_LABEL: Partial<Record<StrategyCategory, string>> = {
  trend: 'Trend', 'mean-reversion': 'Mean Reversion',
  volatility: 'Volatility', volume: 'Volume', 'multi-factor': 'Multi-Factor',
}
const CAT_ORDER: StrategyCategory[] = ['trend', 'mean-reversion', 'volatility', 'volume', 'multi-factor']

const FEE_OPTIONS = [
  { label: 'No fees', value: 0 },
  { label: '0.05%', value: 0.0005 },
  { label: '0.1%', value: 0.001 },
  { label: '0.25%', value: 0.0025 },
]

function BacktestPanel({ assetId, symbol }: { assetId: string; symbol: string }) {
  // Dedicated long DAILY series so 200-period strategies have enough warm-up data.
  const { data, isFetching } = useQuery({
    queryKey: ['ta-backtest-ohlcv', assetId],
    queryFn: async () => {
      const res = await fetch(`/live-data/ohlcv?id=${assetId}&range=BT`)
      if (!res.ok) throw new Error('fetch failed')
      return res.json() as Promise<{ ok: boolean; candles: OhlcvCandle[]; source?: string }>
    },
    staleTime: 60 * 60 * 1000,
  })
  const candles = useMemo<OhlcvCandle[]>(() => data?.candles ?? [], [data])

  const [strategyKey, setStrategyKey] = useState<string | null>(null)
  const [feesPct, setFeesPct]         = useState(0)
  const [direction, setDirection]     = useState<'long' | 'short'>('long')

  // Recompute all results when candles, fees, or direction change.
  const allResults = useMemo(
    () => Object.fromEntries(
      STRATEGIES.map(s => {
        if (candles.length === 0) return [s.key, null]
        // Isolate failures: a single misbehaving strategy must not crash the panel.
        try { return [s.key, runBacktest(candles, s.key, { feesPct, direction })] }
        catch { return [s.key, null] }
      })
    ),
    [candles, feesPct, direction],
  )

  // Auto-pick the first strategy that has trades on first data load.
  useEffect(() => {
    if (strategyKey !== null || candles.length === 0) return
    const first = STRATEGIES.find(s => (allResults[s.key]?.metrics.sampleCount ?? 0) > 0)
    setStrategyKey((first ?? STRATEGIES[0]).key)
  }, [allResults, candles.length, strategyKey])

  const activeKey = strategyKey ?? STRATEGIES[0].key
  const result    = allResults[activeKey] ?? null
  const strat     = STRATEGIES.find(s => s.key === activeKey)!

  const fmtRatio = (v: number | null) => v === null ? 'n/a' : v.toFixed(2)
  const ratioTone = (v: number | null) =>
    v === null ? 'text-text-muted' : v >= 1 ? 'text-emerald-400' : v >= 0 ? 'text-amber-400' : 'text-red-400'

  const metricCard = (label: string, value: string, tone?: string, sub?: string) => (
    <div className="rounded-lg border border-border bg-bg-card px-3 py-2.5 text-center">
      <div className={clsx('text-lg font-bold font-mono', tone ?? 'text-text-primary')}>{value}</div>
      <div className="text-[10px] text-text-muted mt-0.5">{label}</div>
      {sub && <div className="text-[9px] text-text-muted/60 mt-0.5">{sub}</div>}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">

      {/* Strategy selector dropdown — grouped by category */}
      <div className="flex items-center gap-3">
        <label htmlFor="bt-strategy" className="text-xs text-text-muted flex-shrink-0">Strategy</label>
        <select
          id="bt-strategy"
          value={activeKey}
          onChange={e => setStrategyKey(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue/60 transition-colors"
        >
          {CAT_ORDER.map(cat => {
            const group = STRATEGIES.filter(s => s.category === cat)
            if (group.length === 0) return null
            return (
              <optgroup key={cat} label={CAT_LABEL[cat] ?? cat}>
                {group.map(s => {
                  const n = allResults[s.key]?.metrics.sampleCount
                  return (
                    <option key={s.key} value={s.key}>
                      {s.name}{n != null ? ` (${n} trades)` : ''}
                    </option>
                  )
                })}
              </optgroup>
            )
          })}
        </select>
      </div>

      {/* Simulation controls */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-bg-card px-3 py-2">
        {/* Direction */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Direction</span>
          {(['long', 'short'] as const).map(d => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={clsx('px-2.5 py-1 rounded text-xs font-medium border transition-colors capitalize',
                direction === d
                  ? d === 'long' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
                  : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
            >
              {d}
            </button>
          ))}
        </div>
        {/* Fees */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Fees / side</span>
          {FEE_OPTIONS.map(f => (
            <button
              key={f.value}
              onClick={() => setFeesPct(f.value)}
              className={clsx('px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                feesPct === f.value
                  ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                  : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-text-muted">
        {strat.description} · {symbol} · {candles.length} daily candles (~{(candles.length / 365).toFixed(1)}y) ·{' '}
        {direction === 'long' ? 'Long-only' : 'Short-only'}, full position, one trade at a time
        {feesPct > 0 ? `, ${(feesPct * 100).toFixed(2)}% fee per side` : ', no fees'}.
      </p>

      {isFetching && candles.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-8 text-center text-text-muted text-sm">
          Loading {symbol} daily history…
        </div>
      ) : !result ? (
        <div className="rounded-xl border border-border bg-bg-card p-8 text-center text-text-muted text-sm">
          Not enough price history — needs ≥{strat.minBars} daily candles, {symbol} has {candles.length}.
          Bollinger-bounce works on shorter histories; 200-period trend strategies need ~2+ years.
        </div>
      ) : result.metrics.sampleCount === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-8 text-center text-text-muted text-sm">
          Enough data, but entry conditions never triggered for {symbol} over{' '}
          {(candles.length / 365).toFixed(1)} years. Try another strategy (trade counts in parentheses).
        </div>
      ) : (
        <>
          {/* Metrics grid — 8 cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {metricCard('Win rate',    `${result.metrics.winRate.toFixed(0)}%`,
              result.metrics.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400')}
            {metricCard('Avg return',  `${result.metrics.averageReturn >= 0 ? '+' : ''}${result.metrics.averageReturn.toFixed(1)}%`,
              result.metrics.averageReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}
            {metricCard('Total return',`${result.metrics.totalReturn >= 0 ? '+' : ''}${result.metrics.totalReturn.toFixed(1)}%`,
              result.metrics.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}
            {metricCard('Max drawdown',`-${result.metrics.maxDrawdown.toFixed(1)}%`, 'text-red-400')}
            {metricCard('Trades',      `${result.metrics.sampleCount}`)}
            {metricCard('Avg hold',    `${result.metrics.averageHoldingPeriod.toFixed(0)} bars`)}
            {metricCard('Sharpe',      fmtRatio(result.metrics.sharpeRatio),
              ratioTone(result.metrics.sharpeRatio), 'annualised')}
            {metricCard('Sortino',     fmtRatio(result.metrics.sortinoRatio),
              ratioTone(result.metrics.sortinoRatio), 'downside only')}
          </div>

          {/* Trades table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-bg-elevated">
                  <th className="text-left  px-4 py-2 text-text-muted font-medium">#</th>
                  <th className="text-right px-3 py-2 text-text-muted font-medium">Entry</th>
                  <th className="text-right px-3 py-2 text-text-muted font-medium">Exit</th>
                  <th className="text-right px-3 py-2 text-text-muted font-medium">Return{feesPct > 0 ? ' (net)' : ''}</th>
                  <th className="text-right px-4 py-2 text-text-muted font-medium">Bars held</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.trades.map((t, i) => (
                  <tr key={i} className="hover:bg-bg-elevated transition-colors">
                    <td className="px-4 py-2 text-text-muted">{i + 1}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-secondary">${t.entryPrice.toLocaleString(undefined, { maximumFractionDigits: t.entryPrice > 100 ? 2 : 4 })}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-secondary">${t.exitPrice.toLocaleString(undefined, { maximumFractionDigits: t.exitPrice > 100 ? 2 : 4 })}</td>
                    <td className={clsx('px-3 py-2 text-right font-mono font-semibold', t.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>{t.returnPct >= 0 ? '+' : ''}{t.returnPct.toFixed(2)}%</td>
                    <td className="px-4 py-2 text-right font-mono text-text-muted">{t.bars}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-text-muted/70">
            Hypothetical{feesPct > 0 ? ` (${(feesPct * 100).toFixed(2)}% fee per side applied)` : ', no fees or slippage'}; past performance does not predict future results. Not financial advice.
          </p>
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'chart' | 'patterns' | 'scanner' | 'backtest'

// useSearchParams() forces a CSR bailout, so the page body must sit inside a
// Suspense boundary for `next build` prerendering to succeed.
// ModuleGate sits outside Suspense so a disabled module renders the unlock
// notice without mounting TechnicalAnalysisContent — none of its queries or
// useSearchParams work runs for a user who cannot see the results.
export default function TechnicalAnalysisPage() {
  return (
    <ModuleGate module="crypto">
      <Suspense>
        <TechnicalAnalysisContent />
      </Suspense>
    </ModuleGate>
  )
}

function TechnicalAnalysisContent() {
  const searchParams = useSearchParams()

  // Fetch live coin list to enrich OHLCV-supported assets with names + ranks
  const { data: coinListData } = useQuery<CoinListResponse>({
    queryKey: ['coin-list'],
    queryFn: () => fetch('/live-data/coin-list').then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  })

  // Build chart asset list: all COINGECKO_IDS-supported ids, enriched with live names
  const chartAssets = useMemo(() => {
    const coinMap = new Map(
      (coinListData?.coins ?? []).map(c => [c.symbol.toUpperCase(), c])
    )
    return SUPPORTED_IDS.map(id => {
      const sym = id.toUpperCase()
      const live = coinMap.get(sym)
      return {
        id,
        symbol: sym,
        label: live?.name ?? sym,
        rank: live?.rank ?? 9999,
      }
    }).sort((a, b) => a.rank - b.rank)
  }, [coinListData])

  const [tab, setTab] = useState<Tab>('chart')
  const [assetId, setAssetId] = useState(() => {
    const p = searchParams.get('asset')
    return SUPPORTED_IDS.includes(p ?? '') ? p! : 'btc'
  })
  const [range, setRange] = useState<Range>('1Y')
  const [chartType, setChartType] = useState<ChartType>('candlestick')
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(
    new Set(['ema20', 'ema50', 'volume', 'rsi']),
  )
  const [indicatorMenuOpen, setIndicatorMenuOpen] = useState(false)
  const indicatorMenuRef = useRef<HTMLDivElement>(null)
  const [chartTypeMenuOpen, setChartTypeMenuOpen] = useState(false)
  const chartTypeMenuRef = useRef<HTMLDivElement>(null)
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('none')
  const [drawings, setDrawings] = useState<Drawing[]>([])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (indicatorMenuRef.current && !indicatorMenuRef.current.contains(e.target as Node)) {
        setIndicatorMenuOpen(false)
      }
      if (chartTypeMenuRef.current && !chartTypeMenuRef.current.contains(e.target as Node)) {
        setChartTypeMenuOpen(false)
      }
    }
    if (indicatorMenuOpen || chartTypeMenuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [indicatorMenuOpen, chartTypeMenuOpen])

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['ta-ohlcv', assetId, range],
    queryFn: async () => {
      const res = await fetch(`/live-data/ohlcv?id=${assetId}&range=${range}`)
      if (!res.ok) throw new Error('fetch failed')
      return res.json() as Promise<{ ok: boolean; candles: OhlcvCandle[]; source?: string; granularity?: string }>
    },
    staleTime: range === '1H' ? 60_000 : range === '4H' || range === '1M' ? 300_000 : 900_000,
  })

  const ohlcvSource = data?.source === 'binance' ? 'Binance' : data?.source === 'coingecko' ? 'CoinGecko' : undefined

  // News-derived event markers for the chart (feature #4)
  const candles = useMemo<OhlcvCandle[]>(() => data?.candles ?? [], [data])

  const summary = useMemo(() => candles.length >= 50 ? computeSignalSummary(candles) : null, [candles])
  const patterns = useMemo(() => candles.length >= 20 ? detectPatterns(candles) : [], [candles])

  function toggleIndicator(key: IndicatorKey) {
    setActiveIndicators((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const asset = chartAssets.find((a) => a.id === assetId) ?? { id: assetId, symbol: assetId.toUpperCase(), label: assetId.toUpperCase(), rank: 9999 }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-screen-2xl mx-auto w-full">
      <PageHeader
        title="Technical Analysis"
        subtitle="Professional-grade charting, indicators, and pattern recognition"
        icon={<Activity size={18} className="text-accent-blue" />}
        description="A full TA suite combining the best of TradingView, Coinigy, and TrendSpider — candlestick charts with 60+ indicators, automated pattern detection, and a multi-asset screener."
        details={[
          { label: 'Indicators', text: 'RSI, MACD, Bollinger Bands, EMA/SMA stack, Stochastic RSI, ATR, OBV, VWAP — toggle any combination on the chart.' },
          { label: 'Signal Summary', text: 'Each indicator votes buy/sell/neutral; aggregate score produces an overall signal (Strong Buy → Strong Sell).' },
          { label: 'Pattern Recognition', text: 'Automated detection of Double Top/Bottom, Head & Shoulders, Triangles, Engulfing candles, Golden/Death Cross.' },
          { label: 'Screener', text: 'Scans every tracked asset on a selectable timeframe (4H/1D/1W) for technical setups, with sortable results and optional auto-refresh.' },
        ]}
      />

      {/* Data provenance */}
      <SourceLine id="ohlcv" />

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Asset selector */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="appearance-none bg-bg-secondary border border-border rounded-lg pl-3 pr-7 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue/60 cursor-pointer"
            >
              {chartAssets.map((a) => (
                <option key={a.id} value={a.id}>{a.symbol} — {a.label}{a.rank < 9999 ? ` (#${a.rank})` : ''}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
          {candles.length > 0 && (() => {
            const lastClose = candles[candles.length - 1].close
            const prevClose = candles[candles.length - 2]?.close
            const pct = prevClose ? ((lastClose - prevClose) / prevClose) * 100 : null
            return (
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-2xl text-text-primary">{formatPrice(lastClose)}</span>
                {pct !== null && (
                  <span className={clsx('text-base font-semibold', pct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                  </span>
                )}
              </div>
            )
          })()}
        </div>

        {/* Range selector */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={clsx('px-2.5 py-1.5 text-xs font-medium transition-colors', range === r ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated')}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Chart type dropdown */}
        <div className="relative" ref={chartTypeMenuRef}>
          {(() => {
            const current = CHART_TYPES.find((c) => c.type === chartType) ?? CHART_TYPES[0]
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
            <div className="absolute top-full left-0 mt-1.5 z-50 bg-bg-card border border-border rounded-xl shadow-2xl w-56 p-1.5">
              {CHART_TYPES.map(({ type, label, desc, Icon }) => (
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

        {/* Refresh */}
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors disabled:opacity-50"
        >
          <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>

        {/* Tabs */}
        <div className="ml-auto flex items-center rounded-lg border border-border overflow-hidden">
          {([['chart', 'Chart'], ['patterns', 'Patterns'], ['scanner', 'Scanner'], ['backtest', 'Backtest']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx('px-3 py-1.5 text-xs font-medium transition-colors', tab === t ? 'bg-bg-elevated text-text-primary' : 'text-text-muted hover:text-text-secondary')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart Tab ── */}
      {tab === 'chart' && (
        <div className="flex flex-col gap-3">
          {/* Indicators — shared picker, same control on all three TA surfaces */}
          <IndicatorPicker
            indicators={INDICATORS}
            active={activeIndicators}
            onToggle={(k) => toggleIndicator(k as IndicatorKey)}
            onClearAll={() => setActiveIndicators(new Set())}
          />

          {/* Drawing toolbar — shared component; this page was its origin */}
          <DrawingToolbar
            active={drawingTool}
            onChange={setDrawingTool}
            drawings={drawings}
            onClear={() => { setDrawings([]); setDrawingTool('none') }}
          />

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
            {/* Chart */}
            <div className="rounded-xl border border-border bg-bg-card overflow-hidden" style={{ height: 520 }}>
              {isFetching && candles.length === 0 ? (
                <div className="flex items-center justify-center h-full gap-2 text-text-muted">
                  <RefreshCw size={16} className="animate-spin" />
                  <span className="text-sm">Loading {asset?.symbol} {range} data…</span>
                </div>
              ) : candles.length > 0 ? (
                <CandlestickChart
                  candles={candles}
                  activeIndicators={activeIndicators}
                  chartType={chartType}
                  drawingTool={drawingTool}
                  drawings={drawings}
                  onDrawingComplete={(d) => {
                    setDrawings(prev => [...prev, d])
                    setDrawingTool('none')
                  }}
                  patterns={patterns}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-text-muted text-sm">
                  No data available
                </div>
              )}
            </div>

            {/* Right panel */}
            <div className="flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: 520 }}>
              {/* Provenance for the price series + derived signals */}
              {candles.length > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg-card px-3 py-2">
                  <DataBadge
                    status={ohlcvSource ? 'live' : 'unavailable'}
                    source={ohlcvSource ? `${ohlcvSource} OHLCV` : undefined}
                  />
                  <span className="text-[10px] text-text-muted">
                    {candles.length} candles · indicators derived
                  </span>
                </div>
              )}
              {summary && <TechnicalReadPanel candles={candles} summary={summary} />}
              <MarketStructurePanel symbol={asset.symbol} />
              {summary && <SignalSummaryPanel summary={summary} />}
              {candles.length > 0 && <SupportResistancePanel candles={candles} />}
              {candles.length > 0 && <KeyLevelsPanel candles={candles} />}
            </div>
          </div>

          {/* Multi-timeframe confluence */}
          <MultiTimeframeGrid assetId={assetId} />

          {/* Chart notes / thesis builder */}
          <ThesisBuilderPanel
            assetId={assetId}
            symbol={asset.symbol}
            range={range}
            price={candles.length > 0 ? candles[candles.length - 1].close : null}
            signal={summary?.overall ?? null}
          />
        </div>
      )}

      {/* ── Patterns Tab ── */}
      {tab === 'patterns' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-4">
            <PatternsPanel patterns={patterns} candles={candles} />
          </div>
          <div className="flex flex-col gap-4">
            {candles.length > 0 && <SupportResistancePanel candles={candles} />}
            {candles.length > 0 && <KeyLevelsPanel candles={candles} />}
            {summary && <SignalSummaryPanel summary={summary} />}
          </div>
        </div>
      )}

      {/* ── Scanner Tab ── */}
      {tab === 'scanner' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-muted">
            Scans every tracked asset on the selected timeframe for technical setups — breakouts, oversold
            bounces, overbought fades, moving-average crosses, volume spikes, OBV divergence, and volatility
            compression. Rescan manually or enable auto-refresh.
          </p>
          <ScannerPanel />
        </div>
      )}

      {/* ── Backtest Tab ── */}
      {tab === 'backtest' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-muted">
            Backtest a preset technical strategy on {asset.symbol}, using a dedicated multi-year daily
            history (independent of the chart range) so the trend strategies have enough warm-up data.
          </p>
          <BacktestPanel assetId={assetId} symbol={asset.symbol} />
        </div>
      )}
    </div>
  )
}
