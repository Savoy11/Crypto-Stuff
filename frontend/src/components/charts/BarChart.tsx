'use client'

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts'
import { CHART_THEME } from '@/lib/utils/chart'

interface BarSeries {
  key: string
  label: string
  color: string
  colorFn?: (value: unknown, index: number) => string
}

interface BarChartProps {
  data: Record<string, unknown>[]
  series: BarSeries[]
  xKey: string
  xFormatter?: (value: unknown) => string
  yFormatter?: (value: unknown) => string
  tooltipFormatter?: (value: unknown, name: string) => [string, string]
  height?: number
  showGrid?: boolean
  showLegend?: boolean
  layout?: 'horizontal' | 'vertical'
  barSize?: number
}

export function BarChart({
  data,
  series,
  xKey,
  xFormatter,
  yFormatter,
  tooltipFormatter,
  height = 240,
  showGrid = true,
  showLegend = false,
  layout = 'horizontal',
  barSize,
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout={layout}
        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
        barSize={barSize}
      >
        {showGrid && (
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={layout === 'vertical'} horizontal={layout === 'horizontal'} />
        )}

        {layout === 'horizontal' ? (
          <>
            <XAxis
              dataKey={xKey}
              tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={xFormatter}
            />
            <YAxis
              tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={yFormatter}
              width={60}
            />
          </>
        ) : (
          <>
            <XAxis
              type="number"
              tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={yFormatter}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              width={80}
              tickFormatter={xFormatter}
            />
          </>
        )}

        <Tooltip
          contentStyle={{
            backgroundColor: CHART_THEME.tooltip.background,
            border: `1px solid ${CHART_THEME.tooltip.border}`,
            borderRadius: '6px',
            fontSize: '12px',
            color: CHART_THEME.tooltip.text,
          }}
          formatter={tooltipFormatter}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
        />

        {showLegend && (
          <Legend wrapperStyle={{ fontSize: '12px', color: CHART_THEME.axis }} />
        )}

        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {s.colorFn
              ? data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={s.colorFn!(entry[s.key], index)} />
                ))
              : null}
          </Bar>
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
