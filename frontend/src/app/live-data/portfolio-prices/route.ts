import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface PortfolioPricesResponse {
  prices:    Record<string, number>
  missing:   string[]
  source:    'live' | 'partial' | 'error'
  provider?: string   // which upstream(s) supplied the prices
  updatedAt: string
}

async function fetchCoinGeckoPrices(ids: string[]): Promise<Record<string, number>> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`,
    { headers: { Accept: 'application/json' }, next: { revalidate: 60 } }
  )
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
  const data = await res.json() as Record<string, { usd: number }>
  const out: Record<string, number> = {}
  for (const id of ids) {
    if (data[id]?.usd != null) out[id] = data[id].usd
  }
  return out
}

// DefiLlama's coins API accepts CoinGecko ids directly ("coingecko:<id>"),
// so it works as a drop-in fallback without any symbol mapping.
async function fetchDefiLlamaPrices(ids: string[]): Promise<Record<string, number>> {
  const keys = ids.map(id => `coingecko:${id}`).join(',')
  const res = await fetch(
    `https://coins.llama.fi/prices/current/${keys}`,
    { headers: { Accept: 'application/json' }, next: { revalidate: 60 } }
  )
  if (!res.ok) throw new Error(`DefiLlama ${res.status}`)
  const data = await res.json() as { coins: Record<string, { price: number }> }
  const out: Record<string, number> = {}
  for (const id of ids) {
    const price = data.coins[`coingecko:${id}`]?.price
    if (price != null) out[id] = price
  }
  return out
}

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean) ?? []
  if (ids.length === 0) return NextResponse.json({ prices: {}, missing: [], source: 'error', updatedAt: new Date().toISOString() })

  const prices: Record<string, number> = {}
  const providers: string[] = []

  try {
    const cg = await fetchCoinGeckoPrices(ids)
    if (Object.keys(cg).length > 0) {
      Object.assign(prices, cg)
      providers.push('coingecko')
    }
  } catch { /* fall through to DefiLlama */ }

  const unfilled = ids.filter(id => prices[id] == null)
  if (unfilled.length > 0) {
    try {
      const llama = await fetchDefiLlamaPrices(unfilled)
      if (Object.keys(llama).length > 0) {
        Object.assign(prices, llama)
        providers.push('defillama')
      }
    } catch { /* both providers down — reported via source below */ }
  }

  const missing = ids.filter(id => prices[id] == null)
  const source: 'live' | 'partial' | 'error' =
    Object.keys(prices).length === 0 ? 'error' : missing.length > 0 ? 'partial' : 'live'

  return NextResponse.json({
    prices,
    missing,
    source,
    provider: providers.join('+') || undefined,
    updatedAt: new Date().toISOString(),
  } satisfies PortfolioPricesResponse)
}
