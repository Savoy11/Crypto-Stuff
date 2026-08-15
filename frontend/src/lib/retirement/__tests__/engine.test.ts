import { describe, expect, it } from 'vitest'
import {
  futureValue,
  monthsToGoal,
  projectRetirement,
  VEHICLES,
  type RetirementInputs,
  type VehicleInput,
} from '../engine'
import { CONTRIBUTION_LIMITS, deferralCapForAge, iraCapForAge } from '../limits'

const vehicle = (over: Partial<VehicleInput> & Pick<VehicleInput, 'id'>): VehicleInput => ({
  deferralPct: 0, currentBalance: 0, annualReturnPct: 7, ...over,
})

/** The spreadsheet's own starting scenario: age 31, $6k/mo, retire at 60. */
const base: RetirementInputs = {
  currentAge: 31,
  targetRetirementAge: 60,
  planToAge: 100,
  monthlyGrossIncome: 6000,
  currentEmergencySavings: 3000,
  emergencySavingsGoal: 20000,
  emergencyAllocationPct: 15,
  companyMatchPct: 0,
  vehicles: [],
  monthlyExpenses: 2000,
  otherMonthlyIncome: 0,
}

describe('futureValue', () => {
  it('returns the present value when there is no time to grow', () => {
    expect(futureValue(10_000, 500, 7, 0)).toBe(10_000)
  })

  it('sums contributions when the assumed return is zero', () => {
    expect(futureValue(1000, 100, 0, 2)).toBe(1000 + 100 * 24)
  })

  it('compounds a lump sum monthly', () => {
    // 10,000 at 12%/yr compounded monthly for 1 year = 10,000 × 1.01^12.
    expect(futureValue(10_000, 0, 12, 1)).toBeCloseTo(10_000 * Math.pow(1.01, 12), 6)
  })

  it('compounds contributions monthly, not annually', () => {
    // The deviation from the spreadsheet: monthly deposits earn part-year
    // growth. An annual-lump model would return exactly 12,000 here.
    const v = futureValue(0, 1000, 12, 1)
    expect(v).toBeGreaterThan(12_000)
    expect(v).toBeCloseTo(1000 * ((Math.pow(1.01, 12) - 1) / 0.01), 6)
  })

  it('treats a negative horizon as no horizon', () => {
    expect(futureValue(5000, 100, 7, -3)).toBe(5000)
  })
})

describe('monthsToGoal', () => {
  it('is zero when the goal is already met', () => {
    expect(monthsToGoal(20_000, 20_000, 500)).toBe(0)
    expect(monthsToGoal(25_000, 20_000, 500)).toBe(0)
  })

  it('rounds up to a whole month', () => {
    expect(monthsToGoal(3000, 20_000, 900)).toBe(19) // 17_000 / 900 = 18.9
  })

  it('is null — not Infinity — when nothing is being saved', () => {
    expect(monthsToGoal(3000, 20_000, 0)).toBeNull()
  })
})

describe('projectRetirement — emergency fund', () => {
  it('answers how long the goal takes at the current contribution', () => {
    const p = projectRetirement(base)
    expect(p.emergency.monthlyContribution).toBe(900) // 15% of 6000
    expect(p.emergency.monthsToGoal).toBe(19)
    expect(p.emergency.funded).toBe(false)
  })

  it('reports months of expenses covered by what is already saved', () => {
    const p = projectRetirement({ ...base, currentEmergencySavings: 12_000, monthlyExpenses: 2000 })
    expect(p.emergency.monthsOfExpensesCovered).toBe(6)
  })

  it('warns when the fund is short and nothing is going in', () => {
    const p = projectRetirement({ ...base, emergencyAllocationPct: 0 })
    expect(p.emergency.monthsToGoal).toBeNull()
    expect(p.warnings.some((w) => w.includes('nothing is being contributed'))).toBe(true)
  })
})

