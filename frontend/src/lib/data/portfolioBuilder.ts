// Portfolio Builder engine — pure logic, no API calls.
// Turns a suitability questionnaire into a diversified target allocation
// mapped to concrete catalog instruments, with drift bands for rebalancing.
//
// EDUCATIONAL TOOLING, NOT INVESTMENT ADVICE. The UI must show a disclaimer.

import { FUND_CATALOG } from './fundCatalog'
import type { SectorId } from './equityCatalog'
import { SECTOR_INFO } from './equityCatalog'

// ─── Inputs ───────────────────────────────────────────────────────────────────

export type CryptoComfort = 'none' | 'small' | 'moderate'

export interface BuilderInputs {
  /** 1 (capital preservation) … 10 (maximum growth) */
  riskTolerance: number
  /** Years until retirement */
  yearsToRetirement: number
  /** Years until the money is first spent — the binding constraint */
  yearsToFirstUse: number
  /** Optional sector tilts, max 3 applied */
  sectorFocus: SectorId[]
  cryptoComfort: CryptoComfort
  /** Investment amount in USD (for dollar figures in the output) */
  amount: number
}

// ─── Output ───────────────────────────────────────────────────────────────────

export type BuilderAssetClass =
  | 'us-equity' | 'intl-equity' | 'sector-tilt' | 'bonds' | 'inflation' | 'cash' | 'crypto'

export const ASSET_CLASS_INFO: Record<BuilderAssetClass, { label: string; color: string }> = {
  'us-equity':   { label: 'US Equity',            color: '#3b82f6' },
  'intl-equity': { label: 'International Equity', color: '#06b6d4' },
  'sector-tilt': { label: 'Sector Tilts',         color: '#8b5cf6' },
  'bonds':       { label: 'Bonds',                color: '#64748b' },
  'inflation':   { label: 'Inflation Protection', color: '#f59e0b' },
  'cash':        { label: 'Cash & Short-Term',    color: '#22c55e' },
  'crypto':      { label: 'Crypto',               color: '#f97316' },
}

export interface BuiltHolding {
  symbol: string
  name: string
  assetClass: BuilderAssetClass
  weightPct: number
  amountUsd: number
  rationale: string
}

export interface SuitabilityNote {
  level: 'info' | 'warn'
  message: string
}

export interface BuiltPortfolio {
  inputs: BuilderInputs
  classMix: Array<{ assetClass: BuilderAssetClass; pct: number }>
  holdings: BuiltHolding[]
  /** Rebalance when any holding drifts this many absolute points from target */
  driftBandPct: number
  /** Suggested review cadence in days */
  reviewIntervalDays: number
  diversificationScore: number // 0–100
  notes: SuitabilityNote[]
}

// ─── Sector tilt ETF mapping (from the fund catalog) ─────────────────────────

const SECTOR_ETF: Partial<Record<SectorId, string>> = {
  'technology': 'XLK',
  'financials': 'XLF',
  'energy': 'XLE',
  'healthcare': 'XLV',
  'industrials': 'XLI',
  'utilities': 'XLU',
  'real-estate': 'VNQ',
}

