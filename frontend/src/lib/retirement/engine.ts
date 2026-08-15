// Retirement projection engine — pure, no fetch, no clock of its own.
//
// Ported from the owner's planning spreadsheet (Budget_Sheet.xlsx, tabs
// "Hypotheticals" and "Detailed Expense Breakdown"). The spreadsheet is the
// specification for WHAT is modelled; the arithmetic here deliberately differs
// from it in two places, both documented at the point of difference:
//
//   1. Compounding is MONTHLY, not annual. The sheet's retirement projection
//      uses FV(annualRate, years, -annualContribution) — one lump per year —
//      while contributions are actually made every payroll. Annual compounding
//      understates a 30-year projection by roughly a year of growth.
//   2. Contribution limits are ENFORCED, not merely displayed. The sheet lists
//      the §402(g) and IRA caps in a column beside the inputs and does nothing
//      with them, so a deferral percentage that exceeds the cap projects
//      contributions the user is not legally allowed to make.
//
// Everything a user acts on is computed here so it can be unit-tested, per the
// repo's standing rule for dollar figures and percentages.

import { deferralCapForAge, iraCapForAge, CONTRIBUTION_LIMITS } from './limits'

export type VehicleId =
  | 'pretax401k'
  | 'roth401k'
  | 'rothIra'
  | 'traditionalIra'
  | 'brokerage'
  | 'crypto'

export type TaxTreatment = 'pretax' | 'roth' | 'taxable'

export interface VehicleMeta {
  id: VehicleId
  label: string
  treatment: TaxTreatment
  /** Which statutory cap governs it, if any. */
  cap: 'electiveDeferral' | 'ira' | 'none'
  note: string
}

export const VEHICLES: VehicleMeta[] = [
  {
    id: 'pretax401k', label: 'Pre-tax 401(k)', treatment: 'pretax', cap: 'electiveDeferral',
    note: 'Reduces taxable income now; withdrawals are taxed as ordinary income in retirement.',
  },
  {
    id: 'roth401k', label: 'Roth 401(k)', treatment: 'roth', cap: 'electiveDeferral',
    note: 'No deduction now; qualified withdrawals are tax-free. Shares one §402(g) cap with the pre-tax 401(k).',
  },
  {
    id: 'rothIra', label: 'Roth IRA', treatment: 'roth', cap: 'ira',
    note: 'Tax-free growth, subject to income eligibility limits this projection does not check.',
  },
  {
    id: 'traditionalIra', label: 'Traditional IRA', treatment: 'pretax', cap: 'ira',
    note: 'Deductibility depends on income and whether a workplace plan is available — not modelled here.',
  },
  {
    id: 'brokerage', label: 'Taxable brokerage', treatment: 'taxable', cap: 'none',
    note: 'No contribution cap. Growth is taxed as it is realized, which this projection does not deduct.',
  },
  {
    id: 'crypto', label: 'Crypto', treatment: 'taxable', cap: 'none',
    note: 'No contribution cap, and no basis for a long-run expected return — whatever rate you enter is an assumption, not a forecast.',
  },
]

export const VEHICLE_BY_ID = new Map(VEHICLES.map((v) => [v.id, v]))

export interface VehicleInput {
  id: VehicleId
  /** Share of gross pay contributed, as a percentage (7 = 7%). */
  deferralPct: number
  /** Balance already accumulated in this vehicle. */
  currentBalance: number
  /** Assumed nominal annual return, as a percentage (7 = 7%). */
  annualReturnPct: number
}

export interface RetirementInputs {
  currentAge: number
  targetRetirementAge: number
  /** Age the drawdown must last to. The spreadsheet assumes 100. */
  planToAge: number
  monthlyGrossIncome: number
  currentEmergencySavings: number
  emergencySavingsGoal: number
  /** Share of gross pay going to the emergency fund until the goal is met. */
  emergencyAllocationPct: number
  /** Employer match as a share of gross pay (5 = 5%). Lands in the pre-tax 401(k). */
  companyMatchPct: number
  vehicles: VehicleInput[]
  /** Total monthly essential expenses — the "Detailed Expense Breakdown" total. */
  monthlyExpenses: number
  /** Monthly income at retirement from sources this engine does not project. */
  otherMonthlyIncome: number
}

export interface VehicleProjection {
  id: VehicleId
  label: string
  treatment: TaxTreatment
  monthlyContribution: number
  annualContribution: number
  /** Contribution the statutory cap actually permits, annually. */
  cappedAnnualContribution: number
  /** Set when the requested contribution exceeds its cap. */
  capWarning: string | null
  currentBalance: number
  annualReturnPct: number
  /** Balance at the target retirement age. */
  projectedBalance: number
}

