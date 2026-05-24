'use client'

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts'
import { CHART_THEME } from '@/lib/utils/chart'

interface LineSeries {
  key: string
  label: string
  color: string
  strokeWidth?: number
  dashed?: boolean
}

interface LineChartProps {
  data: Record<string, unknown>[]
  series: LineSeries[]
  xKey: string
  xFormatter?: (value: unknown) => string
  yFormatter?: (value: unknown) => string
  tooltipFormatter?: (value: unknown, name: string) => [string, string]
  referenceLines?: { y: number; label?: string; color?: string }[]
  height?: number
  showGrid?: boolean
  showLegend?: boolean
}

export function LineChart({
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
}: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
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
          <Legend wrapperStyle={{ fontSize: '12px', color: CHART_THEME.axis }} />
        )}

        {referenceLines?.map((rl) => (
          <ReferenceLine
            key={rl.y}
            y={rl.y}
            stroke={rl.color ?? '#475569'}
            strokeDasharray="4 4"
          />
        ))}

        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={s.strokeWidth ?? 1.5}
            strokeDasharray={s.dashed ? '5 5' : undefined}
            dot={false}
            activeDot={{ r: 4, stroke: s.color, strokeWidth: 2, fill: '#1a1d26' }}
            isAnimationActive={false}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}
