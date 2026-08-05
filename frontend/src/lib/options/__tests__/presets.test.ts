import { describe, it, expect } from 'vitest'
import { buildPreset, roundToStrike, PRESETS, type PresetId } from '../presets'

describe('roundToStrike', () => {
  it('uses finer increments for cheaper underlyings', () => {
    expect(roundToStrike(18.7)).toBe(18.5)   // 0.5 grid
    expect(roundToStrike(52.4)).toBe(52)     // 1 grid
    expect(roundToStrike(187)).toBe(185)     // 5 grid
    expect(roundToStrike(432)).toBe(430)     // 10 grid
  })

  it('returns 0 for junk input rather than NaN', () => {
    expect(roundToStrike(0)).toBe(0)
    expect(roundToStrike(-5)).toBe(0)
    expect(roundToStrike(NaN)).toBe(0)
  })
})

describe('buildPreset', () => {
  const S = 200 // 5-dollar strike grid

  it('throws on a non-positive underlying', () => {
    expect(() => buildPreset('covered-call', 0)).toThrow(RangeError)
    expect(() => buildPreset('iron-condor', -10)).toThrow(RangeError)
  })

  it('covered call: one short call above spot, no fabricated max loss', () => {
    const p = buildPreset('covered-call', S)
    expect(p.legs).toEqual([{ side: 'short', type: 'call', strike: 210 }])
    // Max loss depends on the shares, which we don't model — must stay unset.
    expect(p.maxLossUsd).toBeUndefined()
    expect(p.note).toMatch(/100 shares/)
  })

  it('cash-secured put: one short put below spot, max loss = strike x 100', () => {
    const p = buildPreset('cash-secured-put', S)
    expect(p.legs).toEqual([{ side: 'short', type: 'put', strike: 190 }])
    expect(p.maxLossUsd).toBe(19_000)
  })

  it('bull call spread: long below short, max loss left for the debit', () => {
    const p = buildPreset('bull-call-spread', S)
    expect(p.legs).toEqual([
      { side: 'long', type: 'call', strike: 200 },
      { side: 'short', type: 'call', strike: 210 },
    ])
    expect(p.maxLossUsd).toBeUndefined()
  })

  it('iron condor: four legs, wings outside shorts, max loss = wing width x 100', () => {
    const p = buildPreset('iron-condor', S)
    expect(p.legs).toHaveLength(4)
    const puts = p.legs.filter((l) => l.type === 'put')
    const calls = p.legs.filter((l) => l.type === 'call')
    const longPut = puts.find((l) => l.side === 'long')!
    const shortPut = puts.find((l) => l.side === 'short')!
    const shortCall = calls.find((l) => l.side === 'short')!
    const longCall = calls.find((l) => l.side === 'long')!
    expect(longPut.strike).toBeLessThan(shortPut.strike)
    expect(shortPut.strike).toBeLessThan(shortCall.strike)
    expect(shortCall.strike).toBeLessThan(longCall.strike)
    expect(p.maxLossUsd).toBe(
      Math.max(shortPut.strike - longPut.strike, longCall.strike - shortCall.strike) * 100,
    )
  })

  it('never prefills market data — structure only', () => {
    for (const { id } of PRESETS) {
      for (const leg of buildPreset(id as PresetId, S).legs) {
        expect(Object.keys(leg).sort()).toEqual(['side', 'strike', 'type'])
        expect(leg.strike).toBeGreaterThan(0)
      }
    }
  })

  it('strikes stay on the grid at awkward prices', () => {
    for (const { id } of PRESETS) {
      for (const leg of buildPreset(id as PresetId, 87.3).legs) {
        expect(leg.strike % 1).toBe(0) // 1-dollar grid under 100
      }
    }
  })
})
