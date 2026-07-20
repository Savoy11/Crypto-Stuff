import apiClient from './client'
import type { Asset, AssetDetail, AssetFilters, AssetSortConfig } from '@/types/asset'
import type { PaginatedResponse, QueryParams } from '@/types/api'
import { LIVE_DATA } from '@/lib/constants'
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
  search?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

// Null-safe comparison: missing values always sort to the end regardless of
// direction, so "N/A" rows don't masquerade as the smallest/largest value.
function compareValues(av: unknown, bv: unknown, dir: number): number {
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

  if (params.sortBy) {
    const key = params.sortBy as keyof Asset
    const dir = params.sortDirection === 'asc' ? 1 : -1
    assets = assets.sort((a, b) => compareValues(a[key], b[key], dir))
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

export const assetsApi = {
  /**
   * List assets. Pass the live risk-composite index (from useRiskScoreIndex /
   * fetchRiskScoreIndex) so scores are joined BEFORE filtering, sorting, and
   * pagination — otherwise the risk band/score filters run against the
   * catalog's null risk and return nothing, and the Safety Score sort no-ops
   * (R2 Phase 2 review finding H1).
   */
  getAssets: async (params: GetAssetsParams = {}, riskIndex?: RiskScoreIndex): Promise<PaginatedResponse<Asset>> => {
    if (LIVE_DATA) {
      const { quotes } = await fetchLiveMarkets()
      let assets = buildLiveAssets(quotes)
      if (riskIndex && riskIndex.size > 0) {
        assets = assets.map((a) => applyRiskComposite(a, riskIndex))
      }
      return applyParams(assets, params)
    }
    const { data } = await apiClient.get<PaginatedResponse<Asset>>('/assets', { params })
    return data
  },

  getAsset: async (id: string): Promise<AssetDetail> => {
    if (LIVE_DATA) {
      const { quotes } = await fetchLiveMarkets()
      return buildLiveAssetDetail(id, quotes[id])
    }
    const { data } = await apiClient.get<AssetDetail>(`/assets/${id}`)
    return data
  },

  getWatchlist: async (): Promise<Asset[]> => {
    if (LIVE_DATA) {
      const { quotes } = await fetchLiveMarkets()
      return buildLiveAssets(quotes).slice(0, 5)
    }
    const { data } = await apiClient.get<Asset[]>('/assets/watchlist')
    return data
  },

  addToWatchlist: async (assetId: string): Promise<void> => {
    if (LIVE_DATA) return
    await apiClient.post(`/assets/watchlist/${assetId}`)
  },

  removeFromWatchlist: async (assetId: string): Promise<void> => {
    if (LIVE_DATA) return
    await apiClient.delete(`/assets/watchlist/${assetId}`)
  },

  searchAssets: async (query: string): Promise<Asset[]> => {
    if (LIVE_DATA) {
      const { quotes } = await fetchLiveMarkets()
      const q = query.toLowerCase()
      return buildLiveAssets(quotes).filter(
        (a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
      )
    }
    const { data } = await apiClient.get<Asset[]>('/assets/search', { params: { q: query } })
    return data
  },
}

export type { AssetFilters, AssetSortConfig }
