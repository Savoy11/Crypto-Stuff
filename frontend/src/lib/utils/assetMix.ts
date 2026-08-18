/**
 * Stock / bond / cash mix for a fund, derived from its own N-PORT filing.
 *
 * NT9 (approved P3-W2 decision session, built 2026-08-18). The allocation donut
 * on a fund detail page went dark on 2026-08-06: its only source was withdrawn
 * on terms grounds, and no remaining provider publishes the mix. But the app
 * already fetches each fund's complete N-PORT portfolio for the holdings table,
 * and every position in that filing carries an `assetCat` code. The mix was
 * therefore derivable from data already in hand — keylessly, from the filer's
 * own disclosure rather than an aggregator's interpretation of it.
 *
 * Pure and tested: this produces percentages a user reads as their exposure.
 */

/** Slice labels, matching the donut's existing colour map. */
export type AssetMixLabel = 'Stocks' | 'Bonds' | 'Cash' | 'Preferred' | 'Derivatives' | 'Other'

export interface AssetMixSlice {
  label: AssetMixLabel
  pct: number
}

export interface AssetMixResult {
  slices: AssetMixSlice[]
  /**
   * Percent of net assets the filing actually accounted for. N-PORT `pctVal`
   * figures rarely sum to exactly 100 — cash held directly at the custodian,
   * payables and receivables live outside the position list.
   *
   * This is REPORTED, never used to rescale. Scaling a 96%-covered filing up to
   * 100% would silently redistribute the 4% nobody disclosed into categories it
   * may not belong to — the same rule the look-through engine follows for
   * partial holdings lists.
   */
  coveredPct: number
  /** Positions that carried no `assetCat` and could not be classified. */
  unclassifiedCount: number
}

/**
 * N-PORT asset category codes → donut slices.
 *
 * Codes are the SEC's own (Form N-PORT, Item C.4.a). Anything unmapped falls to
 * 'Other' rather than being guessed into a familiar bucket: a fund whose filing
 * uses a category this table does not know should show an honest "Other" wedge,
 * not a confidently wrong "Stocks" one.
 */
const ASSET_CAT_MAP: Record<string, AssetMixLabel> = {
  EC: 'Stocks',       // Equity-common
  EP: 'Preferred',    // Equity-preferred
  DBT: 'Bonds',       // Debt
  ABS: 'Bonds',       // Asset-backed (filers also emit the ABS-* variants below)
  'ABS-MBS': 'Bonds',
  'ABS-CBDO': 'Bonds',
  'ABS-O': 'Bonds',
  LON: 'Bonds',       // Loan
  SN: 'Bonds',        // Structured note
  STIV: 'Cash',       // Short-term investment vehicle (e.g. a money-market fund)
  RA: 'Cash',         // Repurchase agreement
  DE: 'Derivatives',  // Derivative
  COMM: 'Other',      // Commodity
  RE: 'Other',        // Real estate
}

/** Display order, so the donut reads consistently across funds. */
const SLICE_ORDER: AssetMixLabel[] = ['Stocks', 'Bonds', 'Cash', 'Preferred', 'Derivatives', 'Other']

export interface AssetMixInput {
  pctVal: number | null
  assetCat: string | null
}

export function computeAssetMix(holdings: AssetMixInput[]): AssetMixResult {
  const totals = new Map<AssetMixLabel, number>()
  let covered = 0
  let unclassifiedCount = 0

  for (const h of holdings) {
    const pct = h.pctVal
    // A position with no percent-of-net-assets figure cannot contribute to a
    // percentage mix. Counting it as zero is right; inventing one is not.
    if (pct == null || !Number.isFinite(pct)) continue

    // Short positions and some derivative blocks report negative pctVal. They
    // are real exposure and belong in the total, so the sign is preserved
    // rather than clamped — a fund with a large short book should not appear
    // to hold more than it does.
    covered += pct

    const label = h.assetCat ? (ASSET_CAT_MAP[h.assetCat] ?? 'Other') : null
    if (label == null) unclassifiedCount++
    const key = label ?? 'Other'
    totals.set(key, (totals.get(key) ?? 0) + pct)
  }

  const slices = SLICE_ORDER
    .filter(label => totals.has(label))
    .map(label => ({ label, pct: round2(totals.get(label)!) }))
    // A slice rounding to exactly 0.00% is noise in a legend, not information.
    .filter(s => s.pct !== 0)

  return { slices, coveredPct: round2(covered), unclassifiedCount }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
