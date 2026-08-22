/**
 * Universe filters for the crypto scanner — the CoinMarketCap-style screener
 * controls, applied BEFORE the scan rather than after it.
 *
 * WHY BEFORE. The scanner fetches OHLCV per coin under a concurrency cap, so
 * narrowing the universe first makes a scan genuinely faster, not just the table
 * shorter. Filtering 80 coins down to 15 is 15 requests, not 80.
 *
 * WHAT IS AND IS NOT OFFERED. CoinMarketCap screens ~10,000 coins and can
 * therefore filter by network, category, exchange, volume-change and age. This
 * scanner runs over a curated 80-coin universe and holds none of those fields —
 * so those controls are deliberately ABSENT rather than present-and-inert. A
 * filter that silently matches everything is worse than no filter: it tells the
 * user they narrowed the set when they did not. `UNSUPPORTED_FILTERS` records
 * each one with the data it would need, so the gap is documented rather than
 * quietly missing.
 *
 * UNKNOWN IS NOT ZERO. A coin whose market data has not loaded (or came from a
 * fallback leg that carries no market cap) is NOT silently treated as 0 and
 * dropped. It is excluded from the filtered set and COUNTED, so the UI can say
 * "3 excluded: no market data" instead of pretending the universe is smaller.
 */

/** A numeric range where either end may be left open. */
export interface Range {
  min?: number | null
  max?: number | null
}

export interface ScannerFilters {
  /** Keep only the top N by market-cap rank. Null = no limit. */
  topN?: number | null
  marketCap?: Range
  fdv?: Range
  /** 24h price change, in percent — may be negative. */
  priceChange24h?: Range
  volume24h?: Range
}

/** The market fields a filter can read. Every one may be absent. */
export interface CoinMarketFacts {
  rank?: number | null
  marketCap?: number | null
  fdv?: number | null
  priceChange24h?: number | null
  volume24h?: number | null
}

/**
 * CMC filters this scanner does NOT offer, and what each would require. Kept in
 * code so the UI can show the honest reason rather than leaving a user to wonder
 * whether the control is missing or broken.
 */
export const UNSUPPORTED_FILTERS: { label: string; needs: string }[] = [
  { label: 'Networks', needs: 'per-coin chain/platform data — not carried by the markets feed' },
  { label: 'Category', needs: 'per-coin category tags — not carried by the markets feed' },
  { label: 'Exchange', needs: 'per-coin exchange listings — no source in this app' },
  { label: 'Volume change (24h)', needs: 'the previous period’s volume — the feed reports only current volume' },
  { label: 'Age', needs: 'a listing or genesis date per coin — not carried by the markets feed' },
]

function withinRange(value: number | null | undefined, range: Range | undefined): 'pass' | 'fail' | 'unknown' {
  const hasMin = range?.min !== undefined && range?.min !== null
  const hasMax = range?.max !== undefined && range?.max !== null
  if (!hasMin && !hasMax) return 'pass'          // an unset filter constrains nothing
  if (value === null || value === undefined) return 'unknown'
  if (hasMin && value < (range!.min as number)) return 'fail'
  if (hasMax && value > (range!.max as number)) return 'fail'
  return 'pass'
}

/** True when the user has actually constrained something. */
export function hasActiveFilters(f: ScannerFilters): boolean {
  const ranges = [f.marketCap, f.fdv, f.priceChange24h, f.volume24h]
  const anyRange = ranges.some(r =>
    (r?.min !== undefined && r?.min !== null) || (r?.max !== undefined && r?.max !== null))
  return anyRange || (f.topN !== undefined && f.topN !== null)
}

export interface FilterResult<T> {
  /** Coins that matched every active filter. */
  matched: T[]
  /**
   * Coins dropped only because a value a filter needed was missing. Reported
   * separately from a real non-match so the UI never implies they failed the
   * test — nobody ran the test on them.
   */
  unknown: T[]
  /** Coins that were tested and did not match. */
  excluded: T[]
}

/**
 * Apply the filters. Pure: takes the facts it needs rather than fetching, so
 * the whole thing is testable without a network.
 */
export function applyScannerFilters<T>(
  items: T[],
  filters: ScannerFilters,
  factsOf: (item: T) => CoinMarketFacts,
): FilterResult<T> {
  if (!hasActiveFilters(filters)) return { matched: [...items], unknown: [], excluded: [] }

  const matched: T[] = []
  const unknown: T[] = []
  const excluded: T[] = []

  for (const item of items) {
    const f = factsOf(item)
    const verdicts = [
      withinRange(f.marketCap, filters.marketCap),
      withinRange(f.fdv, filters.fdv),
      withinRange(f.priceChange24h, filters.priceChange24h),
      withinRange(f.volume24h, filters.volume24h),
    ]
    if (verdicts.includes('fail')) { excluded.push(item); continue }
    if (verdicts.includes('unknown')) { unknown.push(item); continue }
    matched.push(item)
  }

  // topN is applied LAST and only to survivors, so "top 25 with volume over $1m"
  // means the top 25 of what matched — not the top 25 overall, then filtered,
  // which would silently return fewer than 25 and read as a bug.
  if (filters.topN !== undefined && filters.topN !== null) {
    const ranked = [...matched].sort((a, b) => (factsOf(a).rank ?? 9999) - (factsOf(b).rank ?? 9999))
    const keep = new Set(ranked.slice(0, filters.topN))
    for (const item of matched) if (!keep.has(item)) excluded.push(item)
    return { matched: ranked.slice(0, filters.topN), unknown, excluded }
  }

  return { matched, unknown, excluded }
}
