import { describe, it, expect } from 'vitest'
import {
  computeLookThrough, computeFundOverlap,
  type FundHoldings, type LookThroughPosition,
} from '../lookThrough'

function fund(
  symbol: string,
  holdings: Array<[string | null, string, number]>,
  opts: Partial<Pick<FundHoldings, 'source' | 'full' | 'asOf' | 'holdingsCount'>> = {},
): FundHoldings {
  return {
    symbol,
    holdings: holdings.map(([sym, name, weightPct]) => ({ symbol: sym, name, weightPct })),
    source: opts.source ?? 'sec',
    full: opts.full ?? true,
    asOf: opts.asOf ?? '2026-06-30',
    holdingsCount: opts.holdingsCount ?? holdings.length,
  }
}

// A tiny "complete" fund: weights sum to 100.
const VOO = fund('VOO', [
  ['AAPL', 'Apple Inc.', 40],
  ['NVDA', 'NVIDIA Corp', 35],
  ['JPM', 'JPMorgan Chase', 25],
])

const QQQ = fund('QQQ', [
  ['NVDA', 'NVIDIA Corp', 50],
  ['AAPL', 'Apple Inc.', 30],
  ['AMZN', 'Amazon.com', 20],
])

const pos = (symbol: string, weightPct: number, isFund = true): LookThroughPosition =>
  ({ symbol, weightPct, isFund })

describe('computeLookThrough', () => {
  it('multiplies portfolio weight by fund weight', () => {
    const r = computeLookThrough([pos('VOO', 100)], { VOO })
    expect(r.issuers.map((i) => [i.symbol, i.weightPct])).toEqual([
      ['AAPL', 40], ['NVDA', 35], ['JPM', 25],
    ])
    expect(r.resolvedPct).toBe(100)
    expect(r.unresolvedPct).toBe(0)
  })

  it('sums the same issuer across two funds — the headline use case', () => {
    // 50% VOO + 50% QQQ. NVDA: 0.5×35 + 0.5×50 = 42.5.
    const r = computeLookThrough([pos('VOO', 50), pos('QQQ', 50)], { VOO, QQQ })
    const nvda = r.issuers.find((i) => i.symbol === 'NVDA')!
    expect(nvda.weightPct).toBe(42.5)
    expect(nvda.contributions).toHaveLength(2)
    expect(nvda.contributions.map((c) => c.via).sort()).toEqual(['QQQ', 'VOO'])
  })

  it('combines a direct position with fund exposure to the same issuer', () => {
    // 10% NVDA outright + 90% VOO (35% NVDA) = 10 + 31.5 = 41.5.
    const r = computeLookThrough(
      [pos('NVDA', 10, false), pos('VOO', 90)],
      { VOO },
    )
    const nvda = r.issuers.find((i) => i.symbol === 'NVDA')!
    expect(nvda.weightPct).toBe(41.5)
    expect(nvda.heldDirectlyAndViaFund).toBe(true)
  })

  it('does not flag an issuer held only one way', () => {
    const r = computeLookThrough([pos('VOO', 100)], { VOO })
    expect(r.issuers.every((i) => i.heldDirectlyAndViaFund)).toBe(false)
  })

  it('ranks issuers by total exposure', () => {
    const r = computeLookThrough([pos('VOO', 50), pos('QQQ', 50)], { VOO, QQQ })
    const weights = r.issuers.map((i) => i.weightPct)
    expect([...weights].sort((a, b) => b - a)).toEqual(weights)
  })

  // The constraint the whole module is built around.
  it('never rescales a partial holdings list', () => {
    // Yahoo top-10 style: weights sum to 30, not 100.
    const partial = fund('ARKK', [
      ['TSLA', 'Tesla Inc', 20],
      ['COIN', 'Coinbase Global', 10],
    ], { source: 'yahoo', full: false, holdingsCount: 40 })

    const r = computeLookThrough([pos('ARKK', 100)], { ARKK: partial })
    // Face value: 20% and 10% of the portfolio, NOT 67%/33%.
    expect(r.issuers.map((i) => i.weightPct)).toEqual([20, 10])
    expect(r.resolvedPct).toBe(30)
    expect(r.unresolvedPct).toBe(70)
    expect(r.partial).toBe(true)
  })

  it('carries per-fund coverage rather than blending sources', () => {
    const partial = fund('ARKK', [['TSLA', 'Tesla Inc', 20]], {
      source: 'yahoo', full: false, holdingsCount: 40, asOf: null,
    })
    const r = computeLookThrough([pos('VOO', 50), pos('ARKK', 50)], { VOO, ARKK: partial })

    expect(r.coverage).toHaveLength(2)
    const voo = r.coverage.find((c) => c.symbol === 'VOO')!
    const arkk = r.coverage.find((c) => c.symbol === 'ARKK')!
    expect(voo).toMatchObject({ source: 'sec', full: true, explainedPct: 100, asOf: '2026-06-30' })
    expect(arkk).toMatchObject({ source: 'yahoo', full: false, explainedPct: 20, holdingsCount: 40 })
    expect(r.partial).toBe(true)
  })

  it('reports a fund it could not see through instead of dropping or inventing it', () => {
    const r = computeLookThrough([pos('VOO', 60), pos('MYSTERY', 40)], { VOO })
    expect(r.unresolvedPct).toBe(40)
    expect(r.resolvedPct).toBe(60)
    // Crucially, MYSTERY is not listed as an issuer of itself.
    expect(r.issuers.some((i) => i.symbol === 'MYSTERY')).toBe(false)
    expect(r.coverage.find((c) => c.symbol === 'MYSTERY')?.missing).toBe(true)
  })

  it('keeps resolved + unresolved equal to the invested weight', () => {
    const partial = fund('ARKK', [['TSLA', 'Tesla Inc', 25]], { source: 'yahoo', full: false })
    const r = computeLookThrough(
      [pos('VOO', 40), pos('ARKK', 30), pos('AAPL', 20, false), pos('GONE', 10)],
      { VOO, ARKK: partial },
    )
    expect(r.resolvedPct + r.unresolvedPct).toBeCloseTo(100, 6)
  })

  it('merges issuers by name when a ticker is absent', () => {
    const a = fund('A', [[null, 'Apple Inc.', 50]])
    const b = fund('B', [[null, 'APPLE INC', 50]])
    const r = computeLookThrough([pos('A', 50), pos('B', 50)], { A: a, B: b })
    expect(r.issuers).toHaveLength(1)
    expect(r.issuers[0].weightPct).toBe(50)
  })

  it('ignores zero and negative weights on both sides', () => {
    const odd = fund('ODD', [['AAPL', 'Apple Inc.', 100], ['X', 'Short', -5], ['Y', 'Zero', 0]])
    const r = computeLookThrough([pos('ODD', 100), pos('NIL', 0)], { ODD: odd })
    expect(r.issuers.map((i) => i.symbol)).toEqual(['AAPL'])
  })

  it('returns an empty result for an empty portfolio', () => {
    const r = computeLookThrough([], {})
    expect(r).toMatchObject({ issuers: [], resolvedPct: 0, unresolvedPct: 0, partial: false })
  })

  it('matches fund symbols case-insensitively', () => {
    const r = computeLookThrough([pos('voo', 100)], { VOO })
    expect(r.resolvedPct).toBe(100)
  })
})

