import { describe, expect, it } from 'vitest'
import {
  STAKING_DATA_LAST_VERIFIED,
  STAKING_DATA_STALE_AFTER_DAYS,
  stakingDataAgeDays,
  stakingDataIsStale,
  getStakingDataProvenance,
} from '../stakingProviders'

// The provider catalog is hand-maintained reference data presented alongside
// live APRs, so its age has to be computed rather than asserted by hand. `now`
// is injectable on every helper precisely so these boundaries are testable
// without freezing the clock.

const verified = new Date(STAKING_DATA_LAST_VERIFIED)
const daysAfter = (n: number) => new Date(verified.getTime() + n * 86_400_000)

describe('staking data provenance', () => {
  it('exposes a parseable ISO verification date', () => {
    expect(STAKING_DATA_LAST_VERIFIED).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(verified.getTime())).toBe(false)
  })

  it('counts whole days since the catalog was compiled', () => {
    expect(stakingDataAgeDays(verified)).toBe(0)
    expect(stakingDataAgeDays(daysAfter(30))).toBe(30)
    expect(stakingDataAgeDays(daysAfter(365))).toBe(365)
  })

  it('goes stale strictly after the review window, not on it', () => {
    expect(stakingDataIsStale(daysAfter(STAKING_DATA_STALE_AFTER_DAYS))).toBe(false)
    expect(stakingDataIsStale(daysAfter(STAKING_DATA_STALE_AFTER_DAYS + 1))).toBe(true)
  })

  it('steps confidence down with age', () => {
    expect(getStakingDataProvenance(daysAfter(0)).confidence).toBe('high')
    expect(getStakingDataProvenance(daysAfter(45)).confidence).toBe('high')
    expect(getStakingDataProvenance(daysAfter(46)).confidence).toBe('medium')
    expect(getStakingDataProvenance(daysAfter(STAKING_DATA_STALE_AFTER_DAYS)).confidence).toBe('medium')
    expect(getStakingDataProvenance(daysAfter(STAKING_DATA_STALE_AFTER_DAYS + 1)).confidence).toBe('low')
  })

  it('reports low confidence exactly when it reports stale', () => {
    for (const d of [0, 45, 46, 89, 90, 91, 400]) {
      const prov = getStakingDataProvenance(daysAfter(d))
      expect(prov.stale, `day ${d}`).toBe(prov.confidence === 'low')
    }
  })

  it('carries a source string and echoes the verification date', () => {
    const prov = getStakingDataProvenance(daysAfter(10))
    expect(prov.source.length).toBeGreaterThan(0)
    expect(prov.verifiedAt).toBe(STAKING_DATA_LAST_VERIFIED)
    expect(prov.ageDays).toBe(10)
  })

  it('does not claim the catalog was verified in the future', () => {
    // A verification date ahead of today would render as a negative age and
    // read as permanently fresh — the failure mode this machinery exists to
    // prevent, so it is worth a guard rather than a convention.
    expect(stakingDataAgeDays()).toBeGreaterThanOrEqual(0)
  })
})
