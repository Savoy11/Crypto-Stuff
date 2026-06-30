import { NextRequest, NextResponse } from 'next/server'
import { coingeckoIdFor } from '@/lib/api/live/coingeckoIds'

// OHLCV proxy — Binance is primary, CoinGecko is fallback.
// Query params:
//   id     = internal asset id (e.g. "btc")
//   range  = 1H | 4H | 1M | 3M | 6M | YTD | 1Y | 3Y | 5Y | 10Y | MAX  (default "1Y")
//            (legacy: timeframe=1H|4H|1D|1W is aliased)
//   source = "auto" (default) | "binance" | "coingecko"
//
// Response: { ok, range, candles: OhlcvCandle[], granularity, source }

export const dynamic = 'force-dynamic'

const CG_BASE = (process.env.COINGECKO_BASE_URL ?? 'https://api.coingecko.com/api/v3').replace(/\/$/, '')
const CG_KEY  = process.env.COINGECKO_API_KEY && process.env.COINGECKO_API_KEY !== 'your-coingecko-api-key'
  ? process.env.COINGECKO_API_KEY : undefined

export interface OhlcvCandle {
  time: number   // unix seconds
  open: number
  high: number
  low: number
  close: number
  volume: number // USD millions
}

const CG_HEADERS = () => {
  const h: Record<string, string> = { Accept: 'application/json' }
  if (CG_KEY) h['x-cg-demo-api-key'] = CG_KEY
  return h
}

// ─── Legacy alias ──────────────────────────────────────────────────────────────
const LEGACY_MAP: Record<string, string> = { '1D': '1Y', '1W': '5Y' }

// ─── Range config ──────────────────────────────────────────────────────────────
interface RangeConfig {
  cgDays: string
  resample: 'none' | 'daily' | 'weekly'
  sliceDays?: number
  ytd?: true
  candleSize: string
  revalidate: number
  binanceInterval: string
  binanceLimit: number
}

const RANGE_CONFIG: Record<string, RangeConfig> = {
  // Backtest-only: a long DAILY series (~2.7y) so 200-period strategies have a
  // real usable window. Not exposed in the chart range picker.
  'BT':  { cgDays: 'max', resample: 'daily',  candleSize: '1D',  revalidate: 3600, binanceInterval: '1d',  binanceLimit: 1000 },
  '15m': { cgDays: '1',   resample: 'none',   candleSize: '15m', revalidate: 60,   binanceInterval: '15m', binanceLimit: 200  },
  '1H':  { cgDays: '1',   resample: 'none',   candleSize: '30m', revalidate: 60,   binanceInterval: '1h',  binanceLimit: 168  },
  '4H':  { cgDays: '7',   resample: 'none',   candleSize: '4H',  revalidate: 300,  binanceInterval: '4h',  binanceLimit: 540  },
  '1M':  { cgDays: '30',  resample: 'none',   candleSize: '4H',  revalidate: 300,  binanceInterval: '4h',  binanceLimit: 180  },
  '3M':  { cgDays: '90',  resample: 'daily',  candleSize: '1D',  revalidate: 900,  binanceInterval: '1d',  binanceLimit: 90   },
  '6M':  { cgDays: '180', resample: 'daily',  candleSize: '1D',  revalidate: 900,  binanceInterval: '1d',  binanceLimit: 180  },
  'YTD': { cgDays: '365', resample: 'daily',  ytd: true, candleSize: '1D', revalidate: 900, binanceInterval: '1d', binanceLimit: 365 },
  '1Y':  { cgDays: '365', resample: 'daily',  candleSize: '1D',  revalidate: 900,  binanceInterval: '1d',  binanceLimit: 365  },
  '3Y':  { cgDays: 'max', resample: 'weekly', sliceDays: 1095, candleSize: '1W',  revalidate: 3600, binanceInterval: '1w', binanceLimit: 157 },
  '5Y':  { cgDays: 'max', resample: 'weekly', sliceDays: 1825, candleSize: '1W',  revalidate: 3600, binanceInterval: '1w', binanceLimit: 261 },
  '10Y': { cgDays: 'max', resample: 'weekly', sliceDays: 3650, candleSize: '1W',  revalidate: 3600, binanceInterval: '1w', binanceLimit: 522 },
  'MAX': { cgDays: 'max', resample: 'weekly', candleSize: '1W',  revalidate: 3600, binanceInterval: '1w',  binanceLimit: 1000 },
}

