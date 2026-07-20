// Pure long/flat backtest engine for the equity Strategy Backtests page.
// Extracted from the page so it can be unit-tested (no-lookahead reconciliation,
// benchmark parity, transaction-cost drag). This is NOT the shared
// lib/utils/backtest.ts engine — it is the equity page's own simpler model.

export interface BacktestTrade {
  entryTime: number
  exitTime: number
  entryPrice: number
  exitPrice: number
  /** Gross price return of the round trip, in percent (fees not deducted here). */
  returnPct: number
}

export interface BacktestResult {
  curve: Array<{ t: number; strategy: number; buyHold: number }>
  totalReturnPct: number
  buyHoldReturnPct: number
  cagrPct: number | null
  maxDrawdownPct: number
  sharpe: number | null
  trades: BacktestTrade[]
  winRatePct: number | null
  exposurePct: number
}

export interface BacktestOptions {
  /** Round-trip is charged twice: this is the cost per side, in basis points. */
  feeBps?: number
}

/**
 * Replay a long/flat strategy bar-by-bar with NO lookahead: the position held
 * during bar i is the signal computed at bar i-1 (`desired[i-1]`), and it earns
 * that bar's close-to-close return. Buy & hold is compounded over the identical
 * window with identical starting capital, so the benchmark is apples-to-apples.
 *
 * Transaction costs (optional): `feeBps` is charged once per side. The strategy
 * pays it on every position change (each entry and each exit); buy & hold pays a
 * single entry-side fee (one purchase, held). Slippage, dividends, and taxes are
 * still not modelled — the caller must say so.
 */
export function runEquityBacktest(
  times: number[],
  closes: number[],
  desired: boolean[],
  barsPerYear: number,
  opts: BacktestOptions = {},
): BacktestResult {
  const n = closes.length
  const feeFrac = Math.max(0, opts.feeBps ?? 0) / 10_000
  let equity = 1
  let buyHold = 1
  const curve: BacktestResult['curve'] = [{ t: times[0] * 1000, strategy: 100, buyHold: 100 }]
  const periodReturns: number[] = []
  const trades: BacktestTrade[] = []
  let peak = 1
  let maxDrawdown = 0
  let inBars = 0
  let entry: { time: number; price: number } | null = null

  for (let i = 1; i < n; i++) {
    const barReturn = closes[i] / closes[i - 1] - 1
    // Position for bar i is the signal computed at bar i-1 — no lookahead.
    const inMarket = desired[i - 1]
    const posPrev = i >= 2 ? desired[i - 2] : false
    let stratReturn = inMarket ? barReturn : 0
    // Charge one side whenever the position changes at the i-1/i boundary
    // (out→in = a buy, in→out = a sell).
    if (feeFrac > 0 && inMarket !== posPrev) stratReturn -= feeFrac
    equity *= 1 + stratReturn
    buyHold *= 1 + barReturn
    // Buy & hold: single entry-side fee on its one purchase (first bar).
    if (feeFrac > 0 && i === 1) buyHold *= 1 - feeFrac
    periodReturns.push(stratReturn)
    if (inMarket) inBars++

    if (inMarket && !entry) entry = { time: times[i - 1], price: closes[i - 1] }
    if (!desired[i] && entry) {
      trades.push({
        entryTime: entry.time, exitTime: times[i],
        entryPrice: entry.price, exitPrice: closes[i],
        returnPct: (closes[i] / entry.price - 1) * 100,
      })
      entry = null
    }

    peak = Math.max(peak, equity)
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak)
    curve.push({ t: times[i] * 1000, strategy: equity * 100, buyHold: buyHold * 100 })
  }
  if (entry) {
    trades.push({
      entryTime: entry.time, exitTime: times[n - 1],
      entryPrice: entry.price, exitPrice: closes[n - 1],
      returnPct: (closes[n - 1] / entry.price - 1) * 100,
    })
  }

  const years = (times[n - 1] - times[0]) / 31_557_600
  const mean = periodReturns.reduce((s, r) => s + r, 0) / periodReturns.length
  const variance = periodReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / periodReturns.length
  const stdev = Math.sqrt(variance)
  const wins = trades.filter((t) => t.returnPct > 0).length

  return {
    curve,
    totalReturnPct: (equity - 1) * 100,
    buyHoldReturnPct: (buyHold - 1) * 100,
    cagrPct: years > 0.5 ? (Math.pow(equity, 1 / years) - 1) * 100 : null,
    maxDrawdownPct: maxDrawdown * 100,
    sharpe: stdev > 0 ? (mean / stdev) * Math.sqrt(barsPerYear) : null,
    trades,
    winRatePct: trades.length > 0 ? (wins / trades.length) * 100 : null,
    exposurePct: (inBars / (n - 1)) * 100,
  }
}
