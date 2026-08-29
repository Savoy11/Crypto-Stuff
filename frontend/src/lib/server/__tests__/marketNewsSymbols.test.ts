import { describe, it, expect } from 'vitest'
import { detectSymbols, requestedMatcher } from '../marketNewsSymbols'

describe('detectSymbols (catalog matchers)', () => {
  it('matches a company name case-insensitively', () => {
    expect(detectSymbols('apple beats on services revenue')).toContain('AAPL')
  })

  it('matches a bare uppercase ticker but not the lowercase word', () => {
    expect(detectSymbols('AAPL climbs after hours')).toContain('AAPL')
    expect(detectSymbols('he ate an aapl')).not.toContain('AAPL')
  })

  it('requires a cashtag for common-word symbols', () => {
    // "CAT bounced" (the animal, the sentence, whatever) must not tag
    // Caterpillar; the explicit "$CAT" must.
    expect(detectSymbols('the CAT was let out of the bag')).not.toContain('CAT')
    expect(detectSymbols('$CAT beat on mining equipment demand')).toContain('CAT')
  })
})

describe('requestedMatcher (off-catalog symbol mode)', () => {
  it('returns null for a symbol the equity catalog already covers', () => {
    expect(requestedMatcher('AAPL')).toBeNull()
  })

  it('gives a catalog fund its full-name matcher', () => {
    const m = requestedMatcher('VOO')!
    expect(m).not.toBeNull()
    expect(m.name!.test('inflows into the Vanguard S&P 500 ETF continued')).toBe(true)
    expect(detectSymbols('investors favored VOO this week', m)).toContain('VOO')
  })

  it('matches an arbitrary ticker on explicit mention only', () => {
    // SOFI is in neither catalog — the matcher must still work, from the
    // ticker alone, with no name to look for. That is the honest limit.
    const m = requestedMatcher('SOFI')!
    expect(m.name).toBeNull()
    expect(detectSymbols('$SOFI extended its rally', m)).toContain('SOFI')
    expect(detectSymbols('SOFI extended its rally', m)).toContain('SOFI')
    expect(detectSymbols('the sofia summit concluded', m)).not.toContain('SOFI')
  })

  it('escapes regex metacharacters in class-share tickers', () => {
    const m = requestedMatcher('BRK.A')
    // '.' must be literal: "BRKxA" must not match.
    expect(m).not.toBeNull()
    expect(detectSymbols('$BRK.A traded higher', m)).toContain('BRK.A')
    expect(detectSymbols('BRKXA traded higher', m)).not.toContain('BRK.A')
  })

  it('refuses non-ticker-shaped input rather than building a regex from it', () => {
    expect(requestedMatcher('(.+)')).toBeNull()
    expect(requestedMatcher('TOOLONGSYM')).toBeNull()
  })

  it('detection caps at six symbols per article', () => {
    const text = 'Apple Microsoft Nvidia Amazon Alphabet Meta Tesla Broadcom all rallied'
    expect(detectSymbols(text).length).toBeLessThanOrEqual(6)
  })
})