describe('projectRetirement — contribution caps', () => {
  it('applies the §402(g) cap to pre-tax and Roth 401(k) TOGETHER', () => {
    // 30% + 30% of $72k/yr = $43,200 requested against a $23,500 shared cap.
    // Capping each separately would wrongly allow $47,000.
    const p = projectRetirement({
      ...base,
      vehicles: [
        vehicle({ id: 'pretax401k', deferralPct: 30 }),
        vehicle({ id: 'roth401k', deferralPct: 30 }),
      ],
    })
    const total = p.vehicles.reduce((s, v) => s + v.cappedAnnualContribution, 0)
    expect(total).toBeCloseTo(deferralCapForAge(31), 2)
    expect(p.warnings.some((w) => w.includes('§402(g)'))).toBe(true)
    expect(p.vehicles.every((v) => v.capWarning !== null)).toBe(true)
  })

  it('applies the IRA cap across traditional and Roth together', () => {
    const p = projectRetirement({
      ...base,
      vehicles: [
        vehicle({ id: 'rothIra', deferralPct: 10 }),
        vehicle({ id: 'traditionalIra', deferralPct: 10 }),
      ],
    })
    const total = p.vehicles.reduce((s, v) => s + v.cappedAnnualContribution, 0)
    expect(total).toBeCloseTo(iraCapForAge(31), 2)
    expect(p.warnings.some((w) => w.includes('combined limit'))).toBe(true)
  })

  it('leaves contributions under the cap untouched', () => {
    const p = projectRetirement({ ...base, vehicles: [vehicle({ id: 'pretax401k', deferralPct: 10 })] })
    expect(p.vehicles[0].cappedAnnualContribution).toBeCloseTo(7200, 2)
    expect(p.vehicles[0].capWarning).toBeNull()
    expect(p.warnings.some((w) => w.includes('§402(g)'))).toBe(false)
  })

  it('does not cap the brokerage or crypto vehicles', () => {
    const p = projectRetirement({
      ...base,
      vehicles: [vehicle({ id: 'brokerage', deferralPct: 40 }), vehicle({ id: 'crypto', deferralPct: 40 })],
    })
    expect(p.vehicles.every((v) => v.capWarning === null)).toBe(true)
    expect(p.vehicles[0].cappedAnnualContribution).toBeCloseTo(28_800, 2)
  })

  it('raises the caps from the catch-up age', () => {
    const young = projectRetirement({ ...base, currentAge: 49, vehicles: [vehicle({ id: 'pretax401k', deferralPct: 60 })] })
    const older = projectRetirement({ ...base, currentAge: 50, vehicles: [vehicle({ id: 'pretax401k', deferralPct: 60 })] })
    expect(older.vehicles[0].cappedAnnualContribution)
      .toBeCloseTo(young.vehicles[0].cappedAnnualContribution + CONTRIBUTION_LIMITS.electiveDeferralCatchUp, 2)
  })
})

describe('projectRetirement — employer match', () => {
  it('adds the match to the pre-tax 401(k) without spending the §402(g) cap on it', () => {
    // The employee is already at the cap; the match must still land on top,
    // because §402(g) governs elective deferrals only.
    const p = projectRetirement({
      ...base,
      companyMatchPct: 5,
      vehicles: [vehicle({ id: 'pretax401k', deferralPct: 40 })],
    })
    const expected = deferralCapForAge(31) + 6000 * 0.05 * 12
    expect(p.vehicles[0].cappedAnnualContribution).toBeCloseTo(expected, 2)
    expect(p.employerMonthlyContribution).toBe(300)
  })

  it('does not count the match against the user’s own savings rate', () => {
    const p = projectRetirement({
      ...base,
      companyMatchPct: 5,
      vehicles: [vehicle({ id: 'pretax401k', deferralPct: 10 })],
    })
    expect(p.savingsRatePct).toBe(10) // not 15
  })

  it('warns when contributions plus match breach the §415(c) total-additions limit', () => {
    const p = projectRetirement({
      ...base,
      monthlyGrossIncome: 60_000,
      companyMatchPct: 90,
      vehicles: [vehicle({ id: 'pretax401k', deferralPct: 40 })],
    })
    expect(p.warnings.some((w) => w.includes('§415(c)'))).toBe(true)
  })
})

