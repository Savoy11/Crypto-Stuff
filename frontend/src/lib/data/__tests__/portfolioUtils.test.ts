import { describe, expect, it } from 'vitest'
import {
  computeHoldings, computeMetrics, computeAnnualIncome,
  computeBacktestResults, summarizeBacktest, validateHoldings, getDiversificationWarnings,
  type Portfolio, type PortfolioHolding,
} from '../portfolioUtils'
import { getEquity } from '../equityCatalog'
import { getFund } from '../fundCatalog'

const holding = (over: Partial<PortfolioHolding>): PortfolioHolding => ({
  cgId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin',
  targetAlloc: 100, entryPrice: null, addedAt: '2026-01-01T00:00:00Z', ...over,
})

const portfolio = (holdings: PortfolioHolding[], startingCapital = 10_000): Portfolio => ({
  id: 'p1', name: 'Test', description: '', startingCapital, holdings,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
})

describe('computeHoldings', () => {
  it('computes positive P&L when price is above entry', () => {
    const p = portfolio([holding({ entryPrice: 100 })])
    const [h] = computeHoldings(p, { bitcoin: 150 })
    expect(h.targetValue).toBe(10_000)
    expect(h.currentValue).toBe(15_000)
    expect(h.pnlUsd).toBe(5_000)
    expect(h.pnlPct).toBe(50)
    expect(h.priceSource).toBe('live')
  })

  it('computes negative P&L when price is below entry', () => {
    const p = portfolio([holding({ entryPrice: 200 })])
    const [h] = computeHoldings(p, { bitcoin: 100 })
    expect(h.currentValue).toBe(5_000)
    expect(h.pnlUsd).toBe(-5_000)
    expect(h.pnlPct).toBe(-50)
  })

  it('a position with no live price is excluded from valuation — null, never cost', () => {
    const p = portfolio([holding({ entryPrice: 100 })])
    const [h] = computeHoldings(p, {})
    expect(h.currentPrice).toBeNull()
    expect(h.currentValue).toBeNull()
    expect(h.pnlUsd).toBeNull()
    expect(h.pnlPct).toBeNull()
    expect(h.priceSource).toBe('none')
  })

  it('a live price with no entry price values at target with no P&L claimed', () => {
    const p = portfolio([holding({ entryPrice: null })])
    const [h] = computeHoldings(p, { bitcoin: 50_000 })
    expect(h.currentValue).toBe(10_000)
    expect(h.pnlUsd).toBeNull()
    expect(h.pnlPct).toBeNull()
  })

  it('a zero entry price never divides — treated as no entry', () => {
    const p = portfolio([holding({ entryPrice: 0 })])
    const [h] = computeHoldings(p, { bitcoin: 100 })
    expect(h.pnlPct).toBeNull()
    expect(h.currentValue).toBe(10_000)
  })

  it('a price of exactly zero is a total loss, not a missing price', () => {
    const p = portfolio([holding({ entryPrice: 100 })])
    const [h] = computeHoldings(p, { bitcoin: 0 })
    expect(h.priceSource).toBe('live')
    expect(h.currentValue).toBe(0)
    expect(h.pnlUsd).toBe(-10_000)
    expect(h.pnlPct).toBe(-100)
  })

  it('target value splits starting capital by allocation', () => {
    const p = portfolio([
      holding({ cgId: 'bitcoin', targetAlloc: 60 }),
      holding({ cgId: 'ethereum', symbol: 'ETH', name: 'Ethereum', targetAlloc: 40 }),
    ])
    const [btc, eth] = computeHoldings(p, {})
    expect(btc.targetValue).toBe(6_000)
    expect(eth.targetValue).toBe(4_000)
  })

  it('an instrument the registry does not know gets NO risk tier, not a middle one', () => {
    // This test used to pin `riskTier: 5` for unknown assets. That default was
    // a fabrication: a defaulted 5 read exactly like an assessed 5 and shaped
    // the weighted figure. Unknown is now null and excluded (with coverage
    // disclosed) — the same unknown-is-not-zero rule as everywhere else.
    const p = portfolio([holding({ cgId: 'no-such-coin' })])
    const [h] = computeHoldings(p, {})
    expect(h.category).toBe('unknown')
    expect(h.riskTier).toBeNull()
  })

  it('known instruments carry their catalog category and risk tier', () => {
    const p = portfolio([holding({ cgId: 'usd-coin', symbol: 'USDC', targetAlloc: 100 })])
    const [h] = computeHoldings(p, {})
    expect(h.category).toBe('stablecoin')
    expect(h.riskTier).toBe(1)
  })
})

