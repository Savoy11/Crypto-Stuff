import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim()
  if (!query) return NextResponse.json({ coins: [] })

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json' }, next: { revalidate: 60 } }
    )
    if (!res.ok) return NextResponse.json({ coins: [] })

    const data = await res.json() as {
      coins?: Array<{
        id: string; name: string; symbol: string; market_cap_rank: number | null; thumb: string; large: string
      }>
    }

    const coins = (data.coins ?? []).slice(0, 20).map(c => ({
      cgId:          c.id,
      name:          c.name,
      symbol:        c.symbol.toUpperCase(),
      marketCapRank: c.market_cap_rank ?? null,
      thumb:         c.thumb,
      image:         c.large,
    }))

    return NextResponse.json({ coins })
  } catch {
    return NextResponse.json({ coins: [] })
  }
}
