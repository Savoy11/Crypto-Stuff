'use client'

import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import type { Asset } from '@/types/asset'
import { formatCompact, formatBps, formatPercent, formatOrNA, NA_LABEL } from '@/lib/utils/format'
import { getPegDeviationColorClass } from '@/lib/utils/risk'
import { ASSET_TYPE_LABELS, BLOCKCHAIN_LABELS } from '@/lib/constants'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface AssetCardProps {
  asset: Asset
  selected?: boolean
  onSelect?: (id: string) => void
  className?: string
}

export function AssetCard({ asset, selected, onSelect, className }: AssetCardProps) {
  const router = useRouter()
  const pegValue = asset.pegDeviationBps ?? asset.pegDeviation
  const pegClass = getPegDeviationColorClass(pegValue)
  const priceChange = asset.priceChange24h
  const priceUp = (priceChange ?? 0) >= 0

  return (
    <div
      className={clsx(
        'rounded-card border bg-bg-card p-4 cursor-pointer transition-all hover:shadow-card-hover',
        selected ? 'border-accent-blue/50 ring-1 ring-accent-blue/20' : 'border-border hover:border-border-strong',
        className
      )}
      onClick={() => router.push(`/assets/${asset.id}`)}
      role="article"
      aria-label={`${asset.name} (${asset.symbol}) asset card`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-base text-text-primary">{asset.symbol}</span>
            {!asset.isActive && (
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-500/10 text-slate-400 border border-slate-500/30 font-mono">
                INACTIVE
              </span>
            )}
          </div>
          <div className="text-xs text-text-muted mt-0.5 truncate max-w-40">{asset.name}</div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Market Cap</div>
          <div className="font-mono text-sm font-semibold text-text-primary">{formatOrNA(asset.marketCap, formatCompact)}</div>
        </div>
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Peg Dev</div>
          <div className={clsx('font-mono text-sm font-semibold', pegClass)}>
            {formatOrNA(pegValue, formatBps)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">24h Vol</div>
          <div className="font-mono text-sm text-text-secondary">{formatOrNA(asset.volume24h, formatCompact)}</div>
        </div>
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">24h Chg</div>
          <div className={clsx('font-mono text-sm flex items-center gap-1', priceChange === null || priceChange === undefined ? 'text-text-muted' : priceUp ? 'text-accent-green' : 'text-accent-red')}>
            {priceChange === null || priceChange === undefined ? (
              NA_LABEL
            ) : (
              <>
                {priceUp ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
                {formatPercent(priceChange, 2)}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="px-1.5 py-0.5 text-[10px] rounded bg-bg-elevated text-text-muted border border-border font-mono capitalize">
          {ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType}
        </span>
        <span className="px-1.5 py-0.5 text-[10px] rounded bg-bg-elevated text-text-muted border border-border font-mono capitalize">
          {BLOCKCHAIN_LABELS[asset.blockchain] ?? asset.blockchain}
        </span>
      </div>
    </div>
  )
}
