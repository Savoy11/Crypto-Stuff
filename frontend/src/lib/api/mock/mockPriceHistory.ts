import { eachDayOfInterval, eachWeekOfInterval, parseISO, format, differenceInDays } from 'date-fns'

export interface PriceCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number   // USD millions
}

export type PriceRange = '1W' | '1M' | '3M' | '1Y' | 'MAX'

// Each asset's mainnet launch date
const LAUNCH_DATES: Record<string, string> = {
  usdt:  '2014-10-03',
  usdc:  '2018-10-15',
  dai:   '2019-12-18',
  frax:  '2020-12-20',
  tusd:  '2018-03-05',
  busd:  '2019-09-10',
  pyusd: '2023-08-07',
  usdp:  '2018-09-10',
  gusd:  '2018-09-10',
  lusd:  '2021-04-05',
}

// Typical 24h volume baseline (USD millions) per asset
const BASE_VOLUME: Record<string, number> = {
  usdt:  31500, usdc: 8400, dai: 420, frax: 38,
  tusd:  62,    busd: 550,  pyusd: 29, usdp: 12,
  gusd:  8.5,   lusd: 18,
}

// Historical stress events: peg deviation at peak (negative = below $1)
interface StressEvent {
  start: string; peak: string; end: string
  impacts: Record<string, number>
}

const STRESS_EVENTS: StressEvent[] = [
  {
    // Black Thursday — March 2020
    start: '2020-03-12', peak: '2020-03-13', end: '2020-03-20',
    impacts: { usdt: 0.042, dai: 0.118, usdc: 0.002, tusd: 0.006, gusd: 0.003, usdp: 0.002 },
  },
  {
    // DeFi Summer volatility — Sep 2020
    start: '2020-09-02', peak: '2020-09-03', end: '2020-09-08',
    impacts: { dai: 0.025, usdc: 0.001, usdt: 0.004 },
  },
  {
    // Terra/LUNA collapse — May 2022
    start: '2022-05-09', peak: '2022-05-12', end: '2022-05-19',
    impacts: { frax: -0.142, dai: -0.022, usdt: -0.005, usdc: -0.001, tusd: -0.003, lusd: 0.032 },
  },
  {
    // Three Arrows Capital / Celsius — June 2022
    start: '2022-06-13', peak: '2022-06-15', end: '2022-06-22',
    impacts: { usdt: -0.008, dai: -0.006, frax: -0.018, lusd: 0.015 },
  },
  {
    // FTX collapse — November 2022
    start: '2022-11-08', peak: '2022-11-10', end: '2022-11-14',
    impacts: { usdt: -0.014, busd: -0.004, dai: -0.005, frax: -0.022, usdc: -0.002 },
  },
  {
    // SVB / USDC depeg — March 2023
    start: '2023-03-10', peak: '2023-03-11', end: '2023-03-16',
    impacts: { usdc: -0.115, dai: -0.068, frax: -0.042, usdp: -0.012, gusd: -0.006, usdt: 0.007, lusd: 0.008 },
  },
  {
    // Binance / CZ departure — Nov 2023
    start: '2023-11-21', peak: '2023-11-22', end: '2023-11-26',
    impacts: { usdt: -0.004, busd: -0.012, usdc: -0.001 },
  },
]

// Seeded LCG for deterministic per-asset random data
function makePrng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0
    return s / 0x100000000
  }
}

function strHash(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i)
  return h >>> 0
}

// Calculate the stress impact on a given date for an asset
function getStressImpact(assetId: string, date: Date): number {
  const ds = format(date, 'yyyy-MM-dd')
  let total = 0
  for (const evt of STRESS_EVENTS) {
    if (!(assetId in evt.impacts)) continue
    if (ds < evt.start || ds > evt.end) continue
    const impact = evt.impacts[assetId]
    const days = differenceInDays(parseISO(evt.end), parseISO(evt.start)) || 1
    const peakDays = differenceInDays(parseISO(evt.peak), parseISO(evt.start))
    const t = differenceInDays(date, parseISO(evt.start))
    // Triangle-shaped event curve
    const curve = t <= peakDays
      ? t / Math.max(peakDays, 1)
      : 1 - (t - peakDays) / Math.max(days - peakDays, 1)
    total += impact * Math.max(0, curve)
  }
  return total
}