describe('computeMetrics', () => {
  it('weighted risk is the allocation-weighted average of risk tiers', () => {
    // BTC tier 3 at 50% + USDC tier 1 at 50% → 2.0
    const p = portfolio([
      holding({ cgId: 'bitcoin', targetAlloc: 50 }),
      holding({ cgId: 'usd-coin', symbol: 'USDC', targetAlloc: 50 }),
    ])
    const m = computeMetrics(p, computeHoldings(p, {}))
    expect(m.weightedRisk).toBe(2)
    expect(m.riskLabel).toBe('Conservative')
  })

  it('risk labels follow the 3/5/7 thresholds', () => {
    const label = (tierCgId: string) => {
      const p = portfolio([holding({ cgId: tierCgId, targetAlloc: 100 })])
      return computeMetrics(p, computeHoldings(p, {})).riskLabel
    }
    expect(label('usd-coin')).toBe('Conservative')  // tier 1
    expect(label('solana')).toBe('Moderate')        // tier 4
  })

  it('total P&L sums holding P&L and expresses it against starting capital', () => {
    const p = portfolio([
      holding({ cgId: 'bitcoin', targetAlloc: 50, entryPrice: 100 }),
      holding({ cgId: 'ethereum', symbol: 'ETH', targetAlloc: 50, entryPrice: 10 }),
    ])
    const h = computeHoldings(p, { bitcoin: 150, ethereum: 5 })
    const m = computeMetrics(p, h)
    // BTC: 5000 → 7500 (+2500); ETH: 5000 → 2500 (−2500)
    expect(m.totalCurrentValue).toBe(10_000)
    expect(m.totalPnlUsd).toBe(0)
    expect(m.totalPnlPct).toBe(0)
    expect(m.hasEntryPrices).toBe(true)
    expect(m.pricesAvailable).toBe(true)
  })

  it('no entry prices anywhere means no P&L claim, current value pinned to target', () => {
    const p = portfolio([holding({})])
    const m = computeMetrics(p, computeHoldings(p, { bitcoin: 50_000 }))
    expect(m.totalPnlUsd).toBeNull()
    expect(m.totalPnlPct).toBeNull()
    expect(m.totalCurrentValue).toBe(10_000)
  })

  it('no prices at all means no current value claim', () => {
    const p = portfolio([holding({ entryPrice: 100 })])
    const m = computeMetrics(p, computeHoldings(p, {}))
    expect(m.totalCurrentValue).toBeNull()
    expect(m.totalPnlUsd).toBeNull()
    expect(m.pricesAvailable).toBe(false)
  })

  // PB-1 (fixed 2026-08-18). This used to pin the opposite behaviour: an
  // unpriced holding entered the total at cost via `currentValue ?? targetValue`,
  // and P&L% divided by the full capital. Both contradicted the page's stated
  // invariant. These tests now enforce it.
  it('with mixed coverage the unpriced holding leaves the totals entirely', () => {
    const p = portfolio([
      holding({ cgId: 'bitcoin', targetAlloc: 50, entryPrice: 100 }),
      holding({ cgId: 'ethereum', symbol: 'ETH', targetAlloc: 50, entryPrice: 10 }),
    ])
    const h = computeHoldings(p, { bitcoin: 200 }) // no ETH price
    const m = computeMetrics(p, h)
    expect(m.totalCurrentValue).toBe(10_000)  // the BTC leg only — ETH is not valued at cost
    expect(m.totalPnlUsd).toBe(5_000)
    expect(m.totalPnlPct).toBe(100)           // +100% of the 5,000 actually priced
  })

  it('pricedPct discloses how much of capital the totals cover', () => {
    const p = portfolio([
      holding({ cgId: 'bitcoin', targetAlloc: 70, entryPrice: 100 }),
      holding({ cgId: 'ethereum', symbol: 'ETH', targetAlloc: 30, entryPrice: 10 }),
    ])
    const full    = computeMetrics(p, computeHoldings(p, { bitcoin: 100, ethereum: 10 }))
    const partial = computeMetrics(p, computeHoldings(p, { bitcoin: 100 }))
    expect(full.pricedPct).toBe(100)
    expect(full.pricedCapital).toBe(10_000)
    expect(partial.pricedPct).toBe(70)
    expect(partial.pricedCapital).toBe(7_000)
  })

  it('a loss on the priced slice is not damped by unpriced capital', () => {
    // The old denominator (full capital) halved this figure, which is the
    // specific way the bug misled: real moves read as smaller than they were.
    const p = portfolio([
      holding({ cgId: 'bitcoin', targetAlloc: 50, entryPrice: 100 }),
      holding({ cgId: 'ethereum', symbol: 'ETH', targetAlloc: 50, entryPrice: 10 }),
    ])
    const m = computeMetrics(p, computeHoldings(p, { bitcoin: 50 }))
    expect(m.totalPnlUsd).toBe(-2_500)
    expect(m.totalPnlPct).toBe(-50)
  })

  it('category breakdown sums allocations and sorts largest first', () => {
    const p = portfolio([
      holding({ cgId: 'usd-coin', symbol: 'USDC', targetAlloc: 20 }),
      holding({ cgId: 'bitcoin', targetAlloc: 50 }),
      holding({ cgId: 'ethereum', symbol: 'ETH', targetAlloc: 30 }),
    ])
    const m = computeMetrics(p, computeHoldings(p, {}))
    // bitcoin + ethereum are both layer1 → merged slice of 80
    expect(m.categoryBreakdown[0]).toMatchObject({ category: 'layer1', pct: 80, value: 8_000 })
    expect(m.categoryBreakdown[1]).toMatchObject({ category: 'stablecoin', pct: 20, value: 2_000 })
    expect(m.stablecoinPct).toBe(20)
  })

  it('largest position and empty-portfolio degenerates', () => {
    const p = portfolio([])
    const m = computeMetrics(p, computeHoldings(p, {}))
    expect(m.largestPosition).toBeNull()
    // An empty portfolio has no risk FIGURE — null, not a number pretending
    // "0 risk", which on a 1-10 scale would read as maximally safe.
    expect(m.weightedRisk).toBeNull()
    expect(m.totalCurrentValue).toBeNull()
    expect(m.categoryBreakdown).toEqual([])

    const p2 = portfolio([
      holding({ cgId: 'bitcoin', targetAlloc: 70 }),
      holding({ cgId: 'ethereum', symbol: 'ETH', targetAlloc: 30 }),
    ])
    const m2 = computeMetrics(p2, computeHoldings(p2, {}))
    expect(m2.largestPosition?.cgId).toBe('bitcoin')
  })
})

