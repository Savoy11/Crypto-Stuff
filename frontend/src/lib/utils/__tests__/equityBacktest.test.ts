import { describe, expect, it } from 'vitest'
import { runEquityBacktest } from '../equityBacktest'

// Simple ascending series, 1-day spacing (times in unix seconds).
const T = (n: number) => Array.from({ length: n }, (_, i) => 1_700_000_000 + i * 86_400)

describe('runEquityBacktest', () => {
  it('reconciles trade P&L with the equity curve and executes without lookahead', () => {
    // desired[i-1] is the position during bar i. Signal true for bars 1,2 (0-indexed)
    // means in-market for bars 2 and 3.
    const closes = [100, 110, 121, 130]
    const desired = [false, true, true, false]
    const r = runEquityBacktest(T(4), closes, desired, 252)
    // In-market bars: i=2 (110→121, +10%) and i=3 (121→130, +7.44%) → 1.1*1.0744-1.
    expect(r.totalReturnPct).toBeCloseTo((1.1 * (130 / 121) - 1) * 100, 6)
    // One round trip, entered at close[1]=110, exited at close[3]=130.
    expect(r.trades).toHaveLength(1)
    expect(r.trades[0].entryPrice).toBe(110)
    expect(r.trades[0].exitPrice).toBe(130)
    expect(r.trades[0].returnPct).toBeCloseTo((130 / 110 - 1) * 100, 6)
    // Trade gross return matches the compounded in-market equity gain.
    expect(r.trades[0].returnPct).toBeCloseTo(r.totalReturnPct, 6)
  })

  it('computes buy & hold over the identical window with identical starting capital', () => {
    const closes = [100, 90, 120, 150]
    const desired = [true, true, true, true] // always long ⇒ strategy == buy&hold
    const r = runEquityBacktest(T(4), closes, desired, 252)
    expect(r.totalReturnPct).toBeCloseTo(r.buyHoldReturnPct, 6)
    expect(r.buyHoldReturnPct).toBeCloseTo((150 / 100 - 1) * 100, 6)
    expect(r.exposurePct).toBe(100)
  })

  it('stays flat (0% strategy return) when never in the market', () => {
    const r = runEquityBacktest(T(4), [100, 110, 121, 130], [false, false, false, false], 252)
    expect(r.totalReturnPct).toBeCloseTo(0, 9)
    expect(r.trades).toHaveLength(0)
    expect(r.exposurePct).toBe(0)
    expect(r.winRatePct).toBeNull()
  })

  it('fees drag strategy return below the zero-fee case and charge both sides of a completed round trip', () => {
    // 5 bars so the position actually exits (in→out) inside the window: entry at
    // i=2 (out→in), exit at i=4 (in→out) → both sides charged.
    const closes = [100, 110, 121, 130, 130]
    const desired = [false, true, true, false, false]
    const free = runEquityBacktest(T(5), closes, desired, 252, { feeBps: 0 })
    const paid = runEquityBacktest(T(5), closes, desired, 252, { feeBps: 25 }) // 0.25%/side
    expect(paid.totalReturnPct).toBeLessThan(free.totalReturnPct)
    // Two sides at 0.25% each ≈ 0.5% of drag, compounded — bounded sanity check.
    const drag = free.totalReturnPct - paid.totalReturnPct
    expect(drag).toBeGreaterThan(0.4)
    expect(drag).toBeLessThan(0.8)
  })

  it('does not charge an exit fee for a position still open at the window end (unsold)', () => {
    // Position held through the last bar: only the entry side is charged.
    const closes = [100, 110, 121, 130]
    const desired = [false, true, true, true]
    const free = runEquityBacktest(T(4), closes, desired, 252, { feeBps: 0 })
    const paid = runEquityBacktest(T(4), closes, desired, 252, { feeBps: 25 })
    const drag = free.totalReturnPct - paid.totalReturnPct
    expect(drag).toBeGreaterThan(0.2)   // ~one side
    expect(drag).toBeLessThan(0.4)
  })

  it('charges buy & hold a single entry-side fee (held, not round-tripped)', () => {
    const closes = [100, 110, 121, 130]
    const desired = [true, true, true, true]
    const free = runEquityBacktest(T(4), closes, desired, 252, { feeBps: 0 })
    const paid = runEquityBacktest(T(4), closes, desired, 252, { feeBps: 50 }) // 0.5%/side
    // Buy&hold pays exactly one 0.5% entry fee → final value scaled by 0.995.
    expect((1 + paid.buyHoldReturnPct / 100)).toBeCloseTo((1 + free.buyHoldReturnPct / 100) * 0.995, 6)
  })

  it('returns null CAGR for windows under ~6 months', () => {
    const r = runEquityBacktest(T(10), [100, 101, 102, 103, 104, 105, 106, 107, 108, 109], Array(10).fill(true), 252)
    expect(r.cagrPct).toBeNull() // 9 days ≪ 0.5y
  })
})
