import { describe, it, expect } from 'vitest'
import { buildCurveData } from '../treasuryCurve'
import type { CurveSnapshot } from '../treasuryCurve'

// A curve with just enough points to satisfy the shape checks.
function snap(date: string, y2 = 4.0, y10 = 4.5, m3 = 4.2): CurveSnapshot {
  return {
    date,
    points: [
      { label: '3M', years: 0.25, yieldPct: m3 },
      { label: '2Y', years: 2, yieldPct: y2 },
      { label: '10Y', years: 10, yieldPct: y10 },
    ],
  }
}

describe('buildCurveData', () => {
  it('takes the newest row as latest', () => {
    const d = buildCurveData([snap('2026-03-01'), snap('2026-03-03'), snap('2026-03-02')])
    expect(d.latest.date).toBe('2026-03-03')
  })

  it('picks the closest business day to 30 days back', () => {
    const d = buildCurveData([
      snap('2026-02-01'), snap('2026-02-27'), snap('2026-03-05'), snap('2026-03-31'),
    ])
    // latest 03-31, target 03-01 → 02-27 is closest.
    expect(d.monthAgo.date).toBe('2026-02-27')
  })

  it('computes spreads and shape off the latest curve', () => {
    const d = buildCurveData([snap('2026-03-31', 4.0, 4.5, 4.2)])
    expect(d.spread2s10s).toBe(0.5)
    expect(d.spread3m10y).toBeCloseTo(0.3, 5)
    expect(d.shape).toBe('normal')
  })

  it('reads an inverted curve', () => {
    const d = buildCurveData([snap('2026-03-31', 4.8, 4.5, 5.0)])
    expect(d.spread2s10s).toBe(-0.3)
    expect(d.shape).toBe('inverted')
  })

  it('throws on an empty set rather than inventing a curve', () => {
    expect(() => buildCurveData([])).toThrow(/no parsable curve entries/)
  })

  // W4-C6. The route fetched only the current calendar year, so every January
  // it broke twice: empty file on 1 Jan (503), then under 30 days of history
  // for ~5 weeks, which silently collapsed `monthAgo` onto `latest` and
  // rendered a 30-day change of exactly zero as fact. The fix pulls in year-1;
  // these assert the merged set is read correctly.
  describe('year boundary', () => {
    const merged = [
      snap('2025-12-01', 4.0, 4.4), snap('2025-12-15'), snap('2025-12-31'),
      snap('2026-01-02'), snap('2026-01-05', 4.1, 4.7),
    ]

    it('reaches back into the previous year for the month-ago comparison', () => {
      const d = buildCurveData(merged)
      expect(d.latest.date).toBe('2026-01-05')
      // Target is 2025-12-06; 12-01 is closer than 12-15.
      expect(d.monthAgo.date).toBe('2025-12-01')
      expect(d.monthAgo.date).not.toBe(d.latest.date)
    })

    it('anchors yearStart to the latest row’s own year, not the merged first row', () => {
      const d = buildCurveData(merged)
      expect(d.yearStart.date).toBe('2026-01-02')
    })

    it('falls back to the earliest row when the latest year has only one entry', () => {
      // 1 January, first business day just published.
      const d = buildCurveData([...merged.slice(0, 3), snap('2026-01-02')])
      expect(d.latest.date).toBe('2026-01-02')
      expect(d.yearStart.date).toBe('2026-01-02')
      expect(d.monthAgo.date).toBe('2025-12-01')
    })

    it('still works when only the previous year is available', () => {
      // 1 January before any 2026 row exists — this used to throw and 503.
      const d = buildCurveData(merged.slice(0, 3))
      expect(d.latest.date).toBe('2025-12-31')
      expect(d.yearStart.date).toBe('2025-12-01')
    })
  })
})
