import { describe, it, expect } from 'vitest'
import { feeImpact, DEFAULT_FEE_IMPACT_PARAMS } from '../feeImpact'
import { computeFeeDrag, FUND_CATALOG } from '../fundCatalog'

const P = DEFAULT_FEE_IMPACT_PARAMS

describe('feeImpact', () => {
  it('agrees exactly with the detail-page analyzer — one engine, one answer', () => {
    const impact = feeImpact({ expenseRatioPct: 0.75, type: 'etf', issuer: 'X' }, P)!
    const drag = computeFeeDrag(P.principal, 0.75, P.years, P.annualReturnPct).at(-1)!
    expect(impact.costUsd).toBe(drag.feesPaid)
    expect(impact.endValueUsd).toBe(drag.withFee)
  })

  it('returns null for a fund with no expense ratio — unknown must never sort as free', () => {
    expect(feeImpact({ expenseRatioPct: null as unknown as number, type: 'etf', issuer: '' }, P)).toBeNull()
    expect(feeImpact(null, P)).toBeNull()
  })

  it('a cheaper-than-benchmark fund shows a negative cost (a saving), not zero', () => {
    const impact = feeImpact({ expenseRatioPct: 0.015, type: 'mutual', issuer: 'Fidelity' }, P)!
    expect(impact.costUsd).toBeLessThan(0)
  })

  it('flags an UNVERIFIED load and leaves it out of the maths', () => {
    // AGTHX's real state: Capital Group front load exists, rate not verified.
    const withFlag = feeImpact({ expenseRatioPct: 0.59, type: 'mutual', issuer: 'Capital Group' }, P)!
    const noLoad = feeImpact({ expenseRatioPct: 0.59, type: 'mutual', issuer: 'Vanguard' }, P)!
    expect(withFlag.unverifiedLoad).toBe(true)
    expect(withFlag.includesLoad).toBe(false)
    // Same number as a no-load fund — the honesty lives in the flag, not a guess.
    expect(withFlag.costUsd).toBe(noLoad.costUsd)
    expect(noLoad.unverifiedLoad).toBe(false)
  })

  it('includes a VERIFIED front load in the cost, and says so', () => {
    const base = { expenseRatioPct: 0.59, type: 'mutual' as const, issuer: 'Capital Group' }
    const verified = feeImpact({
      ...base,
      salesCharge: { kind: 'front', maxPct: 5.75, source: 'prospectus', verifiedAt: '2026-09-05' },
    }, P)!
    const unverified = feeImpact(base, P)!
    expect(verified.includesLoad).toBe(true)
    expect(verified.unverifiedLoad).toBe(false)
    expect(verified.costUsd).toBeGreaterThan(unverified.costUsd)
  })

  it('rejects nonsense params rather than computing nonsense dollars', () => {
    const f = { expenseRatioPct: 0.5, type: 'etf' as const, issuer: 'X' }
    expect(feeImpact(f, { ...P, principal: 0 })).toBeNull()
    expect(feeImpact(f, { ...P, years: 0 })).toBeNull()
    expect(feeImpact(f, { ...P, years: 2.5 })).toBeNull()
    expect(feeImpact(f, { ...P, annualReturnPct: -1 })).toBeNull()
  })

  it('orders the whole catalog by cost identically to expense ratio when no verified loads exist', () => {
    // Today no rate is verified, so cost must be monotonic in ER — if this ever
    // fails, either a verified load landed (fine — update this test to say so)
    // or the maths broke (not fine).
    const funds = FUND_CATALOG.filter((f) => f.expenseRatioPct != null)
    const byEr = [...funds].sort((a, b) => a.expenseRatioPct - b.expenseRatioPct).map((f) => f.symbol)
    const byCost = [...funds]
      .sort((a, b) => feeImpact(a, P)!.costUsd - feeImpact(b, P)!.costUsd)
      .map((f) => f.symbol)
    expect(byCost).toEqual(byEr)
  })
})
