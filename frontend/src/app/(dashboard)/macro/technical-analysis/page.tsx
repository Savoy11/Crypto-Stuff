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
import type { ChartType } from '@/components/charts/CandlestickChart'
import type { LucideIcon } from 'lucide-react'
import {
  rsi, sma, computeSignalSummary, detectPatterns,
  type Signal, type DetectedPattern,
} from '@/lib/utils/indicators'
import {
  INSTRUMENT_BY_KEY, SEC_PREFIX, formatInstrumentQuote, type Instrument,
} from '@/lib/data/instruments'
import { COMMODITY_CATALOG, THINLY_TRADED_COMMODITIES } from '@/lib/data/commodityCatalog'
import { CURRENCY_CATALOG } from '@/lib/data/currencyCatalog'
import { RATES_CATALOG } from '@/lib/data/ratesCatalog'
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
// No new data route: macro symbols are Yahoo symbols and go through exactly the
// same OHLCV path the equities TA page uses.

const CandlestickChart = dynamic(() => import('@/components/charts/CandlestickChart'), { ssr: false })

// ─── Instrument list ──────────────────────────────────────────────────────────

type MacroGroup = 'Commodities' | 'Currencies' | 'Bonds & Rates'

interface MacroInstrument {
  symbol: string
  name: string
  group: MacroGroup
  detailPath: string
  instrument: Instrument | undefined
  /**
   * Deep enough for indicator output to mean anything. Thin contracts still
   * chart — a user who wants cocoa gets cocoa — but they are kept out of the
   * scanner, where a stale or gappy series would sit in a ranked table next to
   * genuinely liquid ones and read as comparable.
   */
  liquid: boolean
}

// The thin-market exclusion set lives with the catalog (one source of truth —
// the commodity risk profile reads the same set). Their futures still quote,
// so they remain fully chartable; they are simply not ranked.

const MACRO_INSTRUMENTS: MacroInstrument[] = [
  ...COMMODITY_CATALOG.map((c) => ({
    symbol: c.symbol,
    name: c.name,
    group: 'Commodities' as const,
    detailPath: `/macro/commodities/${c.slug}`,
    instrument: INSTRUMENT_BY_KEY[`${SEC_PREFIX}${c.symbol}`],
    liquid: !THINLY_TRADED_COMMODITIES.has(c.symbol),
  })),
  ...CURRENCY_CATALOG.map((c) => ({
    symbol: c.symbol,
    name: c.name,
    group: 'Currencies' as const,
    detailPath: `/macro/currencies/${c.slug}`,
    instrument: INSTRUMENT_BY_KEY[`${SEC_PREFIX}${c.symbol}`],
    // Majors and the index are deep; EM pairs and crosses quote thinly through
    // Yahoo and gap over local holidays.
    liquid: c.category === 'major' || c.category === 'index',
  })),
  ...RATES_CATALOG.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    group: 'Bonds & Rates' as const,
    detailPath: `/macro/rates/${r.slug}`,
    instrument: INSTRUMENT_BY_KEY[`${SEC_PREFIX}${r.symbol}`],
    liquid: true,
  })),
]

const BY_SYMBOL = new Map(MACRO_INSTRUMENTS.map((m) => [m.symbol, m]))
const GROUPS: MacroGroup[] = ['Commodities', 'Currencies', 'Bonds & Rates']

/** Scanner universe — liquid only, and small enough to be one fetch per row. */
const SCANNER_INSTRUMENTS = MACRO_INSTRUMENTS.filter((m) => m.liquid)

// ─── Controls ─────────────────────────────────────────────────────────────────

type Range = '3M' | '6M' | '1Y' | '2Y' | '5Y'
const RANGES: Range[] = ['3M', '6M', '1Y', '2Y', '5Y']

const CHART_TYPES: Array<{ type: ChartType; label: string; Icon: LucideIcon }> = [
  { type: 'candlestick', label: 'Candlestick', Icon: CandlestickIcon },
  { type: 'bars',        label: 'OHLC Bars',   Icon: BarChart2 },
  { type: 'heikin-ashi', label: 'Heikin Ashi', Icon: CandlestickIcon },
  { type: 'line',        label: 'Line',        Icon: LineIcon },
  { type: 'area',        label: 'Area',        Icon: AreaIcon },
  { type: 'baseline',    label: 'Baseline',    Icon: Layers },
]