export interface EmergencyFundPlan {
  goal: number
  current: number
  monthlyContribution: number
  /** Months to reach the goal; 0 if already met, null if nothing is being saved. */
  monthsToGoal: number | null
  funded: boolean
  /** Months of essential expenses the CURRENT balance covers. */
  monthsOfExpensesCovered: number | null
}

export interface RetirementProjection {
  yearsToRetirement: number
  yearsInRetirement: number
  emergency: EmergencyFundPlan
  vehicles: VehicleProjection[]
  totalMonthlyContribution: number
  /** Employer match, which is contribution the user does not fund themselves. */
  employerMonthlyContribution: number
  totalProjectedBalance: number
  byTreatment: Record<TaxTreatment, number>
  /**
   * Straight-line monthly drawdown: balance ÷ months in retirement. This is
   * the spreadsheet's own measure and it deliberately assumes NO growth after
   * retirement, which understates a real portfolio — see the note the UI shows.
   */
  monthlyDrawdown: number
  monthlyRetirementIncome: number
  /** Take-home after savings, and after savings + essential expenses. */
  monthlyAfterSavings: number
  monthlyAfterSavingsAndExpenses: number
  /** Can the plan's own savings rate be afforded alongside the expenses? */
  affordable: boolean
  /** Share of gross going to retirement vehicles, employer match excluded. */
  savingsRatePct: number
  warnings: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Future value of a monthly-contributed, monthly-compounded balance.
 * `fv = pv(1+r)^n + pmt · ((1+r)^n − 1)/r`, with the r=0 case handled so a 0%
 * assumption returns contributions rather than NaN.
 */
export function futureValue(
  presentValue: number,
  monthlyContribution: number,
  annualRatePct: number,
  years: number,
): number {
  const n = Math.max(0, Math.round(years * 12))
  const r = annualRatePct / 100 / 12
  if (n === 0) return presentValue
  if (r === 0) return presentValue + monthlyContribution * n
  const growth = Math.pow(1 + r, n)
  return presentValue * growth + monthlyContribution * ((growth - 1) / r)
}

/** Months of contributions needed to close a savings gap, with growth ignored. */
export function monthsToGoal(current: number, goal: number, monthlyContribution: number): number | null {
  if (current >= goal) return 0
  if (monthlyContribution <= 0) return null
  return Math.ceil((goal - current) / monthlyContribution)
}

/**
 * Project every vehicle to the retirement age and answer the two questions the
 * spreadsheet is actually built around: what will be there, and what does it
 * pay per month once you stop working.
 */
export function projectRetirement(inputs: RetirementInputs): RetirementProjection {
  const warnings: string[] = []
  const gross = Math.max(0, inputs.monthlyGrossIncome)
  const yearsToRetirement = Math.max(0, inputs.targetRetirementAge - inputs.currentAge)
  const yearsInRetirement = Math.max(0, inputs.planToAge - inputs.targetRetirementAge)

  if (inputs.targetRetirementAge <= inputs.currentAge) {
    warnings.push('Target retirement age is not in the future — the projection has no accumulation period to model.')
  }
  if (yearsInRetirement === 0) {
    warnings.push('Plan-to age equals the retirement age, so there is no drawdown period to spread the balance across.')
  }

  // ── Emergency fund ──
  const emergencyMonthly = round2(gross * (inputs.emergencyAllocationPct / 100))
  const emergency: EmergencyFundPlan = {
    goal: inputs.emergencySavingsGoal,
    current: inputs.currentEmergencySavings,
    monthlyContribution: emergencyMonthly,
    monthsToGoal: monthsToGoal(inputs.currentEmergencySavings, inputs.emergencySavingsGoal, emergencyMonthly),
    funded: inputs.currentEmergencySavings >= inputs.emergencySavingsGoal,
    monthsOfExpensesCovered: inputs.monthlyExpenses > 0
      ? round2(inputs.currentEmergencySavings / inputs.monthlyExpenses)
      : null,
  }
  if (!emergency.funded && emergency.monthsToGoal === null) {
    warnings.push('The emergency fund is short of its goal and nothing is being contributed to it.')
  }

  // ── Contribution caps ──
  // The §402(g) cap is shared across pre-tax and Roth 401(k) deferrals, so it
  // has to be applied to their SUM, not to each in isolation. Same for the IRA
  // cap across traditional and Roth. Applying a shared cap per-vehicle is the
  // classic way to let someone over-contribute by exactly 2×.
  const deferralCap = deferralCapForAge(inputs.currentAge)
  const iraCap = iraCapForAge(inputs.currentAge)

  const requestedAnnual = (v: VehicleInput) => gross * (v.deferralPct / 100) * 12
  const sumFor = (ids: VehicleId[]) =>
    inputs.vehicles.filter((v) => ids.includes(v.id)).reduce((s, v) => s + requestedAnnual(v), 0)

  const deferral401kTotal = sumFor(['pretax401k', 'roth401k'])
  const iraTotal = sumFor(['rothIra', 'traditionalIra'])

  const scaleFor = (v: VehicleInput): { scale: number; cap: number | null } => {
    const meta = VEHICLE_BY_ID.get(v.id)
    if (!meta || meta.cap === 'none') return { scale: 1, cap: null }
    const [group, cap] = meta.cap === 'electiveDeferral'
      ? [deferral401kTotal, deferralCap]
      : [iraTotal, iraCap]
    if (group <= cap || group === 0) return { scale: 1, cap }
    return { scale: cap / group, cap }
  }

  if (deferral401kTotal > deferralCap) {
    warnings.push(
      `401(k) deferrals total $${Math.round(deferral401kTotal).toLocaleString()}/yr, above the $${deferralCap.toLocaleString()} §402(g) limit shared by the pre-tax and Roth accounts. The projection uses the capped amount.`,
    )
  }
  if (iraTotal > iraCap) {
    warnings.push(
      `IRA contributions total $${Math.round(iraTotal).toLocaleString()}/yr, above the $${iraCap.toLocaleString()} combined limit. The projection uses the capped amount.`,
    )
  }

  // ── Per-vehicle projection ──
  const employerAnnual = gross * (inputs.companyMatchPct / 100) * 12
  const vehicles: VehicleProjection[] = inputs.vehicles.map((v) => {
    const meta = VEHICLE_BY_ID.get(v.id)!
    const annual = requestedAnnual(v)
    const { scale, cap } = scaleFor(v)
    let cappedAnnual = annual * scale

    // The employer match rides in the pre-tax 401(k) and is NOT counted against
    // §402(g) — that cap governs employee deferrals only. It is bounded by the
    // §415(c) total-additions limit instead.
    if (v.id === 'pretax401k') {
      const withMatch = cappedAnnual + employerAnnual
      if (withMatch > CONTRIBUTION_LIMITS.totalAnnualAdditions) {
        warnings.push(
          `Pre-tax 401(k) contributions plus employer match exceed the $${CONTRIBUTION_LIMITS.totalAnnualAdditions.toLocaleString()} §415(c) total-additions limit.`,
        )
      }
      cappedAnnual = withMatch
    }

    return {
      id: v.id,
      label: meta.label,
      treatment: meta.treatment,
      monthlyContribution: round2(annual / 12),
      annualContribution: round2(annual),
      cappedAnnualContribution: round2(cappedAnnual),
      capWarning: cap != null && scale < 1
        ? `Reduced to the $${cap.toLocaleString()} statutory limit, shared with the other accounts of this type.`
        : null,
      currentBalance: v.currentBalance,
      annualReturnPct: v.annualReturnPct,
      projectedBalance: round2(
        futureValue(v.currentBalance, cappedAnnual / 12, v.annualReturnPct, yearsToRetirement),
      ),
    }
  })

  const totalProjectedBalance = round2(vehicles.reduce((s, v) => s + v.projectedBalance, 0))

  const byTreatment: Record<TaxTreatment, number> = { pretax: 0, roth: 0, taxable: 0 }
  for (const v of vehicles) byTreatment[v.treatment] = round2(byTreatment[v.treatment] + v.projectedBalance)

  // ── Cash flow today ──
  // Contributions are counted at what the user actually funds (uncapped
  // request), because that is what leaves their paycheck — the cap changes
  // where the money can go, not whether it was withheld.
  const totalMonthlyContribution = round2(
    vehicles.reduce((s, v) => s + v.monthlyContribution, 0) + emergencyMonthly,
  )
  const retirementMonthly = vehicles.reduce((s, v) => s + v.monthlyContribution, 0)
  const monthlyAfterSavings = round2(gross - totalMonthlyContribution)
  const monthlyAfterSavingsAndExpenses = round2(monthlyAfterSavings - inputs.monthlyExpenses)

  if (monthlyAfterSavingsAndExpenses < 0) {
    warnings.push('This savings rate leaves less than your essential expenses each month — the plan does not balance as entered.')
  }

  // ── Drawdown ──
  const months = yearsInRetirement * 12
  const monthlyDrawdown = months > 0 ? round2(totalProjectedBalance / months) : 0

  return {
    yearsToRetirement,
    yearsInRetirement,
    emergency,
    vehicles,
    totalMonthlyContribution,
    employerMonthlyContribution: round2(employerAnnual / 12),
    totalProjectedBalance,
    byTreatment,
    monthlyDrawdown,
    monthlyRetirementIncome: round2(monthlyDrawdown + inputs.otherMonthlyIncome),
    monthlyAfterSavings,
    monthlyAfterSavingsAndExpenses,
    affordable: monthlyAfterSavingsAndExpenses >= 0,
    savingsRatePct: gross > 0 ? round2((retirementMonthly / gross) * 100) : 0,
    warnings,
  }
}