function generateDailyCandles(assetId: string, startDate: Date, endDate: Date): PriceCandle[] {
  const rng = makePrng(strHash(assetId))
  const baseVol = BASE_VOLUME[assetId] ?? 100
  const days = eachDayOfInterval({ start: startDate, end: endDate })

  let price = 1.0
  // Long-running assets start with slightly different initial prices
  if (['usdt', 'tusd', 'gusd', 'usdp'].includes(assetId)) price = 1.001

  return days.map((day) => {
    const stress = getStressImpact(assetId, day)
    // Micro random walk ±0.05% per day normally, more volatile for some assets
    const volatility = ['frax', 'lusd', 'dai'].includes(assetId) ? 0.0008 : 0.0003
    const noise = (rng() - 0.5) * volatility
    const meanReversion = (1.0 - price) * 0.15 // pull back toward $1

    price = Math.max(0.5, Math.min(1.15, price + noise + meanReversion + stress * 0.1))

    const spread = volatility * (1 + Math.abs(stress) * 10)
    const open  = price + (rng() - 0.5) * spread
    const close = price
    const high  = Math.max(open, close) + rng() * spread
    const low   = Math.min(open, close) - rng() * spread
    const volMultiplier = 1 + Math.abs(stress) * 8 + (rng() - 0.3) * 0.6
    const volume = Math.round(baseVol * volMultiplier * (0.6 + rng() * 0.8))

    return {
      date: format(day, 'yyyy-MM-dd'),
      open:   +open.toFixed(6),
      high:   +high.toFixed(6),
      low:    +low.toFixed(6),
      close:  +close.toFixed(6),
      volume: Math.max(1, volume),
    }
  })
}

function generateWeeklyCandles(assetId: string, startDate: Date, endDate: Date): PriceCandle[] {
  const daily = generateDailyCandles(assetId, startDate, endDate)
  const buckets: Record<string, PriceCandle[]> = {}
  for (const c of daily) {
    const week = format(parseISO(c.date), "yyyy-'W'II")
    ;(buckets[week] ??= []).push(c)
  }
  return Object.entries(buckets).map(([, candles]) => ({
    date:   candles[0].date,
    open:   candles[0].open,
    close:  candles[candles.length - 1].close,
    high:   Math.max(...candles.map((c) => c.high)),
    low:    Math.min(...candles.map((c) => c.low)),
    volume: candles.reduce((s, c) => s + c.volume, 0),
  }))
}

// ─── Layer 1 Price History ────────────────────────────────────────────────────

interface AnchorPoint { date: string; price: number }

