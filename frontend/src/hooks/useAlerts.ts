import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { alertsApi, type GetAlertsParams } from '@/lib/api/alerts'
import { useAlertStore } from '@/store/useAlertStore'
import { STALE_TIME_SHORT, GC_TIME } from '@/lib/constants'

export const ALERT_KEYS = {
  all: ['alerts'] as const,
  lists: () => [...ALERT_KEYS.all, 'list'] as const,
  list: (params: GetAlertsParams) => [...ALERT_KEYS.lists(), params] as const,
  stats: () => [...ALERT_KEYS.all, 'stats'] as const,
  recent: (limit: number) => [...ALERT_KEYS.all, 'recent', limit] as const,
}

export function useAlerts(params: GetAlertsParams = {}) {
  const { setAlerts, addAlerts } = useAlertStore()

  const query = useQuery({
    queryKey: ALERT_KEYS.list(params),
    queryFn: () => alertsApi.getAlerts(params),
    staleTime: STALE_TIME_SHORT,
    gcTime: GC_TIME,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (query.data) {
      addAlerts(query.data.data)
    }
  }, [query.data, addAlerts])

  return query
}

export function useAlertStats() {
  return useQuery({
    queryKey: ALERT_KEYS.stats(),
    queryFn: () => alertsApi.getAlertStats(),
    staleTime: STALE_TIME_SHORT,
    gcTime: GC_TIME,
    refetchInterval: 15_000,
  })
}

export function useRecentAlerts(limit = 10) {
  const { addAlerts } = useAlertStore()

  const query = useQuery({
    queryKey: ALERT_KEYS.recent(limit),
    queryFn: () => alertsApi.getRecentAlerts(limit),
    staleTime: STALE_TIME_SHORT,
    gcTime: GC_TIME,
    refetchInterval: 15_000,
  })

  useEffect(() => {
    if (query.data) {
      addAlerts(query.data)
    }
  }, [query.data, addAlerts])

  return query
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient()
  const { markRead } = useAlertStore()

  return useMutation({
    mutationFn: (alertId: string) => alertsApi.markRead(alertId),
    onMutate: (alertId) => {
      markRead(alertId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ALERT_KEYS.all })
    },
  })
}

export function useMarkAllAlertsRead() {
  const queryClient = useQueryClient()
  const { markAllRead } = useAlertStore()

  return useMutation({
    mutationFn: () => alertsApi.markAllRead(),
    onMutate: () => {
      markAllRead()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ALERT_KEYS.all })
    },
  })
}
