'use client'

import { useMemo } from 'react'
import { PieChart } from '@/components/charts/PieChart'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { RESERVE_COMPOSITION_COLORS } from '@/lib/utils/chart'
import type { ReserveCompositionItem } from '@/types/asset'
import { formatCompact, formatRatio } from '@/lib/utils/format'
import { clsx } from 'clsx'

interface ReserveCompositionProps {
  composition: ReserveCompositionItem[]
  collateralizationRatio?: number
  totalReserves?: number
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}

export function ReserveComposition({
  composition,
  collateralizationRatio,
  totalReserves,
  loading,
  error,
  onRetry,
}: ReserveCompositionProps) {
  const pieData = useMemo(
    () =>
      composition.map((item) => ({
        name: item.category,
        value: item.percentage,
        color: RESERVE_COMPOSITION_COLORS[item.category] ?? '#64748b',
      })),
    [composition]
  )

  const ratioColor =
    !collateralizationRatio
      ? 'text-text-muted'
      : collateralizationRatio >= 1.05
      ? 'text-emerald-400'
      : collateralizationRatio >= 1.0
      ? 'text-blue-400'
      : 'text-red-400'

  const centerContent = collateralizationRatio !== undefined && (
    <div className="flex flex-col items-center">
      <span className={clsx('font-mono font-bold text-xl', ratioColor)}>
        {(collateralizationRatio * 100).toFixed(1)}%
      </span>
      <span className="text-[10px] text-text-muted">Collat.</span>
    </div>
  )

  return (
    <ChartContainer
      title="Reserve Composition"
      subtitle={totalReserves ? `Total: ${formatCompact(totalReserves)}` : undefined}
      loading={loading}
      error={error}
      onRetry={onRetry}
      height={300}
    >
      <PieChart
        data={pieData}
        height={200}
        innerRadius={55}
        outerRadius={85}
        showLegend={false}
        centerContent={centerContent}
        tooltipFormatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
      />

      {/* Legend */}
      <div className="mt-3 space-y-2">
        {composition.map((item) => (
          <div key={item.category} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="size-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: RESERVE_COMPOSITION_COLORS[item.category] ?? '#64748b' }}
                aria-hidden
              />
              <span className="text-xs text-text-secondary truncate">{item.category}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs text-text-muted font-mono">{formatCompact(item.amount)}</span>
              <span className="text-xs font-mono text-text-primary w-12 text-right">
                {item.percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </ChartContainer>
  )
}
