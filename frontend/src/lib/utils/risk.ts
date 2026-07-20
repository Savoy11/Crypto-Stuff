// Presentation-only shim for the canonical risk/safety scale.
//
// Single sources of truth (post-R2 dedup):
//   - band NUMBERS + vocabulary: lib/risk/types.ts (RISK_BAND_THRESHOLDS, RiskBand)
//   - band FUNCTION:             lib/risk/engine.ts (bandForScore)
//   - colours / labels / classes: lib/risk/presentation.ts (RISK_BAND_CONFIG, ...)
//
// This module re-exports them so its ~12 long-standing consumers keep importing
// from '@/lib/utils/risk' unchanged. It holds no thresholds or band logic of its
// own.
export {
  RISK_BAND_CONFIG,
  getRiskBandConfig,
  getRiskColor,
  getRiskBgColor,
  getRiskLabel,
  getRiskBorderColor,
  getRiskTailwindClasses,
  getScoreColor,
} from '@/lib/risk/presentation'

// getRiskBandFromScore was a byte-identical duplicate of the engine's
// bandForScore (same 80/60/40/20 thresholds). Aliased so call sites are untouched.
export { bandForScore as getRiskBandFromScore } from '@/lib/risk/engine'

/**
 * Format a peg deviation (basis points) with a colour class. Unrelated to risk
 * bands — a small formatting helper that historically lived here.
 */
export function getPegDeviationColorClass(bps: number | null): string {
  if (bps === null) return 'text-text-muted'
  const abs = Math.abs(bps)
  if (abs < 10) return 'text-emerald-400'
  if (abs < 50) return 'text-amber-400'
  return 'text-red-400'
}