describe('computeFundOverlap', () => {
  it('sums the shared minimum weight', () => {
    // AAPL min(40,30)=30 · NVDA min(35,50)=35 → 65.
    const o = computeFundOverlap(VOO, QQQ)
    expect(o.overlapPct).toBe(65)
    expect(o.shared.map((s) => s.symbol)).toEqual(['NVDA', 'AAPL'])
  })

  it('reports a fund against itself as fully overlapping', () => {
    expect(computeFundOverlap(VOO, VOO).overlapPct).toBe(100)
  })

  it('reports disjoint funds as zero', () => {
    const bonds = fund('BND', [['T1', 'Treasury 2030', 60], ['T2', 'Treasury 2040', 40]])
    const o = computeFundOverlap(VOO, bonds)
    expect(o.overlapPct).toBe(0)
    expect(o.shared).toEqual([])
  })

  it('carries each side’s weight for the shared rows', () => {
    const nvda = computeFundOverlap(VOO, QQQ).shared.find((s) => s.symbol === 'NVDA')!
    expect(nvda).toMatchObject({ aPct: 35, bPct: 50, sharedPct: 35 })
  })

  // Comparing two top-10 lists caps overlap near 30% however similar the funds
  // really are, so the figure is a floor and must be labelled as one.
  it('marks the result incomparable when either side is partial', () => {
    const partial = fund('QQQ', [['NVDA', 'NVIDIA Corp', 12]], { source: 'yahoo', full: false })
    const o = computeFundOverlap(VOO, partial)
    expect(o.comparable).toBe(false)
    expect(o.overlapPct).toBe(12)
    expect(o.coverage[1]).toMatchObject({ full: false, explainedPct: 12 })
  })

  it('is comparable only when both sides are complete', () => {
    expect(computeFundOverlap(VOO, QQQ).comparable).toBe(true)
  })

  it('is symmetric in magnitude', () => {
    expect(computeFundOverlap(VOO, QQQ).overlapPct).toBe(computeFundOverlap(QQQ, VOO).overlapPct)
  })
})
