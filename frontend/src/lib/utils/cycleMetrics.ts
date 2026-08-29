/**
 * Pure computations for the Cycle Context tab (Phase 1). Everything here is
 * arithmetic over inputs the caller supplies — no fetches, no clock reads
 * without injection, and deliberately NO composite: a blended "cycle score"
 * is the verdict shape item 4 removed. Each metric stands alone.
 */

import { CYCLE_HISTORY, type CycleRecord } from '@/lib/data/cycleHistory'

// ─── Halving clock ────────────────────────────────────────────────────────────

export interface HalvingPosition {
  monthsSince: number
  /** 0–100 position through a nominal 48-month cycle, clamped. */
  pctThroughNominalCycle: number
  /** Months-to-peak range observed in completed halving cycles, for context. */
  historicalPeakWindowMonths: [number, number]
}

/**
 * Where "now" sits relative to the last halving. Descriptive only: the
 * historical window says when PAST cycles peaked, and the current cycle has
 * already demonstrated that the pattern can break — the caller renders that
 * caveat, this function just does the arithmetic.
 */
export function halvingPosition(lastHalvingIso: string, now: Date): HalvingPosition {
  const months = (now.getTime() - new Date(`${lastHalvingIso}T00:00:00Z`).getTime()) / (86_400_000 * 30.44)
  const windows = CYCLE_HISTORY
    .filter((c) => c.halvingToPeakMonths !== null && !c.open)
    .map((c) => c.halvingToPeakMonths!)
  return {
    monthsSince: Math.round(months * 10) / 10,
    pctThroughNominalCycle: Math.min(100, Math.max(0, (months / 48) * 100)),
    historicalPeakWindowMonths: [Math.min(...windows), Math.max(...windows)],
  }
}

// ─── Drawdown comparison ──────────────────────────────────────────────────────

export interface DrawdownRow {
  label: string
  drawdownPct: number  // negative
  open: boolean
  note: string
}

/**
 * The prior cycles' max drawdowns beside the live figure. The live row is
 * appended ONLY when the caller has a real athChangePct — a missing live
 * value renders as a missing row, never as 0% ("unknown is not zero").
 */
export function drawdownComparison(liveBtcAthChangePct: number | null): DrawdownRow[] {
  const rows: DrawdownRow[] = CYCLE_HISTORY.map((c: CycleRecord) => ({
    label: c.open ? `${c.halving} cycle (open)` : `${c.halving === 'genesis' ? '2011' : c.halving} cycle`,
    drawdownPct: c.maxDrawdownPct,
    open: !!c.open,
    note: c.note,
  }))
  if (liveBtcAthChangePct !== null && Number.isFinite(liveBtcAthChangePct)) {
    rows.push({
      label: 'BTC now',
      drawdownPct: Math.round(Math.min(0, liveBtcAthChangePct) * 10) / 10,
      open: true,
      note: 'Live: current distance below the all-time high, from the markets feed.',
    })
  }
  return rows
}

// ─── Copy tables (vocabulary-guarded) ─────────────────────────────────────────
// All user-facing framing strings live HERE, not inline in JSX, so one test
// can sweep them for advice vocabulary — the same enforcement pattern as
// assetClassProfiles. Add panel copy to this object or the guard can't see it.

export const CYCLE_COPY = {
  panelIntro:
    'Where past-cycle metrics currently read. This panel describes the market — it does not predict it, and it produces no score.',
  indicatorFailureNote:
    'In October 2025, the classic cycle-top indicators (Pi Cycle, MVRV bands and peers) did not fire before the peak and the ~50% decline that followed. Metrics trained on earlier, retail-driven cycles degraded when the buyer base changed. Read every figure here as history, not signal.',
  absentMetricsNote:
    'Not shown here: MVRV, NUPL, SOPR and holder-flow metrics need realized-cap data from paid on-chain providers, and this app has no source for them. An absent metric with a stated reason beats a proxy wearing its name.',
  halvingCaveat:
    'Past cycles peaked 12–18 months after the halving. The current cycle matched that timing and then broke the rest of the template — the window describes history, not a schedule.',
  drawdownCaveat:
    'Each completed cycle’s bar is its final peak-to-trough loss. The open rows can still deepen.',
  dominanceCaveat:
    'Bitcoin’s share of total crypto market value. Rising dominance means capital concentrating in BTC; in prior cycles it fell as rotation into altcoins began.',
  rotationCaveat:
    'A 30-day variant computed over this app’s tracked coins (rank ≤ 50, stablecoins excluded) — NOT the standard Altcoin Season Index, which uses 90 days over CoinGecko’s top 50. In prior cycles a majority of large coins outperforming BTC marked late-cycle rotation; in this cycle that rotation has not arrived.',
  fearGreedCaveat:
    'A sentiment composite (volatility, volume, social activity, dominance) from alternative.me — a mood reading, not a valuation.',
} as const

// ─── Rotation read (30-day variant) ───────────────────────────────────────────

export interface RotationInput {
  id: string
  marketCapRank: number | null
  priceChange30d: number | null
  /** Stablecoins are excluded — pegged assets neither out- nor underperform. */
  isStablecoin: boolean
}

export interface RotationRead {
  /** Percent of eligible coins outperforming BTC over 30 days, 0–100. */
  pctOutperformingBtc: number
  outperforming: number
  eligible: number
  /** Coins ranked in-universe but skipped for missing 30d data. Disclosed, never folded into eligible. */
  untested: number
  btcChange30d: number
}

/**
 * The share of top-ranked coins outperforming BTC over 30 days.
 *
 * A VARIANT, NOT THE INDEX. The standard Altcoin Season Index is 90-day over
 * CoinGecko's top 50; the markets feed carries 30-day changes over the app's
 * tracked universe. Both differences are surfaced by the caller's copy
 * (CYCLE_COPY.rotationCaveat) — presenting this number under the standard
 * name would be a different figure wearing a known label.
 *
 * Returns null when BTC's own 30d change is missing (there is nothing to
 * outperform) or when fewer than 10 coins are eligible — a percentage over a
 * handful of names would read as a market statistic while describing noise.
 */
export function rotationRead(rows: RotationInput[], maxRank = 50): RotationRead | null {
  const btc = rows.find((r) => r.id === 'btc')
  if (!btc || btc.priceChange30d === null || !Number.isFinite(btc.priceChange30d)) return null

  const ranked = rows.filter((r) =>
    r.id !== 'btc' && !r.isStablecoin &&
    r.marketCapRank !== null && r.marketCapRank <= maxRank,
  )
  const eligible = ranked.filter((r) => r.priceChange30d !== null && Number.isFinite(r.priceChange30d))
  const untested = ranked.length - eligible.length
  if (eligible.length < 10) return null

  const outperforming = eligible.filter((r) => r.priceChange30d! > btc.priceChange30d!).length
  return {
    pctOutperformingBtc: Math.round((outperforming / eligible.length) * 1000) / 10,
    outperforming,
    eligible: eligible.length,
    untested,
    btcChange30d: btc.priceChange30d,
  }
}
