import { describe, it, expect } from 'vitest'
import {
  buildFromAllocation, validateAllocation, checkDrift, reviewPlan,
  type AllocationInputs,
} from '../portfolioBuilder'

// Item 16 — the build-by-allocation mode. Its whole promise is that a
// hand-built plan is a first-class plan: same output type, same drift monitor,
// same suitability review. These tests hold it to that.

const base: AllocationInputs = {
  amount: 100_000,
  horizonYears: 20,
  classWeights: { 'us-equity': 60, 'intl-equity': 20, bonds: 20 },
}

describe('validateAllocation', () => {
  it('accepts weights that total 100', () => {
    expect(validateAllocation(base)).toMatchObject({ ok: true, totalPct: 100 })
  })

  it('rejects weights that do not total 100 rather than normalising them', () => {
    // Silently scaling 60/30/5 to 100 hands back a plan the user did not
    // describe — the same rule that forbids rescaling a partial holdings list.
    const v = validateAllocation({ ...base, classWeights: { 'us-equity': 60, bonds: 30, cash: 5 } })
    expect(v.ok).toBe(false)
    expect(v.errors[0]).toContain('95.0%')
  })

  it('rejects a negative weight', () => {
    expect(validateAllocation({ ...base, classWeights: { 'us-equity': 110, bonds: -10 } }).ok).toBe(false)
  })

  it('checks the cap split and sector weights sum within their own sleeve', () => {
    expect(validateAllocation({ ...base, capSplit: { largePct: 70, midPct: 20, smallPct: 5 } }).ok).toBe(false)
    expect(validateAllocation({
      ...base,
      classWeights: { 'us-equity': 50, bonds: 30, 'sector-tilt': 20 },
      sectorWeights: { technology: 60 },
    }).ok).toBe(false)
  })
})

describe('buildFromAllocation', () => {
  it('honours the weights it was given rather than deriving its own', () => {
    const plan = buildFromAllocation(base)
    const byClass = Object.fromEntries(plan.classMix.map((c) => [c.assetClass, c.pct]))
    expect(byClass['us-equity']).toBeCloseTo(60, 1)
    expect(byClass['intl-equity']).toBeCloseTo(20, 1)
    expect(byClass.bonds).toBeCloseTo(20, 1)
  })

  it('uses one total-market fund unless a cap split is asked for', () => {
    const single = buildFromAllocation(base)
    expect(single.holdings.filter((h) => h.assetClass === 'us-equity').map((h) => h.symbol)).toEqual(['VTI'])

    const split = buildFromAllocation({ ...base, capSplit: { largePct: 60, midPct: 25, smallPct: 15 } })
    const symbols = split.holdings.filter((h) => h.assetClass === 'us-equity').map((h) => h.symbol)
    expect(symbols).toEqual(['VOO', 'IJH', 'IJR'])
    // And it says why that is a choice, not an upgrade.
    expect(split.notes.some((n) => n.message.includes('deliberate tilt'))).toBe(true)
  })

  it('splits the US sleeve in the proportions given, not evenly', () => {
    const plan = buildFromAllocation({ ...base, capSplit: { largePct: 60, midPct: 25, smallPct: 15 } })
    const w = (s: string) => plan.holdings.find((h) => h.symbol === s)?.weightPct ?? 0
    expect(w('VOO')).toBeCloseTo(36, 1)   // 60% of the 60% sleeve
    expect(w('IJH')).toBeCloseTo(15, 1)
    expect(w('IJR')).toBeCloseTo(9, 1)
  })

  it('ladders the bond sleeve by horizon, not by preference', () => {
    const near = buildFromAllocation({ ...base, horizonYears: 2 })
    const far = buildFromAllocation({ ...base, horizonYears: 25 })
    const symbolsOf = (p: ReturnType<typeof buildFromAllocation>) =>
      p.holdings.filter((h) => h.assetClass === 'bonds').map((h) => h.symbol)
    // How much is the user's call; how long is a function of when it is spent.
    expect(symbolsOf(near)).not.toEqual(symbolsOf(far))
  })

  it('reports weight it could not place instead of silently absorbing it', () => {
    const plan = buildFromAllocation({ ...base, classWeights: { 'us-equity': 99, currency: 1 } })
    expect(plan.notes.some((n) => n.level === 'warn' && n.message.includes('could not be placed'))).toBe(true)
  })

  it('warns when growth exposure outruns the horizon', () => {
    const plan = buildFromAllocation({ ...base, horizonYears: 3, classWeights: { 'us-equity': 90, bonds: 10 } })
    expect(plan.notes.some((n) => n.level === 'warn' && n.message.includes('no time to recover'))).toBe(true)
  })

  it('produces a plan the drift monitor accepts', () => {
    // The point of sharing the output type: a hand-built plan is monitored the
    // same way a generated one is.
    const plan = buildFromAllocation(base)
    const drift = checkDrift(plan, { VTI: 70, VXUS: 15, BND: 15 }, 100_000)
    expect(drift.items.length).toBeGreaterThan(0)
    // VTI is 10 points over its 60% target — past the 5-point band, so it trades.
    expect(drift.rebalanceDue).toBe(true)
    expect(drift.items.some((i) => i.action !== 'hold')).toBe(true)
  })

  it('produces a plan the suitability review accepts', () => {
    const plan = buildFromAllocation(base)
    const findings = reviewPlan({
      id: 'p1', name: 'Hand-built', createdAt: new Date().toISOString(),
      lastReviewedAt: new Date().toISOString(), plan,
    })
    expect(Array.isArray(findings)).toBe(true)
  })

  it('derives risk tolerance from the allocation rather than inventing one', () => {
    const conservative = buildFromAllocation({ ...base, classWeights: { bonds: 80, 'us-equity': 20 } })
    const aggressive = buildFromAllocation({ ...base, classWeights: { 'us-equity': 100 } })
    expect(aggressive.inputs.riskTolerance).toBeGreaterThan(conservative.inputs.riskTolerance)
  })
})
