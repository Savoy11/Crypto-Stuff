import { NextRequest, NextResponse } from 'next/server'
import { coinDescription, firstUrl } from '@/lib/utils/coinDescription'

// One coin's project profile — official website, what the project is, and its
// category tags. CoinGecko /coins/{id}, keyless.
//
//   GET /live-data/coin-profile?id=arbitrum
//
// WHY THIS IS PER-COIN AND ON DEMAND. The markets feed that backs Coin
// Discovery carries no homepage and no description — only /coins/{id} does,
// one request per coin, against a ~30/min keyless limit. Discovery lists up to
// 750 candidates, so fetching profiles for the list is not an option. The card
// asks for one when the reader opens it, which is when a project description
// is worth anything anyway. Cached hard (24h): a project's website and stated
// purpose do not move on a market cadence.

export const dynamic = 'force-dynamic'

export interface CoinProfileResponse {
  ok: boolean
  cgId: string
  /** The project's own site. Null when CoinGecko lists none. */
  homepage: string | null
  whitepaper: string | null
  /** Plain text, sentence-truncated. Null when nothing usable was published. */
  description: string | null
  /** CoinGecko's category tags for the project, e.g. "Layer 2", "DeFi". */
  categories: string[]
  updatedAt: string
  error?: string
}

const empty = (cgId: string, error?: string): CoinProfileResponse => ({
  ok: !error, cgId, homepage: null, whitepaper: null, description: null,
  categories: [], updatedAt: new Date().toISOString(), ...(error ? { error } : {}),
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const id = req.nextUrl.searchParams.get('id')?.trim().toLowerCase()
  // Shape guard: the id goes into a URL path, so it must look like a
  // CoinGecko slug and nothing else.
  if (!id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
    return NextResponse.json(empty(id ?? '', 'A valid coin id is required'), { status: 400 })
  }

  try {
    // Everything heavy is switched off — market data, tickers, community and
    // developer stats are all served elsewhere or unused here.
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}`
      + '?localization=false&tickers=false&market_data=false'
      + '&community_data=false&developer_data=false&sparkline=false'
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 86_400 },
    })
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
    const j = await res.json() as {
      links?: { homepage?: unknown; whitepaper?: unknown }
      description?: { en?: string }
      categories?: unknown
    }

    return NextResponse.json({
      ok: true,
      cgId: id,
      homepage: firstUrl(j.links?.homepage),
      whitepaper: firstUrl(j.links?.whitepaper),
      description: coinDescription(j.description?.en),
      // CoinGecko leaves nulls in this array.
      categories: Array.isArray(j.categories)
        ? j.categories.filter((c): c is string => typeof c === 'string' && c.length > 0).slice(0, 6)
        : [],
      updatedAt: new Date().toISOString(),
    } satisfies CoinProfileResponse)
  } catch (e) {
    return NextResponse.json(
      empty(id, e instanceof Error ? e.message : 'unreachable'),
      { status: 503 },
    )
  }
}
