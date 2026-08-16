import { describe, it, expect } from 'vitest'
import {
  diffHoldings, CHANGE_THRESHOLD_PP, MAX_CHANGES,
  type DisclosedHolding,
} from '../holdingsDiff'

function h(key: string, weightPct: number, shares: number | null = null): DisclosedHolding {
  return { key, symbol: key, name: `${key} Inc`, weightPct, shares }
}

const asMap = (...holdings: DisclosedHolding[]) =>
  new Map(holdings.map((x) => [x.key, x]))

describe('diffHoldings', () => {
  it('classifies a position absent → present as added, with full weight as delta', () => {
    const { summary, changes } = diffHoldings(asMap(h('AAPL', 6.5)), asMap())
    expect(summary.added).toBe(1)
    expect(summary.exited).toBe(0)
    const row = changes[0]
    expect(row.action).toBe('added')
    expect(row.weightPct).toBe(6.5)
    expect(row.prevWeightPct).toBeNull()
    expect(row.deltaPct).toBe(6.5)
    expect(row.prevShares).toBeNull()
  })

  it('classifies a position present → absent as exited, with negative delta', () => {
    const { summary, changes } = diffHoldings(asMap(), asMap(h('TSLA', 2.0, 300)))
    expect(summary.exited).toBe(1)
    const row = changes[0]
    expect(row.action).toBe('exited')
    expect(row.weightPct).toBeNull()
    expect(row.prevWeightPct).toBe(2)
    expect(row.deltaPct).toBe(-2)
    expect(row.shares).toBeNull()
    expect(row.prevShares).toBe(300)
  })

  it('moves at or above the threshold classify as increased/decreased', () => {
    // Exactly the threshold is a change — only strictly-smaller moves are unchanged.
    const { summary, changes } = diffHoldings(
      asMap(h('UP', 1 + CHANGE_THRESHOLD_PP), h('DOWN', 1 - 0.05)),
      asMap(h('UP', 1), h('DOWN', 1)),
    )
    expect(summary.increased).toBe(1)
    expect(summary.decreased).toBe(1)
    expect(summary.unchanged).toBe(0)
    expect(changes.find((c) => c.symbol === 'UP')?.action).toBe('increased')
    expect(changes.find((c) => c.symbol === 'DOWN')?.action).toBe('decreased')
  })

  it('counts sub-threshold moves as unchanged and omits them from changes', () => {
    const { summary, changes } = diffHoldings(
      asMap(h('MSFT', 10.015)),
      asMap(h('MSFT', 10.0)),
    )
    expect(summary.unchanged).toBe(1)
    expect(summary.increased).toBe(0)
    expect(changes).toHaveLength(0)
    // The sub-threshold move still contributes to turnover (0.015/2, 2dp).
    expect(summary.turnoverPct).toBe(0.01)
  })

  it('computes turnover as the sum of absolute weight moves over two', () => {
    // A: 50→55 (|5|), B: new 10, C: exited 10 → (5+10+10)/2 = 12.5
    const { summary } = diffHoldings(
      asMap(h('A', 55), h('B', 10)),
      asMap(h('A', 50), h('C', 10)),
    )
    expect(summary.turnoverPct).toBe(12.5)
    expect(summary.currentCount).toBe(2)
    expect(summary.previousCount).toBe(2)
  })

  it('handles empty periods without NaN', () => {
    const { summary, changes } = diffHoldings(asMap(), asMap())
    expect(changes).toEqual([])
    expect(summary).toEqual({
      added: 0, exited: 0, increased: 0, decreased: 0, unchanged: 0,
      turnoverPct: 0, currentCount: 0, previousCount: 0,
    })
  })

  it('sorts changes by absolute delta and rounds weights to 3 decimals', () => {
    const { changes } = diffHoldings(
      asMap(h('SMALL', 1.111111), h('BIG', 9)),
      asMap(h('SMALL', 1), h('BIG', 1)),
    )
    expect(changes.map((c) => c.symbol)).toEqual(['BIG', 'SMALL'])
    expect(changes[1].weightPct).toBe(1.111)
    expect(changes[1].deltaPct).toBe(0.111)
  })

  it('caps the change list at MAX_CHANGES but summarizes everything', () => {
    const current = asMap(...Array.from({ length: MAX_CHANGES + 20 }, (_, i) => h(`S${i}`, 0.5)))
    const { summary, changes } = diffHoldings(current, asMap())
    expect(changes).toHaveLength(MAX_CHANGES)
    expect(summary.added).toBe(MAX_CHANGES + 20)
  })
})
