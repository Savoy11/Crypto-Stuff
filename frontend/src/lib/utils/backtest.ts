// Backtester for the Technical Analysis page. Evaluates strategies bar-by-bar
// over a daily candle series. Pure computation, no look-ahead: a signal formed
// on bar i's close fills on bar i+1's open (the earliest tradable price).

import { rsi, sma, ema, macd, bollingerBands, type OhlcvCandle } from './indicators'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BacktestTrade {
  entryIndex: number
  exitIndex:  number
  entryPrice: number
  exitPrice:  number
  returnPct:  number   // net of fees if feesPct > 0
  bars:       number
}

export interface BacktestMetrics {
  sampleCount:          number   // closed trades
  winRate:              number   // 0–100
  averageReturn:        number   // mean per-trade return %
  totalReturn:          number   // compounded equity return %
  maxDrawdown:          number   // worst peak-to-trough %
  averageHoldingPeriod: number   // mean bars held
  sharpeRatio:          number | null  // per-trade, annualised
  sortinoRatio:         number | null  // per-trade, annualised (downside only)
}

export interface BacktestResult {
  trades:      BacktestTrade[]
  metrics:     BacktestMetrics
  equityCurve: number[]   // equity multiple after each closed trade, starting at 1
}

export interface BacktestOptions {
  /** Round-trip fee as a fraction, e.g. 0.001 = 0.1% per side. Default 0. */
  feesPct?: number
  /** Trade direction. Default 'long'. */
  direction?: 'long' | 'short'
}

export type StrategyCategory = 'trend' | 'mean-reversion' | 'volatility' | 'volume' | 'multi-factor'

export interface StrategyDef {
  key:         string
  name:        string
  category:    StrategyCategory
  description: string
  entry: (ctx: StrategyContext, i: number) => boolean
  exit:  (ctx: StrategyContext, i: number) => boolean
  minBars: number
}

// ─── Internal context ─────────────────────────────────────────────────────────

interface StrategyContext {
  candles:        OhlcvCandle[]
  closes:         number[]
  highs:          number[]
  lows:           number[]
  volumes:        number[]
  rsi14:          (number | null)[]
  sma20:          (number | null)[]
  sma200:         (number | null)[]
  ema20:          (number | null)[]
  ema50:          (number | null)[]
  ema200:         (number | null)[]
  macdLine:       (number | null)[]
  macdSignal:     (number | null)[]
  macdHist:       (number | null)[]
  bbUpper:        (number | null)[]
  bbLower:        (number | null)[]
  bbMiddle:       (number | null)[]
  atr14:          (number | null)[]
  volSma20:       (number | null)[]   // 20-bar SMA of volume
  obvArr:         number[]            // On-Balance Volume
  vwap20:         (number | null)[]   // 20-bar rolling VWAP
  stochRsiK:      (number | null)[]
  stochRsiD:      (number | null)[]
  supertrendBull: (boolean | null)[]  // true = bullish, false = bearish
  cloudTop:       (number | null)[]   // Ichimoku cloud top at bar i (no look-ahead)
  cloudBottom:    (number | null)[]   // Ichimoku cloud bottom at bar i
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function crossedAbove(a: (number | null)[], b: (number | null)[], i: number): boolean {
  if (!a || !b || i < 1) return false
  const a0 = a[i - 1], a1 = a[i], b0 = b[i - 1], b1 = b[i]
  return a0 != null && a1 != null && b0 != null && b1 != null && a0 <= b0 && a1 > b1
}
function crossedBelow(a: (number | null)[], b: (number | null)[], i: number): boolean {
  if (!a || !b || i < 1) return false
  const a0 = a[i - 1], a1 = a[i], b0 = b[i - 1], b1 = b[i]
  return a0 != null && a1 != null && b0 != null && b1 != null && a0 >= b0 && a1 < b1
}

function atrArr(candles: OhlcvCandle[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null)
  if (candles.length < 2) return result
  const tr: number[] = [candles[0].high - candles[0].low]
  for (let i = 1; i < candles.length; i++) {
    const pc = candles[i - 1].close
    tr.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - pc), Math.abs(candles[i].low - pc)))
  }
  let s = tr.slice(0, period).reduce((a, b) => a + b, 0)
  result[period - 1] = s / period
  for (let i = period; i < candles.length; i++) {
    s = result[i - 1]! * (period - 1) + tr[i]
    result[i] = s / period
  }
  return result
}

