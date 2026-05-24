'use client'

import { useState } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { clsx } from 'clsx'
import { AssetTable } from '@/components/assets/AssetTable'
import { AssetFilters } from '@/components/assets/AssetFilters'
import { AssetCard } from '@/components/assets/AssetCard'
import { SearchInput } from '@/components/ui/SearchInput'
import { useAssetsWithStore } from '@/hooks/useAssets'
import { useAssetStore } from '@/store/useAssetStore'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

type ViewMode = 'table' | 'grid'

export function AssetRegistryClient() {
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const { data, isLoading, isError, refetch } = useAssetsWithStore()
  const { setSearchQuery, searchQuery } = useAssetStore()

  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Asset Registry</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {isLoading ? 'Loading...' : `${data?.total ?? 0} assets monitored`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <SearchInput
            className="w-64"
            placeholder="Search assets..."
            onSelect={(a) => window.location.assign(`/assets/${a.id}`)}
          />

          {/* View toggle */}
          <div className="flex items-center gap-0.5 bg-bg-secondary border border-border rounded p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={clsx(
                'p-1.5 rounded transition-colors',
                viewMode === 'table' ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary'
              )}
              aria-label="Table view"
              aria-pressed={viewMode === 'table'}
            >
              <List size={14} aria-hidden />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={clsx(
                'p-1.5 rounded transition-colors',
                viewMode === 'grid' ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary'
              )}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
            >
              <LayoutGrid size={14} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex gap-6">
        {/* Filters sidebar */}
        <ErrorBoundary>
          <AssetFilters />
        </ErrorBoundary>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {isError ? (
            <div className="rounded-card border border-border bg-bg-card p-8 text-center">
              <p className="text-sm text-text-muted mb-3">Failed to load assets</p>
              <button
                onClick={() => refetch()}
                className="px-3 py-1.5 rounded text-xs bg-bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                Retry
              </button>
            </div>
          ) : viewMode === 'table' ? (
            <div className="rounded-card border border-border bg-bg-card overflow-hidden">
              <AssetTable assets={data?.data ?? []} loading={isLoading} total={data?.total} />
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              {isLoading
                ? Array.from({ length: 9 }, (_, i) => (
                    <div key={i} className="h-40 rounded-card border border-border bg-bg-card animate-shimmer bg-shimmer-gradient bg-[length:200%_100%]" />
                  ))
                : (data?.data ?? []).map((asset) => (
                    <AssetCard key={asset.id} asset={asset} />
                  ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
