'use client'

import { type Asset } from '@/types/asset'
import { RiskScoreBadge, RiskBandPill } from './RiskScoreBadge'
import { formatCompact, formatBps, formatPercent, formatScore } from '@/lib/utils/format'
import { getPegDeviationColorClass, getRiskColor } from '@/lib/utils/risk'
import { clsx } from 'clsx'
import { X } from 'lucide-react'

interface AssetComparisonProps {
  assets: Asset[]
  onRemove?: (id: string) => void
}

const METRIC_ROWS: {
  label: string
  accessor: (a: Asset) => string | number
  format: (v: string | number, a: Asset) => React.ReactNode
  sortDir?: 'asc' | 'desc' // which direction is "better"
}[] = [
  {
    label: 'Risk Score',
    accessor: (a) => a.riskScore,
    format: (_, a) => <RiskScoreBadge score={a.riskScore} band={a.riskBand} />,
    sortDir: 'desc',
  },
  {
    label: 'Market Cap',
    accessor: (a) => a.marketCap,
    format: (v) => <span className="font-mono text-xs text-text-primary">{formatCompact(v as number)}</span>,
  },
  {
    label: 'Peg Deviation',
    accessor: (a) => Math.abs(a.pegDeviationBps),
    format: (_, a) => (
      <span className={clsx('font-mono text-xs', getPegDeviationColorClass(a.pegDeviationBps))}>
        {formatBps(a.pegDeviationBps)}
      </span>
    ),
    sortDir: 'asc',
  },
  {
    label: 'Reserve Ratio',
    accessor: (a) => a.reserveRatio,
    format: (v) => (
      <span className={clsx('font-mono text-xs', (v as number) >= 1 ? 'text-emerald-400' : 'text-red-400')}>
        {((v as number) * 100).toFixed(2)}%
      </span>
    ),
    sortDir: 'desc',
  },
  {
    label: '24h Volume',
    accessor: (a) => a.volume24h,
    format: (v) => <span className="font-mono text-xs text-text-secondary">{formatCompact(v as number)}</span>,
  },
  {
    label: '24h Change',
    accessor: (a) => a.priceChange24h,
    format: (v) => (
      <span className={clsx('font-mono text-xs', (v as number) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
        {formatPercent(v as number, 2)}
      </span>
    ),
  },
]

export function AssetComparison({ assets, onRemove }: AssetComparisonProps) {
  if (assets.length === 0) return null

  return (
    <div className="rounded-card border border-border bg-bg-card overflow-x-auto">
      <table className="w-full border-collapse text-sm" role="table" aria-label="Asset comparison">
        {/* Header: asset columns */}
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-3 text-left text-xs text-text-muted font-medium w-36">
              Metric
            </th>
            {assets.map((asset) => (
              <th key={asset.id} scope="col" className="px-4 py-3 text-right">
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-text-primary">{asset.symbol}</span>
                    {onRemove && (
                      <button
                        onClick={() => onRemove(asset.id)}
                        className="text-text-muted hover:text-text-secondary"
                        aria-label={`Remove ${asset.symbol} from comparison`}
                      >
                        <X size={12} aria-hidden />
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-text-muted truncate max-w-32 text-right">{asset.name}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRIC_ROWS.map((row) => {
            const values = assets.map((a) => row.accessor(a) as number)
            const best = row.sortDir === 'desc' ? Math.max(...values) : row.sortDir === 'asc' ? Math.min(...values) : null

            return (
              <tr key={row.label} className="border-b border-border/50 hover:bg-bg-elevated/30 transition-colors">
                <td className="px-4 py-3 text-xs text-text-muted font-medium">{row.label}</td>
                {assets.map((asset) => {
                  const val = row.accessor(asset) as number
                  const isBest = best !== null && val === best && assets.length > 1
                  return (
                    <td
                      key={asset.id}
                      className={clsx(
                        'px-4 py-3 text-right',
                        isBest && 'relative'
                      )}
                    >
                      <div className="flex justify-end items-center gap-1.5">
                        {isBest && (
                          <span className="size-1.5 rounded-full bg-emerald-400" aria-label="Best in category" />
                        )}
                        {row.format(val, asset)}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