function obv(candles: OhlcvCandle[]): number[] {
  const result: number[] = [0]
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close)      result.push(result[i - 1] + candles[i].volume)
    else if (candles[i].close < candles[i - 1].close) result.push(result[i - 1] - candles[i].volume)
    else                                                result.push(result[i - 1])
  }
  return result
}

function rollingVwap(candles: OhlcvCandle[], period = 20): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null)
  for (let i = period - 1; i < candles.length; i++) {
    let sumPV = 0, sumV = 0
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (candles[j].high + candles[j].low + candles[j].close) / 3
      sumPV += tp * candles[j].volume
      sumV  += candles[j].volume
    }
    result[i] = sumV > 0 ? sumPV / sumV : null
  }
  return result
}

function stochRsi(rsiValues: (number | null)[], period = 14, smoothK = 3, smoothD = 3): {
  k: (number | null)[]; d: (number | null)[]
} {
  const n = rsiValues.length
  const rawK: (number | null)[] = new Array(n).fill(null)
  for (let i = period - 1; i < n; i++) {
    const slice = rsiValues.slice(i - period + 1, i + 1).filter((v): v is number => v !== null)
    if (slice.length < period) continue
    const lo = Math.min(...slice), hi = Math.max(...slice)
    rawK[i] = hi === lo ? 50 : ((rsiValues[i]! - lo) / (hi - lo)) * 100
  }
  // Smooth %K
  const kSmoothed = sma(rawK.map(v => v ?? NaN), smoothK).map((v, i) =>
    rawK[i] !== null && v !== null && !isNaN(v) ? v : null,
  )
  // %D = SMA of smoothed %K
  const dSmoothed = sma(kSmoothed.map(v => v ?? NaN), smoothD).map((v, i) =>
    kSmoothed[i] !== null && v !== null && !isNaN(v) ? v : null,
  )
  return { k: kSmoothed, d: dSmoothed }
}

function supertrend(candles: OhlcvCandle[], atr: (number | null)[], multiplier = 3): (boolean | null)[] {
  const n = candles.length
  const bull: (boolean | null)[] = new Array(n).fill(null)
  let finalUp: number | null = null
  let finalDn: number | null = null
  let prevBull: boolean | null = null

  for (let i = 1; i < n; i++) {
    const a = atr[i]
    if (a === null) continue
    const hl2  = (candles[i].high + candles[i].low) / 2
    const basicUp = hl2 + multiplier * a
    const basicDn = hl2 - multiplier * a

    const newUp: number = finalDn !== null && candles[i - 1].close >= finalDn
      ? Math.max(basicDn, finalDn)
      : basicDn
    const newDn: number = finalUp !== null && candles[i - 1].close <= finalUp
      ? Math.min(basicUp, finalUp)
      : basicUp

    if (prevBull === null) {
      bull[i] = candles[i].close > newDn
    } else if (prevBull === false && candles[i].close > finalUp!) {
      bull[i] = true
    } else if (prevBull === true && candles[i].close < finalDn!) {
      bull[i] = false
    } else {
      bull[i] = prevBull
    }

    finalDn = newUp
    finalUp = newDn
    prevBull = bull[i]
  }
  return bull
}

function ichimokuCloud(candles: OhlcvCandle[]): { top: (number | null)[]; bottom: (number | null)[] } {
  const n = candles.length
  const top:    (number | null)[] = new Array(n).fill(null)
  const bottom: (number | null)[] = new Array(n).fill(null)

  const midpoint = (from: number, to: number) => {
    const h = Math.max(...candles.slice(from, to + 1).map(c => c.high))
    const l = Math.min(...candles.slice(from, to + 1).map(c => c.low))
    return (h + l) / 2
  }

  for (let i = 0; i < n; i++) {
    // Senkou A/B are plotted 26 bars ahead, so at bar i we use values from bar i-26
    const src = i - 26
    if (src < 8) continue                      // need tenkan window
    if (src < 25) continue                     // need kijun window
    const tenkan = midpoint(src - 8, src)      // 9-bar
    const kijun  = midpoint(src - 25, src)     // 26-bar
    const senkouA = (tenkan + kijun) / 2
    const senkouB = src >= 51 ? midpoint(src - 51, src) : null  // 52-bar
    if (senkouB === null) continue
    top[i]    = Math.max(senkouA, senkouB)
    bottom[i] = Math.min(senkouA, senkouB)
  }
  return { top, bottom }
}

