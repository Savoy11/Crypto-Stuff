'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { getMockPriceHistory, NOTABLE_EVENTS, getAssetLaunchDate, type PriceRange } from '@/lib/api/mock/mockPriceHistory'
import { CHART_THEME } from '@/lib/utils/chart'

interface PriceHistoryChartProps {
  assetId: string
  symbol: string
  pegTarget?: number  // undefined for L1 assets — disables peg reference line
}

const RANGES: PriceRange[] = ['1W', '1M', '3M', '1Y', 'MAX']

function fmtYAxis(v: unknown): string {
  if (typeof v !== 'number') return ''
  if (v >= 100000) return `$${Math.round(v / 1000)}k`
  if (v >= 10000)  return `$${Math.round(v / 1000)}k`
  if (v >= 1000)   return `$${v.toFixed(0)}`
  if (v >= 100)    return `$${v.toFixed(1)}`
  if (v >= 2)      return `$${v.toFixed(2)}`
  return `$${v.toFixed(4)}`
}

function fmtTooltipPrice(v: number): string {
  if (v >= 10000)  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  if (v >= 100)    return `$${v.toFixed(2)}`
  if (v >= 2)      return `$${v.toFixed(2)}`
  return `$${v.toFixed(4)}`
}

function fmtVolume(v: unknown) {
  if (typeof v !== 'number') return ''
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}B`
  return `$${v.toFixed(0)}M`
}

function fmtXAxis(val: unknown, range: PriceRange) {
  if (typeof val !== 'string') return ''
  try {
    const d = parseISO(val)
    if (range === '1W') return format(d, 'EEE dd')
    if (range === '1M') return format(d, 'MMM dd')
    if (range === '3M') return format(d, 'MMM dd')
    if (range === '1Y') return format(d, 'MMM yy')
    return format(d, 'MMM yy')
  } catch { return '' }
}

export function PriceHistoryChart({ assetId, symbol, pegTarget }: PriceHistoryChartProps) {
  const [range, setRange] = useState<PriceRange>('1Y')
  const isL1 = pegTarget === undefined

  const candles = useMemo(() => getMockPriceHistory(assetId, range), [assetId, range])
  const launchDate = getAssetLaunchDate(assetId)

  const latest = candles[candles.length - 1]
  const first  = candles[0]
  const priceChange = latest && first ? latest.close - first.open : 0
  const pricePct    = first?.open ? (priceChange / first.open) * 100 : 0

  const visibleEvents = useMemo(() => {
    if (!candles.length) return []
    const start = candles[0].date
    const end   = candles[candles.length - 1].date
    return NOTABLE_EVENTS.filter((e) => e.date >= start && e.date <= end)
  }, [candles])

  const yDomain = useMemo(() => {
    if (!candles.length) return [0.95, 1.05]
    const lows  = candles.map((c) => c.low)
    const highs = candles.map((c) => c.high)
    const minP  = Math.min(...lows)
    const maxP  = Math.max(...highs)
    const pad   = Math.max((maxP - minP) * 0.12, maxP * 0.01, 0.003)
    return [Math.max(0, +(minP - pad).toPrecision(6)), +(maxP + pad).toPrecision(6)]
  }, [candles])

  const isUp = priceChange >= 0

  const renderTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    if (!d) return null

    const changeVs = isL1
      ? ((d.close - d.open) / Math.max(d.open, 0.000001) * 100).toFixed(2)
      : ((d.close - 1.0) * 100).toFixed(3)
    const changePositive = isL1 ? d.close >= d.open : d.close >= 1.0
    const changeColor = changePositive ? '#10b981' : '#ef4444'

    return (
      <div className="bg-bg-card border border-border rounded-lg p-3 text-xs font-mono shadow-xl min-w-[170px]">
        <div className="text-text-muted mb-2">
          {label ? (() => { try { return format(parseISO(label as string), 'MMM dd, yyyy') } catch { return label } })() : ''}
        </div>
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Open</span>
            <span className="text-text-primary">{fmtTooltipPrice(d.open)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">High</span>
            <span className="text-emerald-400">{fmtTooltipPrice(d.high)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Low</span>
            <span className="text-red-400">{fmtTooltipPrice(d.low)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Close</span>
            <span className="text-text-primary font-bold">{fmtTooltipPrice(d.close)}</span>
          </div>
          <div className="border-t border-border pt-1 flex justify-between gap-4">
            <span className="text-text-muted">{isL1 ? 'vs Open' : 'vs Peg'}</span>
            <span style={{ color: changeColor }}>
              {changePositive ? '+' : ''}{changeVs}%
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Volume</span>
            <span className="text-text-secondary">{fmtVolume(d.volume)}</span>
          </div>
        </div>
      </div>
    )
  }, [isL1])

  return (
    <div className="rounded-xl border border-border bg-bg-card">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{symbol} Price History</span>
            <span className="text-xs text-text-muted font-mono">
              {isL1 ? 'vs USD' : 'vs USD Peg'}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-2xl font-mono font-bold text-text-primary tabular-nums">
              {latest ? fmtTooltipPrice(latest.close) : '—'}
            </span>
            <div className={`flex items-center gap-1 text-sm font-mono ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
              {isUp ? <TrendingUp size={14} /> : pricePct === 0 ? <Minus size={14} /> : <TrendingDown size={14} />}
              {isUp ? '+' : ''}{pricePct.toFixed(isL1 ? 1 : 3)}%
              <span className="text-text-muted text-xs ml-1">({range})</span>
            </div>
          </div>
          <div className="text-[10px] text-text-muted mt-0.5 font-mono">
            Data since {format(parseISO(launchDate), 'MMM d, yyyy')} · {candles.length.toLocaleString()} candles
          </div>
        </div>

        {/* Range selector */}
        <div className="flex items-center gap-1 bg-bg-elevated rounded-lg p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                range === r
                  ? 'bg-accent-blue text-white'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Price chart */}
      <div className="px-2 pt-3">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={candles} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`price-fill-${assetId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />

            <XAxis
              dataKey="date"
              tick={{ fill: CHART_THEME.axis, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => fmtXAxis(v, range)}
              minTickGap={50}
            />

            <YAxis
              domain={yDomain}
              tick={{ fill: CHART_THEME.axis, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtYAxis}
              width={isL1 ? 72 : 62}
            />

            <Tooltip content={renderTooltip} />

            {/* $1.00 peg line — only for pegged assets */}
            {!isL1 && pegTarget != null && (
              <ReferenceLine
                y={pegTarget}
                stroke="#475569"
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{ value: '$1.00', fill: '#64748b', fontSize: 10, position: 'insideTopRight' }}
              />
            )}

            {/* Notable stress events */}
            {visibleEvents.map((evt) => (
              <ReferenceLine
                key={evt.date}
                x={evt.date}
                stroke="#f59e0b"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
                label={{ value: evt.label, fill: '#f59e0b', fontSize: 9, angle: -90, position: 'insideTopLeft' }}
              />
            ))}

            <Area
              type="monotone"
              dataKey="close"
              name="Price"
              stroke="#3b82f6"
              strokeWidth={1.5}
              fill={`url(#price-fill-${assetId})`}
              dot={false}
              activeDot={{ r: 3, stroke: '#3b82f6', strokeWidth: 2, fill: '#1a1d26' }}
              isAnimationActive={false}
            />

            {range !== '1W' && range !== '1M' && (
              <Brush
                dataKey="date"
                height={20}
                stroke="#1e2433"
                fill="#0d1117"
                travellerWidth={6}
                tickFormatter={(v) => fmtXAxis(v, range)}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Volume chart */}
        <ResponsiveContainer width="100%" height={60}>
          <ComposedChart data={candles} margin={{ top: 2, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis hide />
            <Tooltip content={() => null} />
            <Bar
              dataKey="volume"
              name="Volume"
              fill="#3b82f6"
              opacity={0.35}
              maxBarSize={6}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="text-[10px] text-text-muted font-mono px-2 pb-3 -mt-1">VOLUME (USD)</div>
      </div>

      {/* Event legend */}
      {visibleEvents.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-3">
          {visibleEvents.map((evt) => (
            <div key={evt.date} className="flex items-center gap-1.5 text-[10px] text-amber-400/80 font-mono">
              <span className="w-3 border-t border-dashed border-amber-400/60" />
              {evt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
