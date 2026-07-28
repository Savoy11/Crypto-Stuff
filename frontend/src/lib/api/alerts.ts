import type { Alert, AlertStats } from '@/types/alert'
import type { PaginatedResponse } from '@/types/api'

// Risk alerts are a derived product with no free real-time source, so these
// read as empty and the UI shows an explicit notice rather than mock alerts.
//
// This module used to branch on `LIVE_DATA` and otherwise call the legacy
// Python backend through an axios client. `LIVE_DATA` is a hardcoded `true`
// (lib/constants.ts), so every one of those branches was unreachable; the M8
// sweep removed them and the client with them. The live alert feed users
// actually see comes from /live-data/alerts via hooks/useLiveAlerts.ts.
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
  getAlerts: async (_params: GetAlertsParams = {}): Promise<PaginatedResponse<Alert>> => EMPTY_ALERTS,

  getAlertStats: async (): Promise<AlertStats> => EMPTY_ALERT_STATS,

  getRecentAlerts: async (_limit = 10): Promise<Alert[]> => [],
}
