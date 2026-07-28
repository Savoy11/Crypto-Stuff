import { useQuery } from '@tanstack/react-query'
import { marketDataApi } from '@/lib/api/market-data'
import { STALE_TIME_SHORT, GC_TIME } from '@/lib/constants'

// useAssetMarketData / usePegHistory / useMultiAssetPegHistory were removed in
// the M8 sweep — their last consumers were the orphaned dashboard widgets, and
// both peg readers returned empties in live mode. See lib/api/market-data.ts.
export const MARKET_KEYS = {
  all: ['market-data'] as const,
  overview: () => [...MARKET_KEYS.all, 'overview'] as const,
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

