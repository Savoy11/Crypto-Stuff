import { describe, it, expect } from 'vitest'
import {
  compareAssetClasses, CLASS_PROFILES, DIMENSION_LABELS, type DimensionId,
} from '../assetClassProfiles'
import type { InstrumentClass } from '@/lib/data/instruments'

const ALL: InstrumentClass[] = ['crypto', 'equity', 'etf', 'mutual', 'commodity', 'currency', 'rate']

describe('CLASS_PROFILES completeness', () => {
  it('covers every instrument class on every dimension', () => {
    // Guards the guard: a class added to instruments.ts without a profile
    // would render an empty column in the comparison panel.
    for (const c of ALL) {
      expect(CLASS_PROFILES[c], `missing profile for ${c}`).toBeDefined()
      for (const d of Object.keys(DIMENSION_LABELS) as DimensionId[]) {
        expect(CLASS_PROFILES[c].dimensions[d], `${c} missing ${d}`).toBeTruthy()
      }
    }
  })

  it('never uses advice vocabulary', () => {
    // The owner's line: explanation stays, recommendation goes. These words
    // appearing in a profile cell would put the panel on the wrong side of it.
    const forbidden = /\b(should|recommend|buy|sell|avoid|best|worst|better investment|safer choice)\b/i
    for (const c of ALL) {
      expect(CLASS_PROFILES[c].whatItIs).not.toMatch(forbidden)
      for (const text of Object.values(CLASS_PROFILES[c].dimensions)) {
        expect(text, `advice wording in ${c}`).not.toMatch(forbidden)
      }
    }
  })
})

describe('compareAssetClasses', () => {
  it('returns null below two distinct classes — no empty panel', () => {
    expect(compareAssetClasses([])).toBeNull()
    expect(compareAssetClasses(['equity'])).toBeNull()
    expect(compareAssetClasses(['equity', 'equity', 'equity'])).toBeNull()
  })

  it('deduplicates while preserving first-seen order', () => {
    const r = compareAssetClasses(['crypto', 'equity', 'crypto', 'equity'])!
    expect(r.classes).toEqual(['crypto', 'equity'])
  })

  it('partitions every dimension into shared or differing, never both or neither', () => {
    const r = compareAssetClasses(['equity', 'crypto'])!
    const total = r.similarities.length + r.differences.length
    expect(total).toBe(Object.keys(DIMENSION_LABELS).length)
  })

  it('finds genuine sharing between ETFs and mutual funds', () => {
    // Both are pooled vehicles: ownership, income and supply answers are
    // written identically on purpose. If someone edits one side, this fails
    // and forces the question "did they really stop being alike?"
    const r = compareAssetClasses(['etf', 'mutual'])!
    const sharedDims = r.similarities.map((row) => row.dimension)
    expect(sharedDims).toContain('ownership')
    expect(sharedDims).toContain('income')
    expect(sharedDims).toContain('supply')
    // And they genuinely differ on trading mechanics.
    expect(r.differences.map((row) => row.dimension)).toContain('hours')
  })

  it('stock vs crypto differs on every dimension', () => {
    const r = compareAssetClasses(['equity', 'crypto'])!
    expect(r.similarities).toEqual([])
    expect(r.differences).toHaveLength(Object.keys(DIMENSION_LABELS).length)
  })

  it('emits the weekend-overlap caveat only for crypto mixed with market-hours assets', () => {
    const mixed = compareAssetClasses(['crypto', 'equity'])!
    expect(mixed.caveats.some((c) => c.includes('weekend'))).toBe(true)
    const noCrypto = compareAssetClasses(['equity', 'etf'])!
    expect(noCrypto.caveats.some((c) => c.includes('weekend'))).toBe(false)
  })

  it('emits the not-investable caveat for rate indices', () => {
    const r = compareAssetClasses(['rate', 'equity'])!
    expect(r.caveats.some((c) => c.includes('not investable'))).toBe(true)
  })

  it('emits carry, NAV and futures-roll caveats for their classes', () => {
    const r = compareAssetClasses(['currency', 'mutual', 'commodity'])!
    expect(r.caveats.some((c) => c.includes('carry'))).toBe(true)
    expect(r.caveats.some((c) => c.includes('NAV'))).toBe(true)
    expect(r.caveats.some((c) => c.includes('rolling') || c.includes('roll'))).toBe(true)
  })

  it('only includes values for the classes actually compared', () => {
    const r = compareAssetClasses(['equity', 'commodity'])!
    for (const row of [...r.similarities, ...r.differences]) {
      expect(Object.keys(row.values).sort()).toEqual(['commodity', 'equity'])
    }
  })
})
