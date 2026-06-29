import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface PumpMetric {
  coinId: string
  symbol: string
  price: number | null
  priceChange24h: number | null
  volume24h: number | null
  volumeSpike: number | null       // ratio vs 7-day avg (estimated)
  priceVelocity: number | null     // abs % move in 24h
  signalScore: number              // 0–10 heuristic pump signal
  signals: string[]                // human-readable flags
  collapseRisk: 'low' | 'moderate' | 'elevated' | 'high' | 'critical'
}

export interface PumpMetricsResponse {
  ok: boolean
  metrics: PumpMetric[]
  updatedAt: string
}

// CoinGecko ids for the most common coins
const WATCH_COINS: Array<{ id: string; symbol: string; cgId: string }> = [
  { id: 'btc',   symbol: 'BTC',  cgId: 'bitcoin' },
  { id: 'eth',   symbol: 'ETH',  cgId: 'ethereum' },
  { id: 'sol',   symbol: 'SOL',  cgId: 'solana' },
  { id: 'bnb',   symbol: 'BNB',  cgId: 'binancecoin' },
  { id: 'xrp',   symbol: 'XRP',  cgId: 'ripple' },
  { id: 'ada',   symbol: 'ADA',  cgId: 'cardano' },
  { id: 'doge',  symbol: 'DOGE', cgId: 'dogecoin' },
  { id: 'avax',  symbol: 'AVAX', cgId: 'avalanche-2' },
  { id: 'dot',   symbol: 'DOT',  cgId: 'polkadot' },
  { id: 'link',  symbol: 'LINK', cgId: 'chainlink' },
  { id: 'uni',   symbol: 'UNI',  cgId: 'uniswap' },
  { id: 'atom',  symbol: 'ATOM', cgId: 'cosmos' },
  { id: 'matic', symbol: 'MATIC',cgId: 'matic-network' },
  { id: 'near',  symbol: 'NEAR', cgId: 'near' },
  { id: 'ltc',   symbol: 'LTC',  cgId: 'litecoin' },
  { id: 'trx',   symbol: 'TRX',  cgId: 'tron' },
  { id: 'shib',  symbol: 'SHIB', cgId: 'shiba-inu' },
  { id: 'pepe',  symbol: 'PEPE', cgId: 'pepe' },
  { id: 'floki', symbol: 'FLOKI',cgId: 'floki' },
  { id: 'wif',   symbol: 'WIF',  cgId: 'dogwifcoin' },
]

function computeSignal(coin: {
  priceChange24h: number | null
  volume24h: number | null
  marketCap: number | null
}): { score: number; signals: string[]; collapseRisk: PumpMetric['collapseRisk'] } {
  const signals: string[] = []
  let score = 0

  const pct = coin.priceChange24h ?? 0
  const vol = coin.volume24h ?? 0
  const mcap = coin.marketCap ?? 0

  // Price velocity signals
  if (Math.abs(pct) > 50)       { score += 3.5; signals.push(`Extreme price move: ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% in 24h`) }
  else if (Math.abs(pct) > 25)  { score += 2.5; signals.push(`Very large price move: ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% in 24h`) }
  else if (Math.abs(pct) > 15)  { score += 1.5; signals.push(`Large price move: ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% in 24h`) }
  else if (Math.abs(pct) > 8)   { score += 0.8; signals.push(`Elevated price move: ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% in 24h`) }

  // Meme coin flag (higher baseline risk)
  const memes = ['shib', 'pepe', 'floki', 'wif', 'doge']

  // Volume / market-cap ratio (vol/mcap > 1 = suspicious for most coins)
  if (mcap > 0 && vol > 0) {
    const ratio = vol / mcap
    if (ratio > 2.0)        { score += 2.5; signals.push(`Volume/MCap ratio ${ratio.toFixed(2)}× — extreme turnover`) }
    else if (ratio > 1.0)   { score += 1.5; signals.push(`Volume/MCap ratio ${ratio.toFixed(2)}× — unusually high turnover`) }
    else if (ratio > 0.5)   { score += 0.8; signals.push(`Volume/MCap ratio ${ratio.toFixed(2)}× — elevated`) }
  } else if (vol > 1e9 && mcap === 0) {
    score += 1.0
    signals.push('High volume with no market cap data — verify source')
  }

  // Dump phase: large negative move
  if (pct < -30) { score += 1.5; signals.push('Sharp dump detected — possible post-pump collapse') }

  // Cap at 10
  score = Math.min(10, Math.round(score * 10) / 10)

  let collapseRisk: PumpMetric['collapseRisk']
  if (score >= 8)      collapseRisk = 'critical'
  else if (score >= 6) collapseRisk = 'high'
  else if (score >= 4) collapseRisk = 'elevated'
  else if (score >= 2) collapseRisk = 'moderate'
  else                 collapseRisk = 'low'

  return { score, signals, collapseRisk }
}

export async function GET() {
  const cgBase = process.env.COINGECKO_BASE_URL?.replace(/\/$/, '') || 'https://api.coingecko.com/api/v3'
  const cgKey  = process.env.COINGECKO_API_KEY && process.env.COINGECKO_API_KEY !== 'your-coingecko-api-key'
    ? process.env.COINGECKO_API_KEY : undefined

  const ids = WATCH_COINS.map(c => c.cgId).join(',')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (cgKey) headers['x-cg-demo-api-key'] = cgKey

  let cgData: Record<string, {
    current_price: number
    price_change_percentage_24h: number
    total_volume: number
    market_cap: number
  }> = {}

  try {
    const res = await fetch(
      `${cgBase}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=100&page=1`,
      { headers, next: { revalidate: 120 } }
    )
    if (res.ok) {
      const arr = await res.json() as Array<{ id: string } & typeof cgData[string]>
      for (const row of arr) cgData[row.id] = row
    }
  } catch { /* use empty */ }

  const metrics: PumpMetric[] = WATCH_COINS.map(coin => {
    const d = cgData[coin.cgId]
    const priceChange24h = d?.price_change_percentage_24h ?? null
    const volume24h      = d?.total_volume ?? null
    const marketCap      = d?.market_cap ?? null
    const { score, signals, collapseRisk } = computeSignal({ priceChange24h, volume24h, marketCap })

    return {
      coinId: coin.id,
      symbol: coin.symbol,
      price:        d?.current_price ?? null,
      priceChange24h,
      volume24h,
      volumeSpike:  null, // would need historical avg; marked for future
      priceVelocity: priceChange24h !== null ? Math.abs(priceChange24h) : null,
      signalScore:  score,
      signals,
      collapseRisk,
    }
  })

  // Sort by signal score descending
  metrics.sort((a, b) => b.signalScore - a.signalScore)

  return NextResponse.json({ ok: true, metrics, updatedAt: new Date().toISOString() } satisfies PumpMetricsResponse)
}