describe('computeAnnualIncome', () => {
  const spyYield = getFund('SPY')?.yieldPct ?? 0
  const aaplYield = getEquity('AAPL')?.dividendYieldPct ?? 0

  it('projects income from reference yields over security values', () => {
    const p = portfolio([holding({ cgId: 'sec:SPY', symbol: 'SPY', name: 'SPY', targetAlloc: 100 })])
    const h = computeHoldings(p, { 'sec:SPY': 640 })
    const est = computeAnnualIncome(h)
    expect(est.covered).toBe(1)
    expect(est.income).toBeCloseTo(10_000 * spyYield / 100, 6)
  })

  it('equity dividend yields count too, and crypto holdings never do', () => {
    const p = portfolio([
      holding({ cgId: 'sec:AAPL', symbol: 'AAPL', name: 'Apple', targetAlloc: 50 }),
      holding({ cgId: 'bitcoin', targetAlloc: 50 }),
    ])
    const est = computeAnnualIncome(computeHoldings(p, {}))
    expect(est.covered).toBe(1)
    expect(est.income).toBeCloseTo(5_000 * aaplYield / 100, 6)
  })

  it('a security with no reference yield contributes nothing', () => {
    const p = portfolio([holding({ cgId: 'sec:ZZZNOPE', symbol: 'ZZZNOPE', targetAlloc: 100 })])
    expect(computeAnnualIncome(computeHoldings(p, {}))).toEqual({ income: 0, covered: 0 })
  })

  it('pins: an unpriced security still yields income at its target value (labeled ref)', () => {
    const p = portfolio([holding({ cgId: 'sec:SPY', symbol: 'SPY', targetAlloc: 100 })])
    const est = computeAnnualIncome(computeHoldings(p, {}))
    expect(est.covered).toBe(1)
    expect(est.income).toBeCloseTo(10_000 * spyYield / 100, 6)
  })

  it('income scales with current value when P&L is known', () => {
    const p = portfolio([holding({ cgId: 'sec:SPY', symbol: 'SPY', targetAlloc: 100, entryPrice: 320 })])
    const h = computeHoldings(p, { 'sec:SPY': 640 }) // doubled → value 20k
    expect(computeAnnualIncome(h).income).toBeCloseTo(20_000 * spyYield / 100, 6)
  })
})

