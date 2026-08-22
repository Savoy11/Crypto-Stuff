/**
 * Stackable screener for the Coins page.
 *
 * Every rule the user adds is ANDed with the others, so filters COMBINE rather
 * than replace each other — "market cap over $1bn" AND "down more than 50% from
 * its high" AND "less than half the supply issued" is one query, built a rule
 * at a time.
 *
 * THREE RULES, all of which exist because a screener that quietly lies about
 * what it matched is worse than no screener:
 *
 *  1. UNKNOWN IS NOT ZERO, and it is not a match either. A coin whose FDV the
 *     feed did not carry is neither passed nor failed — it lands in `untested`
 *     and is counted separately, so the UI can say "12 not tested: no FDV" and
 *     never imply the universe is smaller than it is.
 *
 *  2. A DERIVED FIELD NEEDS ALL ITS INPUTS. FDV/market-cap is computed only
 *     when both are present and market cap is non-zero. Deriving it from a
 *     partial figure would put a fabricated number in front of someone filtering
 *     on dilution.
 *
 *  3. NOTHING HERE SCORES OR RANKS. Each field is a fact the feed reports (or
 *     plain arithmetic over two of them). There is no composite, no grade and no
 *     "quality" number — ranking a universe by a score we invented is the
 *     advice-shaped side of the line the owner drew (see the item-4 removals).
 */

import type { Asset } from '@/types/asset'

export type FilterGroup = 'valuation' | 'momentum' | 'liquidity' | 'supply'

export type Operator = 'gte' | 'lte'

export interface FieldDef<T = Asset> {
  key: string
  label: string
  group: FilterGroup
  /** How the value is entered and displayed. */
  unit: 'usd' | 'percent' | 'ratio' | 'count'
  /** Short line explaining what the number means, shown at the point of choice. */
  hint: string
  /** Null when the row lacks the inputs — never a substituted zero. */
  valueOf: (a: T) => number | null
}

const ratio = (num: number | null | undefined, den: number | null | undefined): number | null =>
  num == null || den == null || den === 0 ? null : num / den

export const FILTER_FIELDS: FieldDef<Asset>[] = [
  // ── Valuation ──────────────────────────────────────────────────────────────
  { key: 'price', label: 'Price', group: 'valuation', unit: 'usd',
    hint: 'Last traded price in USD.',
    valueOf: a => a.price ?? null },
  { key: 'marketCap', label: 'Market cap', group: 'valuation', unit: 'usd',
    hint: 'Circulating supply × price.',
    valueOf: a => a.marketCap ?? null },
  { key: 'fdv', label: 'Fully diluted value', group: 'valuation', unit: 'usd',
    hint: 'What the market cap would be if every token existed at today’s price.',
    valueOf: a => a.fdv ?? null },
  { key: 'fdvToMcap', label: 'FDV ÷ market cap', group: 'valuation', unit: 'ratio',
    hint: 'Dilution overhang. 1.0 means fully issued; 4.0 means three quarters of the supply is still to come.',
    valueOf: a => ratio(a.fdv, a.marketCap) },

  // ── Momentum (the only technical factors available without per-coin OHLCV) ─
  { key: 'priceChange24h', label: '24h change', group: 'momentum', unit: 'percent',
    hint: 'Percent price change over 24 hours.',
    valueOf: a => a.priceChangePercent24h ?? a.priceChange24h ?? null },
  { key: 'priceChange7d', label: '7d change', group: 'momentum', unit: 'percent',
    hint: 'Percent price change over 7 days.',
    valueOf: a => a.priceChange7d ?? null },
  { key: 'priceChange30d', label: '30d change', group: 'momentum', unit: 'percent',
    hint: 'Percent price change over 30 days.',
    valueOf: a => a.priceChange30d ?? null },
  { key: 'athChangePct', label: 'From all-time high', group: 'momentum', unit: 'percent',
    hint: 'Percent below the all-time high — always negative or zero. −90 means the coin trades at a tenth of its peak.',
    valueOf: a => a.athChangePct ?? null },

  // ── Liquidity ──────────────────────────────────────────────────────────────
  { key: 'volume24h', label: '24h volume', group: 'liquidity', unit: 'usd',
    hint: 'Traded value over 24 hours.',
    valueOf: a => a.volume24h ?? null },
  { key: 'liquidityPct', label: 'Volume ÷ market cap', group: 'liquidity', unit: 'percent',
    hint: 'Daily turnover as a percent of market cap — how easily a position can be moved.',
    valueOf: a => { const r = ratio(a.volume24h, a.marketCap); return r === null ? null : r * 100 } },

  // ── Supply ─────────────────────────────────────────────────────────────────
  { key: 'circulatingPct', label: 'Supply issued', group: 'supply', unit: 'percent',
    hint: 'Circulating as a percent of max supply. Blank for coins with no hard cap.',
    valueOf: a => { const r = ratio(a.circulatingSupply, a.maxSupply); return r === null ? null : r * 100 } },
  { key: 'marketCapRank', label: 'Market-cap rank', group: 'supply', unit: 'count',
    hint: 'Position by market cap — 1 is the largest.',
    valueOf: a => a.marketCapRank ?? null },
]

export const FIELD_BY_KEY = new Map(FILTER_FIELDS.map(f => [f.key, f]))

export const GROUP_LABELS: Record<FilterGroup, string> = {
  valuation: 'Valuation',
  momentum: 'Momentum',
  liquidity: 'Liquidity',
  supply: 'Supply',
}

/**
 * Technical factors this screener deliberately does NOT offer, with the cost of
 * each. They need per-coin candles — one request per coin — which is what the
 * Scanner is for; it sweeps a smaller universe under a concurrency cap. Offering
 * them here would either hang the page or quietly compute them from nothing.
 */
