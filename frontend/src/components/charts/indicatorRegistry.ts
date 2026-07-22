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