describe('computeBacktestResults / summarizeBacktest', () => {
  const p = portfolio([
    holding({ cgId: 'bitcoin', targetAlloc: 60 }),
    holding({ cgId: 'ethereum', symbol: 'ETH', targetAlloc: 40 }),
  ])

  it('per-holding return and value follow the price ratio', () => {
    const [btc, eth] = computeBacktestResults(p,
      { bitcoin: 100, ethereum: 10 },
      { bitcoin: 150, ethereum: 5 })
    expect(btc.returnPct).toBe(50)
    expect(btc.valueThen).toBe(6_000)
    expect(btc.valueNow).toBe(9_000)
    expect(eth.returnPct).toBe(-50)
    expect(eth.valueNow).toBe(2_000)
  })

  it('a holding missing either price gets no return but keeps its allocation dollars', () => {
    const [btc, eth] = computeBacktestResults(p, { bitcoin: 100 }, { bitcoin: 150, ethereum: 5 })
    expect(btc.returnPct).toBe(50)
    expect(eth.returnPct).toBeNull()
    expect(eth.valueNow).toBeNull()
    expect(eth.allocVal).toBe(4_000)
  })

  it('a zero then-price never divides', () => {
    const [btc] = computeBacktestResults(p, { bitcoin: 0 }, { bitcoin: 150 })
    expect(btc.returnPct).toBeNull()
    expect(btc.valueNow).toBeNull()
  })

  it('summary aggregates only holdings with data — partial coverage is not scaled up', () => {
    const results = computeBacktestResults(p, { bitcoin: 100 }, { bitcoin: 150, ethereum: 5 })
    const s = summarizeBacktest(results)
    expect(s).not.toBeNull()
    expect(s!.totalThen).toBe(6_000)
    expect(s!.totalNow).toBe(9_000)
    expect(s!.pnlUsd).toBe(3_000)
    expect(s!.pnlPct).toBe(50)
  })

  it('summary is null when no holding has both prices', () => {
    expect(summarizeBacktest(computeBacktestResults(p, {}, {}))).toBeNull()
  })
})

describe('validateHoldings', () => {
  it('rejects empty, off-100 totals, duplicates and non-positive allocations', () => {
    expect(validateHoldings([])).toHaveLength(1)
    expect(validateHoldings([holding({ targetAlloc: 90 })])[0]).toMatch(/must equal 100/)
    expect(validateHoldings([
      holding({ targetAlloc: 50 }), holding({ targetAlloc: 50 }),
    ]).join(' ')).toMatch(/Duplicate/)
    expect(validateHoldings([holding({ targetAlloc: 100 })])).toEqual([])
  })
})

// ─── All-asset-class portfolios (2026-08-29) ─────────────────────────────────

