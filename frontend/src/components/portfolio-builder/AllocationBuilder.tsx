'use client'

import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Sliders } from 'lucide-react'
import {
  ASSET_CLASS_INFO, BOND_STYLES, buildFromAllocation, validateAllocation,
  type AllocationInputs, type BuilderAssetClass, type BondStyle, type BuiltPortfolio,
} from '@/lib/data/portfolioBuilder'
import { SECTOR_INFO, type SectorId } from '@/lib/data/equityCatalog'
import { formatCurrency } from '@/lib/utils/format'

/**
 * Build-by-allocation — the Portfolio Builder's second mode (short-list item 16).
 *
 * Owner's wording, carried into the build: *"the user is going to have the
 * ability to set these percentages, ultimately it is going to be a tool
 * enhancement."* ADDITIVE — the questionnaire builder is untouched, and both
 * modes produce the same plan type, so a hand-built plan saves to the same
 * storage and gets the same drift monitor and suitability review.
 *
 * The division of labour: the user sets HOW MUCH of each thing. The engine does
 * the parts that are not preferences — instrument selection, laddering the bond
 * sleeve to the spend date, fees, and saying what the allocation implies.
 */

const CLASSES: BuilderAssetClass[] = [
  'us-equity', 'intl-equity', 'sector-tilt', 'bonds', 'inflation', 'cash', 'crypto', 'commodity', 'currency',
]

/** Sectors with a catalog ETF behind them — the same set the questionnaire tilts. */
const TILTABLE: SectorId[] = ['technology', 'financials', 'energy', 'healthcare', 'industrials', 'utilities', 'real-estate']

