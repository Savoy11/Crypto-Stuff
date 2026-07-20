// Client helper for the live risk composite (R2 Phase 2).
//
// The canonical composite for every tracked asset is computed server-side at
// /live-data/risk-scores (5-pillar model, per-pillar confidence, fatal-flaw
// overrides). This module fetches it once, indexes it by internal asset id, and
// joins score/band onto assets at the hook layer — replacing the historical
// hard-null that made ~12 components render "N/A".
//
// ⚠️ R2 Phase 2 LIVE-VERIFICATION PENDING — see docs/assessments/R2-phase2-verification.md.
// The wiring is deterministic and build-verified, but the acceptance criterion
// ("registry, detail, heatmap and /risk-scores show the SAME number for the same
// asset") depends on live DefiLlama/CoinGecko/news data, which is IP-dependent.
// It could NOT be confirmed from the remote build environment. Verify on a normal
// network before treating Phase 2 as done. Failure mode if data is unreachable:
// unscored assets stay null → "N/A" (same as before the fix), never fabricated.
import type { RiskBand } from '@/lib/risk/types'
import type { RiskScoresResponse } from '@/app/live-data/risk-scores/route'

export interface AssetRiskComposite {
  score: number
  band: RiskBand
  confidence: number
  coverage: number
}

export type RiskScoreIndex = Map<string, AssetRiskComposite>

/** Shared React Query key so registry / detail / heatmap dedupe to one request. */
export const RISK_SCORES_QUERY_KEY = ['risk-scores'] as const

/** Fetch the live composite and index it by internal asset id (e.g. "usdc"). */
export async function fetchRiskScoreIndex(): Promise<RiskScoreIndex> {
  const index: RiskScoreIndex = new Map()
  const res = await fetch('/live-data/risk-scores')
  if (!res.ok) return index
  const json = (await res.json()) as RiskScoresResponse
  if (!json.ok) return index
  for (const scored of [...(json.stablecoins ?? []), ...(json.majors ?? [])]) {
    const r = scored.risk
    if (!r) continue
    index.set(scored.assetId, {
      score: r.score,
      band: r.band,
      confidence: r.confidence,
      coverage: r.coverage,
    })
  }
  return index
}

/**
 * Join the live composite onto an asset. Unscored assets are returned unchanged
 * (riskScore/riskBand stay null → "N/A") — never fabricated.
 */
export function applyRiskComposite<
  T extends { id: string; coingeckoId?: string | null; riskScore: number | null; riskBand: RiskBand | null },
>(asset: T, index: RiskScoreIndex): T {
  const composite = index.get(asset.id) ?? (asset.coingeckoId ? index.get(asset.coingeckoId) : undefined)
  if (!composite) return asset
  return { ...asset, riskScore: composite.score, riskBand: composite.band }
}
