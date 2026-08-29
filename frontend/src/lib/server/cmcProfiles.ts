import 'server-only'

// CoinMarketCap project profiles — the KEYED, licensed path for coin website
// and description data.
//
// WHY THIS IS PRIMARY. /v2/cryptocurrency/info is genuinely bulk: it takes
// comma-separated ids and costs 1 call credit per 100 coins returned. The
// keyless CoinGecko equivalent is one request per coin against a ~30/min
// limit. For a 750-coin discovery list that is 8 credits versus 750 requests —
// and it arrives under a plan licence rather than a free-tier posture, which
// is the point (owner, 2026-08-29).
//
// IDENTITY IS THE RISK, NOT AVAILABILITY. CMC keys on its own ids; the app's
// coins come from CoinGecko. Matching is done by lib/utils/coinIdentity.ts,
// which declines rather than guesses — see its header for why a wrong match is
// worse than no match here.

import { getProviderKey } from '@/lib/api/live/providers'
import { coinDescription, firstUrl } from '@/lib/utils/coinDescription'
import { resolveIdentity, type CmcCandidate, type CoinGeckoCoin, type IdentityConfidence } from '@/lib/utils/coinIdentity'

/** CMC's own cap: 1 credit per 100 returned, so batch at the boundary. */
const BATCH = 100
/** The map is ~10k rows and changes when coins list/delist — daily is ample. */
const MAP_REVALIDATE = 86_400
const INFO_REVALIDATE = 86_400

export interface CmcProfile {
  homepage: string | null
  whitepaper: string | null
  description: string | null
  categories: string[]
  cmcId: number
  identity: IdentityConfidence
  identityReason: string
  /** Set when both aggregators reported a cap and they disagree materially. */
  capDivergence: number | null
}

export interface CmcProfileResult {
  /** cgId → profile, only for coins whose identity resolved. */
  profiles: Record<string, CmcProfile>
  /** cgId → why it could not be resolved. Never silently dropped. */
  unresolved: Record<string, string>
  creditsUsed: number
}

export const cmcConfigured = (): boolean => !!getProviderKey('coinmarketcap')

/**
 * Whether the keyless CoinGecko rung may be used at all.
 *
 * A deployment that does not want to rely on free-tier terms sets
 * FN_ALLOW_KEYLESS_COIN_PROFILES=false; unresolved coins then render an honest
 * blank with a reason instead of silently reaching for an unlicensed source.
 * On by default, so nothing changes for an existing install.
 */
export const keylessFallbackAllowed = (): boolean =>
  (process.env.FN_ALLOW_KEYLESS_COIN_PROFILES ?? 'true').toLowerCase() !== 'false'

