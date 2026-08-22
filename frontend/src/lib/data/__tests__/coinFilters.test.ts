import { describe, it, expect } from 'vitest'
import {
  applyFilterStack, applyRules, activeRules, FILTER_FIELDS, FIELD_BY_KEY, UNAVAILABLE_FACTORS,
  DISCOVERY_FILTER_FIELDS, DISCOVERY_FIELD_BY_KEY,
  type FilterRule, type DiscoveryRow,
} from '../coinFilters'
import type { Asset } from '@/types/asset'

const asset = (id: string, f: Partial<Asset> = {}): Asset =>
  ({ id, symbol: id.toUpperCase(), name: id, assetType: 'layer1', blockchain: 'other',
     contractAddress: '', isActive: true, marketCap: null, price: null, volume24h: null,
     pegDeviation: null, riskScore: null, riskBand: null, reserveRatio: null,
     createdAt: '', updatedAt: '', ...f } as Asset)

const rule = (field: string, operator: 'gte' | 'lte', value: number): FilterRule =>
  ({ id: `${field}-${operator}-${value}`, field, operator, value })

describe('applyFilterStack — rules combine', () => {
  const universe = [
    asset('big',   { marketCap: 5e9, priceChange7d: 12, volume24h: 1e9 }),
    asset('small', { marketCap: 1e6, priceChange7d: 40, volume24h: 1e4 }),
    asset('flat',  { marketCap: 8e9, priceChange7d: -3, volume24h: 5e8 }),
  ]

  it('returns everything when no rules are set', () => {
    const r = applyFilterStack(universe, [])
    expect(r.matched).toHaveLength(3)
    expect(r.untested).toHaveLength(0)
  })

  it('ANDs rules together — this is the whole point of stacking', () => {
    const r = applyFilterStack(universe, [
      rule('marketCap', 'gte', 1e9),
      rule('priceChange7d', 'gte', 0),
    ])
    // 'small' fails the cap floor, 'flat' fails the momentum floor
    expect(r.matched.map(a => a.id)).toEqual(['big'])
    expect(r.excluded.map(a => a.id).sort()).toEqual(['flat', 'small'])
  })

  it('supports both directions on the same field (a range)', () => {
    const r = applyFilterStack(universe, [
      rule('marketCap', 'gte', 1e9),
      rule('marketCap', 'lte', 6e9),
    ])
    expect(r.matched.map(a => a.id)).toEqual(['big'])
  })

  it('ignores incomplete rules rather than treating them as zero', () => {
    expect(activeRules([rule('marketCap', 'gte', NaN)])).toHaveLength(0)
    expect(activeRules([{ id: 'x', field: 'nope', operator: 'gte', value: 1 }])).toHaveLength(0)
    // an unusable rule must not silently filter everything out
    expect(applyFilterStack(universe, [rule('marketCap', 'gte', NaN)]).matched).toHaveLength(3)
  })
})

describe('unknown is neither a pass nor a fail', () => {
  const universe = [
    asset('has',  { fdv: 2e9, marketCap: 1e9 }),
    asset('none', { marketCap: 1e9 }),            // no FDV at all
  ]

  it('puts an untestable asset in `untested`, not `excluded`', () => {
    const r = applyFilterStack(universe, [rule('fdv', 'gte', 1e9)])
    expect(r.matched.map(a => a.id)).toEqual(['has'])
    expect(r.untested.map(a => a.id)).toEqual(['none'])
    expect(r.excluded).toHaveLength(0)
  })

  it('never lets a missing value satisfy a filter', () => {
    // If null were read as 0 this would match "FDV under $1".
    const r = applyFilterStack(universe, [rule('fdv', 'lte', 1)])
    expect(r.matched).toHaveLength(0)
    expect(r.untested.map(a => a.id)).toEqual(['none'])
  })

  it('names the missing field so the UI can give a concrete reason', () => {
    const r = applyFilterStack(universe, [rule('fdv', 'gte', 1e9)])
    expect(r.missingByField).toEqual({ fdv: 1 })
  })

  it('a definite failure outranks a missing value', () => {
    // 'none' fails the cap rule outright, so it is excluded even though the FDV
    // rule could not be evaluated — otherwise a user would see it reported as
    // merely "not tested" when we know it does not qualify.
    const r = applyFilterStack([asset('none', { marketCap: 1 })], [
      rule('marketCap', 'gte', 1e9),
      rule('fdv', 'gte', 1e9),
    ])
    expect(r.excluded.map(a => a.id)).toEqual(['none'])
    expect(r.untested).toHaveLength(0)
  })

  it('accounts for every asset exactly once', () => {
    const r = applyFilterStack(universe, [rule('fdv', 'gte', 1e9), rule('marketCap', 'gte', 1)])
    expect(r.matched.length + r.excluded.length + r.untested.length).toBe(universe.length)
  })
})

