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

describe('requestedMatcher with a caller-supplied name', () => {
  it('matches an off-catalog fund by the listing-directory name it was picked with', () => {
    const m = requestedMatcher('QQQM', 'Invesco NASDAQ 100 ETF')!
    expect(m.name!.test('inflows into the Invesco NASDAQ 100 ETF accelerated')).toBe(true)
    expect(detectSymbols('the Invesco NASDAQ 100 ETF gained', m)).toContain('QQQM')
  })

  it('the catalog name wins over a caller-supplied one', () => {
    // A caller cannot re-aim a catalog fund's matcher at unrelated text.
    const m = requestedMatcher('VOO', 'Completely Different Name')!
    expect(m.name!.test('the Vanguard S&P 500 ETF rallied')).toBe(true)
    expect(m.name!.test('Completely Different Name surged')).toBe(false)
  })

  it('rejects an over-long caller name instead of building a matcher from it', () => {
    const m = requestedMatcher('ZZZT', 'x'.repeat(200))!
    expect(m.name).toBeNull()
  })

  it('treats the caller name as a literal, not a pattern', () => {
    const m = requestedMatcher('ZZZT', 'A(.*)B')!
    expect(m.name!.test('literally printed A(.*)B here')).toBe(true)
    expect(m.name!.test('AxxxxB')).toBe(false)
  })
})