describe('projectRetirement — accumulation and drawdown', () => {
  const withVehicles: RetirementInputs = {
    ...base,
    vehicles: [
      vehicle({ id: 'pretax401k', deferralPct: 7, currentBalance: 42_000, annualReturnPct: 7 }),
      vehicle({ id: 'rothIra', deferralPct: 5, currentBalance: 3000, annualReturnPct: 10 }),
    ],
  }

  it('projects each vehicle at its OWN assumed return', () => {
    const p = projectRetirement(withVehicles)
    const [k, ira] = p.vehicles
    expect(k.projectedBalance).toBeCloseTo(
      futureValue(42_000, k.cappedAnnualContribution / 12, 7, 29), 0,
    )
    expect(ira.projectedBalance).toBeCloseTo(
      futureValue(3000, ira.cappedAnnualContribution / 12, 10, 29), 0,
    )
  })

  it('totals the projection and splits it by tax treatment', () => {
    const p = projectRetirement(withVehicles)
    expect(p.totalProjectedBalance).toBeCloseTo(p.vehicles.reduce((s, v) => s + v.projectedBalance, 0), 0)
    expect(p.byTreatment.pretax).toBeCloseTo(p.vehicles[0].projectedBalance, 0)
    expect(p.byTreatment.roth).toBeCloseTo(p.vehicles[1].projectedBalance, 0)
    expect(p.byTreatment.taxable).toBe(0)
  })

  it('spreads the balance across the drawdown years', () => {
    const p = projectRetirement(withVehicles)
    expect(p.yearsInRetirement).toBe(40)
    expect(p.monthlyDrawdown).toBeCloseTo(p.totalProjectedBalance / (40 * 12), 1)
  })

  it('adds other income streams to the drawdown', () => {
    const p = projectRetirement({ ...withVehicles, otherMonthlyIncome: 2500 })
    expect(p.monthlyRetirementIncome).toBeCloseTo(p.monthlyDrawdown + 2500, 2)
  })

  it('does not divide by zero when retirement age equals plan-to age', () => {
    const p = projectRetirement({ ...withVehicles, planToAge: 60 })
    expect(p.monthlyDrawdown).toBe(0)
    expect(p.warnings.some((w) => w.includes('no drawdown period'))).toBe(true)
  })

  it('warns when the retirement age is not in the future', () => {
    const p = projectRetirement({ ...withVehicles, targetRetirementAge: 31 })
    expect(p.yearsToRetirement).toBe(0)
    expect(p.warnings.some((w) => w.includes('no accumulation period'))).toBe(true)
    // Balances still report what is already saved rather than vanishing.
    expect(p.totalProjectedBalance).toBeCloseTo(45_000, 2)
  })
})

describe('projectRetirement — affordability', () => {
  it('reports take-home after savings and after expenses', () => {
    const p = projectRetirement({ ...base, vehicles: [vehicle({ id: 'pretax401k', deferralPct: 10 })] })
    expect(p.totalMonthlyContribution).toBe(1500) // 900 emergency + 600 retirement
    expect(p.monthlyAfterSavings).toBe(4500)
    expect(p.monthlyAfterSavingsAndExpenses).toBe(2500)
    expect(p.affordable).toBe(true)
  })

  it('flags a plan that cannot cover its own expenses', () => {
    const p = projectRetirement({
      ...base,
      monthlyExpenses: 5000,
      vehicles: [vehicle({ id: 'pretax401k', deferralPct: 20 })],
    })
    expect(p.affordable).toBe(false)
    expect(p.monthlyAfterSavingsAndExpenses).toBeLessThan(0)
    expect(p.warnings.some((w) => w.includes('does not balance'))).toBe(true)
  })

  it('handles zero income without producing NaN', () => {
    const p = projectRetirement({ ...base, monthlyGrossIncome: 0, vehicles: [vehicle({ id: 'pretax401k', deferralPct: 10 })] })
    expect(p.savingsRatePct).toBe(0)
    expect(Number.isFinite(p.totalProjectedBalance)).toBe(true)
  })
})

describe('VEHICLES metadata', () => {
  it('shares one cap between the two 401(k) accounts and one between the two IRAs', () => {
    const byCap = (cap: string) => VEHICLES.filter((v) => v.cap === cap).map((v) => v.id)
    expect(byCap('electiveDeferral').sort()).toEqual(['pretax401k', 'roth401k'])
    expect(byCap('ira').sort()).toEqual(['rothIra', 'traditionalIra'])
    expect(byCap('none').sort()).toEqual(['brokerage', 'crypto'])
  })

  it('gives every vehicle a plain-language note at the point of choice', () => {
    expect(VEHICLES.every((v) => v.note.length > 20)).toBe(true)
  })
})
