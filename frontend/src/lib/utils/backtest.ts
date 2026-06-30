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

export type StrategyCategory = 'trend' | 'mean-reversion' | 'momentum' | 'volatility'

export interface StrategyDef {
  key: string
  name: string
  category: StrategyCategory
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
  highs: number[]
  lows: number[]
  rsi14: (number | null)[]
  sma20: (number | null)[]
  sma200: (number | null)[]
  ema20: (number | null)[]
  ema50: (number | null)[]
  ema200: (number | null)[]
  macdLine: (number | null)[]
  macdSignal: (number | null)[]
  bbUpper: (number | null)[]
  bbLower: (number | null)[]
  bbMiddle: (number | null)[]
  atr14: (number | null)[]
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
  // ── Trend following ──────────────────────────────────────────────────────────
  {
    key: 'rsi_trend',
    name: 'RSI dip in uptrend',
    category: 'trend',
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
    category: 'trend',
    description: 'Enter when EMA50 crosses above EMA200; exit when it crosses back below.',
    minBars: 210,
    entry: (c, i) => crossedAbove(c.ema50, c.ema200, i),
    exit:  (c, i) => crossedBelow(c.ema50, c.ema200, i),
  },
  {
    key: 'ema_cross_fast',
    name: 'EMA 20/50 cross',
    category: 'trend',
    description: 'Faster MA cross: enter when EMA20 crosses above EMA50; exit when it crosses back below. More signals than the golden cross but more whipsaws.',
    minBars: 60,
    entry: (c, i) => crossedAbove(c.ema20, c.ema50, i),
    exit:  (c, i) => crossedBelow(c.ema20, c.ema50, i),
  },
  {
    key: 'donchian_breakout',
    name: 'Donchian breakout (20)',
    category: 'trend',
    description: 'Enter when price closes at a new 20-bar high (channel breakout); exit when it closes at a new 20-bar low. Classic trend-following system.',
    minBars: 25,
    entry: (c, i) => {
      if (i < 20) return false
      const high20 = Math.max(...c.highs.slice(i - 20, i)) // excludes current bar
      return c.closes[i] > high20
    },
    exit: (c, i) => {
      if (i < 20) return false
      const low20 = Math.min(...c.lows.slice(i - 20, i))
      return c.closes[i] < low20
    },
  },
  // ── Mean reversion ───────────────────────────────────────────────────────────
  {
    key: 'macd_trend',
    name: 'MACD cross in uptrend',
    category: 'trend',
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
    category: 'mean-reversion',
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
  {
    key: 'rsi_oversold',
    name: 'RSI oversold bounce',
    category: 'mean-reversion',
    description: 'Pure mean-reversion: enter on RSI(14) < 30 regardless of trend; exit when RSI > 60. Catches dips in any market condition.',
    minBars: 20,
    entry: (c, i) => {
      const r = c.rsi14[i]
      return r !== null && r < 30
    },
    exit: (c, i) => {
      const r = c.rsi14[i]
      return r !== null && r > 60
    },
  },
  {
    key: 'sma20_reversion',
    name: 'SMA 20 reversion',
    category: 'mean-reversion',
    description: 'Enter when price closes more than 5% below its 20-day SMA; exit when it reclaims the SMA. Fades overextended sell-offs.',
    minBars: 25,
    entry: (c, i) => {
      const s = c.sma20[i]
      return s !== null && c.closes[i] < s * 0.95
    },
    exit: (c, i) => {
      const s = c.sma20[i]
      return s !== null && c.closes[i] >= s
    },
  },
  // ── Volatility ───────────────────────────────────────────────────────────────
  {
    key: 'bb_squeeze_breakout',
    name: 'Bollinger squeeze breakout',
    category: 'volatility',
    description: 'Wait for a volatility squeeze (bandwidth < 10% of price), then enter when price breaks above the upper band; exit below the midline. Catches expansion after compression.',
    minBars: 30,
    entry: (c, i) => {
      const u = c.bbUpper[i], l = c.bbLower[i], m = c.bbMiddle[i]
      if (u === null || l === null || m === null || m === 0) return false
      const bandwidth = (u - l) / m
      // squeeze = tight bands; breakout = close above upper band
      return bandwidth < 0.10 && c.closes[i] > u
    },
    exit: (c, i) => {
      const m = c.bbMiddle[i]
      return m !== null && c.closes[i] < m
    },
  },
  {
    key: 'atr_breakout',
    name: 'ATR range breakout',
    category: 'volatility',
    description: 'Enter when today\'s close exceeds yesterday\'s high by at least 0.5× ATR(14) — a volatility-adjusted breakout. Exit when close falls below the prior day\'s close by 0.5× ATR.',
    minBars: 20,
    entry: (c, i) => {
      const atr = c.atr14[i]
      if (atr === null || i < 1) return false
      return c.closes[i] > c.highs[i - 1] + atr * 0.5
    },
    exit: (c, i) => {
      const atr = c.atr14[i]
      if (atr === null || i < 1) return false
      return c.closes[i] < c.closes[i - 1] - atr * 0.5
    },
  },
]

function atr(candles: OhlcvCandle[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null)
  if (candles.length < 2) return result
  const trueRanges: number[] = [candles[0].high - candles[0].low]
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close
    trueRanges.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose),
    ))
  }
  let sum = trueRanges.slice(0, period).reduce((a, b) => a + b, 0)
  result[period - 1] = sum / period
  for (let i = period; i < candles.length; i++) {
    sum = (result[i - 1]! * (period - 1) + trueRanges[i])
    result[i] = sum / period
  }
  return result
}

function buildContext(candles: OhlcvCandle[]): StrategyContext {
  const closes = candles.map((c) => c.close)
  const m = macd(closes)
  const bb = bollingerBands(closes, 20, 2)
  return {
    candles,
    closes,
    highs: candles.map((c) => c.high),
    lows: candles.map((c) => c.low),
    rsi14: rsi(closes, 14),
    sma20: sma(closes, 20),
    sma200: sma(closes, 200),
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    macdLine: m.macd,
    macdSignal: m.signal,
    bbUpper: bb.upper,
    bbLower: bb.lower,
    bbMiddle: bb.middle,
    atr14: atr(candles, 14),
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