// ─── Context builder ──────────────────────────────────────────────────────────

function buildContext(candles: OhlcvCandle[]): StrategyContext {
  const closes  = candles.map(c => c.close)
  const highs   = candles.map(c => c.high)
  const lows    = candles.map(c => c.low)
  const volumes = candles.map(c => c.volume)

  const m    = macd(closes)
  const bb   = bollingerBands(closes, 20, 2)
  const atr  = atrArr(candles, 14)
  const rsi14Arr = rsi(closes, 14)
  const srsi = stochRsi(rsi14Arr)
  const st   = supertrend(candles, atr, 3)
  const ic   = ichimokuCloud(candles)
  const obvA = obv(candles)

  return {
    candles, closes, highs, lows, volumes,
    rsi14:    rsi14Arr,
    sma20:    sma(closes, 20),
    sma200:   sma(closes, 200),
    ema20:    ema(closes, 20),
    ema50:    ema(closes, 50),
    ema200:   ema(closes, 200),
    macdLine:   m.macd,
    macdSignal: m.signal,
    macdHist:   m.histogram,
    bbUpper:  bb.upper,
    bbLower:  bb.lower,
    bbMiddle: bb.middle,
    atr14:    atr,
    volSma20: sma(volumes, 20),
    obvArr:   obvA,
    vwap20:   rollingVwap(candles, 20),
    stochRsiK: srsi.k,
    stochRsiD: srsi.d,
    supertrendBull: st,
    cloudTop:    ic.top,
    cloudBottom: ic.bottom,
  }
}

// ─── Strategies ───────────────────────────────────────────────────────────────