// Key historical prices for each L1 asset (interpolated between to build chart data)
const L1_ANCHORS: Record<string, AnchorPoint[]> = {
  btc: [
    { date: '2013-01-01', price: 13 },
    { date: '2013-12-01', price: 1100 },
    { date: '2015-01-15', price: 175 },
    { date: '2017-01-01', price: 1000 },
    { date: '2017-12-17', price: 19800 },
    { date: '2018-12-15', price: 3200 },
    { date: '2019-06-26', price: 13000 },
    { date: '2020-03-13', price: 4900 },
    { date: '2021-04-14', price: 64800 },
    { date: '2021-07-20', price: 29400 },
    { date: '2021-11-10', price: 68900 },
    { date: '2022-06-18', price: 18000 },
    { date: '2022-11-21', price: 15600 },
    { date: '2023-12-01', price: 38700 },
    { date: '2024-03-14', price: 73700 },
    { date: '2024-08-05', price: 49200 },
    { date: '2025-01-20', price: 105000 },
    { date: '2025-05-22', price: 111800 },
    { date: '2026-06-12', price: 63588 },
  ],
  eth: [
    { date: '2015-08-07', price: 0.75 },
    { date: '2016-03-01', price: 12 },
    { date: '2017-01-01', price: 8 },
    { date: '2018-01-13', price: 1400 },
    { date: '2018-12-15', price: 83 },
    { date: '2020-03-13', price: 104 },
    { date: '2021-05-11', price: 4175 },
    { date: '2021-07-20', price: 1780 },
    { date: '2021-11-10', price: 4870 },
    { date: '2022-06-18', price: 900 },
    { date: '2022-11-21', price: 1090 },
    { date: '2023-12-01', price: 2100 },
    { date: '2024-03-14', price: 4000 },
    { date: '2025-01-20', price: 3800 },
    { date: '2026-06-12', price: 2385 },
  ],
  sol: [
    { date: '2020-03-25', price: 0.50 },
    { date: '2020-08-01', price: 3.00 },
    { date: '2021-05-18', price: 52 },
    { date: '2021-11-06', price: 258 },
    { date: '2022-06-18', price: 33 },
    { date: '2022-12-28', price: 8.5 },
    { date: '2023-10-23', price: 28 },
    { date: '2024-01-14', price: 115 },
    { date: '2024-03-19', price: 200 },
    { date: '2025-01-20', price: 265 },
    { date: '2026-06-12', price: 140.8 },
  ],
  bnb: [
    { date: '2017-09-01', price: 0.10 },
    { date: '2018-01-10', price: 24 },
    { date: '2018-12-15', price: 4.5 },
    { date: '2021-05-10', price: 690 },
    { date: '2021-07-20', price: 280 },
    { date: '2021-11-10', price: 695 },
    { date: '2022-06-18', price: 220 },
    { date: '2022-11-21', price: 265 },
    { date: '2023-12-01', price: 240 },
    { date: '2024-06-01', price: 605 },
    { date: '2025-01-20', price: 700 },
    { date: '2026-06-12', price: 566 },
  ],
  avax: [
    { date: '2020-09-23', price: 4.00 },
    { date: '2020-12-26', price: 44 },
    { date: '2021-11-21', price: 147 },
    { date: '2022-06-18', price: 16 },
    { date: '2022-12-28', price: 11.4 },
    { date: '2023-12-01', price: 22 },
    { date: '2024-03-19', price: 56 },
    { date: '2025-01-20', price: 42 },
    { date: '2026-06-12', price: 22.15 },
  ],
  ada: [
    { date: '2017-10-02', price: 0.02 },
    { date: '2018-01-04', price: 1.33 },
    { date: '2018-12-15', price: 0.032 },
    { date: '2021-05-16', price: 2.44 },
    { date: '2021-09-02', price: 3.09 },
    { date: '2022-06-18', price: 0.47 },
    { date: '2022-12-28', price: 0.24 },
    { date: '2024-03-14', price: 0.74 },
    { date: '2025-01-20', price: 1.05 },
    { date: '2026-06-12', price: 0.377 },
  ],
  dot: [
    { date: '2020-08-19', price: 2.50 },
    { date: '2021-05-14', price: 49 },
    { date: '2021-11-04', price: 52 },
    { date: '2022-06-18', price: 6.5 },
    { date: '2022-12-28', price: 4.2 },
    { date: '2024-03-14', price: 15.5 },
    { date: '2025-01-20', price: 10 },
    { date: '2026-06-12', price: 5.80 },
  ],
  pol: [
    { date: '2019-04-28', price: 0.01 },
    { date: '2019-12-01', price: 0.025 },
    { date: '2021-05-18', price: 2.45 },
    { date: '2021-12-26', price: 2.92 },
    { date: '2022-06-18', price: 0.40 },
    { date: '2022-12-28', price: 0.74 },
    { date: '2024-03-14', price: 1.20 },
    { date: '2025-01-20', price: 0.58 },
    { date: '2026-06-12', price: 0.38 },
  ],
  trx: [
    { date: '2018-09-01', price: 0.015 },
    { date: '2019-01-01', price: 0.020 },
    { date: '2021-04-05', price: 0.168 },
    { date: '2021-10-28', price: 0.116 },
    { date: '2022-06-18', price: 0.062 },
    { date: '2022-12-28', price: 0.053 },
    { date: '2024-03-14', price: 0.135 },
    { date: '2025-01-20', price: 0.28 },
    { date: '2026-06-12', price: 0.265 },
  ],
  hype: [
    { date: '2024-11-29', price: 3.5 },
    { date: '2024-12-31', price: 28.0 },
    { date: '2025-03-01', price: 12.0 },
    { date: '2025-06-01', price: 20.0 },
    { date: '2026-06-12', price: 18.50 },
  ],
  zec: [
    { date: '2016-10-28', price: 5000 },
    { date: '2017-01-01', price: 47 },
    { date: '2018-01-07', price: 775 },
    { date: '2018-12-15', price: 58 },
    { date: '2020-03-13', price: 23 },
    { date: '2021-05-05', price: 370 },
    { date: '2022-06-18', price: 64 },
    { date: '2023-01-01', price: 34 },
    { date: '2024-06-01', price: 21 },
    { date: '2026-06-12', price: 28.50 },
  ],
  xmr: [
    { date: '2014-04-18', price: 2.47 },
    { date: '2016-06-01', price: 2.0 },
    { date: '2017-01-01', price: 12 },
    { date: '2018-01-07', price: 490 },
    { date: '2018-12-15', price: 45 },
    { date: '2020-03-13', price: 46 },
    { date: '2021-05-07', price: 480 },
    { date: '2022-06-18', price: 153 },
    { date: '2023-01-01', price: 148 },
    { date: '2024-03-14', price: 175 },
    { date: '2025-01-20', price: 235 },
    { date: '2026-06-12', price: 165 },
  ],
  cc: [
    { date: '2023-07-01', price: 0.05 },
    { date: '2024-01-01', price: 0.09 },
    { date: '2024-06-01', price: 0.14 },
    { date: '2025-01-20', price: 0.18 },
    { date: '2026-06-12', price: 0.12 },
  ],
  ton: [
    { date: '2020-11-15', price: 0.02 },
    { date: '2021-11-01', price: 4.96 },
    { date: '2022-06-18', price: 0.78 },
    { date: '2023-05-01', price: 2.20 },
    { date: '2024-06-05', price: 7.35 },
    { date: '2024-09-01', price: 4.80 },
    { date: '2025-01-20', price: 5.20 },
    { date: '2026-06-12', price: 3.30 },
  ],
  bch: [
    { date: '2017-08-01', price: 289 },
    { date: '2018-01-13', price: 4090 },
    { date: '2018-12-15', price: 75 },
    { date: '2019-04-03', price: 292 },
    { date: '2020-03-13', price: 151 },
    { date: '2021-05-07', price: 1648 },
    { date: '2022-06-18', price: 106 },
    { date: '2022-12-28', price: 104 },
    { date: '2024-03-14', price: 545 },
    { date: '2025-01-20', price: 580 },
    { date: '2026-06-12', price: 375 },
  ],
  memecore: [
    { date: '2024-05-01', price: 0.008 },
    { date: '2024-08-01', price: 0.022 },
    { date: '2024-12-01', price: 0.025 },
    { date: '2025-06-01', price: 0.018 },
    { date: '2026-06-12', price: 0.015 },
  ],
  hbar: [
    { date: '2019-09-16', price: 0.04 },
    { date: '2020-03-13', price: 0.013 },
    { date: '2021-09-10', price: 0.568 },
    { date: '2022-06-18', price: 0.059 },
    { date: '2022-12-28', price: 0.038 },
    { date: '2024-02-05', price: 0.178 },
    { date: '2025-01-20', price: 0.30 },
    { date: '2026-06-12', price: 0.065 },
  ],
  ltc: [
    { date: '2011-10-07', price: 0.30 },
    { date: '2013-11-29', price: 44 },
    { date: '2015-01-15', price: 1.5 },
    { date: '2017-12-19', price: 375 },
    { date: '2018-12-15', price: 24 },
    { date: '2019-06-22', price: 145 },
    { date: '2020-03-13', price: 34 },
    { date: '2021-05-10', price: 413 },
    { date: '2022-06-18', price: 42 },
    { date: '2022-12-28', price: 67 },
    { date: '2024-03-14', price: 125 },
    { date: '2025-01-20', price: 125 },
    { date: '2026-06-12', price: 82 },
  ],
  sui: [
    { date: '2023-05-03', price: 1.08 },
    { date: '2023-10-28', price: 0.45 },
    { date: '2024-01-13', price: 1.25 },
    { date: '2024-03-14', price: 3.87 },
    { date: '2024-08-05', price: 0.68 },
    { date: '2025-01-20', price: 4.85 },
    { date: '2026-06-12', price: 2.85 },
  ],
  cro: [
    { date: '2018-12-01', price: 0.013 },
    { date: '2019-06-01', price: 0.065 },
    { date: '2020-06-01', price: 0.082 },
    { date: '2021-11-24', price: 0.966 },
    { date: '2022-06-18', price: 0.118 },
    { date: '2022-12-28', price: 0.057 },
    { date: '2024-03-14', price: 0.145 },
    { date: '2025-01-20', price: 0.135 },
    { date: '2026-06-12', price: 0.088 },
  ],
  near: [
    { date: '2020-10-13', price: 0.52 },
    { date: '2021-01-11', price: 2.44 },
    { date: '2021-10-21', price: 12.75 },
    { date: '2022-06-18', price: 3.58 },
    { date: '2022-12-28', price: 1.32 },
    { date: '2024-03-14', price: 7.10 },
    { date: '2024-08-05', price: 3.75 },
    { date: '2025-01-20', price: 5.50 },
    { date: '2026-06-12', price: 3.15 },
  ],
  tao: [
    { date: '2021-11-01', price: 3.5 },
    { date: '2022-06-18', price: 45 },
    { date: '2022-12-28', price: 22 },
    { date: '2023-06-01', price: 120 },
    { date: '2024-02-20', price: 800 },
    { date: '2024-06-01', price: 280 },
    { date: '2025-01-20', price: 470 },
    { date: '2026-06-12', price: 285 },
  ],
  pi: [
    { date: '2023-02-20', price: 1.80 },
    { date: '2023-06-01', price: 0.45 },
    { date: '2024-06-01', price: 0.30 },
    { date: '2024-10-01', price: 0.75 },
    { date: '2025-02-20', price: 2.98 },
    { date: '2025-06-01', price: 1.20 },
    { date: '2026-06-12', price: 0.58 },
  ],
  icp: [
    { date: '2021-05-10', price: 750 },
    { date: '2021-06-18', price: 35 },
    { date: '2021-12-28', price: 24 },
    { date: '2022-06-18', price: 5.68 },
    { date: '2022-12-28', price: 3.40 },
    { date: '2024-02-01', price: 13.22 },
    { date: '2024-03-14', price: 18.42 },
    { date: '2025-01-20', price: 11.00 },
    { date: '2026-06-12', price: 5.65 },
  ],
  etc: [
    { date: '2016-07-20', price: 0.90 },
    { date: '2017-12-21', price: 41 },
    { date: '2018-12-15', price: 4.00 },
    { date: '2019-07-10', price: 7.35 },
    { date: '2020-03-13', price: 4.81 },
    { date: '2021-05-06', price: 167 },
    { date: '2022-06-18', price: 15.44 },
    { date: '2022-12-28', price: 14.57 },
    { date: '2024-03-14', price: 38.72 },
    { date: '2025-01-20', price: 38.00 },
    { date: '2026-06-12', price: 17.25 },
  ],
  kas: [
    { date: '2022-11-07', price: 0.0012 },
    { date: '2023-06-01', price: 0.040 },
    { date: '2023-10-28', price: 0.152 },
    { date: '2024-02-14', price: 0.182 },
    { date: '2024-08-01', price: 0.082 },
    { date: '2025-01-20', price: 0.148 },
    { date: '2026-06-12', price: 0.102 },
  ],
  stable: [
    { date: '2023-01-01', price: 0.40 },
    { date: '2023-06-01', price: 0.68 },
    { date: '2024-01-01', price: 0.95 },
    { date: '2025-01-20', price: 1.20 },
    { date: '2026-06-12', price: 0.85 },
  ],
  algo: [
    { date: '2019-06-20', price: 2.37 },
    { date: '2019-12-28', price: 0.19 },
    { date: '2021-09-12', price: 2.97 },
    { date: '2022-06-18', price: 0.39 },
    { date: '2022-12-28', price: 0.14 },
    { date: '2024-03-14', price: 0.32 },
    { date: '2025-01-20', price: 0.55 },
    { date: '2026-06-12', price: 0.165 },
  ],
  flr: [
    { date: '2023-01-10', price: 0.10 },
    { date: '2023-04-01', price: 0.042 },
    { date: '2024-01-05', price: 0.058 },
    { date: '2024-03-14', price: 0.038 },
    { date: '2025-01-20', price: 0.035 },
    { date: '2026-06-12', price: 0.016 },
  ],
  xdc: [
    { date: '2019-06-01', price: 0.003 },
    { date: '2021-08-21', price: 0.192 },
    { date: '2022-06-18', price: 0.026 },
    { date: '2022-12-28', price: 0.020 },
    { date: '2024-06-01', price: 0.055 },
    { date: '2025-01-20', price: 0.080 },
    { date: '2026-06-12', price: 0.044 },
  ],
  fil: [
    { date: '2020-10-15', price: 25.0 },
    { date: '2021-04-01', price: 237 },
    { date: '2022-06-18', price: 5.20 },
    { date: '2022-12-28', price: 2.85 },
    { date: '2024-03-14', price: 8.50 },
    { date: '2024-08-05', price: 3.40 },
    { date: '2025-01-20', price: 5.20 },
    { date: '2026-06-12', price: 2.75 },
  ],
  apt: [
    { date: '2022-10-12', price: 7.88 },
    { date: '2023-01-12', price: 3.11 },
    { date: '2024-01-12', price: 9.76 },
    { date: '2024-03-14', price: 18.52 },
    { date: '2024-08-05', price: 5.88 },
    { date: '2025-01-20', price: 11.60 },
    { date: '2026-06-12', price: 4.85 },
  ],
  inj: [
    { date: '2021-10-21', price: 11.0 },
    { date: '2022-06-18', price: 1.46 },
    { date: '2022-12-28', price: 1.23 },
    { date: '2024-01-08', price: 47.0 },
    { date: '2024-03-14', price: 42.0 },
    { date: '2024-08-05', price: 19.0 },
    { date: '2025-01-20', price: 22.0 },
    { date: '2026-06-12', price: 12.40 },
  ],
  vet: [
    { date: '2018-07-30', price: 0.013 },
    { date: '2021-04-17', price: 0.278 },
    { date: '2022-06-18', price: 0.024 },
    { date: '2022-12-28', price: 0.014 },
    { date: '2024-03-14', price: 0.048 },
    { date: '2025-01-20', price: 0.068 },
    { date: '2026-06-12', price: 0.024 },
  ],
  sei: [
    { date: '2023-08-15', price: 0.12 },
    { date: '2024-01-08', price: 0.93 },
    { date: '2024-03-14', price: 0.62 },
    { date: '2024-08-05', price: 0.22 },
    { date: '2025-01-20', price: 0.38 },
    { date: '2026-06-12', price: 0.205 },
  ],
  kite: [
    { date: '2024-01-01', price: 0.30 },
    { date: '2024-04-01', price: 0.85 },
    { date: '2024-08-01', price: 0.55 },
    { date: '2025-01-20', price: 1.20 },
    { date: '2026-06-12', price: 0.95 },
  ],
  tia: [
    { date: '2023-10-31', price: 2.04 },
    { date: '2024-01-15', price: 20.52 },
    { date: '2024-06-01', price: 9.00 },
    { date: '2024-08-05', price: 4.82 },
    { date: '2025-01-20', price: 6.60 },
    { date: '2026-06-12', price: 2.90 },
  ],
  chz: [
    { date: '2019-09-18', price: 0.015 },
    { date: '2021-03-13', price: 0.884 },
    { date: '2022-06-18', price: 0.084 },
    { date: '2022-12-28', price: 0.065 },
    { date: '2024-03-14', price: 0.142 },
    { date: '2025-01-20', price: 0.086 },
    { date: '2026-06-12', price: 0.058 },
  ],
  gno: [
    { date: '2017-04-24', price: 15 },
    { date: '2018-01-10', price: 582 },
    { date: '2018-12-15', price: 50 },
    { date: '2020-03-13', price: 46 },
    { date: '2021-08-01', price: 460 },
    { date: '2022-06-18', price: 153 },
    { date: '2022-12-28', price: 84 },
    { date: '2024-03-14', price: 380 },
    { date: '2025-01-20', price: 245 },
    { date: '2026-06-12', price: 145 },
  ],
  xtz: [
    { date: '2018-09-17', price: 3.40 },
    { date: '2019-08-15', price: 1.40 },
    { date: '2021-10-04', price: 8.40 },
    { date: '2022-06-18', price: 1.46 },
    { date: '2022-12-28', price: 0.87 },
    { date: '2024-03-14', price: 1.48 },
    { date: '2025-01-20', price: 1.25 },
    { date: '2026-06-12', price: 0.64 },
  ],
  mon: [
    { date: '2025-04-01', price: 1.20 },
    { date: '2025-06-01', price: 3.50 },
    { date: '2025-09-01', price: 2.80 },
    { date: '2026-06-12', price: 2.10 },
  ],
  tel: [
    { date: '2018-01-01', price: 0.0030 },
    { date: '2018-06-01', price: 0.0008 },
    { date: '2021-04-15', price: 0.063 },
    { date: '2022-06-18', price: 0.0035 },
    { date: '2022-12-28', price: 0.0012 },
    { date: '2024-03-14', price: 0.0055 },
    { date: '2025-01-20', price: 0.0048 },
    { date: '2026-06-12', price: 0.0032 },
  ],
  kaia: [
    { date: '2019-06-27', price: 0.08 },
    { date: '2021-03-29', price: 3.86 },
    { date: '2022-06-18', price: 0.22 },
    { date: '2022-12-28', price: 0.18 },
    { date: '2024-03-14', price: 0.31 },
    { date: '2025-01-20', price: 0.36 },
    { date: '2026-06-12', price: 0.155 },
  ],
  cfx: [
    { date: '2021-01-29', price: 0.042 },
    { date: '2021-09-01', price: 1.70 },
    { date: '2022-06-18', price: 0.12 },
    { date: '2022-12-28', price: 0.073 },
    { date: '2023-02-05', price: 0.445 },
    { date: '2024-03-14', price: 0.28 },
    { date: '2025-01-20', price: 0.24 },
    { date: '2026-06-12', price: 0.085 },
  ],
  iota: [
    { date: '2017-06-13', price: 0.001 },
    { date: '2017-12-19', price: 5.25 },
    { date: '2018-12-15', price: 0.25 },
    { date: '2020-03-13', price: 0.12 },
    { date: '2021-04-15', price: 2.20 },
    { date: '2022-06-18', price: 0.35 },
    { date: '2022-12-28', price: 0.18 },
    { date: '2024-03-14', price: 0.32 },
    { date: '2025-01-20', price: 0.45 },
    { date: '2026-06-12', price: 0.178 },
  ],
  dcr: [
    { date: '2016-02-08', price: 2.0 },
    { date: '2018-01-10', price: 122 },
    { date: '2018-12-15', price: 8.8 },
    { date: '2019-06-22', price: 30 },
    { date: '2020-03-13', price: 7.52 },
    { date: '2021-05-01', price: 230 },
    { date: '2022-06-18', price: 24 },
    { date: '2022-12-28', price: 13.5 },
    { date: '2024-03-14', price: 25 },
    { date: '2025-01-20', price: 22 },
    { date: '2026-06-12', price: 13.20 },
  ],
  nex: [
    { date: '2019-06-01', price: 1.08 },
    { date: '2020-06-01', price: 0.42 },
    { date: '2021-04-01', price: 4.28 },
    { date: '2022-06-18', price: 0.84 },
    { date: '2022-12-28', price: 0.34 },
    { date: '2024-03-14', price: 0.45 },
    { date: '2025-01-20', price: 0.32 },
    { date: '2026-06-12', price: 0.185 },
  ],
  theta: [
    { date: '2019-03-15', price: 0.12 },
    { date: '2020-03-13', price: 0.068 },
    { date: '2021-04-15', price: 14.82 },
    { date: '2022-06-18', price: 1.05 },
    { date: '2022-12-28', price: 0.68 },
    { date: '2024-03-14', price: 2.18 },
    { date: '2025-01-20', price: 1.52 },
    { date: '2026-06-12', price: 0.88 },
  ],
  xpl: [
    { date: '2022-05-01', price: 0.02 },
    { date: '2022-12-28', price: 0.008 },
    { date: '2024-03-14', price: 0.062 },
    { date: '2025-01-20', price: 0.085 },
    { date: '2026-06-12', price: 0.045 },
  ],
  xcn: [
    { date: '2022-02-23', price: 0.0095 },
    { date: '2022-12-28', price: 0.0012 },
    { date: '2024-03-14', price: 0.0022 },
    { date: '2025-01-20', price: 0.0018 },
    { date: '2026-06-12', price: 0.0008 },
  ],
}

