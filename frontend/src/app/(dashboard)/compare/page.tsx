'use client'

import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { GitCompareArrows, Search, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { LineChart } from '@/components/charts/LineChart'
import { LiveUnavailable } from '@/components/ui/LiveUnavailable'
import { EQUITY_CATALOG, SECTOR_INFO, getEquity } from '@/lib/data/equityCatalog'
import { FUND_CATALOG, getFund } from '@/lib/data/fundCatalog'
import { CHART_COLORS, STALE_TIME_LONG } from '@/lib/constants'
import { formatCompact } from '@/lib/utils/format'
import type { SecurityChartResponse } from '@/app/live-data/security-chart/route'

// Side-by-side comparison of 2–4 stocks/funds: normalized price chart plus a
// key-stats table (reference fundamentals, labeled). Morningstar-style.

interface Option { symbol: string; name: string; kind: 'stock' | 'fund' }

const OPTIONS: Option[] = [
  ...EQUITY_CATALOG.map((e) => ({ symbol: e.symbol, name: e.name, kind: 'stock' as const })),
  ...FUND_CATALOG.map((f) => ({ symbol: f.symbol, name: f.name, kind: 'fund' as const })),
]

const RANGES = [
  { value: '1y', label: '1Y' },
  { value: '5y', label: '5Y' },
  { value: 'max', label: 'MAX' },
] as const
type Range = typeof RANGES[number]['value']

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
  return []
}

export default function ComparePage() {
  const [symbols, setSymbols] = useState<string[]>(['VOO', 'QQQ'])
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<Range>('1y')

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q || symbols.length >= 4) return []
    return OPTIONS
      .filter((o) => !symbols.includes(o.symbol) && (o.symbol.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [search, symbols])

  const chartQueries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['security-chart', symbol, range],
      queryFn: () => fetch(`/live-data/security-chart?symbol=${encodeURIComponent(symbol)}&range=${range}`)
        .then((r) => r.json() as Promise<SecurityChartResponse>),
      staleTime: STALE_TIME_LONG,
    })),
  })

  // Normalize each series to 100 at the shared start
  const chartData = useMemo(() => {
    const series = chartQueries
      .map((q, i) => ({ symbol: symbols[i], points: q.data?.chart?.points ?? [] }))
      .filter((s) => s.points.length > 1)
    if (series.length === 0) return { rows: [], present: [] as string[] }
    const start = Math.max(...series.map((s) => s.points[0].t))
    const rows = new Map<number, Record<string, number>>()
    for (const s of series) {
      const visible = s.points.filter((p) => p.t >= start)
      const base = visible[0]?.close
      if (!base) continue
      for (const p of visible) {
        const row = rows.get(p.t) ?? {}
        row[s.symbol] = Math.round((p.close / base) * 1000) / 10
        rows.set(p.t, row)
      }
    }
    return {
      rows: Array.from(rows.entries()).sort((a, b) => a[0] - b[0]).map(([t, vals]) => ({ t, ...vals })),
      present: series.map((s) => s.symbol),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, range, chartQueries.map((q) => q.dataUpdatedAt).join(',')])

  const loading = chartQueries.some((q) => q.isLoading)
  const STAT_LABELS = ['Type', 'Sector', 'Market cap', 'P/E (TTM)', 'Dividend yield', 'Beta (5Y)', 'Expense ratio']

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <GitCompareArrows className="h-6 w-6 text-accent-blue" aria-hidden />
        <PageHeader
          title="Compare"
          subtitle="Side-by-side stocks and funds — normalized performance plus key stats"
          description="Pick 2–4 stocks, ETFs, or mutual funds. The chart normalizes every series to 100 at the common start date so different price levels compare directly; the table shows reference fundamentals."
          details={[
            { label: 'Fundamentals', text: 'Stats are approximate reference values from the catalogs, labeled per the suite convention.' },
          ]}
        />
      </div>

      {/* Selection row */}
      <div className="flex flex-wrap items-center gap-2">
        {symbols.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-mono font-medium"
            style={{ borderColor: `${CHART_COLORS[i]}55`, color: CHART_COLORS[i], backgroundColor: `${CHART_COLORS[i]}14` }}>
            {s}
            <button onClick={() => setSymbols(symbols.filter((x) => x !== s))} aria-label={`Remove ${s}`} className="opacity-70 hover:opacity-100">
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        {symbols.length < 4 && (
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Add symbol…"
              className="w-52 rounded-lg border border-border bg-bg-elevated pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue/50 focus:outline-none"
            />
            {matches.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-72 rounded-lg border border-border bg-bg-card shadow-xl shadow-black/40 z-20 overflow-hidden">
                {matches.map((o) => (
                  <button key={o.symbol} onClick={() => { setSymbols([...symbols, o.symbol]); setSearch('') }}
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
            series={chartData.present.map((s, i) => ({ key: s, label: s, color: CHART_COLORS[symbols.indexOf(s)] ?? CHART_COLORS[i] }))}
            xKey="t"
            xFormatter={(v) => new Date(Number(v)).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
            yFormatter={(v) => String(v)}
            tooltipFormatter={(v, name) => [`${v}`, name]}
            height={320}
            showLegend
          />
        ) : (
          <LiveUnavailable message="No live history source is reachable for the selected symbols right now — the comparison chart appears once Yahoo Finance (or FMP with a key) responds." />
        )}
      </div>

      {/* Stats table */}
      <div className="rounded-card border border-border bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Stat <span className="normal-case">(reference)</span></th>
              {symbols.map((s, i) => (
                <th key={s} className="px-4 py-2.5 text-right text-xs font-mono font-semibold" style={{ color: CHART_COLORS[i] }}>{s}</th>
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
