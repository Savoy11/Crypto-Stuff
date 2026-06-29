'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import type { Asset, AssetType } from '@/types/asset'
import { useAssetsWithStore } from '@/hooks/useAssets'
import { getRiskColor, getRiskBgColor, getPegDeviationColorClass } from '@/lib/utils/risk'
import { formatScore, formatBps, formatCompact, formatOrNA, NA_LABEL } from '@/lib/utils/format'
import { ASSET_TYPE_LABELS } from '@/lib/constants'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'
import { TrendingUp, TrendingDown } from 'lucide-react'

const TYPE_FILTERS: Array<{ value: AssetType | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'stablecoin', label: 'Stablecoins' },
  { value: 'tokenized', label: 'Tokenized' },
  { value: 'cbdc', label: 'CBDC' },
  { value: 'defi', label: 'DeFi' },
]

interface HeatmapTileProps {
  asset: Asset
  onClick: (id: string) => void
}

// Neutral styling for assets with no available risk band (strict N/A).
const NA_RISK_COLOR = '#64748b'
const NA_RISK_BG = 'rgba(100, 116, 139, 0.08)'

function HeatmapTile({ asset, onClick }: HeatmapTileProps) {
  const riskColor = asset.riskBand ? getRiskColor(asset.riskBand) : NA_RISK_COLOR
  const riskBg = asset.riskBand ? getRiskBgColor(asset.riskBand) : NA_RISK_BG
  const pegClass = getPegDeviationColorClass(asset.pegDeviationBps ?? asset.pegDeviation)
  const priceChange = asset.priceChange24h
  const isUp = (priceChange ?? 0) >= 0

  return (
    <button
      onClick={() => onClick(asset.id)}
      className={clsx(
        'relative flex flex-col justify-between p-3 rounded border transition-all cursor-pointer hover:shadow-card-hover hover:scale-[1.02]',
        !asset.isActive && 'opacity-50'
      )}
      style={{
        backgroundColor: riskBg,
        borderColor: `${riskColor}30`,
      }}
      aria-label={`${asset.symbol}: Risk ${formatOrNA(asset.riskScore, formatScore)}, ${asset.riskBand ?? 'unrated'} band`}
    >
      {/* Symbol */}
      <div className="flex items-start justify-between">
        <span className="font-mono font-bold text-sm text-text-primary">{asset.symbol}</span>
        <div className={clsx('flex items-center text-[10px] font-mono', priceChange == null ? 'text-text-muted' : isUp ? 'text-emerald-400' : 'text-red-400')}>
          {priceChange == null ? null : isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
        </div>
      </div>

      {/* Score — big */}
      <div className="my-1">
        <span
          className="font-mono font-extrabold text-2xl tabular-nums"
          style={{ color: riskColor }}
        >
          {formatOrNA(asset.riskScore, formatScore)}
        </span>
      </div>

      {/* Peg deviation */}
      <div className="flex items-center justify-between mt-1">
        <span className={clsx('font-mono text-[10px]', pegClass)}>
          {formatOrNA(asset.pegDeviationBps ?? asset.pegDeviation, formatBps)}
        </span>
        <span className="text-[9px] text-text-muted font-mono">{formatOrNA(asset.marketCap, formatCompact)}</span>
      </div>

      {/* Risk band indicator */}
      <div
        className="absolute top-0 right-0 w-1 h-full rounded-r"
        style={{ backgroundColor: riskColor, opacity: 0.6 }}
        aria-hidden
      />
    </button>
  )
}

export function RiskHeatmap() {
  const router = useRouter()
  const [typeFilter, setTypeFilter] = useState<AssetType | 'all'>('all')
  const { data, isLoading } = useAssetsWithStore()

  const filtered = useMemo(() => {
    const assets = data?.data ?? []
    if (typeFilter === 'all') return assets
    return assets.filter((a) => a.assetType === typeFilter)
  }, [data, typeFilter])

  const handleTileClick = useCallback((id: string) => {
    router.push(`/assets/${id}`)
  }, [router])

  return (
    <div className="rounded-card border border-border bg-bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Risk Heatmap</h3>
          <p className="text-xs text-text-muted mt-0.5">Asset tiles colored by risk band</p>
        </div>
        <div className="flex items-center gap-1 bg-bg-secondary rounded border border-border p-0.5">
          {TYPE_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={clsx(
                'px-2 py-1 text-xs rounded transition-colors',
                typeFilter === value
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                  : 'text-text-muted hover:text-text-secondary'
              )}
              aria-pressed={typeFilter === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => (
            <LoadingSkeleton key={i} className="h-24 rounded" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {filtered.map((asset) => (
            <HeatmapTile key={asset.id} asset={asset} onClick={handleTileClick} />
          ))}
        </div>
      )}

      {/* Risk band legend */}
      <div className="flex items-center gap-3 mt-4 flex-wrap text-[10px] text-text-muted">
        {[
          { label: 'Low', color: '#10b981' },
          { label: 'Moderate', color: '#3b82f6' },
          { label: 'Elevated', color: '#f59e0b' },
          { label: 'High', color: '#f97316' },
          { label: 'Critical', color: '#ef4444' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="size-2 rounded-sm" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
