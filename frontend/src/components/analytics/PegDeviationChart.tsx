'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import type { PegDataPoint } from '@/types/asset'
import type { TimeRange } from '@/types/api'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { CHART_THEME } from '@/lib/utils/chart'
import { formatBps } from '@/lib/utils/format'

interface PegDeviationChartProps {
  data: PegDataPoint[]
  assetSymbol?: string
  loading?: boolean
  error?: boolean
  onTimeRangeChange?: (range: TimeRange) => void
  timeRange?: TimeRange
  onRetry?: () => void
}

interface TooltipPayload {
  payload?: {
    timestamp: string
    price: number
    pegDeviation: number
    deviationBps?: number
  }
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: readonly TooltipPayload[] }) {
  if (!active || !payload?.length || !payload[0].payload) return null
  const d = payload[0].payload
  const bps = d.deviationBps ?? d.pegDeviation * 10000
  const isPositive = bps >= 0

  return (
    <div className="bg-bg-card border border-border rounded px-3 py-2 text-xs shadow-card-hover">
      <div className="text-text-muted mb-2 font-mono">
        {format(parseISO(d.timestamp), 'MMM dd, HH:mm')} UTC
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between gap-6">
          <span className="text-text-secondary">Price</span>
          <span className="font-mono text-text-primary">${d.price.toFixed(6)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-text-secondary">Peg Dev</span>
          <span className={`font-mono font-semibold ${isPositive ? 'text-amber-400' : 'text-red-400'}`}>
            {formatBps(bps)}
          </span>
        </div>
      </div>
    </div>
  )
}

function getPegDeviationFill(bps: number): string {
  const abs = Math.abs(bps)
  if (abs < 10) return 'rgba(16, 185, 129, 0.3)'
  if (abs < 50) return 'rgba(245, 158, 11, 0.3)'
  return 'rgba(239, 68, 68, 0.3)'
}

function getPegDeviationStroke(bps: number): string {
  const abs = Math.abs(bps)
  if (abs < 10) return '#10b981'
  if (abs < 50) return '#f59e0b'
  return '#ef4444'
}

export function PegDeviationChart({
  data,
  assetSymbol,
  loading,
  error,
  onTimeRangeChange,
  timeRange = '7d',
  onRetry,
}: PegDeviationChartProps) {
  const chartData = useMemo(() =>
    data.map((d) => ({
      ...d,
      deviationBps: d.pegDeviation * 10000,
      timestamp: d.timestamp,
    })),
    [data]
  )

  // Determine predominant deviation for color
  const avgBps = useMemo(() => {
    if (!chartData.length) return 0
    const sum = chartData.reduce((acc, d) => acc + Math.abs(d.deviationBps), 0)
    return sum / chartData.length
  }, [chartData])

  const fillColor = getPegDeviationFill(avgBps)
  const strokeColor = getPegDeviationStroke(avgBps)

  const xFormatter = useCallback((val: unknown) => {
    if (typeof val !== 'string') return ''
    try {
      return format(parseISO(val), timeRange === '1h' || timeRange === '24h' ? 'HH:mm' : 'MMM dd')
    } catch {
      return ''
    }
  }, [timeRange])

  const yFormatter = useCallback((val: unknown) => `${Number(val).toFixed(1)}bps`, [])

  const controls = onTimeRangeChange && (
    <DateRangePicker value={timeRange} onChange={onTimeRangeChange} />
  )

  return (
    <ChartContainer
      title={`Peg Deviation${assetSymbol ? ` — ${assetSymbol}` : ''}`}
      subtitle="Price vs $1.000 reference, in basis points"
      controls={controls}
      loading={loading}
      error={error}
      onRetry={onRetry}
      height={280}
    >
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="peg-dev-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={0.4} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />

          <XAxis
            dataKey="timestamp"
            tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={xFormatter}
            minTickGap={60}
          />

          <YAxis
            tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={yFormatter}
            width={62}
          />

          <Tooltip content={(props) => <CustomTooltip {...(props as unknown as { active?: boolean; payload?: readonly TooltipPayload[] })} />} />

          <ReferenceLine
            y={0}
            stroke="#475569"
            strokeDasharray="4 4"
            label={{ value: 'Peg', fill: '#475569', fontSize: 10, position: 'right' }}
          />

          <Area
            type="monotone"
            dataKey="deviationBps"
            name="Peg Deviation (bps)"
            stroke={strokeColor}
            strokeWidth={1.5}
            fill="url(#peg-dev-gradient)"
            dot={false}
            activeDot={{ r: 4, stroke: strokeColor, strokeWidth: 2, fill: '#1a1d26' }}
            isAnimationActive={false}
          />

          <Brush
            dataKey="timestamp"
            height={20}
            stroke="#1e2433"
            fill="#12141a"
            travellerWidth={6}
            tickFormatter={xFormatter}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-text-muted">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-400" />
          <span>&lt;10bps (tight)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-400" />
          <span>10–50bps (warn)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-red-400" />
          <span>&gt;50bps (alert)</span>
        </div>
      </div>
    </ChartContainer>
  )
}
