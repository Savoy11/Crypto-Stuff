import { useQuery } from '@tanstack/react-query'
import { marketDataApi } from '@/lib/api/market-data'
import type { TimeRange } from '@/types/api'
import { STALE_TIME_SHORT, STALE_TIME_MEDIUM, GC_TIME } from '@/lib/constants'

export const MARKET_KEYS = {
  all: ['market-data'] as const,
  overview: () => [...MARKET_KEYS.all, 'overview'] as const,
  asset: (id: string) => [...MARKET_KEYS.all, 'asset', id] as const,
  pegHistory: (id: string, range: TimeRange) => [...MARKET_KEYS.all, 'peg-history', id, range] as const,
  multiPegHistory: (ids: string[], range: TimeRange) => [...MARKET_KEYS.all, 'peg-history-multi', ids.join(','), range] as const,
}

export function useMarketOverview() {
  return useQuery({
    queryKey: MARKET_KEYS.overview(),
    queryFn: () => marketDataApi.getMarketOverview(),
    staleTime: STALE_TIME_SHORT,
    gcTime: GC_TIME,
    refetchInterval: 30_000,
  })
}

export function useAssetMarketData(assetId: string) {
  return useQuery({
    queryKey: MARKET_KEYS.asset(assetId),
    queryFn: () => marketDataApi.getAssetMarketData(assetId),
    staleTime: STALE_TIME_SHORT,
    gcTime: GC_TIME,
    enabled: !!assetId,
    refetchInterval: 30_000,
  })
}

export function usePegHistory(assetId: string, timeRange: TimeRange = '7d') {
  return useQuery({
    queryKey: MARKET_KEYS.pegHistory(assetId, timeRange),
    queryFn: () => marketDataApi.getPegHistory(assetId, timeRange),
    staleTime: STALE_TIME_MEDIUM,
    gcTime: GC_TIME,
    enabled: !!assetId,
  })
}

export function useMultiAssetPegHistory(assetIds: string[], timeRange: TimeRange = '7d') {
  return useQuery({
    queryKey: MARKET_KEYS.multiPegHistory(assetIds, timeRange),
    queryFn: () => marketDataApi.getMultiAssetPegHistory(assetIds, timeRange),
    staleTime: STALE_TIME_MEDIUM,
    gcTime: GC_TIME,
    enabled: assetIds.length > 0,
  })
}
