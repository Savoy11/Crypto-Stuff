import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { assetsApi, sortAssets, type GetAssetsParams } from '@/lib/api/assets'
import { COINGECKO_IDS } from '@/lib/api/live/coingeckoIds'
import { needsTechnicalSweep } from '@/lib/data/coinFilters'
import { useTechnicalSweep } from '@/hooks/useTechnicalSweep'
import { useAssetStore } from '@/store/useAssetStore'
import { useCoinDiscoveryStore, type AddedCoin } from '@/store/useCoinDiscoveryStore'
import type { FilterRule } from '@/lib/data/coinFilters'
import { STALE_TIME_SHORT, STALE_TIME_MEDIUM, GC_TIME } from '@/lib/constants'
import type { Asset, AssetType } from '@/types/asset'

export const ASSET_KEYS = {
  all: ['assets'] as const,
  lists: () => [...ASSET_KEYS.all, 'list'] as const,
  list: (params: GetAssetsParams) => [...ASSET_KEYS.lists(), params] as const,
  details: () => [...ASSET_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...ASSET_KEYS.details(), id] as const,
  search: (q: string) => [...ASSET_KEYS.all, 'search', q] as const,
}

/**
 * List assets. When a risk index is supplied it is joined onto assets BEFORE
 * filtering/sorting/pagination (see assetsApi.getAssets) so the Safety Score
 * filters and sort operate on real scores. `riskIndexVersion` must change when
 * the index does (use the index query's dataUpdatedAt) so results recompute.
 */
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

// useWatchlist was removed in the M8 sweep — no consumers, and the api method
// behind it faked a saved list from "the first 5 assets". The real watchlist is
// store/useWatchlistStore.ts, backed by /api/user/watchlists.

/**
 * The live risk composite for every scored asset, indexed by id. Shared query
 * key so registry / detail / heatmap dedupe to a single request (R2 Phase 2).
 */
export function useAssetSearch(query: string) {
  return useQuery({
    queryKey: ASSET_KEYS.search(query),
    queryFn: () => assetsApi.searchAssets(query),
    staleTime: STALE_TIME_SHORT,
    gcTime: GC_TIME,
    enabled: query.length >= 2,
  })
}

// usePrefetchAsset was removed in the M8 sweep — it was written for a hover-
// prefetch on the asset table that never shipped, and had no callers.

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
    reserveRatio:   null,
    createdAt:      coin.addedAt,
    updatedAt:      coin.addedAt,
    coingeckoId:    coin.cgId,
    description:    coin.notes ? `Added via Coin Discovery: ${coin.notes}` : 'Added via Coin Discovery',
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAssetsWithStore(filterRules: FilterRule[] = []) {
  const { filters, sort, page, pageSize } = useAssetStore()
  const { addedCoins } = useCoinDiscoveryStore()

  // The candle sweep (option B). It runs ONLY when a technical rule is active,
  // and over the WHOLE tracked universe rather than the visible page — the
  // screener's invariant is that filters see the dataset, and sweeping one page
  // would filter as though it had seen every coin.
  const sweepIds = useMemo(() => Object.keys(COINGECKO_IDS), [])
  const sweepNeeded = needsTechnicalSweep(filterRules)
  const sweep = useTechnicalSweep(sweepIds, sweepNeeded)

  const params: GetAssetsParams = {
    assetType: filters.assetType !== 'all' ? filters.assetType : undefined,
    blockchain: filters.blockchain !== 'all' ? filters.blockchain : undefined,
    // Review fix: this store field was never threaded into the query params, so
    // any UI bound to it (the Coins screener's "Min mkt cap") silently did
    // nothing. applyParams has supported it all along.
    minMarketCap: filters.minMarketCap > 0 ? filters.minMarketCap : undefined,
    minLiquidityPct: filters.minLiquidityPct > 0 ? filters.minLiquidityPct : undefined,
    search: filters.search || undefined,
    filterRules: filterRules.length ? filterRules : undefined,
    // Deliberately NOT stripped while the sweep is in flight. With no values
    // yet every coin is `untested`, which is exactly true — showing the
    // unfiltered table instead would present coins that may not match as
    // though they did. The UI shows the sweep's progress over the top.
    technicals: sweep.data,
    sortBy: sort.key,
    sortDirection: sort.direction,
    page,
    pageSize,
  }

  const mainQuery = useAssets(params)

  // Convert discovered coins and filter them by the active search term.
  // Other filters (assetType, blockchain, etc.) are intentionally skipped — the
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

    // Discovered coins are merged into the ORDER, not stapled to the front.
    // Prepending them meant OP and USDS sat above Bitcoin no matter which
    // column you sorted by — which reads as "sorting is broken" rather than
    // "these two rows are special", and it broke every column, not just price.
    // Filters are still deliberately not applied to them (see above): the
    // discovery store lacks the metadata to evaluate assetType/blockchain
    // honestly. Sorting needs no such metadata — a price is a price.
    const merged = sortAssets([...newCoins, ...mainQuery.data.data], sort.key, sort.direction)

    return {
      ...mainQuery.data,
      data:  merged,
      total: mainQuery.data.total + newCoins.length,
    }
  }, [mainQuery.data, addedCoins, filters.search, sort.key, sort.direction])

  return {
    ...mainQuery,
    data: mergedData,
    // Surfaced so the screener can say what it is doing. `active` distinguishes
    // "no technical rule, nothing to sweep" from "swept and found nothing" —
    // an absent sweep and an empty one are not the same state.
    technicalSweep: {
      active: sweepNeeded,
      isLoading: sweepNeeded && sweep.isLoading,
      progress: sweep.progress,
      /** Coins the sweep returned values for. The rest read as not tested. */
      covered: sweep.data?.size ?? 0,
      universe: sweepIds.length,
    },
  }
}