function fund(symbol: string) {
  const f = FUND_CATALOG.find((x) => x.symbol === symbol)
  return { symbol, name: f?.name ?? symbol }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round1 = (v: number) => Math.round(v * 10) / 10

// ─── Engine ───────────────────────────────────────────────────────────────────

export function buildPortfolio(inputs: BuilderInputs): BuiltPortfolio {
  const notes: SuitabilityNote[] = []
  // The binding horizon is when the money is actually used, not retirement.
  const horizon = Math.max(0, Math.min(inputs.yearsToFirstUse, inputs.yearsToRetirement + 30))
  if (inputs.yearsToFirstUse < inputs.yearsToRetirement) {
    notes.push({ level: 'info', message: `Allocation is anchored to first use in ${inputs.yearsToFirstUse}y — the binding constraint — rather than retirement in ${inputs.yearsToRetirement}y.` })
  }

  // 1. Equity share: glide path by horizon, tilted by risk tolerance.
  //    horizon 25y+ → base 85%; scales down to 15% at 1y. Risk shifts ±15pts.
  const horizonEquity = clamp(15 + (horizon / 25) * 70, 15, 85)
  const riskShift = (inputs.riskTolerance - 5.5) * 3.3 // −15 … +15
  let equityPct = clamp(horizonEquity + riskShift, 10, 95)

  // 2. Cash floor for near-term spending
  let cashPct = horizon < 1 ? 30 : horizon < 3 ? 15 : horizon < 5 ? 5 : 0
  if (cashPct > 0) {
    notes.push({ level: 'info', message: `Money needed within ${horizon} years — ${cashPct}% held in short-term Treasuries to protect the spend date.` })
    equityPct = Math.min(equityPct, 100 - cashPct - 10)
  }

  // 3. Crypto sleeve — capped hard by comfort, risk, and horizon
  let cryptoPct = inputs.cryptoComfort === 'none' ? 0
    : inputs.cryptoComfort === 'small' ? clamp(inputs.riskTolerance * 0.5, 1, 4)
    : clamp(inputs.riskTolerance, 2, 8)
  if (horizon < 5) cryptoPct = Math.min(cryptoPct, 2)
  if (cryptoPct > 0 && horizon < 5) {
    notes.push({ level: 'warn', message: 'Crypto sleeve capped at 2% — volatile assets fit poorly with a spend date under five years.' })
  }

  // 4. Bonds fill the remainder; part goes to TIPS on long horizons
  const bondsTotal = Math.max(0, 100 - equityPct - cashPct - cryptoPct)
  const inflationPct = round1(bondsTotal * (horizon >= 10 ? 0.3 : 0.2))
  const bondsPct = round1(bondsTotal - inflationPct)

  // 5. Split equity: international sleeve + sector tilts carved from US
  const intlPct = round1(equityPct * 0.3)
  const tilts = inputs.sectorFocus.filter((s) => SECTOR_ETF[s]).slice(0, 3)
  const tiltEach = tilts.length > 0 ? round1(clamp(equityPct * 0.06, 3, 6)) : 0
  const tiltTotal = round1(tiltEach * tilts.length)
  const usCorePct = round1(equityPct - intlPct - tiltTotal)
  if (tilts.length > 0) {
    notes.push({ level: 'info', message: `Sector tilts are capped at ${tiltEach}% each so a theme can't dominate a diversified core.` })
  }
  if (inputs.sectorFocus.length > 3) {
    notes.push({ level: 'warn', message: 'More than three sector tilts dilutes the point of tilting — only the first three were applied.' })
  }

  // 6. Map to instruments
  const holdings: BuiltHolding[] = []
  const add = (symbol: string, assetClass: BuilderAssetClass, weightPct: number, rationale: string) => {
    if (weightPct <= 0) return
    const f = fund(symbol)
    holdings.push({ ...f, assetClass, weightPct: round1(weightPct), amountUsd: Math.round(inputs.amount * weightPct / 100), rationale })
  }

  add('VTI', 'us-equity', usCorePct, 'Total US market at 3bps — the diversified growth core.')
  add('VXUS', 'intl-equity', intlPct, 'All non-US markets — geographic diversification the US core cannot provide.')
  for (const s of tilts) add(SECTOR_ETF[s]!, 'sector-tilt', tiltEach, `${SECTOR_INFO[s].label} tilt you selected — capped to stay diversified.`)
  if (bondsPct > 0) {
    add(horizon < 7 ? 'BND' : 'BND', 'bonds', bondsPct, horizon < 7
      ? 'Investment-grade bond core — dampens drawdowns as the spend date nears.'
      : 'Investment-grade bond core — the portfolio’s shock absorber.')
  }
  add('TIP', 'inflation', inflationPct, 'Inflation-protected Treasuries — guards purchasing power over the horizon.')
  add('SHY', 'cash', cashPct, 'Short-term Treasuries — near-cash for money needed soon.')
  if (cryptoPct > 0) add('IBIT', 'crypto', cryptoPct, 'Spot-Bitcoin ETF sleeve — sized so a full crypto drawdown cannot derail the plan.')

  // Normalize rounding drift into the largest holding
  const total = holdings.reduce((s, h) => s + h.weightPct, 0)
  if (holdings.length > 0 && Math.abs(total - 100) > 0.01) {
    const largest = holdings.reduce((a, b) => (a.weightPct >= b.weightPct ? a : b))
    largest.weightPct = round1(largest.weightPct + (100 - total))
    largest.amountUsd = Math.round(inputs.amount * largest.weightPct / 100)
  }

  // 7. Class mix summary
  const mixMap = new Map<BuilderAssetClass, number>()
  for (const h of holdings) mixMap.set(h.assetClass, round1((mixMap.get(h.assetClass) ?? 0) + h.weightPct))
  const classMix = Array.from(mixMap.entries()).map(([assetClass, pct]) => ({ assetClass, pct }))
    .sort((a, b) => b.pct - a.pct)

  // 8. Diversification score: breadth of classes + no class dominance + intl presence
  const classCount = classMix.length
  const largestClass = classMix[0]?.pct ?? 100
  const diversificationScore = Math.round(clamp(
    classCount * 12 + (100 - largestClass) * 0.45 + (intlPct > 0 ? 10 : 0), 0, 100))

  if (inputs.riskTolerance >= 8 && horizon < 5) {
    notes.push({ level: 'warn', message: 'High risk tolerance with a short horizon — the horizon wins. Appetite for risk does not extend a spend date.' })
  }

  return {
    inputs,
    classMix,
    holdings,
    driftBandPct: 5,
    reviewIntervalDays: 90,
    diversificationScore,
    notes,
  }
}

// ─── Drift / rebalance check ──────────────────────────────────────────────────

export interface DriftItem {
  symbol: string
  targetPct: number
  currentPct: number
  driftPts: number
  action: 'buy' | 'sell' | 'hold'
}

export function checkDrift(plan: BuiltPortfolio, currentWeights: Record<string, number>): {
  items: DriftItem[]
  rebalanceDue: boolean
} {
  const items = plan.holdings.map((h) => {
    const currentPct = currentWeights[h.symbol] ?? 0
    const driftPts = round1(currentPct - h.weightPct)
    return {
      symbol: h.symbol,
      targetPct: h.weightPct,
      currentPct: round1(currentPct),
      driftPts,
      action: (Math.abs(driftPts) < plan.driftBandPct ? 'hold' : driftPts > 0 ? 'sell' : 'buy') as DriftItem['action'],
    }
  })
  return { items, rebalanceDue: items.some((i) => i.action !== 'hold') }
}

// ─── Saved plans (localStorage until DB persistence lands) ───────────────────

export interface SavedPlan {
  id: string
  name: string
  createdAt: string
  lastReviewedAt: string
  plan: BuiltPortfolio
}

export const BUILDER_STORAGE_KEY = 'caep:builder-plans:v1'

export function reviewDue(saved: SavedPlan): boolean {
  const last = new Date(saved.lastReviewedAt).getTime()
  return Date.now() - last > saved.plan.reviewIntervalDays * 86_400_000
}