describe('class-aware breakdown and honest weighted risk', () => {
  it('classifies holdings by key shape even without a catalog entry', () => {
    const p = portfolio([
      holding({ cgId: 'some-new-coin', symbol: 'NEW', name: 'New Coin', targetAlloc: 50 }),
      holding({ cgId: 'sec:XYZ', symbol: 'XYZ', name: 'Xyz Corp', targetAlloc: 50 }),
    ])
    const [coin, stock] = computeHoldings(p, {})
    expect(coin.class).toBe('crypto')
    expect(stock.class).toBe('equity')
  })

  it('never fabricates a risk tier for a non-catalog holding', () => {
    // The bug this forbids: `?? 5` gave an unknown asset the same middle tier
    // as an assessed one, and the weighted figure silently absorbed it.
    const p = portfolio([holding({ cgId: 'some-new-coin', symbol: 'NEW', name: 'New' })])
    const [h] = computeHoldings(p, {})
    expect(h.riskTier).toBeNull()
  })

  it('weights risk over the assessed allocation only, and discloses coverage', () => {
    const p = portfolio([
      holding({ cgId: 'bitcoin', targetAlloc: 50 }),                    // catalog: has a tier
      holding({ cgId: 'unknown-coin', symbol: 'UNK', targetAlloc: 50 }), // no tier
    ])
    const hs = computeHoldings(p, {})
    const m = computeMetrics(p, hs)
    const btcTier = hs[0].riskTier!
    // The average of what was assessed — NOT dragged toward a fabricated 5.
    expect(m.weightedRisk).toBe(btcTier)
    expect(m.riskCoveredPct).toBe(50)
  })

  it('reports null risk — not a number — when nothing carries a tier', () => {
    const p = portfolio([holding({ cgId: 'unknown-coin', symbol: 'UNK' })])
    const m = computeMetrics(p, computeHoldings(p, {}))
    expect(m.weightedRisk).toBeNull()
    expect(m.riskLabel).toBeNull()
    expect(m.riskCoveredPct).toBe(0)
  })

  it('keeps full coverage reporting for an all-catalog portfolio', () => {
    const p = portfolio([
      holding({ cgId: 'bitcoin', targetAlloc: 60 }),
      holding({ cgId: 'ethereum', symbol: 'ETH', name: 'Ethereum', targetAlloc: 40 }),
    ])
    const m = computeMetrics(p, computeHoldings(p, {}))
    expect(m.riskCoveredPct).toBe(100)
    expect(m.weightedRisk).not.toBeNull()
  })

  it('breaks a mixed portfolio down by class, with crypto split by category', () => {
    const p = portfolio([
      holding({ cgId: 'bitcoin', targetAlloc: 25 }),
      holding({ cgId: 'tether', symbol: 'USDT', name: 'Tether', targetAlloc: 25 }),
      holding({ cgId: 'sec:AAPL', symbol: 'AAPL', name: 'Apple', targetAlloc: 25 }),
      holding({ cgId: 'sec:GC=F', symbol: 'GC=F', name: 'Gold Futures', targetAlloc: 25 }),
    ])
    const m = computeMetrics(p, computeHoldings(p, {}))
    const labels = m.categoryBreakdown.map(s => s.label)
    // Stocks and gold are class slices with real labels — the old crypto-only
    // map rendered them blank and "Unknown".
    expect(labels).toContain('Stock')
    expect(labels).toContain('Commodity')
    expect(labels).not.toContain('Unknown')
    // Crypto still splits by its category (BTC and USDT are different slices).
    const cryptoSlices = m.categoryBreakdown.filter(s => !['Stock', 'Commodity'].includes(s.label))
    expect(cryptoSlices.length).toBeGreaterThanOrEqual(2)
    // Slices partition the whole allocation.
    expect(m.categoryBreakdown.reduce((a, s) => a + s.pct, 0)).toBeCloseTo(100)
  })

  it('derives no risk warning from an unknowable risk figure', () => {
    const p = portfolio([holding({ cgId: 'unknown-coin', symbol: 'UNK' })])
    const hs = computeHoldings(p, {})
    const m = computeMetrics(p, hs)
    const warns = getDiversificationWarnings(hs, m)
    expect(warns.some((w: { message: string }) => w.message.includes('risk score'))).toBe(false)
  })
})
