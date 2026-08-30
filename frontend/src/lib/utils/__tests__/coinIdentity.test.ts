import { describe, it, expect } from 'vitest'
import { resolveIdentity, capsAgree, normalizeName, type CmcCandidate } from '../coinIdentity'

const cg = (over: Partial<Parameters<typeof resolveIdentity>[0]> = {}) => ({
  cgId: 'arbitrum', name: 'Arbitrum', symbol: 'ARB', marketCapUsd: 1_000_000_000, ...over,
})
const cmc = (over: Partial<CmcCandidate> = {}): CmcCandidate => ({
  cmcId: 11841, name: 'Arbitrum', symbol: 'ARB', slug: 'arbitrum', marketCapUsd: 1_020_000_000, ...over,
})

describe('normalizeName', () => {
  it('ignores case, punctuation and boilerplate words', () => {
    expect(normalizeName('Polygon Ecosystem Token')).toBe(normalizeName('polygon-ecosystem'))
    expect(normalizeName('Yearn.finance')).toBe(normalizeName('Yearn'))
  })
})

describe('capsAgree', () => {
  it('accepts the few-percent disagreement aggregators normally have', () => {
    expect(capsAgree(1_000_000_000, 1_050_000_000)).toBe(true)
  })
  it('rejects an order-of-magnitude gap — that is a different project', () => {
    expect(capsAgree(1_000_000_000, 40_000_000)).toBe(false)
  })
  it('is false, never true, when either figure is missing or nonsense', () => {
    expect(capsAgree(null, 1_000)).toBe(false)
    expect(capsAgree(1_000, undefined)).toBe(false)
    expect(capsAgree(0, 0)).toBe(false)
    expect(capsAgree(NaN, 1_000)).toBe(false)
  })
})

describe('resolveIdentity', () => {
  it('is exact when the sole symbol match also matches by name', () => {
    const r = resolveIdentity(cg(), [cmc()])
    expect(r.confidence).toBe('exact')
    expect(r.candidate?.cmcId).toBe(11841)
  })

  it('is strong when names differ but market caps corroborate', () => {
    // Real case shape: aggregators name the same asset differently.
    const r = resolveIdentity(cg({ name: 'Polygon', symbol: 'POL' }), [
      cmc({ name: 'Polygon Ecosystem Token', symbol: 'POL', marketCapUsd: 1_010_000_000 }),
    ])
    expect(r.confidence).toBe('strong')
  })

  it('DECLINES a sole symbol match whose name and market cap both disagree', () => {
    // The mislabeling case this module exists for: same ticker, different
    // project. Guessing here would put the wrong website on the card.
    const r = resolveIdentity(cg(), [cmc({ name: 'Arbitrage Coin', marketCapUsd: 12_000 })])
    expect(r.confidence).toBe('unresolved')
    expect(r.candidate).toBeNull()
    expect(r.reason).toContain('market caps differ')
  })

  it('declines a sole match with no market cap to corroborate a differing name', () => {
    const r = resolveIdentity(cg(), [cmc({ name: 'Something Else', marketCapUsd: null })])
    expect(r.confidence).toBe('unresolved')
    expect(r.reason).toContain('no market cap')
  })

  it('picks the right one out of a ticker collision by name', () => {
    const r = resolveIdentity(cg(), [
      cmc({ cmcId: 1, name: 'Arbitrage Coin', marketCapUsd: 9_000 }),
      cmc({ cmcId: 2, name: 'Arbitrum', marketCapUsd: 1_000_000_000 }),
    ])
    expect(r.confidence).toBe('exact')
    expect(r.candidate?.cmcId).toBe(2)
  })

  it('picks the right one out of a ticker collision by market cap when names all differ', () => {
    const r = resolveIdentity(cg({ name: 'Arbitrum One' }), [
      cmc({ cmcId: 1, name: 'Arb Finance', marketCapUsd: 9_000 }),
      cmc({ cmcId: 2, name: 'Arbitrum DAO', marketCapUsd: 1_010_000_000 }),
    ])
    expect(r.confidence).toBe('strong')
    expect(r.candidate?.cmcId).toBe(2)
  })

  it('declines when two candidates BOTH match on market cap — a coin flip is not a match', () => {
    const r = resolveIdentity(cg(), [
      cmc({ cmcId: 1, name: 'Arb One', marketCapUsd: 1_000_000_000 }),
      cmc({ cmcId: 2, name: 'Arb Two', marketCapUsd: 1_010_000_000 }),
    ])
    expect(r.confidence).toBe('unresolved')
    expect(r.reason).toContain('ambiguous')
  })

  it('declines when the symbol is absent from CMC entirely', () => {
    const r = resolveIdentity(cg({ symbol: 'ZZZZ' }), [cmc()])
    expect(r.confidence).toBe('unresolved')
    expect(r.reason).toContain('No CoinMarketCap entry')
  })

  it('reports cap divergence so a caller can surface a disagreement', () => {
    const r = resolveIdentity(cg(), [cmc({ marketCapUsd: 1_100_000_000 })])
    expect(r.capDivergence).toBeCloseTo(0.0909, 3)
  })

  it('never returns a candidate alongside unresolved', () => {
    // Guards the contract the caller relies on: unresolved means "use nothing".
    for (const cands of [[], [cmc({ name: 'X', marketCapUsd: 5 })]]) {
      const r = resolveIdentity(cg(), cands)
      if (r.confidence === 'unresolved') expect(r.candidate).toBeNull()
    }
  })
})
