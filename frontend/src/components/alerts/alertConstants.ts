import type { AlertType } from '@/types/alert'

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  peg_deviation: 'Peg Deviation',
  risk_score_change: 'Risk Score Change',
  reserve_ratio: 'Reserve Ratio',
  liquidity_drop: 'Liquidity Drop',
  whale_movement: 'Whale Movement',
  smart_contract: 'Smart Contract',
  regulatory: 'Regulatory',
  system: 'System',
}
