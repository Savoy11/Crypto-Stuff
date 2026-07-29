import { describe, it, expect } from 'vitest'
import { normaliseHashrate } from '../btcHashrate'

// Real-world anchor: the network sat around 800 EH/s through mid-2026.
//   800 EH/s = 8e20 H/s = 8e11 GH/s = 8e8 TH/s
const EIGHT_HUNDRED_EH_IN_THS = 8e8

describe('normaliseHashrate', () => {
  it('reads a GH/s value correctly — the actual bug', () => {
    // blockchain.info sends GH/s. The old code did `/1e12`, treating it as H/s,
    // and produced 0.8 TH/s — which rendered as "0 EH/s".
    const { hashrateTHs, assumedUnit } = normaliseHashrate(8e11)
    expect(assumedUnit).toBe('GH/s')
    expect(hashrateTHs).toBeCloseTo(EIGHT_HUNDRED_EH_IN_THS, -6)
    // The specific broken output must not recur.
    expect(hashrateTHs).not.toBeCloseTo(0.8, 5)
  })

  it('reads an H/s value correctly, if the upstream ever switches', () => {
    const { hashrateTHs, assumedUnit } = normaliseHashrate(8e20)
    expect(assumedUnit).toBe('H/s')
    expect(hashrateTHs).toBeCloseTo(EIGHT_HUNDRED_EH_IN_THS, -6)
  })

  it('reads a TH/s value unchanged', () => {
    const { hashrateTHs, assumedUnit } = normaliseHashrate(EIGHT_HUNDRED_EH_IN_THS)
    expect(assumedUnit).toBe('TH/s')
    expect(hashrateTHs).toBe(EIGHT_HUNDRED_EH_IN_THS)
  })

  it('reads an EH/s value correctly', () => {
    const { hashrateTHs, assumedUnit } = normaliseHashrate(800)
    expect(assumedUnit).toBe('EH/s')
    expect(hashrateTHs).toBeCloseTo(EIGHT_HUNDRED_EH_IN_THS, -6)
  })

  it('returns null rather than a number it cannot justify', () => {
    // Nothing in the unit ladder puts these inside the plausible band, so the
    // honest answer is "unknown" — the UI renders null as not-available.
    for (const absurd of [1e-9, 0.5, 1e30]) {
      expect(normaliseHashrate(absurd)).toEqual({ hashrateTHs: null, assumedUnit: null })
    }
  })

  it('rejects non-numeric, zero and negative input', () => {
    for (const bad of [null, undefined, NaN, Infinity, 'lots', {}, 0, -8e11]) {
      expect(normaliseHashrate(bad)).toEqual({ hashrateTHs: null, assumedUnit: null })
    }
  })

  it('never returns a value that would render as 0 EH/s', () => {
    // The failure signature from the audit: a positive TH/s so small it prints
    // as zero once converted for display. Any accepted reading must be >= the
    // plausible floor, which is 0.1 EH/s.
    for (const raw of [8e11, 8e20, 8e8, 800, 8e5, 8e14, 8e17]) {
      const { hashrateTHs } = normaliseHashrate(raw)
      if (hashrateTHs === null) continue
      expect(hashrateTHs / 1e6).toBeGreaterThanOrEqual(0.1) // EH/s
    }
  })

  it('picks the reading that does not inflate when two units both fit', () => {
    // The band is wider than the gap between adjacent units, so 8e8 fits both
    // as TH/s (8e8) and as GH/s (8e5). Prefer the smaller result: an inflated
    // hashrate looks plausible and misleads, a deflated one looks broken.
    const { hashrateTHs, assumedUnit } = normaliseHashrate(8e8)
    expect(assumedUnit).toBe('TH/s')
    expect(hashrateTHs).toBe(8e8)
  })
})
