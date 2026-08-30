import { describe, expect, it } from 'vitest'
import { applyParams } from '../assets'
import type { Asset } from '@/types/asset'

// The R2 H1 block that stood here tested the enrich-before-filter contract for
// the live risk composite (risk band/score filters and the Safety Score sort).
// Per-coin risk scoring was removed entirely on 2026-08-29 (RP-6) — there is no
// composite, no risk filter and no score sort left to test. The ordering
// PRINCIPLE it established still holds and is now exercised by the technical
// sweep's merge-before-filter tests in sortAssets.test.ts.
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
  reserveRatio: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
})

describe('liquidity (W3-2)', () => {
  const coin = (over: Partial<Asset> & { id: string }): Asset => ({ ...baseAsset(over.id), ...over })

  it('filters by vol/mcap percent', () => {
    const rows = [
      coin({ id: 'deep', volume24h: 20e6, marketCap: 100e6 }),   // 20%/day
      coin({ id: 'thin', volume24h: 1e6, marketCap: 100e6 }),    // 1%/day
    ]
    const out = applyParams(rows, { minLiquidityPct: 5 })
    expect(out.data.map((a) => a.id)).toEqual(['deep'])
  })

  it('excludes rows missing either figure when the filter is active', () => {
    // An unknown ratio is not a passing ratio.
    const rows = [
      coin({ id: 'known', volume24h: 20e6, marketCap: 100e6 }),
      coin({ id: 'noVol', volume24h: null, marketCap: 100e6 }),
      coin({ id: 'noCap', volume24h: 20e6, marketCap: null }),
    ]
    const out = applyParams(rows, { minLiquidityPct: 1 })
    expect(out.data.map((a) => a.id)).toEqual(['known'])
  })

  it('sorts by the derived liquidityRatio key, nulls last', () => {
    const rows = [
      coin({ id: 'thin', volume24h: 1e6, marketCap: 100e6 }),
      coin({ id: 'na', volume24h: null, marketCap: 100e6 }),
      coin({ id: 'deep', volume24h: 30e6, marketCap: 100e6 }),
    ]
    const out = applyParams(rows, { sortBy: 'liquidityRatio', sortDirection: 'desc' })
    expect(out.data.map((a) => a.id)).toEqual(['deep', 'thin', 'na'])
  })
})
