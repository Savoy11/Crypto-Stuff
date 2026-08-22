import type { Asset, AssetDetail, AssetFilters, AssetSortConfig } from '@/types/asset'
import type { PaginatedResponse, QueryParams } from '@/types/api'
import { fetchLiveMarkets } from './live/liveClient'
import { buildLiveAssets, buildLiveAssetDetail } from './live/overlay'
import { applyRiskComposite, type RiskScoreIndex } from './live/riskScores'

export interface GetAssetsParams extends QueryParams {
  assetType?: string
  blockchain?: string
  riskBand?: string
  minRiskScore?: number
  maxRiskScore?: number
  minMarketCap?: number
  /** Minimum 24h-volume / market-cap, in percent (W3-2). */
  minLiquidityPct?: number
  search?: string
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

// Exported for tests: the R2 session review confirmed risk band/score filters
// and the riskScore sort MUST run on enriched assets — the catalog carries null
// risk (live composite only), so filtering pre-enrichment silently empties the
// result and sorting is a no-op. getAssets() enriches BEFORE calling this.
export function applyParams(all: Asset[], params: GetAssetsParams): PaginatedResponse<Asset> {
  let assets = [...all]

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
  if (params.riskBand && params.riskBand !== 'all') {
    assets = assets.filter((a) => a.riskBand === params.riskBand)
  }
  if (params.minRiskScore !== undefined) {
    assets = assets.filter((a) => a.riskScore !== null && a.riskScore >= (params.minRiskScore ?? 0))
  }
  if (params.maxRiskScore !== undefined) {
    assets = assets.filter((a) => a.riskScore !== null && a.riskScore <= (params.maxRiskScore ?? 100))
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

  if (params.sortBy) {
    const dir = params.sortDirection === 'asc' ? 1 : -1
    if (params.sortBy === 'liquidityRatio') {
      // Derived sort key (W3-2): vol/mcap is not a stored column. Null-safe
      // like every other sort — rows missing either figure go to the end.
      const ratio = (a: Asset) =>
        a.volume24h !== null && a.marketCap !== null && a.marketCap > 0
          ? a.volume24h / a.marketCap : null
      assets = assets.sort((a, b) => compareValues(ratio(a), ratio(b), dir))
    } else {
      const key = params.sortBy as keyof Asset
      assets = assets.sort((a, b) => compareValues(a[key], b[key], dir))
    }
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
  /**
   * List assets. Pass the live risk-composite index (from useRiskScoreIndex /
   * fetchRiskScoreIndex) so scores are joined BEFORE filtering, sorting, and
   * pagination — otherwise the risk band/score filters run against the
   * catalog's null risk and return nothing, and the Safety Score sort no-ops
   * (R2 Phase 2 review finding H1).
   */
  getAssets: async (params: GetAssetsParams = {}, riskIndex?: RiskScoreIndex): Promise<PaginatedResponse<Asset>> => {
    const result = await fetchLiveMarkets()
    // CR-note-1 fix: fetchLiveMarkets swallows failures into {ok:false,
    // quotes:{}}, and building the catalog from empty quotes rendered a full
    // table of N/A prices — a dead upstream disguised as a quiet market.
    // Throwing lets React Query's isError branch show the error card + retry.
    if (!result.ok) throw new Error('Market data is unreachable — no live prices are available right now.')
    let assets = buildLiveAssets(result.quotes)
    if (riskIndex && riskIndex.size > 0) {
      assets = assets.map((a) => applyRiskComposite(a, riskIndex))
    }
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
