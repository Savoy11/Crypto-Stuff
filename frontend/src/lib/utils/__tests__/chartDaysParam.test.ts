import { describe, expect, it } from 'vitest'
import { normalizeDaysParam } from '../chartParams'

// Guards the client/server vocabulary contract between the Compare page's range
// buttons and /live-data/chart. The bug this pins: 'max' failed a numeric-only
// guard and was silently rewritten to '365', so the MAX range returned one year
// of history with no error — and because commonStartTime() takes the latest
// first-timestamp across series, that truncation clipped the window for every
// other symbol in the comparison too.
describe('normalizeDaysParam', () => {
  it("accepts 'max' — the Compare page's MAX range sends it and CoinGecko honors it", () => {
    expect(normalizeDaysParam('max')).toBe('max')
  })

  it('passes positive numeric windows through unchanged', () => {
    // These are exactly the values RANGES declares on the Compare page.
    for (const days of ['30', '90', '180', '365', '1825']) {
      expect(normalizeDaysParam(days)).toBe(days)
    }
  })

  it('defaults to 365 when the param is absent', () => {
    expect(normalizeDaysParam(null)).toBe('365')
    expect(normalizeDaysParam(undefined)).toBe('365')
  })

  it('rejects values CoinGecko cannot use, rather than forwarding them', () => {
    expect(normalizeDaysParam('')).toBe('365')
    expect(normalizeDaysParam('0')).toBe('365')
    expect(normalizeDaysParam('-90')).toBe('365')
    expect(normalizeDaysParam('all')).toBe('365')
    expect(normalizeDaysParam('NaN')).toBe('365')
  })

  it("is case-sensitive on 'max' — only the value CoinGecko documents is forwarded", () => {
    expect(normalizeDaysParam('MAX')).toBe('365')
  })
})
