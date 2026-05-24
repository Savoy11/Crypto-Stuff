'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import type { TimeRange } from '@/types/api'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { CHART_COLORS, CHART_THEME } from '@/lib/utils/chart'
import { formatBps } from '@/lib/utils/format'
import { useMultiAssetPegHistory } from '@/hooks/useMarketData'
import { MOCK_ASSETS } from '@/lib/api/mock/mockAssets'

const TOP_STABLE_IDS = ['usdc', 'usdt', 'dai', 'frax', 'lusd']

export function PegStabilityChart() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')

  const { data: pegHistories, isLoading, isError, refetch } = useMultiAssetPegHistory(TOP_STABLE_IDS, timeRange)

  // Merge all timeseries into a single flat array keyed by timestamp
  const chartData = useMemo(() => {
    if (!pegHistories) return []

    const tsMap = new Map<string, Record<string, number>>()

    TOP_STABLE_IDS.forEach((id) => {
      const history = pegHistories[id] ?? []
      history.forEach((point) => {
        const key = point.timestamp
        if (!tsMap.has(key)) tsMap.set(key, { timestamp: key } as Record<string, number>)
        const entry = tsMap.get(key)!
        entry[id] = point.pegDeviation * 10000 // convert to bps
      })
    })

    return Array.from(tsMap.values()).sort((a, b) =>
      String(a.timestamp).localeCompare(String(b.timestamp))
    )
  }, [pegHistories])

  const xFormatter = useCallback((val: unknown) => {
    if (typeof val !== 'string') return ''
    try { return format(parseISO(val), timeRange === '24h' || timeRange === '1h' ? 'HH:mm' : 'MMM dd') }
    catch { return '' }
  }, [timeRange])

  return (
    <ChartContainer
      title="Peg Stability — Top Stablecoins"
      subtitle="Deviation from $1.000 peg in basis points"
      controls={<DateRangePicker value={timeRange} onChange={setTimeRange} />}
      loading={isLoading}
      error={isError}
      onRetry={refetch}
      height={300}
    >
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
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
            tickFormatter={(v) => `${Number(v).toFixed(0)}bps`}
            width={55}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: CHART_THEME.tooltip.background,
              border: `1px solid ${CHART_THEME.tooltip.border}`,
              borderRadius: '6px',
              fontSize: '12px',
              color: CHART_THEME.tooltip.text,
            }}
            formatter={(value, name) => [formatBps(value as number), String(name).toUpperCase()]}
            labelFormatter={(label) => {
              try { return format(parseISO(label as string), 'MMM dd, HH:mm') } catch { return String(label) }
            }}
          />

          <Legend
            wrapperStyle={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}
            formatter={(value) => (value as string).toUpperCase()}
          />

          {/* Reference line at 0 (peg) */}
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
          {/* Warning bands */}
          <ReferenceLine y={10} stroke="#f59e0b" strokeDasharray="2 6" strokeOpacity={0.4} />
          <ReferenceLine y={-10} stroke="#f59e0b" strokeDasharray="2 6" strokeOpacity={0.4} />
          <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="2 6" strokeOpacity={0.3} />
          <ReferenceLine y={-50} stroke="#ef4444" strokeDasharray="2 6" strokeOpacity={0.3} />

          {TOP_STABLE_IDS.map((id, i) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              name={id}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}
