import { describe, it, expect } from 'vitest'
import { computePeRatio, recentAnnualFrames } from '../secFundamentals'

// Pure helpers only — the network paths (frames/ticker map) are covered by
// their own live behaviour and degrade to empty rather than throwing.

describe('computePeRatio', () => {
  it('computes a trailing P/E from price and EPS', () => {
    expect(computePeRatio(230, 7.46)).toBe(30.83)
    expect(computePeRatio(200, 20.02)).toBe(9.99)
    expect(computePeRatio(100, 10)).toBe(10)
  })

  it('returns null for loss-making companies rather than a negative multiple', () => {
    // A negative P/E would silently corrupt the registry's min/max P/E filter.
    expect(computePeRatio(50, -1.2)).toBeNull()
    expect(computePeRatio(50, 0)).toBeNull()
  })

  it('returns null when EPS is missing or not finite', () => {
    expect(computePeRatio(50, undefined)).toBeNull()
    expect(computePeRatio(50, NaN)).toBeNull()
    expect(computePeRatio(50, Infinity)).toBeNull()
  })

  it('returns null for a missing or non-positive price', () => {
    expect(computePeRatio(0, 5)).toBeNull()
    expect(computePeRatio(-10, 5)).toBeNull()
    expect(computePeRatio(NaN, 5)).toBeNull()
  })

  it('rejects absurd multiples from micro-EPS blowups', () => {
    // A rounding-dust EPS would otherwise yield a six-figure P/E.
    expect(computePeRatio(500, 0.000001)).toBeNull()
    // Just under the guard still returns a value.
    expect(computePeRatio(500, 0.06)).toBe(8333.33)
  })

  it('rounds to two decimals', () => {
    expect(computePeRatio(100, 3)).toBe(33.33)
  })
})

describe('recentAnnualFrames', () => {
  it('asks for the two most recent complete calendar years', () => {
    expect(recentAnnualFrames(new Date('2026-07-19T00:00:00Z'))).toEqual(['CY2025', 'CY2024'])
  })

  it('derives from the clock so it cannot go stale at year boundaries', () => {
    expect(recentAnnualFrames(new Date('2027-01-01T00:00:00Z'))).toEqual(['CY2026', 'CY2025'])
    expect(recentAnnualFrames(new Date('2030-12-31T23:59:59Z'))).toEqual(['CY2029', 'CY2028'])
  })
})
