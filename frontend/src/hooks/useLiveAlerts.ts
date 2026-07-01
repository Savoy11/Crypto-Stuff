import { useQuery } from '@tanstack/react-query'
import { STALE_TIME_MEDIUM } from '@/lib/constants'
import type { LiveAlert } from '@/app/live-data/alerts/route'

export interface LiveAlertsResponse {
  ok: boolean
  alerts: LiveAlert[]
  checkedAt: string
  assetsChecked: number
}

async function fetchLiveAlerts(): Promise<LiveAlertsResponse> {
  const res = await fetch('/live-data/alerts')
  if (!res.ok) throw new Error('Failed to fetch alerts')
  return res.json()
}

/**
 * Single source of truth for live alerts (stablecoin peg deviations + major-asset
 * 24h price moves). Consumed by the TopBar bell dropdown and the Dashboard widget.
 * Replaces the old backend-backed useAlertStore path, which never populated.
 */
export function useLiveAlerts() {
  const query = useQuery({
    queryKey: ['live-alerts'],
    queryFn: fetchLiveAlerts,
    staleTime: STALE_TIME_MEDIUM,
    refetchInterval: 2 * 60 * 1000, // re-check every 2 minutes
  })

  const alerts = query.data?.alerts ?? []
  return {
    alerts,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    activeCount: alerts.length,
    criticalCount: alerts.filter((a) => a.severity === 'critical').length,
    warningCount: alerts.filter((a) => a.severity === 'warning').length,
    checkedAt: query.data?.checkedAt ?? null,
    assetsChecked: query.data?.assetsChecked ?? 0,
  }
}
