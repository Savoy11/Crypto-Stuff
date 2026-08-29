import { NextRequest, NextResponse } from 'next/server'
import { coinDescription, firstUrl } from '@/lib/utils/coinDescription'
import { cmcConfigured, fetchCmcProfiles, keylessFallbackAllowed } from '@/lib/server/cmcProfiles'

// One coin's project profile — official website, what the project is, and its
// category tags. CoinGecko /coins/{id}, keyless.
//
//   GET /live-data/coin-profile?id=arbitrum
//   GET /live-data/coin-profile?ids=arbitrum,optimism&symbols=ARB,OP&caps=1e9,4e8
//        (bulk form — see the provider ladder below)
//
// PROVIDER LADDER (owner, 2026-08-29):
//   1. CoinMarketCap, when a key is configured. KEYED and licensed, and
//      genuinely bulk — 1 call credit per 100 coins. Identity is resolved by
//      lib/utils/coinIdentity.ts, which declines rather than guesses.
//   2. CoinGecko per coin, KEYLESS — the fallback, and switchable off with
//      FN_ALLOW_KEYLESS_COIN_PROFILES=false for a deployment that will not
//      rely on free-tier terms. With it off, an unresolved coin renders an
//      honest blank instead of quietly reaching for an unlicensed source.
// A coin CMC cannot identify is reported as unresolved WITH ITS REASON at
// every layer, so "we could not tell which project this is" never arrives
// looking like "this project published nothing".
//
// WHY THIS IS PER-COIN AND ON DEMAND. The markets feed that backs Coin
// Discovery carries no homepage and no description — only /coins/{id} does,
// one request per coin, against a ~30/min keyless limit. Discovery lists up to
// 750 candidates, so fetching profiles for the list is not an option. The card
// asks for one when the reader opens it, which is when a project description
// is worth anything anyway. Cached hard (24h): a project's website and stated
// purpose do not move on a market cadence.

export const dynamic = 'force-dynamic'

export type ProfileSource = 'coinmarketcap' | 'coingecko' | 'none'

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
  /** Which provider answered. 'none' means nobody could. */
  source: ProfileSource
  /** How confidently the CMC entry was matched to this coin, when CMC answered. */
  identity?: string
  /** Why no profile could be attributed to this coin, when source is 'none'. */
  unresolvedReason?: string
  updatedAt: string
  error?: string
}

const empty = (cgId: string, error?: string, unresolvedReason?: string): CoinProfileResponse => ({
  ok: !error, cgId, homepage: null, whitepaper: null, description: null,
  categories: [], source: 'none', updatedAt: new Date().toISOString(),
  ...(unresolvedReason ? { unresolvedReason } : {}),
  ...(error ? { error } : {}),
})

/** The keyless rung, unchanged in behaviour — one CoinGecko request per coin. */
async function fetchFromCoinGecko(id: string): Promise<CoinProfileResponse> {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}`
    + '?localization=false&tickers=false&market_data=false'
    + '&community_data=false&developer_data=false&sparkline=false'
  const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 86_400 } })
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
  const j = await res.json() as {
    links?: { homepage?: unknown; whitepaper?: unknown }
    description?: { en?: string }
    categories?: unknown
  }
  return {
    ok: true,
    cgId: id,
    homepage: firstUrl(j.links?.homepage),
    whitepaper: firstUrl(j.links?.whitepaper),
    description: coinDescription(j.description?.en),
    categories: Array.isArray(j.categories)
      ? j.categories.filter((c): c is string => typeof c === 'string' && c.length > 0).slice(0, 6)
      : [],
    source: 'coingecko',
    updatedAt: new Date().toISOString(),
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams
  const single = sp.get('id')?.trim().toLowerCase()
  // Bulk form: parallel arrays, because CMC identity needs the symbol and the
  // market cap the caller already holds — re-fetching them here would undo the
  // saving the bulk path exists for.
  const ids = (sp.get('ids') ?? single ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const symbols = (sp.get('symbols') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const names = (sp.get('names') ?? '').split('|').map((s) => s.trim()).filter(Boolean)
  const caps = (sp.get('caps') ?? '').split(',').map((s) => Number(s)).filter((n) => Number.isFinite(n))

  const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/
  if (ids.length === 0 || ids.length > 100 || ids.some((id) => !SLUG.test(id))) {
    return NextResponse.json(empty(single ?? '', 'One to 100 valid coin ids are required'), { status: 400 })
  }

  const responses: Record<string, CoinProfileResponse> = {}

  // ── Rung 1: CoinMarketCap (keyed, licensed, bulk) ──
  let unresolved: Record<string, string> = {}
  if (cmcConfigured() && symbols.length === ids.length) {
    try {
      const result = await fetchCmcProfiles(ids.map((cgId, i) => ({
        cgId,
        symbol: symbols[i],
        name: names[i] ?? cgId,
        marketCapUsd: caps[i] ?? null,
      })))
      for (const [cgId, p] of Object.entries(result.profiles)) {
        responses[cgId] = {
          ok: true, cgId,
          homepage: p.homepage, whitepaper: p.whitepaper,
          description: p.description, categories: p.categories,
          source: 'coinmarketcap',
          identity: `${p.identity} — ${p.identityReason}`,
          updatedAt: new Date().toISOString(),
        }
      }
      unresolved = result.unresolved
    } catch {
      // A CMC failure is not fatal: every coin simply falls to the next rung,
      // exactly as it would with no key at all.
      unresolved = Object.fromEntries(ids.map((id) => [id, 'CoinMarketCap unavailable']))
    }
  } else {
    unresolved = Object.fromEntries(ids.map((id) => [
      id,
      cmcConfigured() ? 'Bulk lookup needs matching symbols' : 'No CoinMarketCap key configured',
    ]))
  }

  // ── Rung 2: CoinGecko per coin (keyless) — only for what rung 1 left ──
  const remaining = ids.filter((id) => !responses[id])
  if (remaining.length > 0) {
    if (!keylessFallbackAllowed()) {
      // The switch is off: say so rather than reaching for an unlicensed
      // source. An empty panel with a reason beats data of uncertain standing.
      for (const id of remaining) {
        responses[id] = empty(id, undefined, `${unresolved[id] ?? 'Not resolved'} — keyless sources are disabled in this deployment`)
      }
    } else {
      const settled = await Promise.allSettled(remaining.map((id) => fetchFromCoinGecko(id)))
      settled.forEach((r, i) => {
        const id = remaining[i]
        responses[id] = r.status === 'fulfilled'
          ? r.value
          : empty(id, r.reason instanceof Error ? r.reason.message : 'unreachable', unresolved[id])
      })
    }
  }

  // Single-id callers get the bare object they had before this ladder existed.
  if (single && !sp.get('ids')) {
    const one = responses[single] ?? empty(single, 'unreachable')
    return NextResponse.json(one, { status: one.ok ? 200 : 503 })
  }
  return NextResponse.json({
    ok: true,
    profiles: responses,
    updatedAt: new Date().toISOString(),
  })
}
