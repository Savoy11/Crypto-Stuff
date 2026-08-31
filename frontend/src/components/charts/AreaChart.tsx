'use client'

import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts'
import type { ChartTooltipFormatter } from './tooltipTypes'
import { CHART_THEME } from '@/lib/utils/chart'
import { type ReactNode } from 'react'

interface DataSeries {
  key: string
  label: string
  color: string
  fillOpacity?: number
}

interface AreaChartProps {
  data: Record<string, unknown>[]
  series: DataSeries[]
  xKey: string
  xFormatter?: (value: unknown) => string
  yFormatter?: (value: unknown) => string
  tooltipFormatter?: ChartTooltipFormatter
  referenceLines?: { y: number; label?: string; color?: string }[]
  height?: number
  showGrid?: boolean
  showLegend?: boolean
  gradientId?: string
}

export function AreaChart({
  data,
  series,
  xKey,
  xFormatter,
  yFormatter,
  tooltipFormatter,
  referenceLines,
  height = 240,
  showGrid = true,
  showLegend = false,
  gradientId = 'area-gradient',
}: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        {showGrid && (
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />
        )}

        <XAxis
          dataKey={xKey}
          tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={xFormatter}
          minTickGap={40}
        />

        <YAxis
          tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={yFormatter}
          width={60}
        />

        <Tooltip
          contentStyle={{
            backgroundColor: CHART_THEME.tooltip.background,
            border: `1px solid ${CHART_THEME.tooltip.border}`,
            borderRadius: '6px',
            fontSize: '12px',
            color: CHART_THEME.tooltip.text,
          }}
          formatter={tooltipFormatter}
        />

        {showLegend && (
          <Legend
            wrapperStyle={{ fontSize: '12px', color: CHART_THEME.axis }}
          />
        )}

        {referenceLines?.map((rl) => (
          <ReferenceLine
            key={rl.y}
            y={rl.y}
            stroke={rl.color ?? '#475569'}
            strokeDasharray="4 4"
            label={rl.label ? { value: rl.label, fill: '#475569', fontSize: 11 } : undefined}
          />
        ))}

        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={1.5}
            fill={`url(#${gradientId}-${i})`}
            fillOpacity={s.fillOpacity ?? 1}
            dot={false}
            activeDot={{ r: 4, stroke: s.color, strokeWidth: 2, fill: '#1a1d26' }}
            isAnimationActive={false}
          />
        ))}
      </RechartsAreaChart>
    </ResponsiveContainer>
  )
}
