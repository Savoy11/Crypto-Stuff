import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { assetsApi, type GetAssetsParams } from '@/lib/api/assets'
import { useAssetStore } from '@/store/useAssetStore'
import { STALE_TIME_SHORT, STALE_TIME_MEDIUM, GC_TIME } from '@/lib/constants'

export const ASSET_KEYS = {
  all: ['assets'] as const,
  lists: () => [...ASSET_KEYS.all, 'list'] as const,
  list: (params: GetAssetsParams) => [...ASSET_KEYS.lists(), params] as const,
  details: () => [...ASSET_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...ASSET_KEYS.details(), id] as const,
  watchlist: () => [...ASSET_KEYS.all, 'watchlist'] as const,
  search: (q: string) => [...ASSET_KEYS.all, 'search', q] as const,
}

export function useAssets(params: GetAssetsParams = {}) {
  return useQuery({
    queryKey: ASSET_KEYS.list(params),
    queryFn: () => assetsApi.getAssets(params),
    staleTime: STALE_TIME_SHORT,
    gcTime: GC_TIME,
    placeholderData: (prev) => prev,
  })
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: ASSET_KEYS.detail(id),
    queryFn: () => assetsApi.getAsset(id),
    staleTime: STALE_TIME_MEDIUM,
    gcTime: GC_TIME,
    enabled: !!id,
  })
}

export function useWatchlist() {
  return useQuery({
    queryKey: ASSET_KEYS.watchlist(),
    queryFn: () => assetsApi.getWatchlist(),
    staleTime: STALE_TIME_MEDIUM,
    gcTime: GC_TIME,
  })
}

export function useAssetSearch(query: string) {
  return useQuery({
    queryKey: ASSET_KEYS.search(query),
    queryFn: () => assetsApi.searchAssets(query),
    staleTime: STALE_TIME_SHORT,
    gcTime: GC_TIME,
    enabled: query.length >= 2,
  })
}

export function usePrefetchAsset() {
  const queryClient = useQueryClient()

  return useCallback(
    (id: string) => {
      queryClient.prefetchQuery({
        queryKey: ASSET_KEYS.detail(id),
        queryFn: () => assetsApi.getAsset(id),
        staleTime: STALE_TIME_MEDIUM,
      })
    },
    [queryClient]
  )
}

export function useAssetsWithStore() {
  const { filters, sort, page, pageSize } = useAssetStore()

  const params: GetAssetsParams = {
    assetType: filters.assetType !== 'all' ? filters.assetType : undefined,
    blockchain: filters.blockchain !== 'all' ? filters.blockchain : undefined,
    riskBand: filters.riskBand !== 'all' ? filters.riskBand : undefined,
    minRiskScore: filters.minRiskScore > 0 ? filters.minRiskScore : undefined,
    maxRiskScore: filters.maxRiskScore < 100 ? filters.maxRiskScore : undefined,
    search: filters.search || undefined,
    sortBy: sort.key,
    sortDirection: sort.direction,
    page,
    pageSize,
  }

  return useAssets(params)
}