const INDICATORS: Array<{ key: string; label: string; group: 'overlay' | 'panel' }> = [
  { key: 'ema20',     label: 'EMA 20',          group: 'overlay' },
  { key: 'ema50',     label: 'EMA 50',          group: 'overlay' },
  { key: 'ema200',    label: 'EMA 200',         group: 'overlay' },
  { key: 'sma50',     label: 'SMA 50',          group: 'overlay' },
  { key: 'sma200',    label: 'SMA 200',         group: 'overlay' },
  { key: 'bb',        label: 'Bollinger Bands', group: 'overlay' },
  { key: 'keltner',   label: 'Keltner',         group: 'overlay' },
  { key: 'donchian',  label: 'Donchian',        group: 'overlay' },
  { key: 'psar',      label: 'Parabolic SAR',   group: 'overlay' },
  { key: 'ichimoku',  label: 'Ichimoku',        group: 'overlay' },
  { key: 'rsi',       label: 'RSI (14)',        group: 'panel' },
  { key: 'macd',      label: 'MACD',            group: 'panel' },
  { key: 'stoch',     label: 'Stochastic',      group: 'panel' },
  { key: 'stochrsi',  label: 'Stoch RSI',       group: 'panel' },
  { key: 'cci',       label: 'CCI (20)',        group: 'panel' },
  { key: 'williamsr', label: 'Williams %R',     group: 'panel' },
]
// VWAP is deliberately absent: it needs meaningful volume, and continuous
// front-month futures and Yahoo FX series don't carry it usefully.

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

/** Quote text honouring the instrument's own convention — never bare dollars. */
function fmtLevel(entry: MacroInstrument | undefined, value: number | null | undefined): string {
  return formatInstrumentQuote(entry?.instrument, value) ?? '—'
}

// ─── Chart tab ────────────────────────────────────────────────────────────────

