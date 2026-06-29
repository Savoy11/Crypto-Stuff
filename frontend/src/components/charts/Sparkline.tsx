'use client'

import { useMemo } from 'react'
import { LineChart, Line, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'
import { getMockPriceHistory } from '@/lib/api/mock/mockPriceHistory'
import { LIVE_DATA } from '@/lib/constants'

interface SparklineProps {
  assetId: string
  width?: number
  height?: number
  color?: string
  pegTarget?: number
}

export function Sparkline({ assetId, width = 80, height = 32, color, pegTarget }: SparklineProps) {
  const candles = useMemo(() => (LIVE_DATA ? [] : getMockPriceHistory(assetId, '1M')), [assetId])

  // No per-row live trend source — show a neutral placeholder instead of a mock line.
  if (LIVE_DATA) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-slate-600 font-mono"
        style={{ width, height }}
        title="Trend not available with live data"
      >
        n/a
      </div>
    )
  }

  const first = candles[0]?.close ?? 1
  const last  = candles[candles.length - 1]?.close ?? 1
  const up    = last >= first

  const lineColor = color ?? (up ? '#10b981' : '#ef4444')

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={candles} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        {pegTarget != null && (
          <ReferenceLine y={pegTarget} stroke="#334155" strokeDasharray="2 2" strokeWidth={1} />
        )}
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
