import { describe, it, expect } from 'vitest'
import { computeAssetMix } from '../assetMix'

// NT9. These percentages are read as "what am I actually holding", so the
// engine is pure and tested per the house rule for user-actionable figures.

const h = (pctVal: number | null, assetCat: string | null) => ({ pctVal, assetCat })

describe('computeAssetMix', () => {
  it('maps N-PORT categories onto the donut slices', () => {
    const { slices } = computeAssetMix([
      h(60, 'EC'), h(20, 'DBT'), h(10, 'STIV'), h(5, 'EP'), h(3, 'DE'), h(2, 'COMM'),
    ])
    expect(slices).toEqual([
      { label: 'Stocks', pct: 60 },
      { label: 'Bonds', pct: 20 },
      { label: 'Cash', pct: 10 },
      { label: 'Preferred', pct: 5 },
      { label: 'Derivatives', pct: 3 },
      { label: 'Other', pct: 2 },
    ])
  })

  it('sums multiple positions in the same category', () => {
    const { slices } = computeAssetMix([h(30, 'EC'), h(25, 'EC'), h(45, 'DBT')])
    expect(slices).toEqual([{ label: 'Stocks', pct: 55 }, { label: 'Bonds', pct: 45 }])
  })

  it('treats every debt-flavoured code as bonds', () => {
    const { slices } = computeAssetMix([
      h(10, 'DBT'), h(10, 'ABS-MBS'), h(10, 'ABS-CBDO'), h(10, 'LON'), h(10, 'SN'),
    ])
    expect(slices).toEqual([{ label: 'Bonds', pct: 50 }])
  })

  it('reports coverage instead of rescaling a partial filing to 100%', () => {
    // The specific failure this guards: a 96%-covered filing scaled to 100%
    // silently redistributes 4% nobody disclosed into categories it may not
    // belong to. Same rule the look-through engine follows.
    const { slices, coveredPct } = computeAssetMix([h(70, 'EC'), h(26, 'DBT')])
    expect(coveredPct).toBe(96)
    expect(slices.reduce((a, s) => a + s.pct, 0)).toBe(96)
  })

  it('sends an unknown category to Other and counts it, rather than guessing', () => {
    const { slices, unclassifiedCount } = computeAssetMix([h(90, 'EC'), h(10, 'XYZ')])
    expect(slices).toContainEqual({ label: 'Other', pct: 10 })
    // 'XYZ' is unmapped but present, so it is classified as Other and NOT
    // counted as unclassified — unclassified means the filer gave us nothing.
    expect(unclassifiedCount).toBe(0)
  })

  it('counts positions with no assetCat at all as unclassified', () => {
    const { slices, unclassifiedCount } = computeAssetMix([h(80, 'EC'), h(20, null)])
    expect(unclassifiedCount).toBe(1)
    expect(slices).toContainEqual({ label: 'Other', pct: 20 })
  })

  it('skips positions with no percent figure rather than valuing them at zero-weight guesses', () => {
    const { slices, coveredPct } = computeAssetMix([h(50, 'EC'), h(null, 'DBT')])
    expect(coveredPct).toBe(50)
    expect(slices).toEqual([{ label: 'Stocks', pct: 50 }])
  })

  it('preserves negative weights from short positions', () => {
    // A short book is real exposure. Clamping it to zero would make the fund
    // look like it holds more than it does.
    const { slices, coveredPct } = computeAssetMix([h(105, 'EC'), h(-5, 'DE')])
    expect(slices).toContainEqual({ label: 'Derivatives', pct: -5 })
    expect(coveredPct).toBe(100)
  })

  it('drops slices that round to zero', () => {
    const { slices } = computeAssetMix([h(100, 'EC'), h(0.001, 'DE')])
    expect(slices).toEqual([{ label: 'Stocks', pct: 100 }])
  })

  it('degenerates cleanly on an empty filing', () => {
    expect(computeAssetMix([])).toEqual({ slices: [], coveredPct: 0, unclassifiedCount: 0 })
  })
})