function ChartTab() {
  const [symbol, setSymbol] = useState('GC=F')
  const [range, setRange] = useState<Range>('1Y')
  const [chartType, setChartType] = useState<ChartType>('candlestick')
  const [active, setActive] = useState<Set<string>>(new Set(['ema50', 'ema200', 'rsi', 'macd']))

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
          onChange={(e) => setSymbol(e.target.value)}
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

      {/* Indicator chips */}
      <div className="flex flex-wrap gap-1.5">
        {INDICATORS.map(({ key, label, group }) => (
          <button
            key={key}
            onClick={() => toggleIndicator(key)}
            className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors',
              active.has(key)
                ? group === 'overlay'
                  ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                  : 'bg-violet-500/15 text-violet-400 border-violet-500/30'
                : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
          >
            {label}
          </button>
        ))}
      </div>

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
                patterns={patterns}
              />
            </div>
          ) : (
            <LiveUnavailable
              className="my-12"
              message={`No OHLCV history came back for ${symbol}. Macro contracts chart through the same Yahoo-first source as equities; front-month futures and thinner FX crosses can gap or return nothing over holidays.`}
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

// ─── Scanner tab ──────────────────────────────────────────────────────────────

interface ScannerRow {
  symbol: string
  name: string
  group: MacroGroup
  detailPath: string
  entry: MacroInstrument
  level: number | null
  rsi14: number | null
  vsSma50Pct: number | null
  overall: Signal | null
}

function ScannerTab() {
  const [group, setGroup] = useState<MacroGroup | 'All'>('All')

  const queries = useQueries({
    queries: SCANNER_INSTRUMENTS.map((m) => ({
      queryKey: ['security-ohlcv', m.symbol, '6M'],
      queryFn: () => fetch(`/live-data/security-ohlcv?symbol=${encodeURIComponent(m.symbol)}&range=6M`)
        .then((r) => r.json() as Promise<SecurityOhlcvResponse>),
      staleTime: 10 * 60 * 1000,
    })),
  })

  const loading = queries.some((q) => q.isLoading)
  const dataKey = queries.map((q) => q.dataUpdatedAt).join(',')

  const rows: ScannerRow[] = useMemo(() => {
    return SCANNER_INSTRUMENTS.map((m, i) => {
      const candles = queries[i].data?.candles ?? []
      const base = {
        symbol: m.symbol, name: m.name, group: m.group, detailPath: m.detailPath, entry: m,
      }
      if (candles.length < 30) {
        return { ...base, level: null, rsi14: null, vsSma50Pct: null, overall: null }
      }
      const closes = candles.map((c) => c.close)
      const last = closes[closes.length - 1]
      const rsiVals = rsi(closes, 14)
      const smaVals = sma(closes, 50)
      const sma50 = smaVals[smaVals.length - 1]
      return {
        ...base,
        level: last,
        rsi14: rsiVals[rsiVals.length - 1],
        vsSma50Pct: sma50 ? ((last - sma50) / sma50) * 100 : null,
        overall: computeSignalSummary(candles).overall,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey])

  const visible = group === 'All' ? rows : rows.filter((r) => r.group === group)
  const skipped = MACRO_INSTRUMENTS.length - SCANNER_INSTRUMENTS.length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['All', ...GROUPS] as Array<MacroGroup | 'All'>).map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={clsx('px-2.5 py-1 rounded text-xs font-medium border transition-colors',
              group === g
                ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                : 'text-text-muted border-border hover:text-text-secondary')}
          >
            {g}
          </button>
        ))}
        {loading && <Loader2 size={14} className="animate-spin text-text-muted" aria-hidden />}
      </div>

      {/* Never silently cap coverage — say what was left out and why. */}
      <p className="text-xs text-text-muted leading-relaxed">
        Scanning {SCANNER_INSTRUMENTS.length} of {MACRO_INSTRUMENTS.length} macro instruments over
        6 months of daily history. {skipped} thin {skipped === 1 ? 'market is' : 'markets are'} excluded —
        the delisted-ETF commodities (heating oil, coffee, cocoa, cotton, cattle, hogs) and the EM and
        cross FX pairs, whose series gap enough that a ranked RSI beside a liquid contract would read
        as comparable when it isn’t. All of them still chart on the Chart tab.
      </p>

      <div className="rounded-card border border-border bg-bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text-muted uppercase tracking-wider text-[10px]">
              <th className="px-4 py-2 text-left font-medium">Instrument</th>
              <th className="px-4 py-2 text-left font-medium">Area</th>
              <th className="px-4 py-2 text-right font-medium">Level</th>
              <th className="px-4 py-2 text-right font-medium">RSI 14</th>
              <th className="px-4 py-2 text-right font-medium">vs SMA 50</th>
              <th className="px-4 py-2 text-right font-medium">Signal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {visible.map((row) => {
              const cfg = row.overall ? SIGNAL_STYLES[row.overall] : null
              return (
                <tr key={row.symbol} className="hover:bg-bg-elevated/50 transition-colors">
                  <td className="px-4 py-2">
                    <Link href={row.detailPath} className="font-medium text-accent-blue hover:underline">
                      {row.name}
                    </Link>
                    <span className="ml-2 font-mono text-text-muted">{row.symbol}</span>
                  </td>
                  <td className="px-4 py-2 text-text-muted">{row.group}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-text-primary">
                    {fmtLevel(row.entry, row.level)}
                  </td>
                  <td className={clsx('px-4 py-2 text-right font-mono tabular-nums',
                    row.rsi14 == null ? 'text-text-muted'
                      : row.rsi14 >= 70 ? 'text-red-400'
                      : row.rsi14 <= 30 ? 'text-emerald-400'
                      : 'text-text-secondary')}>
                    {row.rsi14 == null ? '—' : row.rsi14.toFixed(1)}
                  </td>
                  <td className={clsx('px-4 py-2 text-right font-mono tabular-nums',
                    row.vsSma50Pct == null ? 'text-text-muted'
                      : row.vsSma50Pct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {row.vsSma50Pct == null ? '—' : `${row.vsSma50Pct >= 0 ? '+' : ''}${row.vsSma50Pct.toFixed(1)}%`}
                  </td>
                  <td className={clsx('px-4 py-2 text-right font-medium', cfg?.color ?? 'text-text-muted')}>
                    {cfg?.label ?? (loading ? '…' : 'no data')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'chart' | 'scanner'

export default function MacroTechnicalAnalysisPage() {
  return (
    <ModuleGate module="macro">
      <MacroTechnicalAnalysisInner />
    </ModuleGate>
  )
}

function MacroTechnicalAnalysisInner() {
  const [tab, setTab] = useState<Tab>('chart')

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

      <div className="flex gap-1 bg-bg-elevated p-1 rounded-lg w-fit">
        {(['chart', 'scanner'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx('px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              tab === t ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary')}
          >
            {t === 'chart' ? 'Chart' : 'Scanner'}
          </button>
        ))}
      </div>

      {tab === 'chart' ? <ChartTab /> : <ScannerTab />}

      <p className="text-[11px] text-text-muted leading-relaxed">
        Levels use each market’s own quoting convention — grains in cents per bushel, yields in
        percent, bond futures in points of par, FX at its pair’s precision. A macro instrument
        rendered as a dollar price is an error, not a rounding choice: corn at 482.25¢/bu shown as
        “$482” overstates it roughly a hundredfold.
      </p>
    </div>
  )
}
