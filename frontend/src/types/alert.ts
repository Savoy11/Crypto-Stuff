export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type AlertType =
  | 'peg_deviation'
  | 'risk_score_change'
  | 'reserve_ratio'
  | 'liquidity_drop'
  | 'whale_movement'
  | 'smart_contract'
  | 'regulatory'
  | 'system'

export interface Alert {
  id: string
  assetId: string | null
  assetSymbol: string | null
  assetName: string | null
  alertType: AlertType
  severity: AlertSeverity
  title: string
  message: string
  metadata: AlertMetadata
  isRead: boolean
  isAcknowledged: boolean
  createdAt: string
  acknowledgedAt: string | null
  acknowledgedBy: string | null
}

export interface AlertMetadata {
  previousValue?: number
  currentValue?: number
  threshold?: number
  changePercent?: number
  additionalInfo?: Record<string, string | number | boolean>
}

// AlertFilters was removed in the M8 sweep — its only consumer was the
// orphaned AlertFilters component. The alert store declares its own filter
// shape inline (store/useAlertStore.ts).

export interface AlertStats {
  total: number
  unread: number
  critical: number
  high: number
  medium: number
  low: number
  info: number
}
