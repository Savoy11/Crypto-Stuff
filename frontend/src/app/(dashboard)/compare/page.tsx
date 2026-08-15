'use client'

import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { clsx } from 'clsx'
import { GitCompareArrows, Search, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { LineChart } from '@/components/charts/LineChart'
import { LiveUnavailable } from '@/components/ui/LiveUnavailable'
import { EQUITY_CATALOG, SECTOR_INFO, getEquity } from '@/lib/data/equityCatalog'
import { FUND_CATALOG, getFund } from '@/lib/data/fundCatalog'
import { ASSET_CATALOG } from '@/lib/data/assetCatalog'
import { CHART_COLORS, STALE_TIME_LONG } from '@/lib/constants'
import { formatCompact } from '@/lib/utils/format'
import {
  normalizeToCommonStart,
  windowStats,
  correlationMatrix,
  toDailyCloses,
  commonStartTime,
  type ChartPoint,
  type NamedSeries,
} from '@/lib/utils/compareStats'
import type { SecurityChartResponse } from '@/app/live-data/security-chart/route'
import { FundOverlapSection } from '@/components/markets/FundOverlapSection'

// Cross-module comparison of 2–6 stocks, ETFs, funds AND crypto: a normalized
// growth-of-100 chart, computed window performance (return / volatility /
// drawdown / Sharpe from the live series), a return-correlation matrix, and a
// labeled reference-fundamentals table. Selection + range are URL-deep-linkable.

type Kind = 'stock' | 'fund' | 'crypto'
interface Option { symbol: string; name: string; kind: Kind; id?: string }

const OPTIONS: Option[] = [
  ...EQUITY_CATALOG.map((e) => ({ symbol: e.symbol, name: e.name, kind: 'stock' as const })),
  ...FUND_CATALOG.map((f) => ({ symbol: f.symbol, name: f.name, kind: 'fund' as const })),
  ...ASSET_CATALOG.map((a) => ({ symbol: a.symbol, name: a.name, kind: 'crypto' as const, id: a.id })),
]
const OPTION_BY_SYMBOL = new Map<string, Option>()
for (const o of OPTIONS) if (!OPTION_BY_SYMBOL.has(o.symbol)) OPTION_BY_SYMBOL.set(o.symbol, o)
// Case-insensitive lookup for URL deep links: several crypto symbols are
// mixed-case in the catalog (USDe, lisUSD, …) and would otherwise round-trip
// into the URL but silently drop on reload (review finding).
const OPTION_BY_UPPER = new Map<string, Option>()
for (const o of OPTIONS) if (!OPTION_BY_UPPER.has(o.symbol.toUpperCase())) OPTION_BY_UPPER.set(o.symbol.toUpperCase(), o)

const MAX_SYMBOLS = 6
const DEFAULT_SYMBOLS = ['VOO', 'QQQ']

const RANGES = [
  { value: '1mo', label: '1M', days: '30' },
  { value: '3mo', label: '3M', days: '90' },
  { value: '6mo', label: '6M', days: '180' },
  { value: '1y', label: '1Y', days: '365' },
  { value: '5y', label: '5Y', days: '1825' },
  { value: 'max', label: 'MAX', days: 'max' },
] as const
type Range = (typeof RANGES)[number]['value']
const RANGE_VALUES = RANGES.map((r) => r.value) as readonly string[]

const color = (i: number) => CHART_COLORS[i % CHART_COLORS.length]

interface CryptoChartResponse { ok: boolean; candles?: Array<{ date: string; close: number }> }

/**
 * Fetch a symbol's close history as {t(ms), close}[], from the right source.
 * Every series is snapped to daily closes on UTC-date boundaries
 * (toDailyCloses) — crypto arrives midnight-stamped, equity bars carry
 * market-open epochs, and CoinGecko returns hourly points on short ranges;
 * without the shared date grid, cross-class rows never align (null
 * correlations, fragmented chart) and hourly points break annualization.
 */
async function fetchPoints(opt: Option, range: (typeof RANGES)[number]): Promise<ChartPoint[]> {
  if (opt.kind === 'crypto') {
    const r = await fetch(`/live-data/chart?id=${encodeURIComponent(opt.id ?? opt.symbol.toLowerCase())}&days=${range.days}`)
    const j = (await r.json()) as CryptoChartResponse
    if (!j.ok || !j.candles) return []
    return toDailyCloses(j.candles.map((c) => ({ t: new Date(c.date).getTime(), close: c.close })))
  }
  const r = await fetch(`/live-data/security-chart?symbol=${encodeURIComponent(opt.symbol)}&range=${range.value}`)
  const j = (await r.json()) as SecurityChartResponse
  return toDailyCloses(j.chart?.points ?? [])
}

const STAT_LABELS = ['Type', 'Sector', 'Market cap', 'P/E (TTM)', 'Dividend yield', 'Beta (5Y)', 'Expense ratio']

function statRows(symbol: string): Array<[string, string]> {
  const e = getEquity(symbol)
  if (e) {
    return [
      ['Type', 'Stock'],
      ['Sector', SECTOR_INFO[e.sector].label],
      ['Market cap', formatCompact(e.marketCapB * 1e9)],
      ['P/E (TTM)', e.peRatio != null ? String(e.peRatio) : '—'],
      ['Dividend yield', e.dividendYieldPct != null ? `${e.dividendYieldPct}%` : 'None'],
      ['Beta (5Y)', e.beta.toFixed(2)],
      ['Expense ratio', '—'],
    ]
  }
  const f = getFund(symbol)
  if (f) {
    return [
      ['Type', f.type === 'etf' ? 'ETF' : 'Mutual fund'],
      ['Sector', '—'],
      ['Market cap', '—'],
      ['P/E (TTM)', '—'],
      ['Dividend yield', f.yieldPct != null ? `${f.yieldPct}%` : '—'],
      ['Beta (5Y)', '—'],
      ['Expense ratio', `${f.expenseRatioPct}%`],
    ]
  }
  if (OPTION_BY_SYMBOL.get(symbol)?.kind === 'crypto') {
    return [['Type', 'Crypto'], ['Sector', '—'], ['Market cap', '—'], ['P/E (TTM)', '—'], ['Dividend yield', '—'], ['Beta (5Y)', '—'], ['Expense ratio', '—']]
  }
  return []
}

const pct = (v: number, dp = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`
const signClass = (v: number) => (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-text-secondary')

function corrCellStyle(v: number | null): CSSProperties {
  if (v === null) return {}
  const a = Math.min(Math.abs(v), 1) * 0.5
  return { backgroundColor: v >= 0 ? `rgba(16,185,129,${a})` : `rgba(239,68,68,${a})` }
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="h-64" />}>
      <CompareInner />
    </Suspense>
  )
}

function CompareInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [symbols, setSymbols] = useState<string[]>(() => {
    const raw = searchParams.get('symbols')
    // Case-insensitive resolve to the catalog's canonical casing, deduped.
    const parsed = raw
      ? Array.from(new Set(
          raw.split(',')
            .map((s) => OPTION_BY_UPPER.get(s.trim().toUpperCase())?.symbol)
            .filter((s): s is string => !!s),
        )).slice(0, MAX_SYMBOLS)
      : []
    return parsed.length ? parsed : DEFAULT_SYMBOLS
  })
  const [range, setRange] = useState<Range>(() => {
    const raw = searchParams.get('range')
    return raw && RANGE_VALUES.includes(raw) ? (raw as Range) : '1y'
  })
  const [search, setSearch] = useState('')

  // Keep the URL in sync so a comparison is shareable/bookmarkable.
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('symbols', symbols.join(','))
    params.set('range', range)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [symbols, range, router])

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q || symbols.length >= MAX_SYMBOLS) return []
    return OPTIONS
      .filter((o) => !symbols.includes(o.symbol) && (o.symbol.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [search, symbols])

  const rangeObj = RANGES.find((r) => r.value === range)!
  const chartQueries = useQueries({
    queries: symbols.map((symbol) => {
      const opt = OPTION_BY_SYMBOL.get(symbol)
      return {
        queryKey: ['compare-chart', opt?.kind, opt?.id ?? symbol, range],
        queryFn: () => (opt ? fetchPoints(opt, rangeObj) : Promise.resolve([] as ChartPoint[])),
        staleTime: STALE_TIME_LONG,
      }
    }),
  })

  const dataKey = chartQueries.map((q) => q.dataUpdatedAt).join(',')
  const series: NamedSeries[] = useMemo(
    () => symbols.map((s, i) => ({ symbol: s, points: chartQueries[i]?.data ?? [] })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbols.join(','), dataKey],
  )

  const chartData = useMemo(() => normalizeToCommonStart(series), [series])
  // Symbols the user asked for that returned no usable history. The chart's
  // LiveUnavailable only fires when EVERY series is empty, and crypto is keyless
  // so it practically always resolves — meaning a stock in a mixed comparison
  // used to vanish from the legend with no banner and a bare '—' in the table.
  // Partial coverage has to be named, not inferred from an absence (D-12 class).
  const missing = useMemo(
    () => symbols.filter((s) => !chartData.present.includes(s)),
    [symbols, chartData.present],
  )
  // Stats over the SAME common-start window the chart is rebased to — otherwise
  // series with different history depths report non-comparable "window" figures
  // side by side (review finding).
  const perf = useMemo(() => {
    const start = commonStartTime(series)
    return series.map((s) => ({
      symbol: s.symbol,
      stats: windowStats(start != null ? s.points.filter((p) => p.t >= start) : s.points),
    }))
  }, [series])
  const corr = useMemo(() => correlationMatrix(series.filter((s) => s.points.length > 1)), [series])

  const loading = chartQueries.some((q) => q.isLoading)
  const anyStats = perf.some((p) => p.stats !== null)

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <GitCompareArrows className="h-6 w-6 text-accent-blue" aria-hidden />
        <PageHeader
          title="Compare"
          subtitle="Side-by-side stocks, funds and crypto — normalized performance, risk stats, correlation"
          description="Pick 2–6 stocks, ETFs, mutual funds, or coins. The chart normalizes every series to 100 at the common start date; the stats below are computed from the live price series over the selected window."
          details={[
            { label: 'Performance stats', text: 'Return, volatility, drawdown and Sharpe are derived from the fetched history over the current range.' },
            { label: 'Fundamentals', text: 'The reference table shows approximate catalog values, labeled per the suite convention.' },
          ]}
        />
      </div>

      <SourceLine id="compare" />

      {/* Selection row */}
      <div className="flex flex-wrap items-center gap-2">
        {symbols.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-mono font-medium"
            style={{ borderColor: `${color(i)}55`, color: color(i), backgroundColor: `${color(i)}14` }}>
            {s}
            <button onClick={() => setSymbols(symbols.filter((x) => x !== s))} aria-label={`Remove ${s}`} className="opacity-70 hover:opacity-100">
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        {symbols.length < MAX_SYMBOLS && (
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Add stock, fund or coin…"
              className="w-56 rounded-lg border border-border bg-bg-elevated pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue/50 focus:outline-none"
            />
            {matches.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-72 rounded-lg border border-border bg-bg-card shadow-xl shadow-black/40 z-20 overflow-hidden">
                {matches.map((o) => (
                  <button key={`${o.kind}-${o.symbol}`} onClick={() => { setSymbols([...symbols, o.symbol]); setSearch('') }}
                    className="w-full flex items-center justify-between px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors">
                    <span className="truncate"><span className="font-mono font-medium">{o.symbol}</span> — {o.name}</span>
                    <span className="text-[10px] text-text-muted ml-2 capitalize">{o.kind}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="ml-auto flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5">
          {RANGES.map(({ value, label }) => (
            <button key={value} onClick={() => setRange(value)}
              className={clsx('px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-colors',
                range === value ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-card border border-border bg-bg-card p-4">
        <h2 className="text-sm font-medium text-text-secondary mb-3">Growth of 100 — common start date</h2>
        {loading ? (
          <div className="h-64 animate-shimmer bg-shimmer-gradient bg-[length:200%_100%] rounded" />
        ) : chartData.rows.length > 1 ? (
          <LineChart
            data={chartData.rows}
            series={chartData.present.map((s) => ({ key: s, label: s, color: color(symbols.indexOf(s)) }))}
            xKey="t"
            xFormatter={(v) => new Date(Number(v)).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
            yFormatter={(v) => String(v)}
            tooltipFormatter={(v, name) => [`${v}`, name]}
            height={320}
            showLegend
            connectNulls
          />
        ) : (
          <LiveUnavailable message="No live history source is reachable for the selected symbols. Crypto history is keyless (CoinGecko); stock, fund and macro history now needs a Tiingo or FMP key, since the keyless source was withdrawn on terms grounds." />
        )}
        {!loading && chartData.rows.length > 1 && missing.length > 0 && (
          <p className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-300">
            <span className="font-medium">Charted {chartData.present.length} of {symbols.length}.</span>{' '}
            No history returned for{' '}
            <span className="font-mono">{missing.join(', ')}</span>
            {missing.every((s) => OPTION_BY_SYMBOL.get(s)?.kind !== 'crypto')
              ? ' — stock and fund history needs a Tiingo or FMP key on the Integrations page.'
              : ' — the series is missing or too short to align over this window.'}{' '}
            Everything below is computed over the remaining {chartData.present.length}, so the
            correlation matrix and window statistics do not describe the full selection.
          </p>
        )}
      </div>

      {/* Computed performance over the window */}
      {anyStats && (
        <div className="rounded-card border border-border bg-bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Performance <span className="normal-case">(this window)</span></th>
                {symbols.map((s, i) => (
                  <th key={s} className="px-4 py-2.5 text-right text-xs font-mono font-semibold" style={{ color: color(i) }}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-mono tabular-nums">
              <tr>
                <td className="px-4 py-2.5 text-text-muted font-sans">Total return</td>
                {perf.map((p) => (
                  <td key={p.symbol} className={clsx('px-4 py-2.5 text-right', p.stats ? signClass(p.stats.totalReturnPct) : 'text-text-muted')}>
                    {p.stats ? pct(p.stats.totalReturnPct) : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-text-muted font-sans">Volatility (ann.)</td>
                {perf.map((p) => (
                  <td key={p.symbol} className="px-4 py-2.5 text-right text-text-secondary">{p.stats ? `${p.stats.volPct.toFixed(1)}%` : '—'}</td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-text-muted font-sans">Max drawdown</td>
                {perf.map((p) => (
                  <td key={p.symbol} className="px-4 py-2.5 text-right text-red-400">{p.stats ? `-${p.stats.maxDrawdownPct.toFixed(1)}%` : '—'}</td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-text-muted font-sans">Sharpe (ann.)</td>
                {perf.map((p) => (
                  <td key={p.symbol} className="px-4 py-2.5 text-right text-text-secondary">{p.stats?.sharpe != null ? p.stats.sharpe.toFixed(2) : '—'}</td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-text-muted border-t border-border/60">
            Derived from date-aligned daily closes over the common window; annualization matches per-series bar spacing (daily/weekly/monthly). Sharpe uses a 0% risk-free rate.
          </p>
        </div>
      )}

      {/* Return correlation matrix */}
      {corr.symbols.length >= 2 && (
        <div className="rounded-card border border-border bg-bg-card overflow-x-auto">
          <h2 className="px-4 pt-4 pb-2 text-sm font-medium text-text-secondary">Return correlation <span className="text-text-muted font-normal">— date-aligned closes over the window</span></h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-medium text-text-muted"></th>
                {corr.symbols.map((s) => (
                  <th key={s} className="px-4 py-2 text-right text-xs font-mono font-semibold text-text-secondary">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {corr.symbols.map((rowSym, i) => (
                <tr key={rowSym}>
                  <td className="px-4 py-2 text-xs font-semibold text-text-secondary">{rowSym}</td>
                  {corr.matrix[i].map((v, j) => (
                    <td key={j} className="px-4 py-2 text-right text-text-primary" style={corrCellStyle(v)}>
                      {v === null ? '—' : v.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Holdings overlap — funds only; a stock has no portfolio to compare. */}
      <FundOverlapSection symbols={symbols.filter((s) => OPTION_BY_SYMBOL.get(s)?.kind === 'fund')} />

      {/* Reference fundamentals */}
      <div className="rounded-card border border-border bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Stat <span className="normal-case">(reference)</span></th>
              {symbols.map((s, i) => (
                <th key={s} className="px-4 py-2.5 text-right text-xs font-mono font-semibold" style={{ color: color(i) }}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {STAT_LABELS.map((label, rowIdx) => (
              <tr key={label}>
                <td className="px-4 py-2.5 text-text-muted">{label}</td>
                {symbols.map((s) => (
                  <td key={s} className="px-4 py-2.5 text-right font-mono tabular-nums text-text-secondary">
                    {statRows(s)[rowIdx]?.[1] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
