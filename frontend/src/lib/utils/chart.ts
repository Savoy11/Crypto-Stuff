import type { RiskBand } from '@/types/asset'

export const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#84cc16', // lime
  '#14b8a6', // teal
]

export const RISK_BAND_CHART_COLORS: Record<RiskBand, string> = {
  low: '#10b981',
  moderate: '#3b82f6',
  elevated: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
}

export const RESERVE_COMPOSITION_COLORS: Record<string, string> = {
  'Cash & Equivalents': '#10b981',
  'T-Bills': '#3b82f6',
  'Commercial Paper': '#f59e0b',
  'Crypto Assets': '#f97316',
  'Other': '#64748b',
}

export const CHART_THEME = {
  background: 'transparent',
  grid: '#1e2433',
  axis: '#475569',
  tooltip: {
    background: '#1a1d26',
    border: '#1e2433',
    text: '#e2e8f0',
  },
}

/**
 * Returns fill and stroke colors for peg deviation area chart.
 * Green when tight, amber when moderate, red when wide.
 */
export function getPegDeviationColor(bps: number): {
  stroke: string
  fill: string
} {
  const abs = Math.abs(bps)
  if (abs < 10) return { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.15)' }
  if (abs < 50) return { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.15)' }
  return { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.15)' }
}

/**
 * Generate a gradient stop array for a score arc (high score = green, low = red).
 */
export function getScoreGradientStops(score: number): { offset: string; color: string }[] {
  if (score >= 80) {
    return [
      { offset: '0%', color: '#10b981' },
      { offset: '100%', color: '#34d399' },
    ]
  }
  if (score >= 60) {
    return [
      { offset: '0%', color: '#3b82f6' },
      { offset: '100%', color: '#60a5fa' },
    ]
  }
  if (score >= 40) {
    return [
      { offset: '0%', color: '#f59e0b' },
      { offset: '100%', color: '#fbbf24' },
    ]
  }
  if (score >= 20) {
    return [
      { offset: '0%', color: '#f97316' },
      { offset: '100%', color: '#fb923c' },
    ]
  }
  return [
    { offset: '0%', color: '#ef4444' },
    { offset: '100%', color: '#f87171' },
  ]
}

export function formatChartValue(value: number, type: 'currency' | 'percent' | 'score' | 'bps'): string {
  switch (type) {
    case 'currency':
      if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
      if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`
      if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(1)}K`
      return `$${value.toFixed(2)}`
    case 'percent':
      return `${value >= 0 ? '+' : ''}${value.toFixed(3)}%`
    case 'score':
      return value.toFixed(1)
    case 'bps':
      return `${value >= 0 ? '+' : ''}${value.toFixed(1)}bps`
    default:
      return String(value)
  }
}
