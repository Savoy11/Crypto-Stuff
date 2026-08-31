'use client'

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { ChartTooltipFormatter } from './tooltipTypes'
import { CHART_THEME } from '@/lib/utils/chart'
import { type ReactNode } from 'react'

interface PieSlice {
  name: string
  value: number
  color: string
}

interface PieChartProps {
  data: PieSlice[]
  height?: number
  innerRadius?: number
  outerRadius?: number
  showLegend?: boolean
  showTooltip?: boolean
  centerContent?: ReactNode
  tooltipFormatter?: ChartTooltipFormatter
  labelFormatter?: (entry: PieSlice) => string
}

export function PieChart({
  data,
  height = 240,
  innerRadius = 60,
  outerRadius = 90,
  showLegend = true,
  showTooltip = true,
  centerContent,
  tooltipFormatter,
  labelFormatter,
}: PieChartProps) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            isAnimationActive={false}
            label={labelFormatter ? (entry) => labelFormatter(entry as PieSlice) : undefined}
            labelLine={false}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
            ))}
          </Pie>

          {showTooltip && (
            <Tooltip
              contentStyle={{
                backgroundColor: CHART_THEME.tooltip.background,
                border: `1px solid ${CHART_THEME.tooltip.border}`,
                borderRadius: '6px',
                fontSize: '12px',
                color: CHART_THEME.tooltip.text,
              }}
              formatter={tooltipFormatter ?? ((value, name) => [`${Number(value).toFixed(1)}%`, String(name)])}
            />
          )}

          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }}
              iconType="circle"
              iconSize={8}
            />
          )}
        </RechartsPieChart>
      </ResponsiveContainer>

      {centerContent && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ top: 0 }}
        >
          {centerContent}
        </div>
      )}
    </div>
  )
}
