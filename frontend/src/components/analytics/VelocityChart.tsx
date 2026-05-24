'use client'

import { useState } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import type { VelocityDataPoint } from '@/types/asset'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { CHART_THEME } from '@/lib/utils/chart'
import { formatCompact, formatNumber } from '@/lib/utils/format'

interface VelocityChartProps {
  data: VelocityDataPoint[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}

export function VelocityChart({ data, loading, error, onRetry }: VelocityChartProps) {
  return (
    <ChartContainer
      title="Transfer Velocity"
      subtitle="Daily transfer volume and unique active addresses"
      loading={loading}
      error={error}
      onRetry={onRetry}
      height={280}
    >
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />

          <XAxis
            dataKey="date"
            tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => {
              try { return format(parseISO(v as string), 'MMM dd') } catch { return '' }
            }}
            minTickGap={40}
          />

          <YAxis
            yAxisId="volume"
            tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatCompact(v as number)}
            width={60}
          />

          <YAxis
            yAxisId="count"
            orientation="right"
            tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatNumber(v as number)}
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
            formatter={(value, name) => {
              if (name === 'Transfer Volume') return [formatCompact(value as number), name]
              if (name === 'Transfer Count') return [formatNumber(value as number), name]
              if (name === 'Unique Addresses') return [formatNumber(value as number), name]
              return [String(value), String(name)]
            }}
            labelFormatter={(label) => {
              try { return format(parseISO(label as string), 'MMM dd, yyyy') } catch { return String(label) }
            }}
          />

          <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }} />

          <Bar
            yAxisId="volume"
            dataKey="transferVolume"
            name="Transfer Volume"
            fill="#3b82f6"
            fillOpacity={0.6}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />

          <Line
            yAxisId="count"
            type="monotone"
            dataKey="uniqueAddresses"
            name="Unique Addresses"
            stroke="#10b981"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}
