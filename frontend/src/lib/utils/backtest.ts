// Lightweight long-only backtester for the Technical Analysis page. Evaluates a
// preset strategy bar-by-bar over a daily candle series and reports performance.
// Pure computation — no look-ahead beyond the current bar's close.

import { rsi, sma, ema, macd, bollingerBands, type OhlcvCandle } from './indicators'

export interface BacktestTrade {
  entryIndex: number
  exitIndex: number
  entryPrice: number
  exitPrice: number
  returnPct: number
  bars: number
}

export interface BacktestMetrics {
  sampleCount: number       // number of closed trades
  winRate: number           // 0–100
  averageReturn: number     // mean per-trade return %
  totalReturn: number       // compounded equity return %
  maxDrawdown: number       // worst peak-to-trough on the equity curve, %
  averageHoldingPeriod: number // mean bars held
}

export interface BacktestResult {
  trades: BacktestTrade[]
  metrics: BacktestMetrics
  equityCurve: number[]     // equity multiple after each closed trade, starting at 1
}

export interface StrategyDef {
  key: string
  name: string
  description: string
  /** entry signal at bar i (using only data up to and including i) */
  entry: (ctx: StrategyContext, i: number) => boolean
  /** exit signal at bar i for an open position */
  exit: (ctx: StrategyContext, i: number) => boolean
  minBars: number
}

interface StrategyContext {
  candles: OhlcvCandle[]
  closes: number[]
  rsi14: (number | null)[]
  sma200: (number | null)[]
  ema50: (number | null)[]
  ema200: (number | null)[]
  macdLine: (number | null)[]
  macdSignal: (number | null)[]
  bbLower: (number | null)[]
  bbMiddle: (number | null)[]
}

function crossedAbove(a: (number | null)[], b: (number | null)[], i: number): boolean {
  const a0 = a[i - 1], a1 = a[i], b0 = b[i - 1], b1 = b[i]
  return a0 !== null && a1 !== null && b0 !== null && b1 !== null && a0 <= b0 && a1 > b1
}
function crossedBelow(a: (number | null)[], b: (number | null)[], i: number): boolean {
  const a0 = a[i - 1], a1 = a[i], b0 = b[i - 1], b1 = b[i]
  return a0 !== null && a1 !== null && b0 !== null && b1 !== null && a0 >= b0 && a1 < b1
}

export const STRATEGIES: StrategyDef[] = [
  {
    key: 'rsi_trend',
    name: 'RSI dip in uptrend',
    description: 'Enter when RSI(14) < 30 while price is above the 200-period SMA; exit when RSI > 55.',
    minBars: 210,
    entry: (c, i) => {
      const r = c.rsi14[i], s = c.sma200[i]
      return r !== null && s !== null && r < 30 && c.closes[i] > s
    },
    exit: (c, i) => {
      const r = c.rsi14[i]
      return r !== null && r > 55
    },
  },
  {
    key: 'golden_cross',
    name: 'Golden / death cross',
    description: 'Enter when EMA50 crosses above EMA200; exit when it crosses back below.',
    minBars: 210,
    entry: (c, i) => crossedAbove(c.ema50, c.ema200, i),
    exit:  (c, i) => crossedBelow(c.ema50, c.ema200, i),
  },
  {
    key: 'macd_trend',
    name: 'MACD cross in uptrend',
    description: 'Enter when MACD crosses above its signal while above the 200 EMA; exit on the bearish MACD cross.',
    minBars: 210,
    entry: (c, i) => {
      const e = c.ema200[i]
      return e !== null && c.closes[i] > e && crossedAbove(c.macdLine, c.macdSignal, i)
    },
    exit: (c, i) => crossedBelow(c.macdLine, c.macdSignal, i),
  },
  {
    key: 'bollinger_bounce',
    name: 'Bollinger band bounce',
    description: 'Enter when price closes below the lower Bollinger band; exit when it closes back above the midline.',
    minBars: 30,
    entry: (c, i) => {
      const l = c.bbLower[i]
      return l !== null && c.closes[i] < l
    },
    exit: (c, i) => {
      const m = c.bbMiddle[i]
      return m !== null && c.closes[i] > m
    },
  },
]

function buildContext(candles: OhlcvCandle[]): StrategyContext {
  const closes = candles.map((c) => c.close)
  const m = macd(closes)
  const bb = bollingerBands(closes, 20, 2)
  return {
    candles,
    closes,
    rsi14: rsi(closes, 14),
    sma200: sma(closes, 200),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    macdLine: m.macd,
    macdSignal: m.signal,
    bbLower: bb.lower,
    bbMiddle: bb.middle,
  }
}

export function runBacktest(candles: OhlcvCandle[], strategyKey: string): BacktestResult | null {
  const strat = STRATEGIES.find((s) => s.key === strategyKey)
  if (!strat || candles.length < strat.minBars) return null

  const ctx = buildContext(candles)
  const trades: BacktestTrade[] = []
  let inPosition = false
  let entryIndex = 0
  let entryPrice = 0

  for (let i = 1; i < candles.length; i++) {
    if (!inPosition) {
      if (strat.entry(ctx, i)) {
        inPosition = true
        entryIndex = i
        entryPrice = ctx.closes[i]
      }
    } else if (strat.exit(ctx, i)) {
      const exitPrice = ctx.closes[i]
      trades.push({
        entryIndex, exitIndex: i, entryPrice, exitPrice,
        returnPct: ((exitPrice - entryPrice) / entryPrice) * 100,
        bars: i - entryIndex,
      })
      inPosition = false
    }
  }
  // Close any open position at the final bar (mark-to-market) so it counts.
  if (inPosition) {
    const i = candles.length - 1
    const exitPrice = ctx.closes[i]
    trades.push({
      entryIndex, exitIndex: i, entryPrice, exitPrice,
      returnPct: ((exitPrice - entryPrice) / entryPrice) * 100,
      bars: i - entryIndex,
    })
  }

  // Equity curve + metrics
  let equity = 1
  let peak = 1
  let maxDd = 0
  const equityCurve: number[] = []
  for (const t of trades) {
    equity *= 1 + t.returnPct / 100
    equityCurve.push(equity)
    peak = Math.max(peak, equity)
    maxDd = Math.max(maxDd, (peak - equity) / peak)
  }

  const wins = trades.filter((t) => t.returnPct > 0).length
  const metrics: BacktestMetrics = {
    sampleCount: trades.length,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    averageReturn: trades.length ? trades.reduce((a, t) => a + t.returnPct, 0) / trades.length : 0,
    totalReturn: (equity - 1) * 100,
    maxDrawdown: maxDd * 100,
    averageHoldingPeriod: trades.length ? trades.reduce((a, t) => a + t.bars, 0) / trades.length : 0,
  }

  return { trades, metrics, equityCurve }
}