const L1_ANNUAL_VOL: Record<string, number> = {
  btc: 0.72, eth: 0.85, sol: 1.10, bnb: 0.90,
  avax: 1.05, ada: 0.95, dot: 1.00, pol: 1.10,
  trx: 0.95, hype: 1.40, zec: 1.05, xmr: 0.80,
  cc: 1.10, ton: 1.20, bch: 0.95, memecore: 1.50,
  hbar: 1.10, ltc: 0.90, sui: 1.30, cro: 1.00,
  near: 1.15, tao: 1.30, pi: 1.20, icp: 1.25,
  etc: 1.05, kas: 1.35, stable: 0.90, algo: 0.95,
  flr: 1.10, xdc: 1.05, fil: 1.20, apt: 1.30,
  inj: 1.35, vet: 1.00, sei: 1.30, kite: 1.20,
  tia: 1.35, chz: 1.10, gno: 1.00, xtz: 0.95,
  mon: 1.40, tel: 1.10, kaia: 1.05, cfx: 1.20,
  iota: 1.00, dcr: 0.95, nex: 1.05, theta: 1.15,
  xpl: 1.25, xcn: 1.30,
}

const L1_BASE_VOLUME_B: Record<string, number> = {
  btc: 35000, eth: 18000, sol: 3800, bnb: 1900,
  avax: 720, ada: 580, dot: 340, pol: 420,
  trx: 1200, hype: 120, zec: 45, xmr: 95,
  cc: 15, ton: 280, bch: 310, memecore: 52,
  hbar: 85, ltc: 370, sui: 580, cro: 52,
  near: 195, tao: 68, pi: 95, icp: 78,
  etc: 145, kas: 68, stable: 28, algo: 52,
  flr: 18, xdc: 12, fil: 125, apt: 165,
  inj: 142, vet: 58, sei: 82, kite: 22,
  tia: 115, chz: 38, gno: 18, xtz: 22,
  mon: 85, tel: 28, kaia: 35, cfx: 32,
  iota: 22, dcr: 5.8, nex: 3.2, theta: 24,
  xpl: 8.5, xcn: 4.8,
}