export const STRATEGIES: StrategyDef[] = [

  // ── Trend ────────────────────────────────────────────────────────────────────
  {
    key: 'rsi_trend',
    name: 'RSI dip in uptrend',
    category: 'trend',
    description: 'Enter when RSI(14) < 30 while price is above the 200-period SMA; exit when RSI > 55. A classic dip-buy in an established uptrend.',
    minBars: 210,
    entry: (c, i) => { const r = c.rsi14[i], s = c.sma200[i]; return r !== null && s !== null && r < 30 && c.closes[i] > s },
    exit:  (c, i) => { const r = c.rsi14[i]; return r !== null && r > 55 },
  },
  {
    key: 'golden_cross',
    name: 'Golden / death cross',
    category: 'trend',
    description: 'Enter when EMA50 crosses above EMA200 (golden cross); exit when it crosses back below (death cross). A slow, reliable trend signal — rare but high-conviction.',
    minBars: 210,
    entry: (c, i) => crossedAbove(c.ema50, c.ema200, i),
    exit:  (c, i) => crossedBelow(c.ema50, c.ema200, i),
  },
  {
    key: 'ema_cross_fast',
    name: 'EMA 20/50 cross',
    category: 'trend',
    description: 'Enter when EMA20 crosses above EMA50; exit when it crosses back below. Faster than the golden cross — more trades but more whipsaws in choppy markets.',
    minBars: 60,
    entry: (c, i) => crossedAbove(c.ema20, c.ema50, i),
    exit:  (c, i) => crossedBelow(c.ema20, c.ema50, i),
  },
  {
    key: 'donchian_breakout',
    name: 'Donchian breakout (20)',
    category: 'trend',
    description: 'Enter when price closes at a new 20-bar high (channel breakout); exit when it closes at a new 20-bar low. The original trend-following system — simple and robust.',
    minBars: 25,
    entry: (c, i) => { if (i < 20) return false; return c.closes[i] > Math.max(...c.highs.slice(i - 20, i)) },
    exit:  (c, i) => { if (i < 20) return false; return c.closes[i] < Math.min(...c.lows.slice(i - 20, i)) },
  },
  {
    key: 'macd_trend',
    name: 'MACD cross in uptrend',
    category: 'trend',
    description: 'Enter when MACD crosses above its signal line while price is above EMA200; exit on the bearish MACD cross. Filters out counter-trend MACD signals.',
    minBars: 210,
    entry: (c, i) => { const e = c.ema200[i]; return e !== null && c.closes[i] > e && crossedAbove(c.macdLine, c.macdSignal, i) },
    exit:  (c, i) => crossedBelow(c.macdLine, c.macdSignal, i),
  },
  {
    key: 'supertrend',
    name: 'Supertrend (3×ATR)',
    category: 'trend',
    description: 'Volatility-based trailing trend system. Enter when the Supertrend line (3× ATR multiplier) flips bullish; exit when it flips bearish. Adapts the stop to recent volatility — fewer whipsaws than MA crosses.',
    minBars: 20,
    entry: (c, i) => c.supertrendBull[i] === true && c.supertrendBull[i - 1] !== true,
    exit:  (c, i) => c.supertrendBull[i] === false,
  },
  {
    key: 'ichimoku',
    name: 'Ichimoku cloud breakout',
    category: 'trend',
    description: 'Enter when price closes above the top of the Kumo (cloud); exit when it falls below the cloud bottom. The cloud is the average of Senkou A & B projected 26 bars ahead — a robust multi-timeframe trend filter.',
    minBars: 80,
    entry: (c, i) => { const t = c.cloudTop[i]; return t !== null && c.closes[i] > t },
    exit:  (c, i) => { const b = c.cloudBottom[i]; return b !== null && c.closes[i] < b },
  },

  // ── Mean reversion ───────────────────────────────────────────────────────────
  {
    key: 'bollinger_bounce',
    name: 'Bollinger band bounce',
    category: 'mean-reversion',
    description: 'Enter when price closes below the lower Bollinger band; exit when it closes back above the midline (20 SMA). A classic overextension fade.',
    minBars: 30,
    entry: (c, i) => { const l = c.bbLower[i]; return l !== null && c.closes[i] < l },
    exit:  (c, i) => { const m = c.bbMiddle[i]; return m !== null && c.closes[i] > m },
  },
  {
    key: 'rsi_oversold',
    name: 'RSI oversold bounce',
    category: 'mean-reversion',
    description: 'Pure mean-reversion: enter when RSI(14) < 30 regardless of trend; exit when RSI > 60. Works in both trending and ranging markets — but can get caught in prolonged downtrends.',
    minBars: 20,
    entry: (c, i) => { const r = c.rsi14[i]; return r !== null && r < 30 },
    exit:  (c, i) => { const r = c.rsi14[i]; return r !== null && r > 60 },
  },
  {
    key: 'sma20_reversion',
    name: 'SMA 20 reversion',
    category: 'mean-reversion',
    description: 'Enter when price closes more than 5% below its 20-day SMA; exit when it reclaims the SMA. Fades overextended sell-offs with a quantified deviation threshold.',
    minBars: 25,
    entry: (c, i) => { const s = c.sma20[i]; return s !== null && c.closes[i] < s * 0.95 },
    exit:  (c, i) => { const s = c.sma20[i]; return s !== null && c.closes[i] >= s },
  },
  {
    key: 'stoch_rsi',
    name: 'Stochastic RSI extremes',
    category: 'mean-reversion',
    description: 'Enter when the Stochastic RSI %K crosses above %D from below 20 (oversold); exit when %K crosses above 80 (overbought). A faster, more sensitive oscillator than raw RSI — good for timing entries within a broader trend.',
    minBars: 35,
    entry: (c, i) => {
      const k = c.stochRsiK[i], d = c.stochRsiD[i], pk = c.stochRsiK[i - 1], pd = c.stochRsiD[i - 1]
      return k !== null && d !== null && pk !== null && pd !== null && pk <= pd && k > d && k < 20
    },
    exit: (c, i) => { const k = c.stochRsiK[i]; return k !== null && k > 80 },
  },

  // ── Volatility ───────────────────────────────────────────────────────────────
  {
    key: 'bb_squeeze_breakout',
    name: 'Bollinger squeeze breakout',
    category: 'volatility',
    description: 'Wait for a volatility squeeze (Bollinger bandwidth < 10% of price), then enter when price breaks above the upper band. Exit below the midline. Catches expansion moves after periods of tight compression.',
    minBars: 30,
    entry: (c, i) => {
      const u = c.bbUpper[i], l = c.bbLower[i], m = c.bbMiddle[i]
      if (u === null || l === null || m === null || m === 0) return false
      return (u - l) / m < 0.10 && c.closes[i] > u
    },
    exit: (c, i) => { const m = c.bbMiddle[i]; return m !== null && c.closes[i] < m },
  },
  {
    key: 'atr_breakout',
    name: 'ATR range breakout',
    category: 'volatility',
    description: "Enter when today's close exceeds yesterday's high by at least 0.5× ATR(14) — a volatility-adjusted breakout. Exit when close falls below the prior day's close by 0.5× ATR.",
    minBars: 20,
    entry: (c, i) => { const a = c.atr14[i]; if (a === null || i < 1) return false; return c.closes[i] > c.highs[i - 1] + a * 0.5 },
    exit:  (c, i) => { const a = c.atr14[i]; if (a === null || i < 1) return false; return c.closes[i] < c.closes[i - 1] - a * 0.5 },
  },

  // ── Volume ───────────────────────────────────────────────────────────────────
  {
    key: 'vwap_reversion',
    name: 'VWAP reversion (20)',
    category: 'volume',
    description: 'Uses a 20-bar rolling VWAP (Volume Weighted Average Price). Enter when price crosses above the VWAP from below — signalling that average buyers are now profitable; exit when price crosses back below. Captures moves supported by actual transaction volume.',
    minBars: 25,
    entry: (c, i) => {
      const v = c.vwap20[i], vp = c.vwap20[i - 1]
      if (v === null || vp === null) return false
      return c.closes[i - 1] <= vp && c.closes[i] > v
    },
    exit: (c, i) => {
      const v = c.vwap20[i], vp = c.vwap20[i - 1]
      if (v === null || vp === null) return false
      return c.closes[i - 1] >= vp && c.closes[i] < v
    },
  },
  {
    key: 'obv_divergence',
    name: 'OBV momentum divergence',
    category: 'volume',
    description: 'On-Balance Volume (OBV) measures cumulative buying vs. selling pressure. Enter when price is below its 20-SMA but OBV is above its 20-SMA — a bullish divergence showing accumulation despite falling price. Exit when price reclaims its SMA.',
    minBars: 25,
    entry: (c, i) => {
      const ps = c.sma20[i]
      if (ps === null) return false
      const obvSma = sma(c.obvArr, 20)[i]
      if (obvSma === null) return false
      return c.closes[i] < ps && c.obvArr[i] > obvSma
    },
    exit: (c, i) => {
      const ps = c.sma20[i]
      return ps !== null && c.closes[i] >= ps
    },
  },
  {
    key: 'volume_breakout',
    name: 'Volume-confirmed breakout',
    category: 'volume',
    description: 'A Donchian 20-bar channel breakout that only triggers when volume is at least 150% of the 20-bar average volume. Filters out low-conviction breakouts — requiring the market to "vote with money" before entry.',
    minBars: 25,
    entry: (c, i) => {
      if (i < 20) return false
      const vs = c.volSma20[i]
      if (vs === null) return false
      const high20 = Math.max(...c.highs.slice(i - 20, i))
      return c.closes[i] > high20 && c.volumes[i] >= vs * 1.5
    },
    exit: (c, i) => {
      if (i < 20) return false
      return c.closes[i] < Math.min(...c.lows.slice(i - 20, i))
    },
  },

  // ── Multi-factor ─────────────────────────────────────────────────────────────
  {
    key: 'trend_mean_rev',
    name: 'RSI dip + trend filter',
    category: 'multi-factor',
    description: 'Combines trend + mean-reversion: only takes an RSI oversold bounce (RSI < 35) when price is above the 200 SMA. Avoids catching falling knives in downtrends — the 200 SMA acts as the macro trend gate.',
    minBars: 210,
    entry: (c, i) => {
      const r = c.rsi14[i], s = c.sma200[i]
      return r !== null && s !== null && r < 35 && c.closes[i] > s
    },
    exit: (c, i) => { const r = c.rsi14[i]; return r !== null && r > 60 },
  },
  {
    key: 'vol_momentum',
    name: 'BB squeeze + MACD confirm',
    category: 'multi-factor',
    description: 'Volatility + momentum confluence: enter on a Bollinger squeeze breakout (bandwidth < 10%, price > upper band) only if the MACD histogram is positive. The MACD filter ensures buying pressure is building — not just a volatility spike.',
    minBars: 35,
    entry: (c, i) => {
      const u = c.bbUpper[i], l = c.bbLower[i], m = c.bbMiddle[i], h = c.macdHist[i]
      if (u === null || l === null || m === null || m === 0 || h === null) return false
      return (u - l) / m < 0.10 && c.closes[i] > u && h > 0
    },
    exit: (c, i) => { const m = c.bbMiddle[i]; return m !== null && c.closes[i] < m },
  },
]

