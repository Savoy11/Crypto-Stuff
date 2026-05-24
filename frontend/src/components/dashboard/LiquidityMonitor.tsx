'use client'

import { useMemo } from 'react'
import { useAssetsWithStore } from '@/hooks/useAssets'
import { formatCompact, formatBps } from '@/lib/utils/format'
import { getPegDeviationColorClass } from '@/lib/utils/risk'
import { clsx } from 'clsx'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'

export function LiquidityMonitor() {
  const { data, isLoading } = useAssetsWithStore()

  const sorted = useMemo(() => {
    return [...(data?.data ?? [])].sort((a, b) => b.volume24h - a.volume24h).slice(0, 5)
  }, [data])

  const totalVolume = useMemo(() =>
    (data?.data ?? []).reduce((acc, a) => acc + a.volume24h, 0),
    [data]
  )

  return (
    <div className="rounded-card border border-border bg-bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Liquidity Monitor</h3>
          <p className="text-xs text-text-muted mt-0.5">
            24h total volume: <span className="font-mono text-text-secondary">{formatCompact(totalVolume)}</span>
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <LoadingSkeleton className="h-4 w-16" />
                <LoadingSkeleton className="h-2 flex-1" />
                <LoadingSkeleton className="h-4 w-20" />
              </div>
            ))
          : sorted.map((asset) => {
              const sharePct = totalVolume > 0 ? (asset.volume24h / totalVolume) * 100 : 0
              const pegClass = getPegDeviationColorClass(asset.pegDeviationBps ?? asset.pegDeviation)

              return (
                <div key={asset.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-text-primary w-12">{asset.symbol}</span>
                      <span className={clsx('font-mono text-[10px]', pegClass)}>
                        {formatBps(asset.pegDeviationBps ?? asset.pegDeviation)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <span className="font-mono text-text-secondary">{formatCompact(asset.volume24h)}</span>
                      <span className="font-mono text-text-muted w-10 text-right">{sharePct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent-blue transition-all"
                      style={{ width: `${sharePct}%` }}
                      role="progressbar"
                      aria-valuenow={Math.round(sharePct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${asset.symbol} volume share`}
                    />
                  </div>
                </div>
              )
            })}
      </div>
    </div>
  )
}