// ─── Resamplers ────────────────────────────────────────────────────────────────

function resampleToDaily(candles: OhlcvCandle[]): OhlcvCandle[] {
  const byDay = new Map<string, OhlcvCandle[]>()
  for (const c of candles) {
    const day = new Date(c.time * 1000).toISOString().slice(0, 10)
    const arr = byDay.get(day) ?? []; arr.push(c); byDay.set(day, arr)
  }
  return Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, cs]) => ({
    time: cs[0].time,
    open: cs[0].open,
    high: Math.max(...cs.map((c) => c.high)),
    low:  Math.min(...cs.map((c) => c.low)),
    close: cs[cs.length - 1].close,
    volume: cs.reduce((s, c) => s + c.volume, 0),
  }))
}

function resampleToWeekly(candles: OhlcvCandle[]): OhlcvCandle[] {
  const byWeek = new Map<string, OhlcvCandle[]>()
  for (const c of candles) {
    const d = new Date(c.time * 1000)
    const day = d.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    const mon = new Date(d); mon.setUTCDate(d.getUTCDate() + diff)
    const key = mon.toISOString().slice(0, 10)
    const arr = byWeek.get(key) ?? []; arr.push(c); byWeek.set(key, arr)
  }
  return Array.from(byWeek.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, cs]) => ({
    time: cs[0].time,
    open: cs[0].open,
    high: Math.max(...cs.map((c) => c.high)),
    low:  Math.min(...cs.map((c) => c.low)),
    close: cs[cs.length - 1].close,
    volume: cs.reduce((s, c) => s + c.volume, 0),
  }))
}

function applySlice(candles: OhlcvCandle[], cfg: RangeConfig): OhlcvCandle[] {
  if (cfg.ytd) {
    const jan1 = new Date(new Date().getUTCFullYear(), 0, 1).getTime() / 1000
    return candles.filter((c) => c.time >= jan1)
  }
  if (cfg.sliceDays) {
    const cutoff = Date.now() / 1000 - cfg.sliceDays * 86400
    return candles.filter((c) => c.time >= cutoff)
  }
  if (cfg.cgDays === '1') return candles.slice(-168) // 1H: last week of 30m bars
  return candles
}

// ─── Binance ───────────────────────────────────────────────────────────────────

const BINANCE_SYMBOL: Record<string, string> = {
  btc: 'BTCUSDT', eth: 'ETHUSDT', sol: 'SOLUSDT', bnb: 'BNBUSDT',
  xrp: 'XRPUSDT', ada: 'ADAUSDT', doge: 'DOGEUSDT', avax: 'AVAXUSDT',
  dot: 'DOTUSDT', matic: 'MATICUSDT', ltc: 'LTCUSDT', link: 'LINKUSDT',
  atom: 'ATOMUSDT', near: 'NEARUSDT', apt: 'APTUSDT', arb: 'ARBUSDT',
  op: 'OPUSDT', inj: 'INJUSDT', sui: 'SUIUSDT',
}

// Binance hosts, tried in order. api.binance.com is geo-blocked (HTTP 451) in
// some regions (incl. the US); api.binance.us is the US-accessible mirror with
// an identical klines API. Trying both makes OHLCV work regardless of region.
const BINANCE_HOSTS = ['https://api.binance.com', 'https://api.binance.us']

async function fetchBinance(id: string, cfg: RangeConfig): Promise<OhlcvCandle[]> {
  const symbol = BINANCE_SYMBOL[id.toLowerCase()]
  if (!symbol) throw new Error('no-binance-mapping')

  const path = `/api/v3/klines?symbol=${symbol}&interval=${cfg.binanceInterval}&limit=${cfg.binanceLimit}`
  let res: Response | undefined
  let lastStatus = 0
  for (const host of BINANCE_HOSTS) {
    try {
      const r = await fetch(host + path, { next: { revalidate: cfg.revalidate } })
      if (r.ok) { res = r; break }
      lastStatus = r.status // 451 (geo-block), 400 (symbol not on this host), etc. → try next host
    } catch {
      // network error → try next host
    }
  }
  if (!res) throw new Error(`binance-${lastStatus || 'unreachable'}`)

  const raw = await res.json() as [number, string, string, string, string, string, ...unknown[]][]
  let candles: OhlcvCandle[] = raw.map(([openTime, open, high, low, close, volume]) => ({
    time: Math.floor(openTime / 1000),
    open: parseFloat(open), high: parseFloat(high),
    low: parseFloat(low),   close: parseFloat(close),
    volume: parseFloat(volume) * parseFloat(close) / 1e6,
  }))
  candles = applySlice(candles, cfg)
  return candles
}

