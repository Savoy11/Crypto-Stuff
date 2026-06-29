'use client'

import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRefreshStore } from '@/store/useRefreshStore'

export function useGlobalRefresh() {
  const queryClient                          = useQueryClient()
  const { intervalMs, setRefreshing, recordRefresh } = useRefreshStore()

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await queryClient.invalidateQueries()
    recordRefresh()
    // Keep spinner visible briefly so it feels intentional
    setTimeout(() => setRefreshing(false), 800)
  }, [queryClient, setRefreshing, recordRefresh])

  // Auto-refresh on configured interval
  useEffect(() => {
    if (!intervalMs) return
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, refresh])

  return { refresh }
}
