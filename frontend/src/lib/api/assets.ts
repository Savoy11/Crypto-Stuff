import { applyFilterStack, type FilterRule } from '@/lib/data/coinFilters'
import type { TechnicalRow } from '@/lib/technicals/sweep'
import type { Asset, AssetDetail, AssetFilters, AssetSortConfig } from '@/types/asset'
import type { PaginatedResponse } from '@/types/api'
import { fetchLiveMarkets } from './live/liveClient'
import { buildLiveAssets, buildLiveAssetDetail } from './live/overlay'

// Deliberately NOT `extends QueryParams`: that interface carries an index
// signature (`[key: string]: string | number | boolean | undefined`) which no
// consumer of this type ever used, and which makes an array-valued field like
// `filterRules` unrepresentable. Every field below is declared explicitly.
export interface GetAssetsParams {
  assetType?: string
  blockchain?: string
  minMarketCap?: number
  /** Minimum 24h-volume / market-cap, in percent (W3-2). */
  minLiquidityPct?: number
  search?: string
  /**
   * Stackable screener rules, ANDed together. Applied HERE — before sorting and
   * pagination — because filtering a page instead of the dataset would silently
   * screen only the rows already on screen.
   */
  filterRules?: FilterRule[]
  /**
   * Per-coin technical values from the shared OHLCV sweep, keyed by asset id.
   * Merged onto each asset HERE — before the filter stack — so a technical rule
   * is just another field to `applyFilterStack` and inherits its
   * unknown-is-not-zero handling for free. A coin absent from the map keeps its
   * undefined technicals and lands in `untested`.
   */
  technicals?: Map<string, TechnicalRow>
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

// Null-safe comparison: missing values always sort to the end regardless of
// direction, so "N/A" rows don't masquerade as the smallest/largest value.
/**
 * Null-safe comparison used by every sort on this surface. Exported so the
 * discovery-store merge in useAssetsWithStore orders its rows the same way,
 * instead of inventing a second comparator that disagrees at the edges.
 */
export function compareValues(av: unknown, bv: unknown, dir: number): number {
  const aMissing = av === null || av === undefined
  const bMissing = bv === null || bv === undefined
  if (aMissing && bMissing) return 0
  if (aMissing) return 1
  if (bMissing) return -1
  if (av < bv) return -dir
  if (av > bv) return dir
  return 0
}

/**
 * THE one asset sort. Every surface that orders this table must call this
 * rather than re-deriving the direction, because the direction convention is
 * easy to get backwards and a backwards copy is invisible in code review — it
 * looks like a sort, it just returns the wrong order.
 *
 * That is not hypothetical: a second copy in useAssetsWithStore computed
 * `dir = asc ? -1 : 1`, the exact inverse of the original here, and silently
 * reversed the rows after the API had already sorted and paginated them.
 */
export function sortAssets(assets: Asset[], sortBy: string, direction: 'asc' | 'desc'): Asset[] {
  const dir = direction === 'asc' ? 1 : -1
  if (sortBy === 'liquidityRatio') {
    // Derived sort key (W3-2): vol/mcap is not a stored column. Null-safe like
    // every other sort — rows missing either figure go to the end.
    const ratio = (a: Asset) =>
      a.volume24h !== null && a.marketCap !== null && a.marketCap > 0
        ? a.volume24h / a.marketCap : null
    return [...assets].sort((a, b) => compareValues(ratio(a), ratio(b), dir))
  }
  const key = sortBy as keyof Asset
  return [...assets].sort((a, b) => compareValues(a[key], b[key], dir))
}


// Exported for tests. The R2 note that used to sit here described joining a
// live risk composite before filtering; per-coin risk scoring was removed
// entirely on 2026-08-29 (RP-6), so there is no composite to join and no risk
// filter left to run. The enrich-before-filter PRINCIPLE still applies to the
// technical sweep below — see the comment inside applyParams.
export function applyParams(all: Asset[], params: GetAssetsParams): PaginatedResponse<Asset> {
  // Enrich BEFORE filtering or sorting: the technical values have
  // to be on the asset BEFORE anything filters or sorts on them, or a rule runs
  // against undefined and empties the table silently.
  let assets = params.technicals
    ? all.map(a => {
        const t = params.technicals!.get(a.id)
        return t ? { ...a, ...t } : a
      })
    : [...all]

  if (params.search) {
    const q = params.search.toLowerCase()
    assets = assets.filter(
      (a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    )
  }
  if (params.assetType && params.assetType !== 'all') {
    assets = assets.filter((a) => a.assetType === params.assetType)
  }
  if (params.blockchain && params.blockchain !== 'all') {
    assets = assets.filter((a) => a.blockchain === params.blockchain)
  }
  if (params.minMarketCap !== undefined) {
    assets = assets.filter((a) => a.marketCap !== null && a.marketCap >= (params.minMarketCap ?? 0))
  }
  if (params.minLiquidityPct !== undefined) {
    // Liquidity = 24h volume / market cap. Rows missing either figure are
    // EXCLUDED when the filter is active: an unknown ratio is not a passing
    // ratio, and letting N/A through would make the filter read stricter than
    // it is.
    assets = assets.filter((a) =>
      a.volume24h !== null && a.marketCap !== null && a.marketCap > 0 &&
      (a.volume24h / a.marketCap) * 100 >= (params.minLiquidityPct ?? 0))
  }

  // Stack first, then sort, then paginate.
  let untested = 0
  let missingByField: Record<string, number> = {}
  if (params.filterRules?.length) {
    const stack = applyFilterStack(assets, params.filterRules)
    assets = stack.matched
    untested = stack.untested.length
    missingByField = stack.missingByField
  }

  if (params.sortBy) {
    assets = sortAssets(assets, params.sortBy, params.sortDirection ?? 'desc')
  }

  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25
  const start = (page - 1) * pageSize
  const paginated = assets.slice(start, start + pageSize)

  return {
    data: paginated,
    total: assets.length,
    page,
    pageSize,
    totalPages: Math.ceil(assets.length / pageSize),
    hasNext: start + pageSize < assets.length,
    hasPrev: page > 1,
    // Reported so the UI can say "9 not tested: no FDV" rather than letting
    // those coins vanish into an unexplained smaller total.
    untested,
    missingByField,
  }
}

// The legacy-backend fallbacks here sat behind `if (LIVE_DATA)` early returns,
// and `LIVE_DATA` is a hardcoded `true` (lib/constants.ts) — unreachable, and
// removed in the M8 sweep along with the axios client.
//
// getWatchlist/addToWatchlist/removeFromWatchlist went with them: the real
// watchlist is DB-backed through store/useWatchlistStore.ts + /api/user/
// watchlists. These three were a parallel, never-wired implementation whose
// live path returned "the first 5 assets" as if it were a saved list.
export const assetsApi = {
  /** List assets: live quotes, optional screener rules, then sort and paginate. */
  getAssets: async (params: GetAssetsParams = {}): Promise<PaginatedResponse<Asset>> => {
    const result = await fetchLiveMarkets()
    // CR-note-1 fix: fetchLiveMarkets swallows failures into {ok:false,
    // quotes:{}}, and building the catalog from empty quotes rendered a full
    // table of N/A prices — a dead upstream disguised as a quiet market.
    // Throwing lets React Query's isError branch show the error card + retry.
    if (!result.ok) throw new Error('Market data is unreachable — no live prices are available right now.')
    const assets = buildLiveAssets(result.quotes)
    return applyParams(assets, params)
  },

  getAsset: async (id: string): Promise<AssetDetail> => {
    const { quotes } = await fetchLiveMarkets()
    return buildLiveAssetDetail(id, quotes[id])
  },

  searchAssets: async (query: string): Promise<Asset[]> => {
    const { quotes } = await fetchLiveMarkets()
    const q = query.toLowerCase()
    return buildLiveAssets(quotes).filter(
      (a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    )
  },
}

export type { AssetFilters, AssetSortConfig }
