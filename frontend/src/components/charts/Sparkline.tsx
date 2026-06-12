'use client'

import { useMemo } from 'react'
import { LineChart, Line, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'
import { getMockPriceHistory } from '@/lib/api/mock/mockPriceHistory'

interface SparklineProps {
  assetId: string
  width?: number
  height?: number
  color?: string
}

export function Sparkline({ assetId, width = 80, height = 32, color }: SparklineProps) {
  const candles = useMemo(() => getMockPriceHistory(assetId, '1M'), [assetId])

  const first = candles[0]?.close ?? 1
  const last  = candles[candles.length - 1]?.close ?? 1
  const up    = last >= first

  const lineColor = color ?? (up ? '#10b981' : '#ef4444')

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={candles} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <ReferenceLine y={1.0} stroke="#334155" strokeDasharray="2 2" strokeWidth={1} />
        <Tooltip content={() => null} />
        <Line
          type="monotone"
          dataKey="close"
          stroke={lineColor}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
