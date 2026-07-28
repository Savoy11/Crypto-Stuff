import { describe, it, expect } from 'vitest'
import { classifyPillar } from '@/lib/server/macroPillar'

// The classifier decides which chip a macro headline appears under, and a
// misfile hides the story from the filter a reader is actually using.
// Regression: "pound" (the weight) and "oil/gas" (a slashed pair) were treated
// as currency signals and tested FIRST, so commodity stories were filed under
// Currencies.

describe('classifyPillar', () => {
  it('files a commodity story quoted per pound under commodities', () => {
    expect(classifyPillar('Coffee futures climb to 320 cents a pound', null)).toBe('commodities')
    expect(classifyPillar('Copper slips to $4.10 a pound on China demand', null)).toBe('commodities')
    expect(classifyPillar('Live cattle settle higher per pound', null)).toBe('commodities')
  })

  it('does not read a slashed commodity phrase as a currency pair', () => {
    expect(classifyPillar('Oil/gas rig count falls for a third week', null)).toBe('commodities')
  })

  it('still files real sterling stories under currencies', () => {
    expect(classifyPillar('The pound slipped after the Bank of England held rates', null)).toBe('currencies')
    expect(classifyPillar('Pound sterling rallies to a two-year high', null)).toBe('currencies')
  })

  it('still reads an explicit FX pair as a currency story', () => {
    expect(classifyPillar('EUR/USD holds gains ahead of the ECB', null)).toBe('currencies')
  })

  it('keeps unambiguous currency names winning over other signals', () => {
    // A named currency beats a bonds signal — an FX story about a central bank
    // is a currency story.
    expect(classifyPillar('Turkish lira falls as inflation expectations rise', null)).toBe('currencies')
    expect(classifyPillar('Yen weakens as the BoJ holds its yield target', null)).toBe('currencies')
  })

  it('still classifies plain bonds and commodities stories', () => {
    expect(classifyPillar('Treasury yields rise ahead of the FOMC decision', null)).toBe('bonds')
    expect(classifyPillar('Gold steadies near record highs', null)).toBe('commodities')
  })

  it('drops an off-pillar story rather than guessing', () => {
    expect(classifyPillar('Tech earnings beat expectations', null)).toBeNull()
  })

  it('honours the feed default when nothing matches', () => {
    expect(classifyPillar('Market wrap for Tuesday', 'commodities')).toBe('commodities')
  })
})