export const UNAVAILABLE_FACTORS: { label: string; needs: string }[] = [
  { label: 'RSI', needs: 'per-coin candles — use the Scanner, which sweeps for exactly this' },
  { label: 'Moving averages', needs: 'per-coin candles (price vs SMA/EMA)' },
  { label: 'Volatility', needs: 'a price history per coin' },
  { label: 'On-chain metrics', needs: 'a chain-data provider this app does not carry' },
]

export interface FilterRule {
  /** Stable id so a row can be edited or removed without reordering the rest. */
  id: string
  field: string
  operator: Operator
  value: number
}

export interface StackResult<T> {
  matched: T[]
  /** Failed at least one rule it could actually be tested against. */
  excluded: T[]
  /** Missing a value some rule needed — never counted as a pass or a fail. */
  untested: T[]
  /** field key → how many assets lacked that value. Drives the honest caption. */
  missingByField: Record<string, number>
}

/** Rules that are complete enough to evaluate, against a given field set. */
export function activeRules<T>(
  rules: FilterRule[],
  fields: Map<string, FieldDef<T>> = FIELD_BY_KEY as unknown as Map<string, FieldDef<T>>,
): FilterRule[] {
  return rules.filter(r => fields.has(r.field) && Number.isFinite(r.value))
}

/**
 * The screener engine, generic over the row type so a page with a different
 * shape (Coin Discovery's candidates carry no FDV or supply figures) reuses the
 * SAME semantics rather than growing a second, subtly different one. What each
 * page varies is its field table; unknown-is-not-zero and
 * definite-failure-beats-missing are decided once, here.
 */
export function applyRules<T>(
  items: T[],
  rules: FilterRule[],
  fields: Map<string, FieldDef<T>>,
): StackResult<T> {
  const active = activeRules(rules, fields)
  if (active.length === 0) {
    return { matched: [...items], excluded: [], untested: [], missingByField: {} }
  }

  const matched: T[] = []
  const excluded: T[] = []
  const untested: T[] = []
  const missingByField: Record<string, number> = {}

  for (const item of items) {
    let failed = false
    let missing: string | null = null

    for (const rule of active) {
      const def = fields.get(rule.field)!
      const value = def.valueOf(item)
      if (value === null || !Number.isFinite(value)) {
        // Record the FIRST field we could not evaluate, so the caption can name
        // a concrete reason rather than a vague "some data missing".
        if (missing === null) missing = rule.field
        continue
      }
      if (rule.operator === 'gte' ? value < rule.value : value > rule.value) {
        failed = true
        break
      }
    }

    // A definite failure beats a missing value: if a coin fails a rule we COULD
    // test, it is genuinely excluded regardless of what else was unknown.
    if (failed) excluded.push(item)
    else if (missing !== null) {
      untested.push(item)
      missingByField[missing] = (missingByField[missing] ?? 0) + 1
    }
    else matched.push(item)
  }

  return { matched, excluded, untested, missingByField }
}

/** The Coins page's stack — `applyRules` bound to the Asset field table. */
export function applyFilterStack(assets: Asset[], rules: FilterRule[]): StackResult<Asset> {
  return applyRules(assets, rules, FIELD_BY_KEY)
}

// ─── Coin Discovery's field table ────────────────────────────────────────────
//
// A DELIBERATELY SHORTER LIST than the Coins page's. Discovery candidates come
// from a leaner projection of the CoinGecko markets feed: there is no FDV, no
// max supply and no 30d change on a CandidateCoin, so those four fields are
// absent rather than offered and silently sending every row to `untested`. If
// the discovery route later carries them, add them here — do not fake them.

export interface DiscoveryRow {
  price: number
  marketCap: number
  marketCapRank: number
  volume24h: number
  priceChange24h: number
  priceChange7d: number | null
  athChangePercent: number
  liquidityRatio: number
}

export const DISCOVERY_FILTER_FIELDS: FieldDef<DiscoveryRow>[] = [
  { key: 'price', label: 'Price', group: 'valuation', unit: 'usd',
    hint: 'Last traded price in USD.',
    valueOf: c => c.price ?? null },
  { key: 'marketCap', label: 'Market cap', group: 'valuation', unit: 'usd',
    hint: 'Circulating supply × price.',
    valueOf: c => c.marketCap ?? null },
  { key: 'marketCapRank', label: 'Market-cap rank', group: 'valuation', unit: 'count',
    hint: 'Position by market cap — 1 is the largest.',
    valueOf: c => c.marketCapRank ?? null },

  { key: 'priceChange24h', label: '24h change', group: 'momentum', unit: 'percent',
    hint: 'Percent price change over 24 hours.',
    valueOf: c => c.priceChange24h ?? null },
  { key: 'priceChange7d', label: '7d change', group: 'momentum', unit: 'percent',
    hint: 'Percent price change over 7 days.',
    valueOf: c => c.priceChange7d ?? null },
  { key: 'athChangePercent', label: 'From all-time high', group: 'momentum', unit: 'percent',
    hint: 'Percent below the all-time high — negative or zero. −90 means the coin trades at a tenth of its peak.',
    valueOf: c => c.athChangePercent ?? null },

  { key: 'volume24h', label: '24h volume', group: 'liquidity', unit: 'usd',
    hint: 'Traded value over 24 hours.',
    valueOf: c => c.volume24h ?? null },
  { key: 'liquidityPct', label: 'Volume ÷ market cap', group: 'liquidity', unit: 'percent',
    hint: 'Daily turnover as a percent of market cap — how easily a position can be moved.',
    valueOf: c => c.liquidityRatio == null ? null : c.liquidityRatio * 100 },
]

export const DISCOVERY_FIELD_BY_KEY = new Map(DISCOVERY_FILTER_FIELDS.map(f => [f.key, f]))