// ─── Engine ───────────────────────────────────────────────────────────────────

export function runBacktest(
  candles: OhlcvCandle[],
  strategyKey: string,
  options: BacktestOptions = {},
): BacktestResult | null {
  const strat = STRATEGIES.find(s => s.key === strategyKey)
  if (!strat || candles.length < strat.minBars) return null

  const feesPct   = options.feesPct  ?? 0
  const direction = options.direction ?? 'long'
  const isShort   = direction === 'short'

  const ctx = buildContext(candles)
  const trades: BacktestTrade[] = []
  let inPosition = false
  let entryIndex = 0
  let entryPrice = 0

  // A signal is computed on bar i (from indicators through closes[i]), but the
  // trade fills on the NEXT bar's open — the earliest price actually tradable
  // once bar i has closed. Filling on closes[i] (same bar) is look-ahead
  // optimism. Loop stops at length-1 so bar i's signal always has an i+1 to
  // execute on; a signal on the final bar cannot be acted upon.
  for (let i = 1; i < candles.length - 1; i++) {
    const execI = i + 1
    if (!inPosition) {
      const signal = isShort ? strat.exit(ctx, i) : strat.entry(ctx, i)
      if (signal) { inPosition = true; entryIndex = execI; entryPrice = candles[execI].open }
    } else {
      const signal = isShort ? strat.entry(ctx, i) : strat.exit(ctx, i)
      if (signal) {
        const exitPrice = candles[execI].open
        const gross = isShort
          ? (entryPrice - exitPrice) / entryPrice
          : (exitPrice - entryPrice) / entryPrice
        const net = gross - 2 * feesPct   // pay fee on both legs
        trades.push({ entryIndex, exitIndex: execI, entryPrice, exitPrice, returnPct: net * 100, bars: execI - entryIndex })
        inPosition = false
      }
    }
  }
  // Mark open position to market at final bar
  if (inPosition) {
    const i = candles.length - 1
    const exitPrice = ctx.closes[i]
    const gross = isShort
      ? (entryPrice - exitPrice) / entryPrice
      : (exitPrice - entryPrice) / entryPrice
    const net = gross - 2 * feesPct
    trades.push({ entryIndex, exitIndex: i, entryPrice, exitPrice, returnPct: net * 100, bars: i - entryIndex })
  }

  // Equity curve + drawdown
  let equity = 1, peak = 1, maxDd = 0
  const equityCurve: number[] = []
  for (const t of trades) {
    equity *= 1 + t.returnPct / 100
    equityCurve.push(equity)
    peak  = Math.max(peak, equity)
    maxDd = Math.max(maxDd, (peak - equity) / peak)
  }

  // Risk-adjusted ratios (per-trade, annualised)
  const rets = trades.map(t => t.returnPct)
  const n    = rets.length
  let sharpeRatio:  number | null = null
  let sortinoRatio: number | null = null
  if (n >= 2) {
    const avgHold = trades.reduce((a, t) => a + t.bars, 0) / n
    const annFactor = Math.sqrt(252 / Math.max(avgHold, 1))
    const mean = rets.reduce((a, v) => a + v, 0) / n
    const variance = rets.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)
    const std = Math.sqrt(variance)
    if (std > 0) sharpeRatio = (mean / std) * annFactor

    const downRets = rets.filter(v => v < 0)
    if (downRets.length >= 2) {
      const downVar = downRets.reduce((a, v) => a + v ** 2, 0) / downRets.length
      const downStd = Math.sqrt(downVar)
      if (downStd > 0) sortinoRatio = (mean / downStd) * annFactor
    }
  }

  const wins = trades.filter(t => t.returnPct > 0).length
  const metrics: BacktestMetrics = {
    sampleCount:          n,
    winRate:              n ? (wins / n) * 100 : 0,
    averageReturn:        n ? rets.reduce((a, v) => a + v, 0) / n : 0,
    totalReturn:          (equity - 1) * 100,
    maxDrawdown:          maxDd * 100,
    averageHoldingPeriod: n ? trades.reduce((a, t) => a + t.bars, 0) / n : 0,
    sharpeRatio,
    sortinoRatio,
  }

  return { trades, metrics, equityCurve }
}
