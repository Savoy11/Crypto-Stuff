import { describe, it, expect } from 'vitest'
import {
  decideRateScale,
  applyRateScale,
  MATCH_TOLERANCE_PCT,
  type RateScale,
} from '../rateScale'

// The reference values are shaped like a real par curve: a 10-year around
// 4.25%, a 3-month around 4.9%. What matters is the ORDER OF MAGNITUDE, which
// is the whole question.
describe('decideRateScale', () => {
  it('calls divide-by-ten when the quote is ten times the reference', () => {
    // ^TNX printing 42.5 against a 4.25% ten-year — the agent prompts' claim
    const v = decideRateScale(42.5, 4.25)
    expect(v.scale).toBe('divide-by-ten')
    expect(v.inconclusive).toBe(false)
    expect(v.errorDivideByTen).toBeCloseTo(0)
    expect(v.errorAsIs).toBeCloseTo(38.25)
  })

  it('calls as-is when the quote already is the yield', () => {
    // ^TNX printing 4.25 against a 4.25% ten-year — what the UI assumes
    const v = decideRateScale(4.25, 4.25)
    expect(v.scale).toBe('as-is')
    expect(v.inconclusive).toBe(false)
    expect(v.errorAsIs).toBeCloseTo(0)
  })

  it('still decides on an imperfect but clearly closer match', () => {
    // A quote from a different session than the curve print: close, not equal
    const v = decideRateScale(42.9, 4.25)
    expect(v.scale).toBe('divide-by-ten')
    expect(v.inconclusive).toBe(false)
  })

  it('reports inconclusive when NEITHER reading is near the reference', () => {
    // A price, not a yield — must not be laundered into a scaling verdict
    const v = decideRateScale(112.4, 4.25)
    expect(v.inconclusive).toBe(true)
  })

  it('treats a gap just past the tolerance as inconclusive', () => {
    const v = decideRateScale(4.25 + MATCH_TOLERANCE_PCT + 0.01, 4.25)
    expect(v.inconclusive).toBe(true)
  })

  it('treats a gap just inside the tolerance as decided', () => {
    const v = decideRateScale(4.25 + MATCH_TOLERANCE_PCT - 0.01, 4.25)
    expect(v.inconclusive).toBe(false)
    expect(v.scale).toBe('as-is')
  })

  it('works at the short end, where yields are higher and the gap is wider', () => {
    // ^IRX printing 49.0 against a 4.90% 3-month
    expect(decideRateScale(49.0, 4.9).scale).toBe('divide-by-ten')
    expect(decideRateScale(4.9, 4.9).scale).toBe('as-is')
  })

  it('does not divide a near-zero yield into a false match', () => {
    // A genuine 0.05% yield: as-is fits, divide-by-ten also lands near zero.
    // as-is must win — ties and near-ties resolve to leaving the quote alone.
    const v = decideRateScale(0.05, 0.05)
    expect(v.scale).toBe('as-is')
  })
})

describe('applyRateScale', () => {
  it('divides only when told to', () => {
    expect(applyRateScale(42.5, 'divide-by-ten')).toBeCloseTo(4.25)
    expect(applyRateScale(42.5, 'as-is')).toBe(42.5)
  })

  it('round-trips whatever decideRateScale concluded', () => {
    for (const [raw, ref] of [[42.5, 4.25], [4.25, 4.25], [49.0, 4.9]] as const) {
      const { scale } = decideRateScale(raw, ref)
      expect(applyRateScale(raw, scale as RateScale)).toBeCloseTo(ref, 1)
    }
  })
})