const L1_LAUNCH_DATES: Record<string, string> = {
  btc: '2013-01-01', eth: '2015-08-07', sol: '2020-03-25',
  bnb: '2017-09-01', avax: '2020-09-23', ada: '2017-10-02',
  dot: '2020-08-19', pol: '2019-04-28',
  trx: '2018-09-01', hype: '2024-11-29', zec: '2016-10-28',
  xmr: '2014-04-18', cc: '2023-07-01', ton: '2020-11-15',
  bch: '2017-08-01', memecore: '2024-05-01', hbar: '2019-09-16',
  ltc: '2011-10-07', sui: '2023-05-03', cro: '2018-12-01',
  near: '2020-10-13', tao: '2021-11-01', pi: '2023-02-20',
  icp: '2021-05-10', etc: '2016-07-20', kas: '2022-11-07',
  stable: '2023-01-01', algo: '2019-06-20', flr: '2023-01-10',
  xdc: '2019-06-01', fil: '2020-10-15', apt: '2022-10-12',
  inj: '2021-10-21', vet: '2018-07-30', sei: '2023-08-15',
  kite: '2024-01-01', tia: '2023-10-31', chz: '2019-09-18',
  gno: '2017-04-24', xtz: '2018-09-17', mon: '2025-04-01',
  tel: '2018-01-01', kaia: '2019-06-27', cfx: '2021-01-29',
  iota: '2017-06-13', dcr: '2016-02-08', nex: '2019-06-01',
  theta: '2019-03-15', xpl: '2022-05-01', xcn: '2022-02-23',
}