// ─── CoinGecko ─────────────────────────────────────────────────────────────────

async function fetchCoinGecko(id: string, cfg: RangeConfig): Promise<OhlcvCandle[]> {
  const cgId = coingeckoIdFor(id)
  if (!cgId) throw new Error('no-cg-mapping')

  const [ohlcRes, volRes] = await Promise.all([
    fetch(`${CG_BASE}/coins/${cgId}/ohlc?vs_currency=usd&days=${cfg.cgDays}`, {
      headers: CG_HEADERS(),
      next: { revalidate: cfg.revalidate },
    }),
    fetch(`${CG_BASE}/coins/${cgId}/market_chart?vs_currency=usd&days=${cfg.cgDays}`, {
      headers: CG_HEADERS(),
      next: { revalidate: cfg.revalidate },
    }),
  ])

  if (!ohlcRes.ok) throw new Error(`cg-${ohlcRes.status}`)

  const ohlcRaw = (await ohlcRes.json()) as [number, number, number, number, number][]

  const volLookup = new Map<number, number>()
  if (volRes.ok) {
    const volData = (await volRes.json()) as { total_volumes: [number, number][] }
    for (const [ms, vol] of volData.total_volumes ?? []) {
      volLookup.set(Math.round(ms / 3_600_000) * 3_600_000, vol)
    }
  }

  let candles: OhlcvCandle[] = ohlcRaw.map(([ms, open, high, low, close]) => {
    const hk = Math.round(ms / 3_600_000) * 3_600_000
    let vol = 0
    for (let o = 0; o <= 4; o++) {
      if (volLookup.has(hk + o * 3_600_000)) { vol = volLookup.get(hk + o * 3_600_000)!; break }
      if (volLookup.has(hk - o * 3_600_000)) { vol = volLookup.get(hk - o * 3_600_000)!; break }
    }
    return { time: Math.floor(ms / 1000), open, high, low, close, volume: vol / 1e6 }
  })

  if (cfg.resample === 'daily')  candles = resampleToDaily(candles)
  if (cfg.resample === 'weekly') candles = resampleToWeekly(candles)
  candles = applySlice(candles, cfg)
  return candles
}

// ─── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const id  = request.nextUrl.searchParams.get('id') ?? ''
  const rawRange = (
    request.nextUrl.searchParams.get('range') ??
    request.nextUrl.searchParams.get('timeframe') ??
    '1Y'
  ).toUpperCase()
  const range  = LEGACY_MAP[rawRange] ?? rawRange
  const cfg    = RANGE_CONFIG[range] ?? RANGE_CONFIG['1Y']
  const source = request.nextUrl.searchParams.get('source') ?? 'auto'

  // auto: try Binance first for any coin that has a mapping, fall back to CoinGecko
  // binance: Binance only
  // coingecko: CoinGecko only

  if (source !== 'coingecko' && BINANCE_SYMBOL[id.toLowerCase()]) {
    try {
      const candles = await fetchBinance(id, cfg)
      return NextResponse.json({ ok: true, range, candles, granularity: cfg.candleSize, source: 'binance' })
    } catch (err) {
      // fall through to CoinGecko unless explicitly forced to Binance
      if (source === 'binance') {
        return NextResponse.json({ ok: false, candles: [], error: String(err) })
      }
    }
  }

  if (source !== 'binance') {
    try {
      const candles = await fetchCoinGecko(id, cfg)
      return NextResponse.json({ ok: true, range, candles, granularity: cfg.candleSize, source: 'coingecko' })
    } catch (err) {
      return NextResponse.json({ ok: false, candles: [], error: String(err) })
    }
  }

  return NextResponse.json({ ok: false, candles: [], error: 'no-source' })
}
