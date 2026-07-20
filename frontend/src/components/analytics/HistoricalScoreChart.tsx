'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import type { TimeRange } from '@/types/api'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { CHART_THEME } from '@/lib/utils/chart'
import { formatScore } from '@/lib/utils/format'
import { getScoreColor } from '@/lib/utils/risk'
import { useAssetRiskScores } from '@/hooks/useRiskScores'

interface HistoricalScoreChartProps {
  assetId: string
  assetSymbol?: string
}

export function HistoricalScoreChart({ assetId, assetSymbol }: HistoricalScoreChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d')
  const { data: scores, isLoading, isError, refetch } = useAssetRiskScores(assetId, timeRange)

  const chartData = useMemo(
    () =>
      scores?.map((s) => ({
        date: s.scoreDate,
        score: s.overallScore,
        reserveScore: s.reserveScore,
        pegScore: s.pegScore,
        networkScore: s.networkScore,
        securityScore: s.securityScore,
      })) ?? [],
    [scores]
  )

  const latestScore = chartData[chartData.length - 1]?.score ?? 0
  const avgScore = chartData.length
    ? chartData.reduce((acc, d) => acc + d.score, 0) / chartData.length
    : 0

  const scoreColor = getScoreColor(latestScore)

  const xFormatter = useCallback((val: unknown) => {
    if (typeof val !== 'string') return ''
    try {
      return format(parseISO(val), timeRange === '7d' ? 'MMM dd' : 'MMM dd')
    } catch { return '' }
  }, [timeRange])

  return (
    <ChartContainer
      title={`Safety Score History${assetSymbol ? ` — ${assetSymbol}` : ''}`}
      subtitle={`Avg: ${formatScore(avgScore)} / Latest: ${formatScore(latestScore)}`}
      controls={<DateRangePicker value={timeRange} onChange={setTimeRange} />}
      loading={isLoading}
      error={isError}
      onRetry={refetch}
      height={280}
    >
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="score-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={scoreColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={scoreColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />

          <XAxis
            dataKey="date"
            tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={xFormatter}
            minTickGap={50}
          />

          <YAxis
            domain={[0, 100]}
            tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => String(v)}
            width={35}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: CHART_THEME.tooltip.background,
              border: `1px solid ${CHART_THEME.tooltip.border}`,
              borderRadius: '6px',
              fontSize: '12px',
              color: CHART_THEME.tooltip.text,
            }}
            formatter={(value, name) => [formatScore(value as number), name === 'score' ? 'Overall Score' : String(name)]}
            labelFormatter={(label) => {
              try { return format(parseISO(label as string), 'MMM dd, yyyy') } catch { return String(label) }
            }}
          />

          {/* Band thresholds */}
          <ReferenceLine y={80} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.4} />
          <ReferenceLine y={60} stroke="#3b82f6" strokeDasharray="3 3" strokeOpacity={0.4} />
          <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.4} />
          <ReferenceLine y={20} stroke="#f97316" strokeDasharray="3 3" strokeOpacity={0.4} />

          <Area
            type="monotone"
            dataKey="score"
            name="score"
            stroke={scoreColor}
            strokeWidth={2}
            fill="url(#score-gradient)"
            dot={false}
            activeDot={{ r: 4, stroke: scoreColor, strokeWidth: 2, fill: '#1a1d26' }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Risk band reference legend */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        {[
          { label: 'Low (80–100)', color: '#10b981' },
          { label: 'Moderate (60–80)', color: '#3b82f6' },
          { label: 'Elevated (40–60)', color: '#f59e0b' },
          { label: 'High (20–40)', color: '#f97316' },
          { label: 'Critical (<20)', color: '#ef4444' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </div>
        ))}
      </div>
    </ChartContainer>
  )
}
