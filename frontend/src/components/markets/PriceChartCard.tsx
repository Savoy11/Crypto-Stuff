'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { AreaChart } from '@/components/charts/AreaChart'
import { LiveUnavailable } from '@/components/ui/LiveUnavailable'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'
import { formatCurrency } from '@/lib/utils/format'
import { STALE_TIME_LONG } from '@/lib/constants'
import type { SecurityChartResponse } from '@/app/live-data/security-chart/route'
import type { ChartRange } from '@/lib/api/live/marketData'

// Price history card shared by the equities and funds modules.
// Fetches /live-data/security-chart and renders a range-selectable area chart.

const RANGES: Array<{ value: ChartRange; label: string }> = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y',  label: '1Y' },
  { value: '5y',  label: '5Y' },
  { value: 'max', label: 'MAX' },
]

export function useSecurityChart(symbol: string, range: ChartRange) {
  return useQuery<SecurityChartResponse>({
    queryKey: ['security-chart', symbol, range],
    queryFn: () => fetch(`/live-data/security-chart?symbol=${encodeURIComponent(symbol)}&range=${range}`).then((r) => r.json()),
    staleTime: STALE_TIME_LONG,
    enabled: !!symbol,
  })
}

export function PriceChartCard({ symbol, valueFormat = 'usd' }: {
  symbol: string
  /**
   * 'usd' (default) renders $-prefixed axis/tooltip values — right for
   * stocks and funds. 'plain' renders bare numbers — for FX rates and
   * yield indices, where a dollar sign would mislabel the unit.
   */
  valueFormat?: 'usd' | 'plain'
}) {
  const [range, setRange] = useState<ChartRange>('1y')
  const { data, isLoading } = useSecurityChart(symbol, range)
  const fmt = (v: number, decimals?: number) => valueFormat === 'usd'
    ? formatCurrency(v, decimals)
    : v.toLocaleString(undefined, { maximumFractionDigits: decimals ?? (v >= 100 ? 2 : 4) })

  const points = (data?.chart?.points ?? []).map((p) => ({ t: p.t, close: p.close }))
  const first = points[0]?.close
  const last = points[points.length - 1]?.close
  const positive = first != null && last != null && last >= first
  const color = positive ? '#10b981' : '#ef4444'

  const xFormat = (value: unknown) => {
    const t = Number(value)
    if (!isFinite(t)) return ''
    return format(new Date(t), range === '1mo' || range === '3mo' ? 'MMM d' : range === 'max' || range === '5y' ? 'yyyy' : 'MMM yy')
  }

  return (
    <div className="rounded-card border border-border bg-bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-text-secondary">Price History</h2>
        <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5">
          {RANGES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={clsx('px-2 py-1 rounded text-[11px] font-mono font-medium transition-colors',
                range === value ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton className="h-60 w-full" />
      ) : data?.ok && points.length > 0 ? (
        <>
          <AreaChart
            data={points}
            series={[{ key: 'close', label: symbol, color }]}
            xKey="t"
            xFormatter={xFormat}
            yFormatter={(v) => fmt(Number(v), Number(v) >= 1000 ? 0 : 2)}
            tooltipFormatter={(v) => [fmt(Number(v)), symbol]}
            height={260}
            gradientId={`chart-${symbol}`}
          />
          {first != null && last != null && (
            <p className="mt-2 text-[11px] text-text-muted text-center font-mono">
              {fmt(first)} → {fmt(last)}
              {' '}({positive ? '+' : ''}{(((last - first) / first) * 100).toFixed(2)}% over range)
            </p>
          )}
        </>
      ) : (
        <LiveUnavailable
          message="No live history source is reachable. Price history now needs an API key — the keyless source was withdrawn on terms grounds. Add a Tiingo or FMP key on the Integrations page."
        />
      )}
    </div>
  )
}

// ─── 52-week range indicator ──────────────────────────────────────────────────

export function FiftyTwoWeekBar({ symbol, price }: { symbol: string; price: number | null }) {
  const { data } = useSecurityChart(symbol, '1y')
  const chart = data?.chart
  const high = chart?.fiftyTwoWeekHigh ?? (chart?.points.length ? Math.max(...chart.points.map((p) => p.close)) : null)
  const low = chart?.fiftyTwoWeekLow ?? (chart?.points.length ? Math.min(...chart.points.map((p) => p.close)) : null)

  if (price == null || high == null || low == null || high <= low) return null
  const position = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100))

  return (
    <div className="rounded-card border border-border bg-bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-text-secondary">52-Week Range</h2>
        <span className="text-[11px] font-mono text-text-muted">{position.toFixed(0)}% of range</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-bg-elevated">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-red-500/50 via-amber-400/50 to-emerald-500/50 w-full" />
        <div
          className="absolute -top-[3px] size-3 rounded-full bg-text-primary border-2 border-bg-card shadow"
          style={{ left: `calc(${position}% - 6px)` }}
          aria-label={`Current price is at ${position.toFixed(0)}% of the 52-week range`}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-mono text-text-muted">
        <span>{formatCurrency(low)}</span>
        <span className="text-text-secondary">{formatCurrency(price)}</span>
        <span>{formatCurrency(high)}</span>
      </div>
    </div>
  )
}