function interpolateL1Price(dateMs: number, anchors: AnchorPoint[]): number {
  const first = anchors[0]
  const last  = anchors[anchors.length - 1]
  if (dateMs <= parseISO(first.date).getTime()) return first.price
  if (dateMs >= parseISO(last.date).getTime()) return last.price
  for (let i = 0; i < anchors.length - 1; i++) {
    const t0 = parseISO(anchors[i].date).getTime()
    const t1 = parseISO(anchors[i + 1].date).getTime()
    if (dateMs >= t0 && dateMs <= t1) {
      const t = (dateMs - t0) / (t1 - t0)
      const logP = Math.log(anchors[i].price) + t * (Math.log(anchors[i + 1].price) - Math.log(anchors[i].price))
      return Math.exp(logP)
    }
  }
  return last.price
}

function decimalsForPrice(p: number): number {
  if (p >= 10000) return 0
  if (p >= 100)  return 2
  if (p >= 1)    return 4
  return 6
}

function generateL1DailyCandles(assetId: string, startDate: Date, endDate: Date): PriceCandle[] {
  const anchors = L1_ANCHORS[assetId]
  if (!anchors) return []
  const rng = makePrng(strHash(assetId + '_l1'))
  const dailyVol = (L1_ANNUAL_VOL[assetId] ?? 0.80) / Math.sqrt(252)
  const baseVol  = L1_BASE_VOLUME_B[assetId] ?? 1000
  const days = eachDayOfInterval({ start: startDate, end: endDate })

  return days.map((day) => {
    const trend = interpolateL1Price(day.getTime(), anchors)
    const noise = Math.exp((rng() - 0.5) * dailyVol * 2)
    const close = trend * noise
    const spread = close * dailyVol * 0.5
    const open  = close * (1 + (rng() - 0.5) * dailyVol * 0.6)
    const high  = Math.max(open, close) * (1 + rng() * dailyVol * 0.8)
    const low   = Math.min(open, close) * (1 - rng() * dailyVol * 0.8)
    const vol   = Math.round(baseVol * (0.4 + rng() * 1.2))
    const dp    = decimalsForPrice(close)
    return {
      date:   format(day, 'yyyy-MM-dd'),
      open:   +open.toFixed(dp),
      high:   +high.toFixed(dp),
      low:    +low.toFixed(dp),
      close:  +close.toFixed(dp),
      volume: Math.max(1, vol),
    }
  })
}