async function cmcFetch<T>(path: string, key: string, revalidate: number): Promise<T> {
  const res = await fetch(`https://pro-api.coinmarketcap.com${path}`, {
    headers: { 'X-CMC_PRO_API_KEY': key, Accept: 'application/json' },
    next: { revalidate },
  })
  if (!res.ok) throw new Error(`CoinMarketCap ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * The symbol→candidates index, built from CMC's own map. Cached hard: it is
 * one request that serves every lookup, and its contents change on listing
 * cadence, not market cadence.
 */
async function fetchCandidateIndex(key: string): Promise<Map<string, CmcCandidate[]>> {
  // sort=cmc_rank keeps the most significant projects first, which matters
  // because the map is capped — a long-tail collision is better left
  // unresolved than resolved against a truncated list.
  const j = await cmcFetch<{ data?: Array<{ id: number; name: string; symbol: string; slug: string }> }>(
    '/v1/cryptocurrency/map?listing_status=active&sort=cmc_rank&limit=5000', key, MAP_REVALIDATE,
  )
  const index = new Map<string, CmcCandidate[]>()
  for (const row of j.data ?? []) {
    const sym = row.symbol?.trim().toUpperCase()
    if (!sym) continue
    const list = index.get(sym) ?? []
    list.push({ cmcId: row.id, name: row.name, symbol: sym, slug: row.slug })
    index.set(sym, list)
  }
  return index
}

/** Market caps for candidate ids, so identity can be corroborated numerically. */
async function fetchCaps(ids: number[], key: string): Promise<Map<number, number | null>> {
  const caps = new Map<number, number | null>()
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH)
    const j = await cmcFetch<{ data?: Record<string, { quote?: { USD?: { market_cap?: number } } }> }>(
      `/v2/cryptocurrency/quotes/latest?id=${slice.join(',')}`, key, INFO_REVALIDATE,
    )
    for (const [id, row] of Object.entries(j.data ?? {})) {
      caps.set(Number(id), row?.quote?.USD?.market_cap ?? null)
    }
  }
  return caps
}

/**
 * Resolve and fetch profiles for the given coins.
 *
 * Coins whose identity does not resolve are returned in `unresolved` with the
 * reason — never approximated, and never quietly omitted, so the caller can
 * decide between a fallback source and an honest blank.
 */
export async function fetchCmcProfiles(coins: CoinGeckoCoin[]): Promise<CmcProfileResult> {
  const key = getProviderKey('coinmarketcap')
  if (!key) throw new Error('No CoinMarketCap key configured')
  if (coins.length === 0) return { profiles: {}, unresolved: {}, creditsUsed: 0 }

  const index = await fetchCandidateIndex(key)

  // Two-pass resolution: names alone settle most coins, and only the ones
  // still contested need market caps — so the quotes call covers the
  // ambiguous minority rather than the whole list.
  const contested: number[] = []
  for (const coin of coins) {
    const cands = index.get(coin.symbol.trim().toUpperCase()) ?? []
    if (cands.length > 0 && resolveIdentity(coin, cands).confidence === 'unresolved') {
      for (const c of cands) contested.push(c.cmcId)
    }
  }
  const caps = contested.length > 0
    ? await fetchCaps([...new Set(contested)], key)
    : new Map<number, number | null>()

  const matched: Array<{ coin: CoinGeckoCoin; match: ReturnType<typeof resolveIdentity> }> = []
  const unresolved: Record<string, string> = {}
  for (const coin of coins) {
    const cands = (index.get(coin.symbol.trim().toUpperCase()) ?? [])
      .map((c) => ({ ...c, marketCapUsd: caps.get(c.cmcId) ?? c.marketCapUsd ?? null }))
    const match = resolveIdentity(coin, cands)
    if (match.confidence === 'unresolved' || !match.candidate) unresolved[coin.cgId] = match.reason
    else matched.push({ coin, match })
  }

  // Bulk info — the whole point. 1 credit per 100.
  const profiles: Record<string, CmcProfile> = {}
  let creditsUsed = Math.ceil(contested.length / BATCH)
  for (let i = 0; i < matched.length; i += BATCH) {
    const slice = matched.slice(i, i + BATCH)
    creditsUsed += 1
    const j = await cmcFetch<{
      data?: Record<string, { urls?: { website?: unknown; technical_doc?: unknown }; description?: string; category?: string; tags?: unknown }>
    }>(`/v2/cryptocurrency/info?id=${slice.map((m) => m.match.candidate!.cmcId).join(',')}`, key, INFO_REVALIDATE)

    for (const { coin, match } of slice) {
      const row = j.data?.[String(match.candidate!.cmcId)]
      if (!row) {
        unresolved[coin.cgId] = 'CoinMarketCap returned no profile for the matched id'
        continue
      }
      profiles[coin.cgId] = {
        homepage: firstUrl(row.urls?.website),
        whitepaper: firstUrl(row.urls?.technical_doc),
        description: coinDescription(row.description),
        categories: [
          ...(row.category ? [row.category] : []),
          ...(Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === 'string') : []),
        ].slice(0, 6),
        cmcId: match.candidate!.cmcId,
        identity: match.confidence,
        identityReason: match.reason,
        capDivergence: match.capDivergence,
      }
    }
  }

  return { profiles, unresolved, creditsUsed }
}
