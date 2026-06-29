import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface PortfolioPricesResponse {
  prices:    Record<string, number>
  missing:   string[]
  source:    'live' | 'partial' | 'error'
  updatedAt: string
}

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean) ?? []
  if (ids.length === 0) return NextResponse.json({ prices: {}, missing: [], source: 'error', updatedAt: new Date().toISOString() })

  const prices: Record<string, number> = {}
  const missing: string[] = []
  let source: 'live' | 'partial' | 'error' = 'error'

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`,
      { headers: { Accept: 'application/json' }, next: { revalidate: 60 } }
    )
    if (res.ok) {
      const data = await res.json() as Record<string, { usd: number }>
      for (const id of ids) {
        if (data[id]?.usd != null) prices[id] = data[id].usd
        else missing.push(id)
      }
      source = missing.length === 0 ? 'live' : 'partial'
    }
  } catch { /* source stays 'error' */ }

  return NextResponse.json({
    prices,
    missing,
    source,
    updatedAt: new Date().toISOString(),
  } satisfies PortfolioPricesResponse)
}
