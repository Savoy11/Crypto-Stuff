import { describe, expect, it } from 'vitest'
import { bandForScore, composeRisk, validateProfile } from '../engine'
import type { DimensionScore, RiskProfileSpec } from '../types'

const PROFILE: RiskProfileSpec = {
  id: 'test',
  name: 'Test Profile',
  assetClass: 'equities',
  version: '1.0.0',
  dimensions: [
    { key: 'a', label: 'A', description: '', weight: 0.5 },
    { key: 'b', label: 'B', description: '', weight: 0.3 },
    { key: 'c', label: 'C', description: '', weight: 0.2 },
  ],
}

const score = (key: string, value: number | null, confidence = 1): DimensionScore => ({
  key,
  score: value,
  confidence,
  evidence: [],
})

describe('bandForScore', () => {
  it('maps canonical thresholds', () => {
    expect(bandForScore(100)).toBe('low')
    expect(bandForScore(80)).toBe('low')
    expect(bandForScore(79.9)).toBe('moderate')
    expect(bandForScore(60)).toBe('moderate')
    expect(bandForScore(40)).toBe('elevated')
    expect(bandForScore(20)).toBe('high')
    expect(bandForScore(0)).toBe('critical')
  })
})

describe('validateProfile', () => {
  it('accepts a valid profile', () => {
    expect(() => validateProfile(PROFILE)).not.toThrow()
  })

  it('rejects weights not summing to 1', () => {
    const bad = { ...PROFILE, dimensions: [{ key: 'a', label: 'A', description: '', weight: 0.7 }] }
    expect(() => validateProfile(bad)).toThrow(/sum to 1/)
  })

  it('rejects duplicate dimension keys', () => {
    const bad = {
      ...PROFILE,
      dimensions: [
        { key: 'a', label: 'A', description: '', weight: 0.5 },
        { key: 'a', label: 'A2', description: '', weight: 0.5 },
      ],
    }
    expect(() => validateProfile(bad)).toThrow(/duplicate/)
  })
})

describe('composeRisk', () => {
  it('computes the weighted composite with full data', () => {
    const result = composeRisk(PROFILE, [score('a', 80), score('b', 60), score('c', 40)])
    expect(result.score).toBeCloseTo(80 * 0.5 + 60 * 0.3 + 40 * 0.2, 5) // 66
    expect(result.band).toBe('moderate')
    expect(result.coverage).toBe(1)
    expect(result.confidence).toBe(1)
    expect(result.warnings).toHaveLength(0)
  })

  it('renormalizes weights over scored dimensions when data is missing', () => {
    const result = composeRisk(PROFILE, [score('a', 80), score('b', 60)])
    // c missing: composite over a+b = (80*.5 + 60*.3) / .8 = 72.5
    expect(result.score).toBeCloseTo(72.5, 5)
    expect(result.coverage).toBeCloseTo(0.8, 5)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('C')
  })

  it('treats explicit null scores as missing data', () => {
    const withNull = composeRisk(PROFILE, [score('a', 80), score('b', 60), score('c', null)])
    const without = composeRisk(PROFILE, [score('a', 80), score('b', 60)])
    expect(withNull.score).toBe(without.score)
    expect(withNull.coverage).toBe(without.coverage)
  })

  it('reduces confidence for missing coverage even when scored dims are confident', () => {
    const result = composeRisk(PROFILE, [score('a', 80, 1)])
    expect(result.coverage).toBeCloseTo(0.5, 5)
    expect(result.confidence).toBeCloseTo(0.5, 5) // 1.0 dim confidence × 0.5 coverage
  })

  it('missing data changes coverage, not the composite score', () => {
    const full = composeRisk(PROFILE, [score('a', 70), score('b', 70), score('c', 70)])
    const partial = composeRisk(PROFILE, [score('a', 70)])
    expect(partial.score).toBe(full.score)
    expect(partial.confidence).toBeLessThan(full.confidence)
  })

  it('clamps out-of-range dimension scores', () => {
    const result = composeRisk(PROFILE, [score('a', 150), score('b', -20), score('c', 50)])
    const a = result.dimensions.find((d) => d.key === 'a')
    const b = result.dimensions.find((d) => d.key === 'b')
    expect(a?.score).toBe(100)
    expect(b?.score).toBe(0)
  })

  it('throws when no dimension has data', () => {
    expect(() => composeRisk(PROFILE, [])).toThrow(/cannot score/)
    expect(() => composeRisk(PROFILE, [score('a', null)])).toThrow(/cannot score/)
  })

  it('throws on scores for unknown dimensions', () => {
    expect(() => composeRisk(PROFILE, [score('nope', 50)])).toThrow(/unknown dimension/)
  })

  it('carries per-dimension bands and evidence through', () => {
    const result = composeRisk(PROFILE, [
      { key: 'a', score: 85, confidence: 1, evidence: [{ metric: 'x', value: 1 }] },
      score('b', 15),
    ])
    const a = result.dimensions.find((d) => d.key === 'a')
    const b = result.dimensions.find((d) => d.key === 'b')
    const c = result.dimensions.find((d) => d.key === 'c')
    expect(a?.band).toBe('low')
    expect(a?.evidence).toEqual([{ metric: 'x', value: 1 }])
    expect(b?.band).toBe('critical')
    expect(c?.band).toBeNull()
  })
})