function generateL1WeeklyCandles(assetId: string, startDate: Date, endDate: Date): PriceCandle[] {
  const daily = generateL1DailyCandles(assetId, startDate, endDate)
  const buckets: Record<string, PriceCandle[]> = {}
  for (const c of daily) {
    const week = format(parseISO(c.date), "yyyy-'W'II")
    ;(buckets[week] ??= []).push(c)
  }
  return Object.entries(buckets).map(([, candles]) => ({
    date:   candles[0].date,
    open:   candles[0].open,
    close:  candles[candles.length - 1].close,
    high:   Math.max(...candles.map((c) => c.high)),
    low:    Math.min(...candles.map((c) => c.low)),
    volume: candles.reduce((s, c) => s + c.volume, 0),
  }))
}

const L1_IDS = new Set([
  'btc', 'eth', 'sol', 'bnb', 'avax', 'ada', 'dot', 'pol',
  'trx', 'hype', 'zec', 'xmr', 'cc', 'ton', 'bch', 'memecore',
  'hbar', 'ltc', 'sui', 'cro', 'near', 'tao', 'pi', 'icp',
  'etc', 'kas', 'stable', 'algo', 'flr', 'xdc', 'fil', 'apt',
  'inj', 'vet', 'sei', 'kite', 'tia', 'chz', 'gno', 'xtz',
  'mon', 'tel', 'kaia', 'cfx', 'iota', 'dcr', 'nex', 'theta',
  'xpl', 'xcn',
])

