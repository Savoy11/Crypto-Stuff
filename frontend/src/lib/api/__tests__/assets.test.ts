import { describe, expect, it } from 'vitest'
import { applyParams } from '../assets'
import { applyRiskComposite, type RiskScoreIndex } from '../live/riskScores'
import type { Asset } from '@/types/asset'

// R2 session-review finding H1: risk band/score filters and the Safety Score
// sort must operate on ENRICHED assets. The catalog carries null risk (scores
// come only from the live composite), so running applyParams before enrichment
// silently empties any risk-filtered view and makes the score sort a no-op.
// getAssets() now enriches first; these tests pin that ordering contract.

const baseAsset = (id: string): Asset => ({
  id,
  symbol: id.toUpperCase(),
  name: id,
  assetType: 'stablecoin',
  blockchain: 'ethereum',
  contractAddress: '',
  isActive: true,
  marketCap: 1_000_000,
  price: 1,
  volume24h: 1000,
  pegDeviation: null,
  riskScore: null,
  riskBand: null,
  reserveRatio: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
})

const INDEX: RiskScoreIndex = new Map([
  ['usdc', { score: 92, band: 'low', confidence: 0.9, coverage: 0.9 }],
  ['usdt', { score: 55, band: 'elevated', confidence: 0.8, coverage: 0.8 }],
])

const CATALOG = [baseAsset('usdc'), baseAsset('usdt'), baseAsset('mystery')]
const enrich = (assets: Asset[]) => assets.map((a) => applyRiskComposite(a, INDEX))

describe('enrich-before-filter contract (R2 H1)', () => {
  it('band filter finds scored assets after enrichment', () => {
    const res = applyParams(enrich(CATALOG), { riskBand: 'low' })
    expect(res.data.map((a) => a.id)).toEqual(['usdc'])
  })

  it('band filter on raw catalog returns nothing — the failure mode the fix removes', () => {
    // Documents WHY ordering matters: pre-enrichment every riskBand is null.
    const res = applyParams(CATALOG, { riskBand: 'low' })
    expect(res.data).toEqual([])
  })

  it('min/max score range filters operate on enriched scores', () => {
    const res = applyParams(enrich(CATALOG), { minRiskScore: 60, maxRiskScore: 100 })
    expect(res.data.map((a) => a.id)).toEqual(['usdc'])
    const mid = applyParams(enrich(CATALOG), { minRiskScore: 40, maxRiskScore: 60 })
    expect(mid.data.map((a) => a.id)).toEqual(['usdt'])
  })

  it('sorting by riskScore orders enriched values and pushes unscored to the end', () => {
    const asc = applyParams(enrich(CATALOG), { sortBy: 'riskScore', sortDirection: 'asc' })
    expect(asc.data.map((a) => a.id)).toEqual(['usdt', 'usdc', 'mystery'])
    const desc = applyParams(enrich(CATALOG), { sortBy: 'riskScore', sortDirection: 'desc' })
    expect(desc.data.map((a) => a.id)).toEqual(['usdc', 'usdt', 'mystery'])
  })

  it('unscored assets still pass through unfiltered views as N/A', () => {
    const res = applyParams(enrich(CATALOG), {})
    expect(res.data).toHaveLength(3)
    expect(res.data.find((a) => a.id === 'mystery')?.riskScore).toBeNull()
  })
})
