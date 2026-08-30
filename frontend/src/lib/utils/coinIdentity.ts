/**
 * Deciding whether a CoinMarketCap entry and a CoinGecko coin are the SAME
 * project.
 *
 * WHY THIS IS THE HARD PART. CoinGecko keys on its own slugs ("arbitrum");
 * CoinMarketCap keys on its own ids, slugs and symbols. The only field they
 * obviously share is the ticker — and tickers collide constantly in crypto
 * (dozens of coins have used BTC-adjacent or three-letter symbols). Matching
 * on symbol alone would eventually attach one project's website and
 * description to a different project's card, which is worse than showing
 * nothing: it is confidently wrong, and nothing on screen would reveal it.
 *
 * THE DISAMBIGUATOR IS MARKET CAP, and it costs no extra request — the
 * discovery list already carries CoinGecko's figure, and CMC's map/listing
 * carries its own. Two projects sharing a ticker do not share a market cap;
 * the same project quoted by two aggregators agrees within a few percent.
 *
 * Everything here is pure. `resolveIdentity` never guesses: when the evidence
 * does not single out one candidate it returns `unresolved` with a reason, and
 * the caller decides whether to fall back to another source or show nothing.
 */

export interface CmcCandidate {
  cmcId: number
  name: string
  symbol: string
  slug: string
  /** CMC's market cap for this entry, when the caller has it. */
  marketCapUsd?: number | null
}

export interface CoinGeckoCoin {
  cgId: string
  name: string
  symbol: string
  marketCapUsd: number | null
}

export type IdentityConfidence = 'exact' | 'strong' | 'unresolved'

export interface IdentityMatch {
  confidence: IdentityConfidence
  candidate: CmcCandidate | null
  /** Human-readable account of the decision — rendered when unresolved. */
  reason: string
  /** |Δ| between the two market caps as a fraction of the larger, when both known. */
  capDivergence: number | null
}

/** Loose comparison for names: case, spacing, punctuation and common suffixes. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(token|coin|protocol|network|finance|chain|dao|labs)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Market caps agree when they are within `tolerance` of each other, measured
 * against the LARGER figure. Aggregators differ on circulating supply, so a few
 * percent is normal; an order of magnitude means different projects.
 */
export function capsAgree(a: number | null | undefined, b: number | null | undefined, tolerance = 0.25): boolean {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return false
  if (a <= 0 || b <= 0) return false
  const larger = Math.max(a, b)
  return Math.abs(a - b) / larger <= tolerance
}

export function capDivergence(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null
  return Math.abs(a - b) / Math.max(a, b)
}

/**
 * Pick the CMC entry that is the same project as `coin`, or decline.
 *
 * Ladder, strongest evidence first:
 *  1. Exactly one symbol match AND the names agree → `exact`.
 *  2. Exactly one symbol match, names differ, but market caps agree → `strong`
 *     (aggregators genuinely disagree on names: "Polygon" vs "Polygon Ecosystem
 *     Token"). The cap is the harder evidence.
 *  3. Several symbol matches → the one whose market cap agrees, if exactly one
 *     does → `strong`. Two candidates both matching on cap is a real ambiguity,
 *     not a coin flip.
 *  4. Anything else → `unresolved`, with the reason.
 */
export function resolveIdentity(coin: CoinGeckoCoin, candidates: CmcCandidate[]): IdentityMatch {
  const symbol = coin.symbol.trim().toUpperCase()
  const matches = candidates.filter((c) => c.symbol.trim().toUpperCase() === symbol)

  if (matches.length === 0) {
    return { confidence: 'unresolved', candidate: null, reason: `No CoinMarketCap entry with symbol ${symbol}`, capDivergence: null }
  }

  const wanted = normalizeName(coin.name)

  if (matches.length === 1) {
    const only = matches[0]
    const div = capDivergence(coin.marketCapUsd, only.marketCapUsd)
    if (normalizeName(only.name) === wanted) {
      return { confidence: 'exact', candidate: only, reason: 'Symbol and name agree', capDivergence: div }
    }
    if (capsAgree(coin.marketCapUsd, only.marketCapUsd)) {
      return { confidence: 'strong', candidate: only, reason: `Sole ${symbol} match; names differ but market caps agree`, capDivergence: div }
    }
    // One candidate, name differs, and either cap is missing or they disagree.
    // Declining here is the point of the whole module.
    return {
      confidence: 'unresolved',
      candidate: null,
      reason: div === null
        ? `Sole ${symbol} match named "${only.name}", and no market cap to corroborate it`
        : `Sole ${symbol} match named "${only.name}", market caps differ by ${(div * 100).toFixed(0)}%`,
      capDivergence: div,
    }
  }

  // Several share the ticker. A name hit is decisive if it is unique.
  const byName = matches.filter((c) => normalizeName(c.name) === wanted)
  if (byName.length === 1) {
    return { confidence: 'exact', candidate: byName[0], reason: `One of ${matches.length} ${symbol} entries matches the name`, capDivergence: capDivergence(coin.marketCapUsd, byName[0].marketCapUsd) }
  }

  const byCap = matches.filter((c) => capsAgree(coin.marketCapUsd, c.marketCapUsd))
  if (byCap.length === 1) {
    return { confidence: 'strong', candidate: byCap[0], reason: `One of ${matches.length} ${symbol} entries matches on market cap`, capDivergence: capDivergence(coin.marketCapUsd, byCap[0].marketCapUsd) }
  }

  return {
    confidence: 'unresolved',
    candidate: null,
    reason: byCap.length > 1
      ? `${matches.length} CoinMarketCap entries use ${symbol} and ${byCap.length} match on market cap — ambiguous`
      : `${matches.length} CoinMarketCap entries use ${symbol}, none corroborated by name or market cap`,
    capDivergence: null,
  }
}
