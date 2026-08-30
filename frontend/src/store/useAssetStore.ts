import { create } from 'zustand'
import type { AssetFilters, AssetSortConfig, Asset } from '@/types/asset'

interface AssetState {
  filters: AssetFilters
  sort: AssetSortConfig
  selectedAssetIds: string[]
  watchlistIds: string[]
  searchQuery: string
  page: number
  pageSize: number
}

interface AssetActions {
  setFilters: (filters: Partial<AssetFilters>) => void
  resetFilters: () => void
  setSort: (sort: AssetSortConfig) => void
  toggleAssetSelection: (id: string) => void
  clearSelection: () => void
  addToWatchlist: (id: string) => void
  removeFromWatchlist: (id: string) => void
  setSearchQuery: (query: string) => void
  setPage: (page: number) => void
  setPageSize: (size: number) => void
}

const DEFAULT_FILTERS: AssetFilters = {
  assetType: 'all',
  blockchain: 'all',
  search: '',
  minMarketCap: 0,
  minLiquidityPct: 0,
}

const DEFAULT_SORT: AssetSortConfig = {
  key: 'marketCap',
  direction: 'desc',
}

export const useAssetStore = create<AssetState & AssetActions>()((set) => ({
  filters: DEFAULT_FILTERS,
  sort: DEFAULT_SORT,
  selectedAssetIds: [],
  watchlistIds: [],
  searchQuery: '',
  page: 1,
  pageSize: 25,

  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
      page: 1, // Reset to page 1 when filtering
    })),

  resetFilters: () => set({ filters: DEFAULT_FILTERS, searchQuery: '', page: 1 }),

  setSort: (sort) => set({ sort, page: 1 }),

  toggleAssetSelection: (id) =>
    set((state) => ({
      selectedAssetIds: state.selectedAssetIds.includes(id)
        ? state.selectedAssetIds.filter((s) => s !== id)
        : [...state.selectedAssetIds, id],
    })),

  clearSelection: () => set({ selectedAssetIds: [] }),

  addToWatchlist: (id) =>
    set((state) => ({
      watchlistIds: state.watchlistIds.includes(id) ? state.watchlistIds : [...state.watchlistIds, id],
    })),

  removeFromWatchlist: (id) =>
    set((state) => ({
      watchlistIds: state.watchlistIds.filter((w) => w !== id),
    })),

  setSearchQuery: (query) => set({ searchQuery: query, page: 1 }),

  setPage: (page) => set({ page }),

  setPageSize: (pageSize) => set({ pageSize, page: 1 }),
}))
