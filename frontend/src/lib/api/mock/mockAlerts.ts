import type { Alert, AlertStats } from '@/types/alert'
import type { PaginatedResponse } from '@/types/api'
import { subMinutes, subHours, subDays } from 'date-fns'
import type { GetAlertsParams } from '../alerts'

const RAW_ALERTS: Alert[] = [
  {
    id: 'alert-1',
    assetId: 'busd',
    assetSymbol: 'BUSD',
    assetName: 'Binance USD',
    alertType: 'peg_deviation',
    severity: 'critical',
    title: 'Critical Peg Deviation Detected',
    message: 'BUSD has deviated 255bps from its $1.00 peg. Price currently at $0.9745.',
    metadata: { previousValue: 1.0, currentValue: 0.9745, threshold: 50, changePercent: -2.55 },
    isRead: false,
    isAcknowledged: false,
    createdAt: subMinutes(new Date(), 8).toISOString(),
    acknowledgedAt: null,
    acknowledgedBy: null,
  },
  {
    id: 'alert-2',
    assetId: 'busd',
    assetSymbol: 'BUSD',
    assetName: 'Binance USD',
    alertType: 'risk_score_change',
    severity: 'critical',
    title: 'Risk Score Downgrade',
    message: 'BUSD risk score dropped from 28.1 to 12.4 (critical band). Immediate review required.',
    metadata: { previousValue: 28.1, currentValue: 12.4, changePercent: -55.8 },
    isRead: false,
    isAcknowledged: false,
    createdAt: subMinutes(new Date(), 22).toISOString(),
    acknowledgedAt: null,
    acknowledgedBy: null,
  },
  {
    id: 'alert-3',
    assetId: 'lusd',
    assetSymbol: 'LUSD',
    assetName: 'Liquity USD',
    alertType: 'peg_deviation',
    severity: 'high',
    title: 'High Peg Deviation',
    message: 'LUSD trading at $1.0088 (88bps above peg). Monitoring for stabilization.',
    metadata: { previousValue: 1.0, currentValue: 1.0088, threshold: 50, changePercent: 0.88 },
    isRead: false,
    isAcknowledged: false,
    createdAt: subMinutes(new Date(), 45).toISOString(),
    acknowledgedAt: null,
    acknowledgedBy: null,
  },
  {
    id: 'alert-4',
    assetId: 'tusd',
    assetSymbol: 'TUSD',
    assetName: 'TrueUSD',
    alertType: 'peg_deviation',
    severity: 'medium',
    title: 'Peg Deviation Warning',
    message: 'TUSD has breached the 10bps warning threshold, currently at 12bps deviation.',
    metadata: { previousValue: 1.0, currentValue: 1.0012, threshold: 10, changePercent: 0.12 },
    isRead: true,
    isAcknowledged: false,
    createdAt: subHours(new Date(), 2).toISOString(),
    acknowledgedAt: null,
    acknowledgedBy: null,
  },
  {
    id: 'alert-5',
    assetId: 'usdt',
    assetSymbol: 'USDT',
    assetName: 'Tether USD',
    alertType: 'whale_movement',
    severity: 'medium',
    title: 'Large Transfer Detected',
    message: '500M USDT transferred from Binance hot wallet to unknown address.',
    metadata: { currentValue: 500_000_000, additionalInfo: { fromAddress: '0xBinance', toAddress: '0x...unknown' } },
    isRead: false,
    isAcknowledged: false,
    createdAt: subHours(new Date(), 3).toISOString(),
    acknowledgedAt: null,
    acknowledgedBy: null,
  },
  {
    id: 'alert-6',
    assetId: 'dai',
    assetSymbol: 'DAI',
    assetName: 'Dai Stablecoin',
    alertType: 'reserve_ratio',
    severity: 'low',
    title: 'Collateralization Ratio Update',
    message: 'DAI collateralization ratio improved to 155% following ETH price increase.',
    metadata: { previousValue: 1.42, currentValue: 1.55, changePercent: 9.15 },
    isRead: true,
    isAcknowledged: true,
    createdAt: subHours(new Date(), 6).toISOString(),
    acknowledgedAt: subHours(new Date(), 5).toISOString(),
    acknowledgedBy: 'analyst@caep.io',
  },
  {
    id: 'alert-7',
    assetId: 'frax',
    assetSymbol: 'FRAX',
    assetName: 'Frax',
    alertType: 'risk_score_change',
    severity: 'medium',
    title: 'Risk Score Deterioration',
    message: 'FRAX risk score declined 4.2 points to 55.1 (elevated band) over the past 24 hours.',
    metadata: { previousValue: 59.3, currentValue: 55.1, changePercent: -7.1 },
    isRead: false,
    isAcknowledged: false,
    createdAt: subHours(new Date(), 8).toISOString(),
    acknowledgedAt: null,
    acknowledgedBy: null,
  },
  {
    id: 'alert-8',
    assetId: null,
    assetSymbol: null,
    assetName: null,
    alertType: 'system',
    severity: 'info',
    title: 'Scheduled Maintenance',
    message: 'Data ingestion pipeline will undergo maintenance from 02:00–03:00 UTC.',
    metadata: {},
    isRead: true,
    isAcknowledged: true,
    createdAt: subDays(new Date(), 1).toISOString(),
    acknowledgedAt: subDays(new Date(), 1).toISOString(),
    acknowledgedBy: 'system',
  },
]

export async function getMockAlerts(params: GetAlertsParams): Promise<PaginatedResponse<Alert>> {
  let alerts = [...RAW_ALERTS]

  if (params.severity && params.severity !== 'all') {
    alerts = alerts.filter((a) => a.severity === params.severity)
  }
  if (params.alertType && params.alertType !== 'all') {
    alerts = alerts.filter((a) => a.alertType === params.alertType)
  }
  if (params.assetId) {
    alerts = alerts.filter((a) => a.assetId === params.assetId)
  }
  if (params.isRead !== undefined) {
    alerts = alerts.filter((a) => a.isRead === params.isRead)
  }

  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25
  const start = (page - 1) * pageSize
  const paginated = alerts.slice(start, start + pageSize)

  return {
    data: paginated,
    total: alerts.length,
    page,
    pageSize,
    totalPages: Math.ceil(alerts.length / pageSize),
    hasNext: start + pageSize < alerts.length,
    hasPrev: page > 1,
  }
}

export async function getMockAlertStats(): Promise<AlertStats> {
  return {
    total: RAW_ALERTS.length,
    unread: RAW_ALERTS.filter((a) => !a.isRead).length,
    critical: RAW_ALERTS.filter((a) => a.severity === 'critical').length,
    high: RAW_ALERTS.filter((a) => a.severity === 'high').length,
    medium: RAW_ALERTS.filter((a) => a.severity === 'medium').length,
    low: RAW_ALERTS.filter((a) => a.severity === 'low').length,
    info: RAW_ALERTS.filter((a) => a.severity === 'info').length,
  }
}

export { RAW_ALERTS }
