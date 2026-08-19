import { describe, it, expect } from 'vitest'
import { taxEquivalentYield, afterTaxYield, combinedMarginalRate } from '../taxEquivalentYield'

// Items 11/13. TEY is a percentage a user acts on when choosing between a muni
// and a corporate fund, so it is pure and tested per the house rule.

const bracket = (federalPct: number, statePct = 0, over: Partial<{ stateExempt: boolean; deductStateFromFederal: boolean }> = {}) => ({
  federalPct, statePct, stateExempt: false, ...over,
})

describe('taxEquivalentYield', () => {
  it('reproduces the textbook case: 3.5% exempt at a 32% federal rate', () => {
    // 3.5 / (1 - 0.32) = 5.147…
    const r = taxEquivalentYield(3.5, bracket(32))
    expect(r.taxEquivalentPct).toBeCloseTo(5.15, 2)
    expect(r.upliftPct).toBeCloseTo(1.65, 2)
  })

  it('a zero-tax investor gets no uplift at all', () => {
    // The case that shows munis are not universally better: with no tax to
    // escape, the exempt yield IS the comparable yield.
    const r = taxEquivalentYield(3.3, bracket(0, 0))
    expect(r.taxEquivalentPct).toBe(3.3)
    expect(r.upliftPct).toBe(0)
  })

  it('excludes state tax for a national fund whose out-of-state income is still taxed', () => {
    // The mistake this prevents: assuming "municipal" means exempt from
    // everything inflates the answer for exactly the funds most people hold.
    const national = taxEquivalentYield(3.3, bracket(35, 9, { stateExempt: false }))
    const inState = taxEquivalentYield(3.3, bracket(35, 9, { stateExempt: true }))
    expect(national.taxEquivalentPct).toBeCloseTo(5.08, 2)
    expect(inState.taxEquivalentPct).toBeGreaterThan(national.taxEquivalentPct)
  })

  it('applies the deductibility correction only when the filer itemizes', () => {
    // Naively adding 35% + 9% double-counts for an itemizer, whose state tax
    // reduces federal taxable income.
    const plain = taxEquivalentYield(3.3, bracket(35, 9, { stateExempt: true }))
    const itemized = taxEquivalentYield(3.3, bracket(35, 9, { stateExempt: true, deductStateFromFederal: true }))
    expect(itemized.taxEquivalentPct).toBeLessThan(plain.taxEquivalentPct)
  })

  it('never divides by zero, however absurd the rate', () => {
    const r = taxEquivalentYield(3.3, bracket(100, 50, { stateExempt: true }))
    expect(Number.isFinite(r.taxEquivalentPct)).toBe(true)
    expect(r.effectiveRate).toBeLessThanOrEqual(0.95)
  })

  it('degenerates on a zero or missing yield rather than emitting NaN', () => {
    expect(taxEquivalentYield(0, bracket(32))).toEqual({ taxEquivalentPct: 0, effectiveRate: 0, upliftPct: 0 })
    expect(taxEquivalentYield(Number.NaN, bracket(32)).taxEquivalentPct).toBe(0)
  })
})

describe('afterTaxYield', () => {
  it('is the mirror of TEY — a 5.15% taxable bond nets 3.5% at a 32% rate', () => {
    expect(afterTaxYield(5.15, bracket(32))).toBeCloseTo(3.5, 1)
  })

  it('taxes both federal and state on a fully taxable bond', () => {
    expect(afterTaxYield(5, bracket(35, 9))).toBeCloseTo(2.8, 1)
  })
})

describe('combinedMarginalRate', () => {
  it('adds the two rates for a standard-deduction filer', () => {
    expect(combinedMarginalRate(bracket(24, 5))).toBeCloseTo(0.29, 4)
  })

  it('reduces the combined rate for an itemizer', () => {
    expect(combinedMarginalRate(bracket(24, 5, { deductStateFromFederal: true })))
      .toBeCloseTo(0.24 + 0.05 * 0.76, 4)
  })
})
