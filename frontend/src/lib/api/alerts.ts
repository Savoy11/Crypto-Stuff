import apiClient from './client'
import type { Alert, AlertFilters, AlertStats } from '@/types/alert'
import type { PaginatedResponse } from '@/types/api'
import { LIVE_DATA } from '@/lib/constants'

// Risk alerts are a derived product with no free real-time source. In strict
// live mode they are reported as empty (the UI shows an explicit notice)
// rather than falling back to mock alerts.
const EMPTY_ALERTS: PaginatedResponse<Alert> = {
  data: [],
  total: 0,
  page: 1,
  pageSize: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
}

const EMPTY_ALERT_STATS: AlertStats = {
  total: 0,
  unread: 0,
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  info: 0,
}

export interface GetAlertsParams {
  page?: number
  pageSize?: number
  severity?: string
  alertType?: string
  assetId?: string
  isRead?: boolean
}

export const alertsApi = {
  getAlerts: async (params: GetAlertsParams = {}): Promise<PaginatedResponse<Alert>> => {
    if (LIVE_DATA) return EMPTY_ALERTS
    const { data } = await apiClient.get<PaginatedResponse<Alert>>('/alerts', { params })
    return data
  },

  getAlertStats: async (): Promise<AlertStats> => {
    if (LIVE_DATA) return EMPTY_ALERT_STATS
    const { data } = await apiClient.get<AlertStats>('/alerts/stats')
    return data
  },

  markRead: async (alertId: string): Promise<void> => {
    if (LIVE_DATA) return
    await apiClient.patch(`/alerts/${alertId}/read`)
  },

  markAllRead: async (): Promise<void> => {
    if (LIVE_DATA) return
    await apiClient.post('/alerts/mark-all-read')
  },

  acknowledge: async (alertId: string): Promise<void> => {
    if (LIVE_DATA) return
    await apiClient.patch(`/alerts/${alertId}/acknowledge`)
  },

  getRecentAlerts: async (limit = 10): Promise<Alert[]> => {
    if (LIVE_DATA) return []
    const { data } = await apiClient.get<Alert[]>('/alerts/recent', { params: { limit } })
    return data
  },
}

export type { AlertFilters }
