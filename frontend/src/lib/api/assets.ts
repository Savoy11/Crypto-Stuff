import apiClient from './client'
import type { Asset, AssetDetail, AssetFilters, AssetSortConfig } from '@/types/asset'
import type { PaginatedResponse, QueryParams } from '@/types/api'
import { USE_MOCK } from '@/lib/constants'
import { getMockAssets, getMockAssetDetail } from './mock/mockAssets'

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

export const assetsApi = {
  getAssets: async (params: GetAssetsParams = {}): Promise<PaginatedResponse<Asset>> => {
    if (USE_MOCK) return getMockAssets(params)
    const { data } = await apiClient.get<PaginatedResponse<Asset>>('/assets', { params })
    return data
  },

  getAsset: async (id: string): Promise<AssetDetail> => {
    if (USE_MOCK) return getMockAssetDetail(id)
    const { data } = await apiClient.get<AssetDetail>(`/assets/${id}`)
    return data
  },

  getWatchlist: async (): Promise<Asset[]> => {
    if (USE_MOCK) return getMockAssets({ pageSize: 5 }).then((r) => r.data.slice(0, 5))
    const { data } = await apiClient.get<Asset[]>('/assets/watchlist')
    return data
  },

  addToWatchlist: async (assetId: string): Promise<void> => {
    if (USE_MOCK) return
    await apiClient.post(`/assets/watchlist/${assetId}`)
  },

  removeFromWatchlist: async (assetId: string): Promise<void> => {
    if (USE_MOCK) return
    await apiClient.delete(`/assets/watchlist/${assetId}`)
  },

  searchAssets: async (query: string): Promise<Asset[]> => {
    if (USE_MOCK) {
      const all = await getMockAssets({})
      return all.data.filter(
        (a) =>
          a.symbol.toLowerCase().includes(query.toLowerCase()) ||
          a.name.toLowerCase().includes(query.toLowerCase())
      )
    }
    const { data } = await apiClient.get<Asset[]>('/assets/search', { params: { q: query } })
    return data
  },
}

export type { AssetFilters, AssetSortConfig }
