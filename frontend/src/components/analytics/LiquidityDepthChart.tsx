'use client'

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
import type { LiquidityDepthItem } from '@/types/asset'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { CHART_THEME } from '@/lib/utils/chart'
import { formatCompact } from '@/lib/utils/format'

interface LiquidityDepthChartProps {
  data: LiquidityDepthItem[]
  currentPrice?: number
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}

export function LiquidityDepthChart({
  data,
  currentPrice = 1.0,
  loading,
  error,
  onRetry,
}: LiquidityDepthChartProps) {
  return (
    <ChartContainer
      title="Liquidity Depth"
      subtitle="Cumulative bid/ask depth by price level"
      loading={loading}
      error={error}
      onRetry={onRetry}
      height={240}
    >
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="bid-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="ask-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />

          <XAxis
            dataKey="price"
            tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${Number(v).toFixed(4)}`}
            minTickGap={40}
          />

          <YAxis
            tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatCompact(v as number)}
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
            formatter={(value, name) => [formatCompact(value as number), name === 'bidDepth' ? 'Bid Depth' : 'Ask Depth']}
            labelFormatter={(label) => `Price: $${Number(label).toFixed(4)}`}
          />

          <ReferenceLine
            x={currentPrice}
            stroke="#475569"
            strokeDasharray="4 4"
            label={{ value: 'Mid', fill: '#475569', fontSize: 10 }}
          />

          <Area
            type="monotone"
            dataKey="bidDepth"
            name="bidDepth"
            stroke="#10b981"
            strokeWidth={1.5}
            fill="url(#bid-gradient)"
            dot={false}
            isAnimationActive={false}
          />

          <Area
            type="monotone"
            dataKey="askDepth"
            name="askDepth"
            stroke="#ef4444"
            strokeWidth={1.5}
            fill="url(#ask-gradient)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-400" />
          <span>Bid depth</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-red-400" />
          <span>Ask depth</span>
        </div>
      </div>
    </ChartContainer>
  )
}
