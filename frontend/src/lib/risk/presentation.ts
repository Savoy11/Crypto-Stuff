// Presentation layer for the canonical risk/safety scale: colours, labels, and
// Tailwind classes per band. The band NUMBERS and vocabulary come from the
// single source of truth (`lib/risk/types.ts` RISK_BAND_THRESHOLDS + RiskBand)
// and the band FUNCTION from `engine.ts` (bandForScore). This module holds no
// thresholds of its own — only how each band is displayed.
//
// `lib/utils/risk.ts` re-exports everything here so its ~12 existing consumers
// keep their imports; this file is the canonical definition.
import type { RiskBand } from '@/lib/risk/types'
import type { RiskBandConfig } from '@/types/risk'
import { bandForScore } from '@/lib/risk/engine'

export const RISK_BAND_CONFIG: Record<RiskBand, RiskBandConfig> = {
  low: {
    label: 'Low',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    textColor: '#10b981',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    min: 80,
    max: 100,
  },
  moderate: {
    label: 'Moderate',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    textColor: '#3b82f6',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    min: 60,
    max: 79.9,
  },
  elevated: {
    label: 'Elevated',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    textColor: '#f59e0b',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    min: 40,
    max: 59.9,
  },
  high: {
    label: 'High',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    textColor: '#f97316',
    borderColor: 'rgba(249, 115, 22, 0.3)',
    min: 20,
    max: 39.9,
  },
  critical: {
    label: 'Critical',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    textColor: '#ef4444',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    min: 0,
    max: 19.9,
  },
}

export function getRiskBandConfig(band: RiskBand): RiskBandConfig {
  return RISK_BAND_CONFIG[band]
}

export function getRiskColor(band: RiskBand): string {
  return RISK_BAND_CONFIG[band].color
}

export function getRiskBgColor(band: RiskBand): string {
  return RISK_BAND_CONFIG[band].bgColor
}

export function getRiskLabel(band: RiskBand): string {
  return RISK_BAND_CONFIG[band].label
}

export function getRiskBorderColor(band: RiskBand): string {
  return RISK_BAND_CONFIG[band].borderColor
}

/** Tailwind class names for risk-band styling. */
export function getRiskTailwindClasses(band: RiskBand): {
  text: string
  bg: string
  border: string
  badge: string
} {
  const classMap: Record<RiskBand, { text: string; bg: string; border: string; badge: string }> = {
    low: {
      text: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
    },
    moderate: {
      text: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
    },
    elevated: {
      text: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
    },
    high: {
      text: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/30',
      badge: 'bg-orange-500/10 text-orange-400 border border-orange-500/30',
    },
    critical: {
      text: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      badge: 'bg-red-500/10 text-red-400 border border-red-500/30',
    },
  }
  return classMap[band]
}

/** Colour for a raw 0–100 score, via the canonical band function. */
export function getScoreColor(score: number): string {
  return getRiskColor(bandForScore(score))
}
