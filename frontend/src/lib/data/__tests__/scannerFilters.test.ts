import { describe, it, expect } from 'vitest'
import {
  applyScannerFilters, hasActiveFilters, UNSUPPORTED_FILTERS,
  type CoinMarketFacts,
} from '../scannerFilters'

interface Coin { id: string; facts: CoinMarketFacts }
const facts = (c: Coin) => c.facts
const coin = (id: string, f: CoinMarketFacts): Coin => ({ id, facts: f })

const UNIVERSE: Coin[] = [
  coin('btc', { rank: 1, marketCap: 1_900_000_000_000, fdv: 2_000_000_000_000, priceChange24h: 1.2, volume24h: 50_000_000_000 }),
  coin('eth', { rank: 2, marketCap: 400_000_000_000, fdv: 400_000_000_000, priceChange24h: -2.5, volume24h: 30_000_000_000 }),
  coin('tiny', { rank: 300, marketCap: 5_000_000, fdv: 50_000_000, priceChange24h: 40, volume24h: 100_000 }),
  coin('nodata', { rank: 500 }),
]

describe('hasActiveFilters', () => {
  it('is false for an empty or all-open filter set', () => {
    expect(hasActiveFilters({})).toBe(false)
    expect(hasActiveFilters({ marketCap: {}, fdv: { min: null, max: null } })).toBe(false)
  })
  it('is true once any bound or topN is set', () => {
    expect(hasActiveFilters({ marketCap: { min: 1 } })).toBe(true)
    expect(hasActiveFilters({ topN: 10 })).toBe(true)
    // zero is a real bound, not an absent one
    expect(hasActiveFilters({ priceChange24h: { min: 0 } })).toBe(true)
  })
})

describe('applyScannerFilters', () => {
  it('returns everything untouched when nothing is constrained', () => {
    const r = applyScannerFilters(UNIVERSE, {}, facts)
    expect(r.matched).toHaveLength(4)
    expect(r.unknown).toHaveLength(0)
    expect(r.excluded).toHaveLength(0)
  })

  it('filters on a minimum', () => {
    const r = applyScannerFilters(UNIVERSE, { marketCap: { min: 100_000_000_000 } }, facts)
    expect(r.matched.map(c => c.id)).toEqual(['btc', 'eth'])
    expect(r.excluded.map(c => c.id)).toContain('tiny')
  })

  it('filters on a maximum, and on both ends together', () => {
    expect(applyScannerFilters(UNIVERSE, { marketCap: { max: 1_000_000_000 } }, facts).matched.map(c => c.id)).toEqual(['tiny'])
    expect(applyScannerFilters(UNIVERSE, { marketCap: { min: 1_000_000, max: 1_000_000_000 } }, facts).matched.map(c => c.id)).toEqual(['tiny'])
  })

  it('handles negative bounds on price change', () => {
    const r = applyScannerFilters(UNIVERSE, { priceChange24h: { max: 0 } }, facts)
    expect(r.matched.map(c => c.id)).toEqual(['eth'])
  })

  // The rule that matters most: a coin we know nothing about must not be
  // reported as having failed a test nobody ran on it.
  it('separates "no data" from "did not match", never conflating them', () => {
    const r = applyScannerFilters(UNIVERSE, { marketCap: { min: 1 } }, facts)
    expect(r.unknown.map(c => c.id)).toEqual(['nodata'])
    expect(r.excluded.map(c => c.id)).not.toContain('nodata')
    expect(r.matched.map(c => c.id)).not.toContain('nodata')
  })

  it('never treats a missing value as zero', () => {
    // If `nodata` were read as 0 it would match "market cap under $1", which is
    // the exact fabrication this guards.
    const r = applyScannerFilters(UNIVERSE, { marketCap: { max: 1 } }, facts)
    expect(r.matched).toHaveLength(0)
    expect(r.unknown.map(c => c.id)).toEqual(['nodata'])
  })

  it('applies topN to the survivors, not to the universe', () => {
    // Top 2 of the coins that pass the volume floor. If topN were applied first,
    // btc+eth would be taken and then filtered, returning fewer than asked.
    const r = applyScannerFilters(UNIVERSE, { topN: 2, volume24h: { min: 1_000 } }, facts)
    expect(r.matched.map(c => c.id)).toEqual(['btc', 'eth'])
    const r2 = applyScannerFilters(UNIVERSE, { topN: 2, volume24h: { max: 1_000_000 } }, facts)
    expect(r2.matched.map(c => c.id)).toEqual(['tiny'])
  })

  it('orders a topN result by rank', () => {
    const shuffled = [UNIVERSE[2], UNIVERSE[1], UNIVERSE[0]]
    const r = applyScannerFilters(shuffled, { topN: 3 }, facts)
    expect(r.matched.map(c => c.id)).toEqual(['btc', 'eth', 'tiny'])
  })

  it('accounts for every input coin exactly once', () => {
    const r = applyScannerFilters(UNIVERSE, { topN: 1, marketCap: { min: 1 } }, facts)
    const total = r.matched.length + r.unknown.length + r.excluded.length
    expect(total).toBe(UNIVERSE.length)
  })
})

describe('UNSUPPORTED_FILTERS', () => {
  // These exist so the UI can state why a CoinMarketCap control is absent. An
  // inert control that silently matches everything would tell the user they
  // narrowed the set when they did not.
  it('names each missing filter and the data it would need', () => {
    expect(UNSUPPORTED_FILTERS.length).toBeGreaterThan(0)
    for (const f of UNSUPPORTED_FILTERS) {
      expect(f.label.length).toBeGreaterThan(0)
      expect(f.needs.length, `${f.label} must say what it needs`).toBeGreaterThan(20)
    }
  })
})
