import { NextRequest, NextResponse } from 'next/server'
import { CORS, options } from '../../_cors'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

const ALL_COINS = ['btc','eth','usdt','usdc','bnb','sol','dai','xrp','ltc','trx','doge','matic','avax','ada','dot','atom'] as const
const CG_IDS: Record<string, string> = {
  btc: 'bitcoin', eth: 'ethereum', usdt: 'tether', usdc: 'usd-coin',
  bnb: 'binancecoin', sol: 'solana', dai: 'dai', xrp: 'ripple',
  ltc: 'litecoin', trx: 'tron', doge: 'dogecoin', matic: 'matic-network',
  avax: 'avalanche-2', ada: 'cardano', dot: 'polkadot', atom: 'cosmos',
}
// V6 fix: like every hand-maintained table, the fallback constants carry a
// compiled-as-of date — a stale constant disclosed as "fallback" but undated
// still reads as roughly current. Update the date when refreshing the numbers.
const FALLBACK_AS_OF = '2026-07-22' // per git history of these constants
const FALLBACK: Record<string, number> = {
  btc: 95000, eth: 3200, usdt: 1.0, usdc: 1.0, bnb: 600, sol: 160,
  dai: 1.0, xrp: 2.20, ltc: 90, trx: 0.14, doge: 0.18, matic: 0.60,
  avax: 28, ada: 0.45, dot: 7.0, atom: 5.50,
}

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get('coins')
  const requested = param
    ? param.split(',').map(c => c.trim().toLowerCase()).filter(c => ALL_COINS.includes(c as typeof ALL_COINS[number]))
    : [...ALL_COINS]

  if (requested.length === 0) {
    return NextResponse.json({ error: 'No valid coins specified. Supported: ' + ALL_COINS.join(',') }, { status: 400, headers: CORS })
  }

  const cgIds = requested.map(c => CG_IDS[c]).join(',')
  const prices: Record<string, number> = {}
  let source: 'live' | 'fallback' = 'fallback'

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgIds}&vs_currencies=usd&precision=4`,
      { headers: { Accept: 'application/json' }, next: { revalidate: 60 } }
    )
    if (res.ok) {
      const data = await res.json() as Record<string, { usd: number }>
      for (const coin of requested) {
        const cgId = CG_IDS[coin]
        prices[coin] = data[cgId]?.usd ?? FALLBACK[coin]
      }
      source = 'live'
    }
  } catch { /* fall through */ }

  if (source === 'fallback') {
    for (const coin of requested) prices[coin] = FALLBACK[coin]
  }

  return NextResponse.json({
    prices,
    source,
    // On fallback, updatedAt describes the RESPONSE, not the prices — the
    // constants' own compile date is what a consumer needs to judge them.
    ...(source === 'fallback' ? { fallbackPricesAsOf: FALLBACK_AS_OF, warning: `CoinGecko unreachable — prices are static fallback constants compiled ${FALLBACK_AS_OF}, not quotes.` } : {}),
    updatedAt: new Date().toISOString(),
  }, { headers: CORS })
}
