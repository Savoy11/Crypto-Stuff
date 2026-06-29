import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { assetsApi, type GetAssetsParams } from '@/lib/api/assets'
import { useAssetStore } from '@/store/useAssetStore'
import { useCoinDiscoveryStore, type AddedCoin } from '@/store/useCoinDiscoveryStore'
import { STALE_TIME_SHORT, STALE_TIME_MEDIUM, GC_TIME } from '@/lib/constants'
import type { Asset, AssetType } from '@/types/asset'

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

// ─── Discovered-coin → Asset conversion ──────────────────────────────────────

function categoryToAssetType(cat: string): AssetType {
  if (cat === 'stablecoin') return 'stablecoin'
  if (cat === 'defi')       return 'defi'
  return 'layer1'
}

function discoveredCoinToAsset(coin: AddedCoin): Asset {
  return {
    id:             coin.cgId,
    symbol:         coin.symbol,
    name:           coin.name,
    assetType:      categoryToAssetType(coin.category),
    blockchain:     'other',
    contractAddress:'',
    isActive:       true,
    marketCap:      coin.marketCap || null,
    price:          coin.price || null,
    volume24h:      null,
    priceChange24h: null,
    priceChangePercent24h: null,
    pegDeviation:   null,
    riskScore:      null,
    riskBand:       null,
    reserveRatio:   null,
    createdAt:      coin.addedAt,
    updatedAt:      coin.addedAt,
    coingeckoId:    coin.cgId,
    description:    coin.notes ? `Added via Coin Discovery: ${coin.notes}` : 'Added via Coin Discovery',
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAssetsWithStore() {
  const { filters, sort, page, pageSize } = useAssetStore()
  const { addedCoins } = useCoinDiscoveryStore()

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

  const mainQuery = useAssets(params)

  // Convert discovered coins and filter them by the active search term.
  // Other filters (assetType, riskBand, etc.) are intentionally skipped — the
  // discovery store doesn't carry enough metadata to evaluate them reliably.
  const mergedData = useMemo(() => {
    if (!mainQuery.data) return mainQuery.data

    const search = filters.search?.toLowerCase() ?? ''
    const existingIds = new Set(
      mainQuery.data.data.flatMap(a => [a.id, a.coingeckoId].filter(Boolean) as string[])
    )

    const newCoins = addedCoins
      .filter(c => !existingIds.has(c.cgId))
      .filter(c =>
        !search ||
        c.symbol.toLowerCase().includes(search) ||
        c.name.toLowerCase().includes(search)
      )
      .map(discoveredCoinToAsset)

    if (newCoins.length === 0) return mainQuery.data

    return {
      ...mainQuery.data,
      data:  [...newCoins, ...mainQuery.data.data],
      total: mainQuery.data.total + newCoins.length,
    }
  }, [mainQuery.data, addedCoins, filters.search])

  return { ...mainQuery, data: mergedData }
}
