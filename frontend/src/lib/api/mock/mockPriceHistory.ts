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

export function getMockPriceHistory(assetId: string, range: PriceRange): PriceCandle[] {
  const now = new Date()
  const launch = parseISO(LAUNCH_DATES[assetId] ?? '2020-01-01')

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

  // Use weekly candles for MAX view with >500 days to keep it performant
  if (range === 'MAX' && totalDays > 500) {
    return generateWeeklyCandles(assetId, startDate, now)
  }

  return generateDailyCandles(assetId, startDate, now)
}

export function getAssetLaunchDate(assetId: string): string {
  return LAUNCH_DATES[assetId] ?? '2020-01-01'
}

export const NOTABLE_EVENTS = [
  { date: '2020-03-12', label: 'Black Thursday' },
  { date: '2022-05-09', label: 'Terra Collapse' },
  { date: '2022-11-08', label: 'FTX Collapse' },
  { date: '2023-03-10', label: 'SVB / USDC Depeg' },
]