export function AllocationBuilder({ onBuilt }: { onBuilt: (plan: BuiltPortfolio) => void }) {
  const [amount, setAmount] = useState(25_000)
  const [horizonYears, setHorizonYears] = useState(20)
  const [weights, setWeights] = useState<Partial<Record<BuilderAssetClass, number>>>({
    'us-equity': 60, 'intl-equity': 20, bonds: 20,
  })
  const [bondStyle, setBondStyle] = useState<BondStyle>('aggregate')
  const [splitByCap, setSplitByCap] = useState(false)
  const [capSplit, setCapSplit] = useState({ largePct: 70, midPct: 20, smallPct: 10 })
  const [sectorWeights, setSectorWeights] = useState<Partial<Record<SectorId, number>>>({})

  const inputs: AllocationInputs = useMemo(() => ({
    amount,
    horizonYears,
    classWeights: weights,
    capSplit: splitByCap ? capSplit : undefined,
    sectorWeights: (weights['sector-tilt'] ?? 0) > 0 ? sectorWeights : undefined,
    bondStyle,
  }), [amount, horizonYears, weights, splitByCap, capSplit, sectorWeights, bondStyle])

  const validation = useMemo(() => validateAllocation(inputs), [inputs])

  const setWeight = (c: BuilderAssetClass, pct: number) =>
    setWeights((prev) => ({ ...prev, [c]: Number.isFinite(pct) ? pct : 0 }))

  const remaining = Math.round((100 - validation.totalPct) * 10) / 10

  return (
    <div className="rounded-card border border-border bg-bg-card p-5 space-y-5">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
          <Sliders size={14} className="text-text-muted" aria-hidden /> Set your own allocation
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          You choose the weights; the builder picks the instruments, ladders the bond sleeve to your
          spend date, and shows what the allocation implies. Weights must total 100% —
          they are not scaled for you, because a total that is off by 5 is usually a typo, not a preference.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <div className="mb-1 flex justify-between text-xs">
            <span className="uppercase tracking-wider text-text-muted">Amount</span>
            <span className="font-mono text-text-primary">{formatCurrency(amount, 0)}</span>
          </div>
          <input type="range" min={1000} max={500000} step={1000} value={amount}
            onChange={(e) => setAmount(Number(e.target.value))} className="w-full accent-blue-500" />
        </label>
        <label className="block">
          <div className="mb-1 flex justify-between text-xs">
            <span className="uppercase tracking-wider text-text-muted">Years until this money is used</span>
            <span className="font-mono text-text-primary">{horizonYears}y</span>
          </div>
          <input type="range" min={0} max={45} value={horizonYears}
            onChange={(e) => setHorizonYears(Number(e.target.value))} className="w-full accent-blue-500" />
        </label>
      </div>

      {/* Class weights */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-text-muted">Asset class weights</span>
          <span className={clsx('font-mono text-xs', Math.abs(validation.totalPct - 100) < 0.05 ? 'text-emerald-400' : 'text-amber-400')}>
            {validation.totalPct.toFixed(1)}%{remaining !== 0 && ` · ${remaining > 0 ? `${remaining} left` : `${-remaining} over`}`}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {CLASSES.map((c) => (
            <label key={c} className="flex items-center gap-2 rounded border border-border bg-bg-elevated px-2 py-1.5">
              <span className="size-2 rounded-sm" style={{ backgroundColor: ASSET_CLASS_INFO[c].color }} aria-hidden />
              <span className="flex-1 text-xs text-text-secondary">{ASSET_CLASS_INFO[c].label}</span>
              <input
                type="number" min={0} max={100} step={1}
                value={weights[c] ?? 0}
                onChange={(e) => setWeight(c, Number(e.target.value))}
                className="w-14 rounded border border-border bg-bg-card px-1.5 py-0.5 text-right font-mono text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
              />
              <span className="text-[10px] text-text-muted">%</span>
            </label>
          ))}
        </div>
      </div>

      {/* Sub-division inside US equity */}
      {(weights['us-equity'] ?? 0) > 0 && (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-xs text-text-muted">
            <input type="checkbox" checked={splitByCap} onChange={(e) => setSplitByCap(e.target.checked)} className="mt-0.5 rounded border-border" />
            <span>
              Split US equity by market cap
              <span className="text-text-muted/70"> — off means one total-market fund, which already holds
              mid and small caps at market weight. Splitting is a tilt away from the market, not a fix.</span>
            </span>
          </label>
          {splitByCap && (
            <div className="grid gap-2 sm:grid-cols-3">
              {([['largePct', 'Large'], ['midPct', 'Mid'], ['smallPct', 'Small']] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded border border-border bg-bg-elevated px-2 py-1.5">
                  <span className="flex-1 text-xs text-text-secondary">{label}</span>
                  <input
                    type="number" min={0} max={100} value={capSplit[key]}
                    onChange={(e) => setCapSplit((p) => ({ ...p, [key]: Number(e.target.value) }))}
                    className="w-14 rounded border border-border bg-bg-card px-1.5 py-0.5 text-right font-mono text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
                  />
                  <span className="text-[10px] text-text-muted">%</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-division inside the sector sleeve */}
      {(weights['sector-tilt'] ?? 0) > 0 && (
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-wider text-text-muted">
            Sector weights <span className="normal-case text-text-muted/70">(as % of your sector sleeve)</span>
          </span>
          <div className="grid gap-2 sm:grid-cols-3">
            {TILTABLE.map((s) => (
              <label key={s} className="flex items-center gap-2 rounded border border-border bg-bg-elevated px-2 py-1.5">
                <span className="flex-1 truncate text-xs text-text-secondary">{SECTOR_INFO[s].label}</span>
                <input
                  type="number" min={0} max={100} value={sectorWeights[s] ?? 0}
                  onChange={(e) => setSectorWeights((p) => ({ ...p, [s]: Number(e.target.value) }))}
                  className="w-14 rounded border border-border bg-bg-card px-1.5 py-0.5 text-right font-mono text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
                />
                <span className="text-[10px] text-text-muted">%</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Bond posture */}
      {(weights.bonds ?? 0) > 0 && (
        <label className="block text-xs text-text-muted">
          Bond posture
          <select
            value={bondStyle}
            onChange={(e) => setBondStyle(e.target.value as BondStyle)}
            className="mt-1 block w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-accent-blue/50 focus:outline-none sm:w-72"
          >
            {(Object.entries(BOND_STYLES) as Array<[BondStyle, { label: string; note: string }]>)
              .map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
          </select>
          <span className="mt-1 block leading-relaxed text-text-muted/80">{BOND_STYLES[bondStyle].note}</span>
        </label>
      )}

      {validation.errors.length > 0 && (
        <ul className="space-y-1 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          {validation.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <button
        onClick={() => onBuilt(buildFromAllocation(inputs))}
        disabled={!validation.ok}
        className="rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
      >
        Build from these weights
      </button>
    </div>
  )
}
