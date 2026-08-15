// IRS contribution limits — hand-maintained reference data.
//
// These are statutory figures the IRS re-indexes for inflation every year, so
// they carry the same provenance machinery as every other curated table in this
// repo (transferFees.ts, stablecoinMeta.ts, fundCatalog.ts). A limit is exactly
// the kind of number that reads as authoritative and quietly goes wrong: a
// stale 402(g) figure tells a user they are maxed out when they have thousands
// of dollars of headroom left, and nothing on screen would say otherwise.
//
// Staleness window is deliberately short. Limits change on a known annual
// cadence (announced each autumn, effective 1 January), so 400 days means "you
// have certainly missed an announcement" rather than "these might be old".

/** Tax year these limits apply to. */
export const LIMITS_TAX_YEAR = 2025

/** When the figures below were last checked against IRS publications. */
export const LIMITS_LAST_VERIFIED = '2026-08-15'

export const LIMITS_STALE_AFTER_DAYS = 400

export interface ContributionLimits {
  /** §402(g) elective deferral cap across all 401(k)/403(b) plans. */
  electiveDeferral: number
  /** §414(v) additional deferral allowed from the year you turn 50. */
  electiveDeferralCatchUp: number
  /** §415(c) total annual additions — employee + employer, per plan. */
  totalAnnualAdditions: number
  /** Combined traditional + Roth IRA cap. */
  ira: number
  /** Additional IRA contribution allowed from the year you turn 50. */
  iraCatchUp: number
}

export const CONTRIBUTION_LIMITS: ContributionLimits = {
  electiveDeferral: 23_500,
  electiveDeferralCatchUp: 7_500,
  totalAnnualAdditions: 70_000,
  ira: 7_000,
  iraCatchUp: 1_000,
}

/** Age from which catch-up contributions are permitted. */
export const CATCH_UP_AGE = 50

export function limitsAgeDays(now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(LIMITS_LAST_VERIFIED).getTime()) / 86_400_000)
}

export function limitsAreStale(now: Date = new Date()): boolean {
  return limitsAgeDays(now) > LIMITS_STALE_AFTER_DAYS
}

export interface LimitsProvenance {
  source: string
  taxYear: number
  verifiedAt: string
  ageDays: number
  stale: boolean
  confidence: 'high' | 'medium' | 'low'
}

export function getLimitsProvenance(now: Date = new Date()): LimitsProvenance {
  const ageDays = limitsAgeDays(now)
  const stale = ageDays > LIMITS_STALE_AFTER_DAYS
  return {
    source: `IRS contribution limits, tax year ${LIMITS_TAX_YEAR}`,
    taxYear: LIMITS_TAX_YEAR,
    verifiedAt: LIMITS_LAST_VERIFIED,
    ageDays,
    stale,
    confidence: stale ? 'low' : ageDays > LIMITS_STALE_AFTER_DAYS / 2 ? 'medium' : 'high',
  }
}

/** The elective-deferral cap applicable at a given age, catch-up included. */
export function deferralCapForAge(age: number): number {
  return CONTRIBUTION_LIMITS.electiveDeferral
    + (age >= CATCH_UP_AGE ? CONTRIBUTION_LIMITS.electiveDeferralCatchUp : 0)
}

/** The combined IRA cap applicable at a given age, catch-up included. */
export function iraCapForAge(age: number): number {
  return CONTRIBUTION_LIMITS.ira + (age >= CATCH_UP_AGE ? CONTRIBUTION_LIMITS.iraCatchUp : 0)
}
