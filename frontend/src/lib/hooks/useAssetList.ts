'use client'

import { useQuery } from '@tanstack/react-query'
import type { AssetEntry } from '@/lib/data/assetList'

export function useAssetList() {
  const { data, isLoading } = useQuery<{ assets: AssetEntry[] }>({
    queryKey: ['asset-list'],
    queryFn: () => fetch('/live-data/assets/list').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  return { assets: data?.assets ?? [], isLoading }
}
