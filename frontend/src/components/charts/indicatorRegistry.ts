import { LineStyle } from 'lightweight-charts'
import {
  ema, sma, wma, hma, dema, tema, kama, mcginleyDynamic, linearRegression,
  bollingerBands, keltnerChannels, donchianChannels, vwap, rollingVwap, isIntradaySeries, parabolicSar, ichimoku,
  rsi, macd, stochasticRsi, williamsr, cci, roc, momentum, cmo, ultimateOscillator,
  adx, aroon, trix, kst, dpo,
  obv, mfi, cmf, accDistLine, volumeOscillator, forceIndex, easeOfMovement, elderRay,
  atr, choppinessIndex, bollingerPercentB, massIndex, stdDev,
  stochasticOscillator, tsi, ppo, fisherTransform, connorsRsi,
  vortex, coppockCurve, klingerOscillator, balanceOfPower, chaikinOscillator, disparityIndex,
  type OhlcvCandle,
} from '@/lib/utils/indicators'

// ─── Render spec types ──────────────────────────────────────────────────────
//
// Every indicator declares how it should be drawn, decoupled from the chart.
// `overlay` indicators draw on the price pane; `panel` indicators each get their
// own stacked pane below the price chart.

export interface RenderLine {
  data: (number | null)[]
  color: string
  lineWidth?: number
  lineStyle?: LineStyle
  dotted?: boolean          // render as point markers instead of a connected line (e.g. PSAR)
  title?: string
}

export interface RenderHist {
  data: (number | null)[]
  color?: string
  colorFn?: (v: number) => string
  title?: string
}

export interface RenderRefLine {
  value: number
  color: string
  title?: string
}

export interface RenderSpec {
  kind: 'overlay' | 'panel'
  title: string
  lines?: RenderLine[]
  histograms?: RenderHist[]
  refLines?: RenderRefLine[]
}

export type RenderFn = (candles: OhlcvCandle[], closes: number[]) => RenderSpec

// ─── Palette ────────────────────────────────────────────────────────────────

const C = {
  amber:   '#f59e0b',
  violet:  '#8b5cf6',
  pink:    '#ec4899',
  cyan:    '#06b6d4',
  orange:  '#f97316',
  blue:    '#3b82f6',
  green:   '#10b981',
  red:     '#ef4444',
  teal:    '#34d399',
  sky:     '#22d3ee',
  rose:    '#f472b6',
  yellow:  '#fbbf24',
  lime:    '#a3e635',
  fuchsia: '#d946ef',
  indigo:  '#6366f1',
  emerald: '#059669',
  slate:   'rgba(148,163,184,0.5)',
  slateDim:'rgba(148,163,184,0.3)',
} as const

const refUp   = 'rgba(239,68,68,0.4)'   // overbought guide
const refDown = 'rgba(16,185,129,0.4)'  // oversold guide
const refZero = 'rgba(148,163,184,0.35)'

const up   = (v: number) => (v >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)')

// ─── Registry ───────────────────────────────────────────────────────────────

