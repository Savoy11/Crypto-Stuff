import { describe, expect, it } from 'vitest'
import {
  annualizedVolatility,
  clamp,
  linear,
  maxDrawdown,
  piecewise,
  tenPointRiskToSafety,
} from '../normalize'

describe('linear', () => {
  it('maps worst→0 and best→100 in either direction', () => {
    expect(linear(1.0, 1.0, 0.1)).toBe(0)
    expect(linear(0.1, 1.0, 0.1)).toBe(100)
    expect(linear(0.55, 1.0, 0.1)).toBeCloseTo(50, 5)
    expect(linear(0, 0, 10)).toBe(0)
    expect(linear(10, 0, 10)).toBe(100)
  })

  it('clamps outside the range', () => {
    expect(linear(2.0, 1.0, 0.1)).toBe(0)
    expect(linear(0.01, 1.0, 0.1)).toBe(100)
  })
})

describe('piecewise', () => {
  const points: Array<[number, number]> = [
    [10, 20],
    [50, 60],
    [100, 90],
  ]

  it('clamps below the first and above the last point', () => {
    expect(piecewise(5, points)).toBe(20)
    expect(piecewise(500, points)).toBe(90)
  })

  it('hits calibration points exactly', () => {
    expect(piecewise(10, points)).toBe(20)
    expect(piecewise(50, points)).toBe(60)
    expect(piecewise(100, points)).toBe(90)
  })

  it('interpolates between points', () => {
    expect(piecewise(30, points)).toBeCloseTo(40, 5)
    expect(piecewise(75, points)).toBeCloseTo(75, 5)
  })

  it('throws on an empty point list', () => {
    expect(() => piecewise(1, [])).toThrow()
  })
})

describe('tenPointRiskToSafety', () => {
  it('inverts the staking 1–10 scale onto 0–100', () => {
    expect(tenPointRiskToSafety(1)).toBe(100)
    expect(tenPointRiskToSafety(10)).toBe(0)
    expect(tenPointRiskToSafety(5.5)).toBe(50)
  })

  it('preserves ordering (riskier in → lower safety out)', () => {
    expect(tenPointRiskToSafety(3)).toBeGreaterThan(tenPointRiskToSafety(7))
  })
})

describe('annualizedVolatility', () => {
  it('returns null with insufficient data', () => {
    expect(annualizedVolatility([100, 101])).toBeNull()
  })

  it('returns 0 for a flat series', () => {
    expect(annualizedVolatility(Array(30).fill(100))).toBe(0)
  })

  it('scores a swingier series as more volatile', () => {
    const calm = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i) * 0.5)
    const wild = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i) * 15)
    expect(annualizedVolatility(wild)!).toBeGreaterThan(annualizedVolatility(calm)!)
  })
})

describe('maxDrawdown', () => {
  it('returns null with insufficient data', () => {
    expect(maxDrawdown([100])).toBeNull()
  })

  it('is 0 for a monotonically rising series', () => {
    expect(maxDrawdown([100, 110, 120, 130])).toBe(0)
  })

  it('finds the worst peak-to-trough drop', () => {
    // Peak 200, trough 100 → 50% drawdown, despite later recovery.
    expect(maxDrawdown([100, 200, 150, 100, 180])).toBeCloseTo(0.5, 5)
  })
})

describe('clamp', () => {
  it('bounds values', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})
