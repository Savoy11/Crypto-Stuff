import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { assetsApi, sortAssets, type GetAssetsParams } from '@/lib/api/assets'
import { useAssetStore } from '@/store/useAssetStore'
import { useCoinDiscoveryStore, type AddedCoin } from '@/store/useCoinDiscoveryStore'
import type { FilterRule } from '@/lib/data/coinFilters'
import { STALE_TIME_SHORT, STALE_TIME_MEDIUM, GC_TIME } from '@/lib/constants'
import { fetchRiskScoreIndex, RISK_SCORES_QUERY_KEY, applyRiskComposite, type RiskScoreIndex } from '@/lib/api/live/riskScores'
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
export function useAssets(params: GetAssetsParams = {}, riskIndex?: RiskScoreIndex, riskIndexVersion = 0) {
  return useQuery({
    queryKey: [...ASSET_KEYS.list(params), riskIndexVersion],
    queryFn: () => assetsApi.getAssets(params, riskIndex),
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
export function useRiskScoreIndex() {
  return useQuery({
    queryKey: RISK_SCORES_QUERY_KEY,
    queryFn: fetchRiskScoreIndex,
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

export function useAssetsWithStore(filterRules: FilterRule[] = []) {
  const { filters, sort, page, pageSize } = useAssetStore()
  const { addedCoins } = useCoinDiscoveryStore()

  const params: GetAssetsParams = {
    assetType: filters.assetType !== 'all' ? filters.assetType : undefined,
    blockchain: filters.blockchain !== 'all' ? filters.blockchain : undefined,
    riskBand: filters.riskBand !== 'all' ? filters.riskBand : undefined,
    minRiskScore: filters.minRiskScore > 0 ? filters.minRiskScore : undefined,
    maxRiskScore: filters.maxRiskScore < 100 ? filters.maxRiskScore : undefined,
    // Review fix: this store field was never threaded into the query params, so
    // any UI bound to it (the Coins screener's "Min mkt cap") silently did
    // nothing. applyParams has supported it all along.
    minMarketCap: filters.minMarketCap > 0 ? filters.minMarketCap : undefined,
    minLiquidityPct: filters.minLiquidityPct > 0 ? filters.minLiquidityPct : undefined,
    search: filters.search || undefined,
    filterRules: filterRules.length ? filterRules : undefined,
    sortBy: sort.key,
    sortDirection: sort.direction,
    page,
    pageSize,
  }

  const riskIndexQuery = useRiskScoreIndex()
  // Pass the live composite into the list query so risk filters/sort see real
  // scores (enrich-before-filter). dataUpdatedAt keys the recompute when the
  // index lands or refreshes.
  const mainQuery = useAssets(params, riskIndexQuery.data, riskIndexQuery.dataUpdatedAt)

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

    // Discovered coins are merged into the ORDER, not stapled to the front.
    // Prepending them meant OP and USDS sat above Bitcoin no matter which
    // column you sorted by — which reads as "sorting is broken" rather than
    // "these two rows are special", and it broke every column, not just price.
    // Filters are still deliberately not applied to them (see above): the
    // discovery store lacks the metadata to evaluate assetType/riskBand
    // honestly. Sorting needs no such metadata — a price is a price.
    const merged = sortAssets([...newCoins, ...mainQuery.data.data], sort.key, sort.direction)

    return {
      ...mainQuery.data,
      data:  merged,
      total: mainQuery.data.total + newCoins.length,
    }
  }, [mainQuery.data, addedCoins, filters.search, sort.key, sort.direction])

  // R2 Phase 2: the registry rows arrive already enriched (getAssets joins the
  // composite pre-filter). This second join only matters for discovery-store
  // coins merged in above; it is idempotent for everything else. Unscored
  // assets keep riskScore/riskBand null → "N/A" (never fabricated).
  const enrichedData = useMemo(() => {
    if (!mergedData) return mergedData
    const idx = riskIndexQuery.data
    if (!idx || idx.size === 0) return mergedData
    return { ...mergedData, data: mergedData.data.map((a) => applyRiskComposite(a, idx)) }
  }, [mergedData, riskIndexQuery.data])

  return { ...mainQuery, data: enrichedData }
}
