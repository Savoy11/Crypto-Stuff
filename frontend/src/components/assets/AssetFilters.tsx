'use client'

import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { useAssetStore } from '@/store/useAssetStore'
import type { AssetType, RiskBand, Blockchain } from '@/types/asset'
import { ASSET_TYPE_LABELS, BLOCKCHAIN_LABELS } from '@/lib/constants'
import { getRiskTailwindClasses, getRiskLabel } from '@/lib/utils/risk'

const ASSET_TYPES: Array<{ value: AssetType | 'all'; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'layer1', label: 'Layer 1' },
  { value: 'stablecoin', label: 'Stablecoin' },
  { value: 'tokenized', label: 'Tokenized' },
  { value: 'cbdc', label: 'CBDC' },
  { value: 'defi', label: 'DeFi' },
]

const BLOCKCHAINS: Array<{ value: Blockchain | 'all'; label: string }> = [
  { value: 'all', label: 'All Chains' },
  { value: 'bitcoin', label: 'Bitcoin' },
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'bnb-chain', label: 'BNB Chain' },
  { value: 'solana', label: 'Solana' },
  { value: 'tron', label: 'Tron' },
  { value: 'ton', label: 'TON' },
  { value: 'cardano', label: 'Cardano' },
  { value: 'avalanche', label: 'Avalanche' },
  { value: 'polkadot', label: 'Polkadot' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'sui', label: 'Sui' },
  { value: 'near', label: 'NEAR' },
  { value: 'aptos', label: 'Aptos' },
  { value: 'bitcoin-cash', label: 'Bitcoin Cash' },
  { value: 'litecoin', label: 'Litecoin' },
  { value: 'monero', label: 'Monero' },
  { value: 'hedera', label: 'Hedera' },
  { value: 'algorand', label: 'Algorand' },
  { value: 'internet-computer', label: 'Internet Computer' },
  { value: 'etc', label: 'Ethereum Classic' },
  { value: 'kaspa', label: 'Kaspa' },
  { value: 'filecoin', label: 'Filecoin' },
  { value: 'injective', label: 'Injective' },
  { value: 'vechain', label: 'VeChain' },
  { value: 'tezos', label: 'Tezos' },
  { value: 'iota', label: 'IOTA' },
  { value: 'zcash', label: 'Zcash' },
  { value: 'other', label: 'Other' },
]

const RISK_BANDS: Array<{ value: RiskBand | 'all'; label: string }> = [
  { value: 'all', label: 'All Risk Levels' },
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'elevated', label: 'Elevated' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

interface FilterGroupProps {
  label: string
  children: React.ReactNode
}

function FilterGroup({ label, children }: FilterGroupProps) {
  return (
    <div className="mb-5">
      <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">{label}</div>
      {children}
    </div>
  )
}

export function AssetFilters() {
  const { filters, setFilters, resetFilters } = useAssetStore()
  const hasActive =
    filters.assetType !== 'all' ||
    filters.blockchain !== 'all' ||
    filters.riskBand !== 'all' ||
    filters.minRiskScore > 0 ||
    filters.maxRiskScore < 100

  return (
    <aside className="w-52 flex-shrink-0" aria-label="Asset filters">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">Filters</h3>
        {hasActive && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-accent-blue transition-colors"
            aria-label="Reset all filters"
          >
            <X size={11} aria-hidden />
            Reset
          </button>
        )}
      </div>

      <FilterGroup label="Asset Type">
        <div className="space-y-1">
          {ASSET_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilters({ assetType: value as AssetType | 'all' })}
              className={clsx(
                'w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors',
                filters.assetType === value
                  ? 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              )}
              aria-pressed={filters.assetType === value}
            >
              {label}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Blockchain">
        <div className="space-y-1 max-h-52 overflow-y-auto pr-0.5">
          {BLOCKCHAINS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilters({ blockchain: value as Blockchain | 'all' })}
              className={clsx(
                'w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors',
                filters.blockchain === value
                  ? 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              )}
              aria-pressed={filters.blockchain === value}
            >
              {label}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Risk Band">
        <div className="space-y-1">
          {RISK_BANDS.map(({ value, label }) => {
            const riskClasses = value !== 'all' ? getRiskTailwindClasses(value as RiskBand) : null
            const isActive = filters.riskBand === value
            return (
              <button
                key={value}
                onClick={() => setFilters({ riskBand: value as RiskBand | 'all' })}
                className={clsx(
                  'w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors',
                  isActive && value !== 'all' && riskClasses?.badge,
                  isActive && value === 'all' && 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20',
                  !isActive && 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                )}
                aria-pressed={isActive}
              >
                {label}
              </button>
            )
          })}
        </div>
      </FilterGroup>

      <FilterGroup label="Risk Score Range">
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-[10px] text-text-muted mb-1">
              <span>Min: {filters.minRiskScore}</span>
              <span>Max: {filters.maxRiskScore}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={filters.minRiskScore}
              onChange={(e) => setFilters({ minRiskScore: Number(e.target.value) })}
              className="w-full accent-accent-blue"
              aria-label="Minimum risk score"
            />
            <input
              type="range"
              min={0}
              max={100}
              value={filters.maxRiskScore}
              onChange={(e) => setFilters({ maxRiskScore: Number(e.target.value) })}
              className="w-full accent-accent-blue"
              aria-label="Maximum risk score"
            />
          </div>
        </div>
      </FilterGroup>
    </aside>
  )
}