// ─────────────────────────────────────────────────────────────────────────────

export function getMockPriceHistory(assetId: string, range: PriceRange): PriceCandle[] {
  const now = new Date()
  const launchStr = L1_IDS.has(assetId) ? (L1_LAUNCH_DATES[assetId] ?? '2020-01-01') : (LAUNCH_DATES[assetId] ?? '2020-01-01')
  const launch = parseISO(launchStr)

  let startDate: Date
  switch (range) {
    case '1W': startDate = new Date(now.getTime() - 7 * 86400000); break
    case '1M': startDate = new Date(now.getTime() - 30 * 86400000); break
    case '3M': startDate = new Date(now.getTime() - 90 * 86400000); break
    case '1Y': startDate = new Date(now.getTime() - 365 * 86400000); break
    case 'MAX': startDate = launch; break
  }

  if (startDate < launch) startDate = launch

  const totalDays = differenceInDays(now, startDate)

  if (L1_IDS.has(assetId)) {
    if (range === 'MAX' && totalDays > 500) return generateL1WeeklyCandles(assetId, startDate, now)
    return generateL1DailyCandles(assetId, startDate, now)
  }

  // Use weekly candles for MAX view with >500 days to keep it performant
  if (range === 'MAX' && totalDays > 500) {
    return generateWeeklyCandles(assetId, startDate, now)
  }

  return generateDailyCandles(assetId, startDate, now)
}

export function getAssetLaunchDate(assetId: string): string {
  return L1_LAUNCH_DATES[assetId] ?? LAUNCH_DATES[assetId] ?? '2020-01-01'
}

export const NOTABLE_EVENTS = [
  { date: '2020-03-12', label: 'Black Thursday' },
  { date: '2022-05-09', label: 'Terra Collapse' },
  { date: '2022-11-08', label: 'FTX Collapse' },
  { date: '2023-03-10', label: 'SVB / USDC Depeg' },
]
