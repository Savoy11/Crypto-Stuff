import type { WalletConcentrationData } from '@/types/asset'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { formatNumber } from '@/lib/utils/format'
import { clsx } from 'clsx'

interface WalletConcentrationProps {
  data: WalletConcentrationData
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}

function MetricItem({ label, value, subtitle, colorClass }: {
  label: string
  value: string
  subtitle?: string
  colorClass?: string
}) {
  return (
    <div className="p-3 rounded bg-bg-elevated border border-border">
      <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">{label}</div>
      <div className={clsx('font-mono text-lg font-bold', colorClass ?? 'text-text-primary')}>{value}</div>
      {subtitle && <div className="text-[10px] text-text-muted mt-0.5">{subtitle}</div>}
    </div>
  )
}

function GaugeBar({ value, label, max = 1, thresholds }: {
  value: number
  label: string
  max?: number
  thresholds?: { warn: number; danger: number }
}) {
  const pct = Math.min(100, (value / max) * 100)
  const color =
    !thresholds
      ? '#3b82f6'
      : value >= thresholds.danger
      ? '#ef4444'
      : value >= thresholds.warn
      ? '#f59e0b'
      : '#10b981'

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-text-secondary">{label}</span>
        <span className="font-mono" style={{ color }}>{(value * 100).toFixed(2)}%</span>
      </div>
      <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        />
      </div>
    </div>
  )
}

export function WalletConcentration({ data, loading, error, onRetry }: WalletConcentrationProps) {
  const giniColor =
    data.giniCoefficient >= 0.8
      ? 'text-red-400'
      : data.giniCoefficient >= 0.65
      ? 'text-amber-400'
      : 'text-emerald-400'

  const hhiColor =
    data.herfindahlIndex >= 0.18
      ? 'text-red-400'
      : data.herfindahlIndex >= 0.1
      ? 'text-amber-400'
      : 'text-emerald-400'

  return (
    <ChartContainer
      title="Wallet Concentration"
      subtitle="Holder distribution and concentration metrics"
      loading={loading}
      error={error}
      onRetry={onRetry}
    >
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricItem
          label="Gini Coefficient"
          value={data.giniCoefficient.toFixed(3)}
          subtitle="0 = equal, 1 = concentrated"
          colorClass={giniColor}
        />
        <MetricItem
          label="HHI Index"
          value={data.herfindahlIndex.toFixed(4)}
          subtitle="Market concentration"
          colorClass={hhiColor}
        />
        <MetricItem
          label="Top 10 Holders"
          value={`${data.top10HoldersPercent.toFixed(1)}%`}
          subtitle="of total supply"
        />
        <MetricItem
          label="Total Holders"
          value={formatNumber(data.totalHolders)}
          subtitle="unique addresses"
        />
      </div>

      <div className="space-y-3">
        <GaugeBar
          value={data.top10HoldersPercent / 100}
          label="Top 10 wallet concentration"
          thresholds={{ warn: 0.5, danger: 0.7 }}
        />
        <GaugeBar
          value={data.top50HoldersPercent / 100}
          label="Top 50 wallet concentration"
          thresholds={{ warn: 0.7, danger: 0.85 }}
        />
        <GaugeBar
          value={data.giniCoefficient}
          label="Gini coefficient"
          thresholds={{ warn: 0.65, danger: 0.80 }}
        />
      </div>
    </ChartContainer>
  )
}
