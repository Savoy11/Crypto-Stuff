import { INSTRUMENT_BY_KEY, SEC_PREFIX } from '@/lib/data/instruments'
import { ASSET_ID_BY_COINGECKO } from '@/lib/api/live/coingeckoIds'
import { useWatchlistStore } from '@/store/useWatchlistStore'

// Watchlist-driven feed bias.
//
// Reads the watchlist and turns it into the three shapes the feeds need:
//   assetIds  — crypto ids ('btc'), matched against LiveNewsArticle.relatedAssets
//   symbols   — equity tickers ('AAPL'), matched against MarketArticle.relatedSymbols
//   terms     — names and symbols, used as free-text search and for video titles
//
// The watchlist lives in useWatchlistStore (DB-backed), so this is client-only
// and every consumer reads through here instead of touching the store shape —
// the Daily Brief already hand-rolled its own copy of the old localStorage
// parsing, and a third and fourth would drift.

export interface WatchlistBias {
  /** Crypto asset ids, lowercase. */
  assetIds: string[]
  /** Equity/fund tickers, uppercase. */
  symbols: string[]
  /** Lowercased names and symbols for text matching. */
  terms: string[]
  /** True when the watchlist is empty — callers should skip biasing entirely. */
  isEmpty: boolean
}

export const EMPTY_BIAS: WatchlistBias = { assetIds: [], symbols: [], terms: [], isEmpty: true }

/**
 * Read the watchlist and derive matchable identifiers.
 *
 * Returns EMPTY_BIAS on the server and before the store hydrates — biasing is
 * an enhancement, and an unavailable watchlist must never cost the user their
 * feed. Callers who need freshness should trigger hydrateWatchlists() and
 * re-read on store changes (useWatchlistBias does both).
 */
export function readWatchlistBias(): WatchlistBias {
  if (typeof window === 'undefined') return EMPTY_BIAS

  const keys = useWatchlistStore.getState().lists.flatMap((l) => l.keys)
  if (keys.length === 0) return EMPTY_BIAS

  const assetIds = new Set<string>()
  const symbols = new Set<string>()
  const terms = new Set<string>()

  for (const key of keys) {
    const inst = INSTRUMENT_BY_KEY[key]
    if (inst) {
      terms.add(inst.symbol.toLowerCase())
      terms.add(inst.name.toLowerCase())
    }

    if (key.startsWith(SEC_PREFIX)) {
      symbols.add(key.slice(SEC_PREFIX.length).toUpperCase())
    } else {
      // Watchlist stores CoinGecko ids; the news route tags articles with our
      // own asset ids, so translate. Fall back to the raw key when unmapped.
      assetIds.add((ASSET_ID_BY_COINGECKO[key] ?? key).toLowerCase())
      terms.add(key.toLowerCase())
    }
  }

  return {
    assetIds: [...assetIds],
    symbols: [...symbols],
    terms: [...terms].filter((t) => t.length >= 2),
    isEmpty: false,
  }
}

// ─── Strength ────────────────────────────────────────────────────────────────

export type BiasStrength = 'off' | 'light' | 'strong' | 'only'

export const BIAS_STRENGTHS: Array<{ value: BiasStrength; label: string; hint: string }> = [
  { value: 'off', label: 'Off', hint: 'No watchlist influence' },
  { value: 'light', label: 'Light', hint: 'Sort watchlist matches to the top' },
  { value: 'strong', label: 'Strong', hint: 'Sort to top and pull extra watchlist articles' },
  { value: 'only', label: 'Only', hint: 'Show watchlist matches exclusively' },
]

/** Whether this strength should widen the fetch, not just reorder results. */
export function shouldAugmentFetch(strength: BiasStrength): boolean {
  return strength === 'strong' || strength === 'only'
}

// ─── Matching and ranking ────────────────────────────────────────────────────

/** What a feed item exposes for matching. Keeps this decoupled from feed types. */
export interface Biasable {
  /** Tagged crypto asset ids, if the feed provides them. */
  assetIds?: string[]
  /** Tagged tickers, if the feed provides them. */
  symbols?: string[]
  /** Title/summary text to fall back on. */
  text?: string
}

/**
 * Does this item relate to the watchlist?
 *
 * Explicit tags are checked first and are authoritative. Text matching is a
 * fallback for feeds without tagging (video titles), and requires a word
 * boundary — a naive substring test matches "ada" inside "Canada" and "eth"
 * inside "whether".
 */
export function matchesWatchlist(item: Biasable, bias: WatchlistBias): boolean {
  if (bias.isEmpty) return false

  if (item.assetIds?.some((a) => bias.assetIds.includes(a.toLowerCase()))) return true
  if (item.symbols?.some((s) => bias.symbols.includes(s.toUpperCase()))) return true

  if (item.text) {
    const haystack = item.text.toLowerCase()
    return bias.terms.some((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`\\b${escaped}\\b`).test(haystack)
    })
  }
  return false
}

/**
 * Apply bias to a list, preserving the caller's existing order within each group.
 *
 * 'light' and 'strong' partition into matches-then-rest, which keeps whatever
 * sort the feed already applied (recency, relevance) intact inside each half.
 * 'only' drops non-matches. An empty watchlist is always a no-op, so turning
 * bias on before adding anything can't silently empty a feed.
 */
export function applyBias<T>(
  items: T[],
  bias: WatchlistBias,
  strength: BiasStrength,
  toBiasable: (item: T) => Biasable
): T[] {
  if (strength === 'off' || bias.isEmpty) return items

  const matched: T[] = []
  const rest: T[] = []
  for (const item of items) {
    (matchesWatchlist(toBiasable(item), bias) ? matched : rest).push(item)
  }

  if (strength === 'only') return matched
  return [...matched, ...rest]
}

/** Search terms to widen a fetch with, capped so URLs stay sane. */
export function fetchTerms(bias: WatchlistBias, max = 6): string[] {
  return bias.terms.slice(0, max)
}

/**
 * Watchlist payload for agent requests.
 *
 * Agents run server-side and cannot read localStorage, so every client that
 * invokes one sends this. `terms` are for tool-level filtering; `labels` are the
 * human-readable tickers the system prompt names, so the model can talk about
 * them ("BTC, ETH, AAPL") rather than echo internal ids.
 *
 * Returns null for an empty watchlist so callers can omit the field entirely.
 */
export function agentWatchlistPayload(
  bias: WatchlistBias
): { terms: string[]; labels: string[] } | null {
  if (bias.isEmpty) return null
  const labels = [...bias.assetIds.map((a) => a.toUpperCase()), ...bias.symbols]
  if (labels.length === 0) return null
  return { terms: fetchTerms(bias, 12), labels: labels.slice(0, 20) }
}
