import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_SOURCES, requiredAttributions, getSource } from '../dataSources'
import { SOURCE_TERMS } from '@/lib/server/sourceTerms'

/**
 * CoinGecko's API Terms clause 4 (read 2026-08-29) prescribes the attribution
 * MESSAGE, not merely the fact of attribution:
 *
 *   "displaying prominently the message 'Powered by CoinGecko' in a legible
 *    font ... no smaller than font size 10"
 *
 * "Source: CoinGecko" does not satisfy that however accurate it is, which is
 * why this is a separate mechanism from describeSource's provenance wording.
 */

describe('requiredAttributions', () => {
  it('returns CoinGecko\'s prescribed message verbatim', () => {
    const attrs = requiredAttributions(getSource('markets')!)
    const cg = attrs.find((a) => a.text.includes('CoinGecko'))
    expect(cg, 'markets is CoinGecko-sourced and must carry its attribution').toBeDefined()
    expect(cg!.text).toBe('Powered by CoinGecko')
    expect(cg!.minFontPx).toBe(10)
  })

  it('deduplicates by text, so one provider named twice is attributed once', () => {
    const entry = {
      ...getSource('markets')!,
      providers: [...getSource('markets')!.providers, ...getSource('markets')!.providers],
    }
    const texts = requiredAttributions(entry).map((a) => a.text)
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('returns nothing for sources whose licences require no wording', () => {
    // Government data carries no attribution clause — inventing one would
    // imply an obligation that does not exist.
    const sec = DATA_SOURCES.find((e) => e.providers.some((p) => p.host?.includes('sec.gov')))
    if (sec) expect(requiredAttributions(sec)).toEqual([])
  })

  it('every entry sourcing CoinGecko carries the attribution', () => {
    // The real risk: a new /live-data route reads CoinGecko, is registered, and
    // ships with no required attribution because nobody remembered.
    for (const e of DATA_SOURCES) {
      const usesCg = e.providers.some((p) => p.host?.includes('coingecko.com'))
      if (!usesCg) continue
      expect(
        requiredAttributions(e).some((a) => a.text === 'Powered by CoinGecko'),
        `${e.id} reads CoinGecko but carries no "Powered by CoinGecko" attribution`,
      ).toBe(true)
    }
  })
})

describe('SourceLine renders it at or above the licensed floor', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/components/ui/SourceLine.tsx'), 'utf8')

  it('renders the attribution list', () => {
    expect(src).toContain('requiredAttributions')
    expect(src).toContain('attributions.map')
  })

  it('uses a font size at or above every licensed minimum', () => {
    // Parse the class actually applied to the attribution element, rather than
    // trusting that someone kept it in step with the clause.
    const block = src.slice(src.indexOf('attributions.map'))
    const px = block.match(/text-\[(\d+)px\]/)
    expect(px, 'attribution element has no explicit px size to check').not.toBeNull()
    const floor = Math.max(
      ...DATA_SOURCES.flatMap((e) => requiredAttributions(e))
        .map((a) => a.minFontPx ?? 0),
    )
    expect(Number(px![1])).toBeGreaterThanOrEqual(floor)
  })
})

describe('the registry records the reading, not an assumption', () => {
  it('CoinGecko is verified against the API terms, not the site terms', () => {
    const cg = SOURCE_TERMS.find((e) => e.domain === 'coingecko.com')!
    expect(cg.review).toBe('verified')
    expect(cg.reviewedAt).toBe('2026-08-29')
    // The document matters: the site ToU is what the probe read and what
    // produced the false "non-commercial only" alarm.
    expect(cg.termsUrl).toContain('api_terms')
    expect(cg.conditions?.some((c) => c.includes('Powered by CoinGecko'))).toBe(true)
  })
})