describe('derived fields need all their inputs', () => {
  it('computes FDV ÷ market cap only when both exist and the cap is non-zero', () => {
    const f = FIELD_BY_KEY.get('fdvToMcap')!
    expect(f.valueOf(asset('a', { fdv: 4e9, marketCap: 1e9 }))).toBe(4)
    expect(f.valueOf(asset('b', { fdv: 4e9 }))).toBeNull()
    expect(f.valueOf(asset('c', { marketCap: 1e9 }))).toBeNull()
    expect(f.valueOf(asset('d', { fdv: 4e9, marketCap: 0 }))).toBeNull()
  })

  it('computes supply issued only against a real max supply', () => {
    const f = FIELD_BY_KEY.get('circulatingPct')!
    expect(f.valueOf(asset('a', { circulatingSupply: 50, maxSupply: 200 }))).toBe(25)
    // uncapped coins have no max supply — blank, not 100%
    expect(f.valueOf(asset('b', { circulatingSupply: 50 }))).toBeNull()
  })

  it('computes turnover only against a real market cap', () => {
    const f = FIELD_BY_KEY.get('liquidityPct')!
    expect(f.valueOf(asset('a', { volume24h: 5, marketCap: 100 }))).toBe(5)
    expect(f.valueOf(asset('b', { volume24h: 5, marketCap: 0 }))).toBeNull()
  })
})

describe('field registry integrity', () => {
  it('every field has a unique key and a hint explaining the number', () => {
    const keys = FILTER_FIELDS.map(f => f.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const f of FILTER_FIELDS) {
      expect(f.hint.length, `${f.key} needs a hint`).toBeGreaterThan(15)
      expect(f.label.length).toBeGreaterThan(0)
    }
  })

  // The line the owner drew: report facts, never a score we invented.
  it('offers no composite, grade or quality score', () => {
    for (const f of FILTER_FIELDS) {
      expect(f.key.toLowerCase()).not.toMatch(/score|grade|rating|quality|rank(?!$)/)
    }
  })

  it('records what it cannot offer, and why', () => {
    expect(UNAVAILABLE_FACTORS.length).toBeGreaterThan(0)
    for (const f of UNAVAILABLE_FACTORS) expect(f.needs.length).toBeGreaterThan(15)
  })
})

describe('applyRules over the Coin Discovery field table', () => {
  const row = (over: Partial<DiscoveryRow> = {}): DiscoveryRow => ({
    price: 10, marketCap: 1e9, marketCapRank: 50, volume24h: 1e8,
    priceChange24h: 1, priceChange7d: 5, athChangePercent: -40,
    liquidityRatio: 0.1, ...over,
  })

  it('reproduces the retired "High liquidity" band as an at-least rule', () => {
    const rows = [row({ liquidityRatio: 0.2 }), row({ liquidityRatio: 0.1 })]
    const r = applyRules(rows, [
      { id: '1', field: 'liquidityPct', operator: 'gte', value: 15 },
    ], DISCOVERY_FIELD_BY_KEY)
    expect(r.matched).toHaveLength(1)
    expect(r.matched[0].liquidityRatio).toBe(0.2)
  })

  it('supports the opposite direction the bands could not express', () => {
    const rows = [row({ liquidityRatio: 0.2 }), row({ liquidityRatio: 0.01 })]
    const r = applyRules(rows, [
      { id: '1', field: 'liquidityPct', operator: 'lte', value: 5 },
    ], DISCOVERY_FIELD_BY_KEY)
    expect(r.matched).toHaveLength(1)
    expect(r.matched[0].liquidityRatio).toBe(0.01)
  })

  it('stacks a floor and a ceiling on different fields', () => {
    const rows = [
      row({ marketCap: 5e9, athChangePercent: -80 }),   // both hold
      row({ marketCap: 5e9, athChangePercent: -10 }),   // not far enough off its high
      row({ marketCap: 1e6, athChangePercent: -80 }),   // too small
    ]
    const r = applyRules(rows, [
      { id: '1', field: 'marketCap', operator: 'gte', value: 1e9 },
      { id: '2', field: 'athChangePercent', operator: 'lte', value: -50 },
    ], DISCOVERY_FIELD_BY_KEY)
    expect(r.matched).toHaveLength(1)
    expect(r.excluded).toHaveLength(2)
  })

  it('sends a null 7d change to untested, never to excluded', () => {
    const r = applyRules([row({ priceChange7d: null })], [
      { id: '1', field: 'priceChange7d', operator: 'gte', value: 0 },
    ], DISCOVERY_FIELD_BY_KEY)
    expect(r.untested).toHaveLength(1)
    expect(r.excluded).toHaveLength(0)
    expect(r.missingByField.priceChange7d).toBe(1)
  })

  it('excludes a row that definitely fails one rule even when another is unknown', () => {
    const r = applyRules([row({ marketCap: 1, priceChange7d: null })], [
      { id: '1', field: 'marketCap', operator: 'gte', value: 1e9 },
      { id: '2', field: 'priceChange7d', operator: 'gte', value: 0 },
    ], DISCOVERY_FIELD_BY_KEY)
    expect(r.excluded).toHaveLength(1)
    expect(r.untested).toHaveLength(0)
  })

  it('offers only fields a discovery candidate actually carries', () => {
    // Guards the guard: FDV and supply are on the Coins page's table and must
    // NOT appear here, or every row would land in untested.
    const keys = DISCOVERY_FILTER_FIELDS.map(f => f.key)
    expect(keys).not.toContain('fdv')
    expect(keys).not.toContain('circulatingPct')
    expect(keys).toContain('liquidityPct')
  })
})
