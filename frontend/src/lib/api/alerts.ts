import apiClient from './client'
import type { Alert, AlertFilters, AlertStats } from '@/types/alert'
import type { PaginatedResponse } from '@/types/api'
import { USE_MOCK } from '@/lib/constants'
import { getMockAlerts, getMockAlertStats } from './mock/mockAlerts'

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
    if (USE_MOCK) return getMockAlerts(params)
    const { data } = await apiClient.get<PaginatedResponse<Alert>>('/alerts', { params })
    return data
  },

  getAlertStats: async (): Promise<AlertStats> => {
    if (USE_MOCK) return getMockAlertStats()
    const { data } = await apiClient.get<AlertStats>('/alerts/stats')
    return data
  },

  markRead: async (alertId: string): Promise<void> => {
    if (USE_MOCK) return
    await apiClient.patch(`/alerts/${alertId}/read`)
  },

  markAllRead: async (): Promise<void> => {
    if (USE_MOCK) return
    await apiClient.post('/alerts/mark-all-read')
  },

  acknowledge: async (alertId: string): Promise<void> => {
    if (USE_MOCK) return
    await apiClient.patch(`/alerts/${alertId}/acknowledge`)
  },

  getRecentAlerts: async (limit = 10): Promise<Alert[]> => {
    if (USE_MOCK) {
      const result = await getMockAlerts({ pageSize: limit })
      return result.data
    }
    const { data } = await apiClient.get<Alert[]>('/alerts/recent', { params: { limit } })
    return data
  },
}

export type { AlertFilters }