export const INDICATOR_RENDER: Record<string, RenderFn> = {
  // ===== Overlays — moving averages =====
  ema9:    (_, c) => ({ kind: 'overlay', title: 'EMA 9',   lines: [{ data: ema(c, 9),   color: C.lime,    lineWidth: 1 }] }),
  ema20:   (_, c) => ({ kind: 'overlay', title: 'EMA 20',  lines: [{ data: ema(c, 20),  color: C.amber,   lineWidth: 1 }] }),
  ema21:   (_, c) => ({ kind: 'overlay', title: 'EMA 21',  lines: [{ data: ema(c, 21),  color: C.orange,  lineWidth: 1 }] }),
  ema50:   (_, c) => ({ kind: 'overlay', title: 'EMA 50',  lines: [{ data: ema(c, 50),  color: C.violet,  lineWidth: 1 }] }),
  ema100:  (_, c) => ({ kind: 'overlay', title: 'EMA 100', lines: [{ data: ema(c, 100), color: C.indigo,  lineWidth: 1 }] }),
  ema200:  (_, c) => ({ kind: 'overlay', title: 'EMA 200', lines: [{ data: ema(c, 200), color: C.pink,    lineWidth: 1 }] }),
  sma20:   (_, c) => ({ kind: 'overlay', title: 'SMA 20',  lines: [{ data: sma(c, 20),  color: C.cyan,    lineWidth: 1 }] }),
  sma50:   (_, c) => ({ kind: 'overlay', title: 'SMA 50',  lines: [{ data: sma(c, 50),  color: C.sky,     lineWidth: 1 }] }),
  sma100:  (_, c) => ({ kind: 'overlay', title: 'SMA 100', lines: [{ data: sma(c, 100), color: C.teal,    lineWidth: 1 }] }),
  sma200:  (_, c) => ({ kind: 'overlay', title: 'SMA 200', lines: [{ data: sma(c, 200), color: C.fuchsia, lineWidth: 1 }] }),
  wma20:   (_, c) => ({ kind: 'overlay', title: 'WMA 20',  lines: [{ data: wma(c, 20),  color: C.emerald, lineWidth: 1 }] }),
  hma20:   (_, c) => ({ kind: 'overlay', title: 'HMA 20',  lines: [{ data: hma(c, 20),  color: C.yellow,  lineWidth: 1 }] }),
  dema:    (_, c) => ({ kind: 'overlay', title: 'DEMA 20', lines: [{ data: dema(c, 20), color: C.rose,    lineWidth: 1 }] }),
  tema:    (_, c) => ({ kind: 'overlay', title: 'TEMA 20', lines: [{ data: tema(c, 20), color: C.fuchsia, lineWidth: 1 }] }),
  kama:    (_, c) => ({ kind: 'overlay', title: 'KAMA 10', lines: [{ data: kama(c, 10), color: C.sky,     lineWidth: 1 }] }),
  mcginley:(_, c) => ({ kind: 'overlay', title: 'McGinley',lines: [{ data: mcginleyDynamic(c, 14), color: C.teal, lineWidth: 1 }] }),
  linreg:  (_, c) => ({ kind: 'overlay', title: 'LinReg 20', lines: [{ data: linearRegression(c, 20), color: C.indigo, lineWidth: 1, lineStyle: LineStyle.Dashed }] }),

  // ===== Overlays — bands / channels =====
  bb: (_, c) => {
    const bb = bollingerBands(c, 20, 2)
    return { kind: 'overlay', title: 'Bollinger Bands', lines: [
      { data: bb.upper,  color: C.slate, lineWidth: 1 },
      { data: bb.middle, color: C.slateDim, lineWidth: 1, lineStyle: LineStyle.Dashed },
      { data: bb.lower,  color: C.slate, lineWidth: 1 },
    ] }
  },
  keltner: (candles) => {
    const k = keltnerChannels(candles, 20, 10, 1.5)
    return { kind: 'overlay', title: 'Keltner Channels', lines: [
      { data: k.upper,  color: 'rgba(34,211,238,0.5)', lineWidth: 1 },
      { data: k.middle, color: 'rgba(34,211,238,0.3)', lineWidth: 1, lineStyle: LineStyle.Dashed },
      { data: k.lower,  color: 'rgba(34,211,238,0.5)', lineWidth: 1 },
    ] }
  },
  donchian: (candles) => {
    const d = donchianChannels(candles, 20)
    return { kind: 'overlay', title: 'Donchian (20)', lines: [
      { data: d.upper,  color: 'rgba(168,85,247,0.5)', lineWidth: 1 },
      { data: d.middle, color: 'rgba(168,85,247,0.3)', lineWidth: 1, lineStyle: LineStyle.Dashed },
      { data: d.lower,  color: 'rgba(168,85,247,0.5)', lineWidth: 1 },
    ] }
  },
  // Session VWAP only means something on intraday bars; on daily-and-coarser
  // series it collapses to (H+L+C)/3 and carries no volume information, so
  // switch to the rolling variant and SAY which one is drawn.
  vwap: (candles) => {
    const intraday = isIntradaySeries(candles)
    return {
      kind: 'overlay',
      title: intraday ? 'VWAP (session)' : 'VWAP (rolling 20)',
      lines: [{
        data: intraday ? vwap(candles) : rollingVwap(candles, 20),
        color: C.orange, lineWidth: 1, lineStyle: LineStyle.Dotted,
      }],
    }
  },
  psar: (candles) => ({ kind: 'overlay', title: 'Parabolic SAR', lines: [{ data: parabolicSar(candles), color: C.amber, dotted: true }] }),
  ichimoku: (candles) => {
    const ich = ichimoku(candles)
    return { kind: 'overlay', title: 'Ichimoku', lines: [
      { data: ich.tenkan,  color: C.blue,   lineWidth: 1, title: 'Tenkan' },
      { data: ich.kijun,   color: C.red,    lineWidth: 1, title: 'Kijun' },
      { data: ich.senkouA, color: 'rgba(16,185,129,0.5)', lineWidth: 1, title: 'Senkou A' },
      { data: ich.senkouB, color: 'rgba(239,68,68,0.5)',  lineWidth: 1, title: 'Senkou B' },
    ] }
  },

  // ===== Panels — momentum =====
  rsi:      (_, c) => ({ kind: 'panel', title: 'RSI (14)', lines: [{ data: rsi(c, 14), color: C.violet, lineWidth: 1 }], refLines: [{ value: 70, color: refUp }, { value: 30, color: refDown }] }),
  macd:     (_, c) => { const m = macd(c); return { kind: 'panel', title: 'MACD', lines: [{ data: m.macd, color: C.blue, lineWidth: 1 }, { data: m.signal, color: C.orange, lineWidth: 1 }], histograms: [{ data: m.histogram, colorFn: up }] } },
  stochrsi: (_, c) => { const s = stochasticRsi(c); return { kind: 'panel', title: 'Stoch RSI', lines: [{ data: s.k, color: C.sky, lineWidth: 1 }, { data: s.d, color: C.rose, lineWidth: 1 }], refLines: [{ value: 80, color: refUp }, { value: 20, color: refDown }] } },
  williamsr:(candles) => ({ kind: 'panel', title: 'Williams %R', lines: [{ data: williamsr(candles, 14), color: C.fuchsia, lineWidth: 1 }], refLines: [{ value: -20, color: refUp }, { value: -80, color: refDown }] }),
  cci:      (candles) => ({ kind: 'panel', title: 'CCI (20)', lines: [{ data: cci(candles, 20), color: C.cyan, lineWidth: 1 }], refLines: [{ value: 100, color: refUp }, { value: -100, color: refDown }] }),
  roc:      (_, c) => ({ kind: 'panel', title: 'ROC (12)', lines: [{ data: roc(c, 12), color: C.amber, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),
  mom:      (_, c) => ({ kind: 'panel', title: 'Momentum (10)', lines: [{ data: momentum(c, 10), color: C.teal, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),
  cmo:      (_, c) => ({ kind: 'panel', title: 'CMO (14)', lines: [{ data: cmo(c, 14), color: C.violet, lineWidth: 1 }], refLines: [{ value: 50, color: refUp }, { value: -50, color: refDown }] }),
  uo:       (candles) => ({ kind: 'panel', title: 'Ultimate Osc', lines: [{ data: ultimateOscillator(candles), color: C.indigo, lineWidth: 1 }], refLines: [{ value: 70, color: refUp }, { value: 30, color: refDown }] }),
  stoch:    (candles) => { const s = stochasticOscillator(candles); return { kind: 'panel', title: 'Stochastic', lines: [{ data: s.k, color: C.sky, lineWidth: 1 }, { data: s.d, color: C.rose, lineWidth: 1 }], refLines: [{ value: 80, color: refUp }, { value: 20, color: refDown }] } },
  tsi:      (_, c) => ({ kind: 'panel', title: 'TSI (25,13)', lines: [{ data: tsi(c, 25, 13), color: C.blue, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),
  ppo:      (_, c) => { const p = ppo(c); return { kind: 'panel', title: 'PPO', lines: [{ data: p.ppo, color: C.blue, lineWidth: 1 }, { data: p.signal, color: C.orange, lineWidth: 1 }], histograms: [{ data: p.histogram, colorFn: up }] } },
  fisher:   (candles) => ({ kind: 'panel', title: 'Fisher Transform', lines: [{ data: fisherTransform(candles, 9), color: C.fuchsia, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),
  crsi:     (_, c) => ({ kind: 'panel', title: 'Connors RSI', lines: [{ data: connorsRsi(c), color: C.violet, lineWidth: 1 }], refLines: [{ value: 90, color: refUp }, { value: 10, color: refDown }] }),

  // ===== Panels — trend =====
  adx:      (candles) => { const a = adx(candles, 14); return { kind: 'panel', title: 'ADX (14)', lines: [{ data: a.adx, color: C.yellow, lineWidth: 1 }, { data: a.plusDI, color: C.green, lineWidth: 1 }, { data: a.minusDI, color: C.red, lineWidth: 1 }], refLines: [{ value: 25, color: refZero }] } },
  aroon:    (candles) => { const a = aroon(candles, 25); return { kind: 'panel', title: 'Aroon (25)', lines: [{ data: a.up, color: C.green, lineWidth: 1 }, { data: a.down, color: C.red, lineWidth: 1 }] } },
  trix:     (_, c) => ({ kind: 'panel', title: 'TRIX (15)', lines: [{ data: trix(c, 15), color: C.cyan, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),
  kst:      (_, c) => ({ kind: 'panel', title: 'KST', lines: [{ data: kst(c), color: C.blue, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),
  dpo:      (_, c) => ({ kind: 'panel', title: 'DPO (20)', lines: [{ data: dpo(c, 20), color: C.orange, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),
  vortex:   (candles) => { const v = vortex(candles, 14); return { kind: 'panel', title: 'Vortex (14)', lines: [{ data: v.viPlus, color: C.green, lineWidth: 1 }, { data: v.viMinus, color: C.red, lineWidth: 1 }], refLines: [{ value: 1, color: refZero }] } },
  coppock:  (_, c) => ({ kind: 'panel', title: 'Coppock Curve', lines: [{ data: coppockCurve(c), color: C.indigo, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),

  // ===== Panels — volume / money flow =====
  volume:   (candles) => ({ kind: 'panel', title: 'Volume', histograms: [{ data: candles.map(c => c.volume), colorFn: (_v) => 'rgba(100,116,139,0.5)', }] }),
  obv:      (candles) => ({ kind: 'panel', title: 'OBV', lines: [{ data: obv(candles), color: C.teal, lineWidth: 1 }] }),
  mfi:      (candles) => ({ kind: 'panel', title: 'MFI (14)', lines: [{ data: mfi(candles, 14), color: C.cyan, lineWidth: 1 }], refLines: [{ value: 80, color: refUp }, { value: 20, color: refDown }] }),
  cmf:      (candles) => ({ kind: 'panel', title: 'Chaikin MF (20)', lines: [{ data: cmf(candles, 20), color: C.blue, lineWidth: 1 }], refLines: [{ value: 0.1, color: refUp }, { value: 0, color: refZero }, { value: -0.1, color: refDown }] }),
  accDist:  (candles) => ({ kind: 'panel', title: 'A/D Line', lines: [{ data: accDistLine(candles), color: C.emerald, lineWidth: 1 }] }),
  volosc:   (candles) => ({ kind: 'panel', title: 'Volume Osc', lines: [{ data: volumeOscillator(candles), color: C.amber, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),
  fi:       (candles) => ({ kind: 'panel', title: 'Force Index (13)', lines: [{ data: forceIndex(candles, 13), color: C.violet, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),
  eom:      (candles) => ({ kind: 'panel', title: 'Ease of Move', lines: [{ data: easeOfMovement(candles, 14), color: C.sky, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),
  elderray: (candles) => { const e = elderRay(candles, 13); return { kind: 'panel', title: 'Elder Ray (13)', histograms: [{ data: e.bullPower, color: 'rgba(16,185,129,0.55)' }, { data: e.bearPower, color: 'rgba(239,68,68,0.55)' }], refLines: [{ value: 0, color: refZero }] } },
  klinger:  (candles) => ({ kind: 'panel', title: 'Klinger Vol Osc', lines: [{ data: klingerOscillator(candles), color: C.fuchsia, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),
  bop:      (candles) => ({ kind: 'panel', title: 'Balance of Power', lines: [{ data: balanceOfPower(candles, 14), color: C.teal, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),
  chaikin:  (candles) => ({ kind: 'panel', title: 'Chaikin Osc', lines: [{ data: chaikinOscillator(candles), color: C.indigo, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),

  // ===== Panels — volatility =====
  atr:      (candles) => ({ kind: 'panel', title: 'ATR (14)', lines: [{ data: atr(candles, 14), color: C.yellow, lineWidth: 1 }] }),
  chop:     (candles) => ({ kind: 'panel', title: 'Choppiness', lines: [{ data: choppinessIndex(candles, 14), color: C.orange, lineWidth: 1 }], refLines: [{ value: 61.8, color: refUp }, { value: 38.2, color: refDown }] }),
  bbpctb:   (_, c) => ({ kind: 'panel', title: 'BB %B', lines: [{ data: bollingerPercentB(c, 20, 2), color: C.cyan, lineWidth: 1 }], refLines: [{ value: 1, color: refUp }, { value: 0, color: refDown }] }),
  massidx:  (candles) => ({ kind: 'panel', title: 'Mass Index', lines: [{ data: massIndex(candles, 9, 25), color: C.rose, lineWidth: 1 }], refLines: [{ value: 27, color: refUp }, { value: 26.5, color: refZero }] }),
  stddev:   (_, c) => ({ kind: 'panel', title: 'Std Deviation', lines: [{ data: stdDev(c, 20), color: C.violet, lineWidth: 1 }] }),
  disparity:(_, c) => ({ kind: 'panel', title: 'Disparity Index', lines: [{ data: disparityIndex(c, 14), color: C.amber, lineWidth: 1 }], refLines: [{ value: 0, color: refZero }] }),
}

// ─── Indicator metadata ─────────────────────────────────────────────────────
//
// The label, grouping and explanation for every indicator INDICATOR_RENDER can
// draw. This lives beside the render map on purpose: the two drifted for months
// while each TA page kept its own private list, so the engine could render 62
// indicators while /equities showed 18 and /macro showed 16 — not because the
// others were unimplemented, but because nobody added them to three places.
//
// Pages must select from ALL_INDICATORS rather than declare their own list.
//
// `needsVolume` marks the 11 indicators whose maths reads candle volume
// (verified by tracing INDICATOR_RENDER through lib/utils/indicators.ts, not by
// eye). Macro instruments — FX pairs and yield indices — have no meaningful
// volume, so /macro filters these out and says so on the page. Showing them
// there would render a flat or nonsense series, which is worse than omitting it.
export interface IndicatorMeta {
  key: string
  label: string
  group: 'overlay' | 'panel'
  tip: string
  /** Reads candle volume; unusable on series without it (FX, yield indices). */
  needsVolume?: boolean
}

export const ALL_INDICATORS = [
  // Overlays
  { key: 'ema20',    label: 'EMA 20',           group: 'overlay', tip: 'Exponential Moving Average (20). Weights recent prices more heavily than older ones. Price above EMA → uptrend; below → downtrend. Faster to react than SMA.' },
  { key: 'ema50',    label: 'EMA 50',           group: 'overlay', tip: 'Exponential Moving Average (50). Mid-term trend line. Crossover with EMA20 signals momentum shifts; holding above EMA50 is a bullish structure.' },
  { key: 'ema200',   label: 'EMA 200',          group: 'overlay', tip: 'Exponential Moving Average (200). The gold standard long-term trend indicator. Price above EMA200 = bull market; below = bear market. Watch for the Golden/Death Cross with EMA50.' },
  { key: 'sma20',    label: 'SMA 20',           group: 'overlay', tip: 'Simple Moving Average (20). Equal weight to each of the last 20 closes. Slower than EMA — good for spotting support/resistance and as the midline of Bollinger Bands.' },
  { key: 'wma20',    label: 'WMA 20',           group: 'overlay', tip: 'Weighted Moving Average (20). Linearly weights recent candles higher. More responsive than SMA, less "jumpy" than EMA. Use like EMA20 for trend direction.' },
  { key: 'hma20',    label: 'HMA 20',           group: 'overlay', tip: 'Hull Moving Average (20). Uses WMA of WMAs to nearly eliminate lag while staying smooth. Excellent for spotting trend changes early — direction of the HMA is the signal.' },
  { key: 'bb',       label: 'Bollinger Bands',  group: 'overlay', tip: 'Bollinger Bands (20, ±2σ). Upper/lower bands are 2 standard deviations from SMA20. Price touching the lower band = oversold; upper band = overbought. Bands squeezing = breakout imminent.' },
  { key: 'vwap',     label: 'VWAP',             group: 'overlay', needsVolume: true, tip: 'Volume Weighted Average Price. Resets daily. The "fair value" anchor used by institutional traders. Price above VWAP = buyers in control; below = sellers. Best on intraday timeframes.' },
  { key: 'keltner',  label: 'Keltner Channels', group: 'overlay', tip: 'Keltner Channels (EMA20 ± 2×ATR10). Volatility-based envelopes. Smoother than Bollinger Bands — less susceptible to short spikes. Useful for spotting breakouts when price exits the channel.' },
  { key: 'donchian', label: 'Donchian (20)',    group: 'overlay', tip: 'Donchian Channels (20-period high/low). Upper band = highest high; lower = lowest low. Price breaking above the upper band is a new 20-period high — a classic breakout signal used by trend-followers.' },
  { key: 'psar',     label: 'Parabolic SAR',    group: 'overlay', tip: 'Parabolic Stop and Reverse. Dots appear above price in a downtrend and below in an uptrend. When price crosses the dots, the trend may be reversing. Best used in trending markets — noisy in sideways chop.' },
  { key: 'linreg',   label: 'Linear Reg (20)',  group: 'overlay', tip: 'Linear Regression line (20 periods). A best-fit line through recent closes. Shows the statistically "ideal" trend direction. Price deviating far from the line tends to revert back toward it.' },
  // Panels — Momentum
  { key: 'rsi',      label: 'RSI (14)',          group: 'panel', tip: 'Relative Strength Index (14). Oscillates 0–100. Below 30 = oversold (look for buy); above 70 = overbought (look for sell). Divergence between RSI and price is one of the strongest signals in TA.' },
  { key: 'macd',     label: 'MACD',              group: 'panel', tip: 'Moving Average Convergence/Divergence (12,26,9). The MACD line crossing above the signal line is bullish; crossing below is bearish. Histogram growing in the positive = accelerating momentum.' },
  { key: 'stochrsi', label: 'Stoch RSI',         group: 'panel', tip: 'Stochastic RSI (14,14,3,3). RSI applied to RSI — more sensitive than RSI alone. K line below 20 = deeply oversold; above 80 = deeply overbought. K crossing above D is a buy signal.' },
  { key: 'williamsr',label: 'Williams %R',       group: 'panel', tip: 'Williams %R (14). Oscillates -100 to 0. Above -20 = overbought; below -80 = oversold. Similar to Stochastic but inverted. Use for identifying short-term turning points and confirming reversals.' },
  { key: 'cci',      label: 'CCI (20)',          group: 'panel', tip: 'Commodity Channel Index (20). Measures how far price is from its statistical average. Above +100 = overbought / strong uptrend; below -100 = oversold / strong downtrend. Works well for spotting cyclical turns.' },
  { key: 'roc',      label: 'ROC (12)',          group: 'panel', tip: 'Rate of Change (12). The % change from 12 periods ago. Positive = upward momentum; negative = downward. Crossing zero is a trend signal. Useful for spotting divergence and momentum exhaustion.' },
  { key: 'mom',      label: 'Momentum (10)',     group: 'panel', tip: 'Momentum (10). Raw difference between current close and close 10 periods ago. Rising = accelerating; falling = decelerating. Simple but effective for confirming trend strength. Cross above zero = bullish.' },
  { key: 'cmo',      label: 'CMO (14)',          group: 'panel', tip: 'Chande Momentum Oscillator (14). Oscillates -100 to +100. Above +50 = strong bullish momentum; below -50 = strong bearish. Zero-line crossovers signal trend changes. Less whipsaw than RSI in trending markets.' },
  { key: 'uo',       label: 'Ultimate Osc',      group: 'panel', tip: 'Ultimate Oscillator (7,14,28). Combines three timeframes into one oscillator to reduce false divergence signals. Above 70 = overbought; below 30 = oversold. Divergence + breakout from the overbought/oversold zone is the key setup.' },
  // Panels — Trend
  { key: 'adx',      label: 'ADX (14)',          group: 'panel', tip: 'Average Directional Index (14). ADX measures trend strength (not direction) — above 25 = trending, above 40 = strongly trending. +DI above -DI = uptrend; -DI above +DI = downtrend. Best for filtering out choppy markets.' },
  { key: 'aroon',    label: 'Aroon (25)',        group: 'panel', tip: 'Aroon (25). Measures how recently the highest high and lowest low occurred. Oscillator above +50 = uptrend strengthening; below -50 = downtrend strengthening. Aroon Up crossing above Aroon Down is a bullish signal.' },
  { key: 'trix',     label: 'TRIX (15)',         group: 'panel', tip: 'TRIX (15). 1-period % change of a triple-smoothed EMA. Filters out market noise effectively. Signal line crossovers and zero-line crossovers are the main signals. Especially good for medium-term trends.' },
  { key: 'kst',      label: 'KST',              group: 'panel', tip: 'Know Sure Thing. A weighted sum of four ROCs at different lengths, smoothed. Designed to clearly show cyclical momentum at multiple timeframes simultaneously. KST crossing its signal line is the key trade trigger.' },
  { key: 'dpo',      label: 'DPO (20)',          group: 'panel', tip: 'Detrended Price Oscillator (20). Removes the long-term trend so you can see price cycles clearly. Oscillates around zero — peaks/troughs of the DPO mark peaks/troughs of the price cycle. Not for trend-following.' },
  // Panels — Volume / Money Flow
  { key: 'volume',   label: 'Volume',            group: 'panel', needsVolume: true, tip: 'Raw trading volume per candle (USD millions). High volume on breakouts = conviction; low volume = suspect. A price move on expanding volume is more reliable than one on declining volume.' },
  { key: 'obv',      label: 'OBV',              group: 'panel', needsVolume: true, tip: 'On-Balance Volume. Adds volume on up days, subtracts on down days. OBV rising ahead of price = smart money accumulating (bullish). OBV diverging from price often leads the next price move.' },
  { key: 'mfi',      label: 'MFI (14)',          group: 'panel', needsVolume: true, tip: 'Money Flow Index (14). Volume-weighted RSI — considers both price and volume. Below 20 = oversold with selling pressure drying up (bullish); above 80 = overbought. Divergence with price is a high-conviction signal.' },
  { key: 'cmf',      label: 'Chaikin MF (20)',   group: 'panel', needsVolume: true, tip: 'Chaikin Money Flow (20). Measures buying vs selling pressure by comparing close position within the candle\'s range, weighted by volume. Above 0.1 = buying pressure; below -0.1 = selling pressure. Zero-line crossovers signal trend shifts.' },
  { key: 'accDist',  label: 'A/D Line',         group: 'panel', needsVolume: true, tip: 'Accumulation/Distribution Line. Cumulative volume indicator based on close position within each candle\'s range. Rising A/D while price falls = accumulation (bullish divergence). Falling A/D while price rises = distribution (bearish).' },
  { key: 'volosc',   label: 'Volume Osc',       group: 'panel', needsVolume: true, tip: 'Volume Oscillator (fast 5, slow 10). Difference between a fast and slow volume moving average. Positive = volume expanding; negative = contracting. Rising volume oscillator during a price move confirms the trend.' },
  { key: 'fi',       label: 'Force Index (13)',  group: 'panel', needsVolume: true, tip: 'Force Index (13). Combines price change and volume into a single momentum measure. Strong positive readings = powerful buying force; strong negative = powerful selling. Zero crossovers and divergence are the key signals.' },
  { key: 'eom',      label: 'Ease of Move',     group: 'panel', needsVolume: true, tip: 'Ease of Movement. Measures how efficiently price moves relative to volume. High positive value = price rising easily on low volume (bullish); high negative = falling easily. Hovering near zero = price struggling to move.' },
  { key: 'elderray', label: 'Elder Ray (13)',    group: 'panel', tip: 'Elder Ray Index (EMA 13). Bull Power = high minus EMA (positive = buyers driving price above average). Bear Power = low minus EMA (negative = sellers pushing below). Buy when Bear Power is negative but rising; sell when Bull Power is positive but falling.' },
  // Panels — Volatility
  { key: 'atr',      label: 'ATR (14)',          group: 'panel', tip: 'Average True Range (14). Measures average volatility (typical daily price swing). Not directional — use for position sizing and stop placement. High ATR = high volatility; low ATR = consolidation, potential breakout building.' },
  { key: 'chop',     label: 'Choppiness',       group: 'panel', tip: 'Choppiness Index (14). Measures whether the market is trending or ranging. Above 61.8 = choppy/sideways (avoid trend strategies); below 38.2 = strongly trending (use trend-following strategies). Great for filtering other signals.' },
  { key: 'bbpctb',   label: 'BB %B',            group: 'panel', tip: 'Bollinger %B. Shows where price is within the Bollinger Bands as a percentage. 1.0 = at upper band; 0 = at lower band; 0.5 = at midline. Below 0 or above 1 = price outside the bands — extreme reading, potential reversal.' },
  { key: 'massidx',  label: 'Mass Index',       group: 'panel', tip: 'Mass Index (25). Uses the high-low range to identify reversals — regardless of direction. When it rises above 27 then falls below 26.5 ("reversal bulge"), a trend reversal is likely. Direction confirmed by a separate trend indicator.' },
  { key: 'stddev',   label: 'Std Deviation',    group: 'panel', tip: 'Standard Deviation (20). Measures the statistical dispersion of closing prices around their mean. High StdDev = high volatility / trending; low StdDev = compression. Low readings often precede explosive moves.' },
  // Panels — Momentum (additional)
  { key: 'stoch',    label: 'Stochastic',       group: 'panel', tip: 'Classic Stochastic Oscillator (14,3,3). %K crossing above %D below 20 = buy; crossing below above 80 = sell. The original oscillator developed by George Lane — more stable than Stoch RSI.' },
  { key: 'tsi',      label: 'TSI (25,13)',       group: 'panel', tip: 'True Strength Index. Double-smoothed price momentum oscillator. Above zero = bullish; below zero = bearish. Crossing zero or the signal line are the key signals. Less whipsaw than RSI thanks to double smoothing.' },
  { key: 'ppo',      label: 'PPO (12,26,9)',     group: 'panel', tip: 'Percentage Price Oscillator. MACD expressed as a percentage of the slow EMA, making it comparable across different price levels. Use exactly like MACD: signal line crossovers and histogram direction.' },
  { key: 'fisher',   label: 'Fisher Transform', group: 'panel', tip: 'Fisher Transform (9). Converts prices into a near-Gaussian distribution. Sharp reversals at extreme peaks/troughs signal turning points. Zero-line crossovers signal trend changes. Particularly effective for identifying cycle tops and bottoms.' },
  { key: 'crsi',     label: 'Connors RSI',      group: 'panel', tip: 'Connors RSI (3,2,100). Composite of 3-period RSI, RSI of the current price streak, and a percentile rank. Below 10 = strong buy; above 90 = strong sell. More precise than standard RSI for short-term reversals.' },
  // Panels — Trend (additional)
  { key: 'vortex',   label: 'Vortex (14)',      group: 'panel', tip: 'Vortex Indicator (14). VI+ measures upward movement; VI− measures downward. VI+ crossing above VI− = bullish; VI− crossing above VI+ = bearish. Both lines rising above 1.0 confirms a strong trend.' },
  { key: 'coppock',  label: 'Coppock Curve',    group: 'panel', tip: 'Coppock Curve. A long-term momentum oscillator originally designed for monthly charts. Crossing above zero from below = major buy signal. Rare but high-conviction — especially reliable after prolonged downtrends.' },
  // Panels — Volume (additional)
  { key: 'klinger',  label: 'Klinger Vol Osc',  group: 'panel', needsVolume: true, tip: 'Klinger Volume Oscillator (34,55). Combines price direction, magnitude, and volume. Designed to detect long-term money flow while staying sensitive to short-term fluctuations. Signal line crossovers are the key signals.' },
  { key: 'bop',      label: 'Balance of Power', group: 'panel', tip: 'Balance of Power (smoothed 14). Measures the strength of buyers vs sellers by comparing where the candle closes within its range. Above zero = buyers winning; below zero = sellers winning. Divergence with price is a powerful signal.' },
  { key: 'chaikin',  label: 'Chaikin Osc',      group: 'panel', needsVolume: true, tip: 'Chaikin Oscillator (3,10). An EMA of the Accumulation/Distribution line — measures momentum of money flow. Crossing above zero = buying pressure accelerating (bullish); crossing below = selling pressure building (bearish).' },
  { key: 'disparity',label: 'Disparity Index',  group: 'panel', tip: 'Disparity Index (14). Percentage deviation of price from its 14-period EMA. High positive values = overbought/extended; high negative = oversold/stretched. Useful for mean-reversion setups — price tends to snap back.' },
  // Overlays — additional MAs
  { key: 'ema9',     label: 'EMA 9',            group: 'overlay', tip: 'Exponential Moving Average (9). Ultra-short-term trend — commonly used for intraday and swing trade entries. Price pulling back to EMA9 and bouncing is a classic continuation entry. Very reactive to price changes.' },
  { key: 'ema21',    label: 'EMA 21',           group: 'overlay', tip: 'Exponential Moving Average (21). Fibonacci-based short-term MA widely used in crypto. Acts as dynamic support in uptrends. Crossing above EMA50 signals a potential trend shift.' },
  { key: 'ema100',   label: 'EMA 100',          group: 'overlay', tip: 'Exponential Moving Average (100). Mid-to-long-term trend indicator. Often acts as a key support/resistance in bull markets. Price reclaiming EMA100 after a correction is a bullish reentry signal.' },
  { key: 'sma50',    label: 'SMA 50',           group: 'overlay', tip: 'Simple Moving Average (50). The most widely watched medium-term MA by institutional traders. Holding above SMA50 is bullish structure; losing SMA50 often triggers selling. Part of the Golden/Death Cross setup with SMA200.' },
  { key: 'sma100',   label: 'SMA 100',          group: 'overlay', tip: 'Simple Moving Average (100). Intermediate-term trend benchmark. Less commonly cited than SMA50/200 but useful as a confirmation level. Price bouncing from SMA100 = bullish; failing it = bearish.' },
  { key: 'sma200',   label: 'SMA 200',          group: 'overlay', tip: 'Simple Moving Average (200). The ultimate long-term trend gauge — defines the bull/bear market boundary for most market participants. Trading above SMA200 = macro bullish; below = macro bearish.' },
  { key: 'dema',     label: 'DEMA 20',          group: 'overlay', tip: 'Double Exponential Moving Average (20). Reduces EMA lag by applying EMA twice. More responsive than EMA with less noise than raw price. Direction and slope of DEMA is the primary signal.' },
  { key: 'tema',     label: 'TEMA 20',          group: 'overlay', tip: 'Triple Exponential Moving Average (20). Even lower lag than DEMA. Extremely responsive — good for catching early trend changes. Can produce false signals in choppy markets; best combined with ADX to confirm trending conditions.' },
  { key: 'kama',     label: 'KAMA (10)',         group: 'overlay', tip: 'Kaufman Adaptive MA (10). Automatically adjusts its speed based on market noise — moves quickly in trending markets, slowly in ranging ones. A flattening KAMA signals chop; a steep KAMA signals strong trend.' },
  { key: 'mcginley', label: 'McGinley Dyn',     group: 'overlay', tip: 'McGinley Dynamic (14). A self-adjusting MA that corrects for slow/fast EMA movement by adjusting its speed based on the price ratio. More accurate than EMA in both fast and slow markets — stays closer to actual price.' },
  { key: 'ichimoku', label: 'Ichimoku Cloud',   group: 'overlay', tip: 'Ichimoku Cloud (9,26,52). An all-in-one indicator: Tenkan (conversion), Kijun (base), Senkou A/B (cloud), Chikou (lagging). Price above the cloud = bullish; below = bearish. Cloud thickness shows support/resistance strength.' },
] as const satisfies readonly IndicatorMeta[]

/**
 * Every indicator key the engine can draw. `as const` above keeps this a literal
 * union rather than `string`, so a page cannot toggle an indicator that does not
 * exist and a typo fails the build instead of silently rendering nothing.
 */
export type IndicatorKey = typeof ALL_INDICATORS[number]['key']

/**
 * Indicators appropriate for a series, given whether it carries real volume.
 * `hasVolume: false` drops the volume-derived set — the honest subset, not a
 * degraded one.
 */
export function indicatorsFor(hasVolume: boolean): readonly IndicatorMeta[] {
  // Widened view: `as const` above narrows each entry to its own literal shape,
  // so entries without `needsVolume` genuinely lack the property. Reading it
  // through IndicatorMeta is what makes the optional field addressable.
  const all: readonly IndicatorMeta[] = ALL_INDICATORS
  return hasVolume ? all : all.filter((i) => !i.needsVolume)
}

/** The volume-derived indicators, so a page can name what it is leaving out. */
export const VOLUME_INDICATORS: readonly IndicatorMeta[] =
  (ALL_INDICATORS as readonly IndicatorMeta[]).filter((i) => i.needsVolume)
