// Fund look-through: what you actually own underneath your funds.
//
// The data has been there all along — /live-data/fund-holdings returns a fund's
// full weighted portfolio from SEC N-PORT — but every consumer rendered one fund
// in isolation, so nothing answered "how much NVDA do I hold across VOO + QQQ +
// my direct position?". That is the single most common real portfolio mistake:
// believing three funds are diversification when two of them are 70% the same
// mega-caps. It is also the input Portfolio Builder's concentration check is
// missing, since that measures concentration against the plan's own targets —
// i.e. at the fund level, where a plan can look perfectly diversified while its
// underlying issuer exposure is not.
//
// Pure functions, no fetching. The route and its cache stay where they are.
//
// ── The honesty constraint that shapes the whole module ──────────────────────
//
// Holdings arrive from a source ladder: SEC N-PORT (complete), FMP (complete),
// catalog (indicative, a handful of names). Such a list sums to roughly 30%,
// not 100%. Renormalising it to 100% — the obvious implementation — would claim
// you hold about three times the NVDA you actually do, and would look entirely
// plausible on screen.
//
// So weights are distributed at FACE VALUE and never rescaled. Whatever a fund's
// holdings don't account for lands in `unresolvedPct`, and per-fund coverage
// travels with the result so no surface can blend a full N-PORT list with a
// partial indicative list unlabelled.

// 'yahoo' was a member until 2026-08-06 and meant "top-10 subset". It is gone
// with the source; 'catalog' is now the only partial (full: false) kind. The
// full-vs-partial distinction the rest of this file turns on is unchanged —
// nothing here ever branched on the provider name, only on `full`.
export type HoldingsSourceId = 'sec' | 'fmp' | 'catalog'

/** One position in the user's portfolio. */
export interface LookThroughPosition {
  symbol: string
  /** Share of the whole portfolio, 0–100. */
  weightPct: number
  /** Look this one through when holdings are supplied; direct stock if false. */
  isFund: boolean
}

/** A fund's own holdings, as returned by /live-data/fund-holdings. */
export interface FundHoldings {
  symbol: string
  holdings: Array<{ symbol: string | null; name: string; weightPct: number }>
  source: HoldingsSourceId
  /** The provider returned the complete list, not a top-N subset. */
  full: boolean
  asOf: string | null
  holdingsCount: number | null
}

/** How well one held fund could be seen through. */
export interface FundCoverage {
  symbol: string
  source: HoldingsSourceId
  full: boolean
  asOf: string | null
  /** Share of the FUND explained by the holdings we have, 0–100. */
  explainedPct: number
  holdingsCount: number | null
  /** No holdings supplied at all — fetch failed, or the fund isn't resolvable. */
  missing: boolean
}

export interface IssuerContribution {
  /** The held position this exposure came through — a fund symbol, or the issuer itself if direct. */
  via: string
  /** Percentage points of the whole portfolio. */
  weightPct: number
  direct: boolean
}

export interface IssuerExposure {
  symbol: string | null
  name: string
  /** Percentage points of the whole portfolio. */
  weightPct: number
  contributions: IssuerContribution[]
  /** Held both directly and inside a fund — the case users most often miss. */
  heldDirectlyAndViaFund: boolean
}

export interface LookThroughResult {
  issuers: IssuerExposure[]
  /** Portfolio weight attributed to a named underlying issuer. */
  resolvedPct: number
  /** Fund weight whose underlying holdings are unknown (top-N tails, failed fetches). */
  unresolvedPct: number
  coverage: FundCoverage[]
  /** Any contributing fund is a partial list — figures below are floors, not totals. */
  partial: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Issuer identity. Ticker when we have one; otherwise a normalised name, since
 * N-PORT and the aggregators spell the same company differently ("Apple Inc." vs
 * "APPLE INC"). Deliberately conservative — merging two genuinely different
 * issuers is worse than listing one twice.
 */
function issuerKey(symbol: string | null, name: string): string {
  if (symbol && symbol.trim()) return `sym:${symbol.trim().toUpperCase()}`
  return `name:${name.trim().toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ')}`
}

/**
 * Combine portfolio weights with per-fund holdings into true issuer exposure.
 *
 * `holdingsByFund` is keyed by fund symbol (case-insensitive). A fund position
 * with no entry is reported as missing coverage and its whole weight lands in
 * `unresolvedPct` — never silently dropped, and never treated as a direct
 * holding of itself.
 */
export function computeLookThrough(
  positions: LookThroughPosition[],
  holdingsByFund: Record<string, FundHoldings>,
): LookThroughResult {
  const byKey = new Map<string, IssuerExposure>()
  const coverage: FundCoverage[] = []
  let unresolvedPct = 0

  const lookup = new Map<string, FundHoldings>()
  for (const [key, value] of Object.entries(holdingsByFund)) {
    lookup.set(key.trim().toUpperCase(), value)
  }

  const add = (
    symbol: string | null,
    name: string,
    weightPct: number,
    via: string,
    direct: boolean,
  ) => {
    if (weightPct <= 0) return
    const key = issuerKey(symbol, name)
    const existing = byKey.get(key)
    if (existing) {
      existing.weightPct += weightPct
      existing.contributions.push({ via, weightPct, direct })
      // Filled in once at the end — a running flag here would depend on order.
    } else {
      byKey.set(key, {
        symbol: symbol?.trim().toUpperCase() ?? null,
        name: name.trim(),
        weightPct,
        contributions: [{ via, weightPct, direct }],
        heldDirectlyAndViaFund: false,
      })
    }
  }

  for (const position of positions) {
    const symbol = position.symbol.trim().toUpperCase()
    const weight = position.weightPct
    if (weight <= 0) continue

    if (!position.isFund) {
      add(symbol, symbol, weight, symbol, true)
      continue
    }

    const fund = lookup.get(symbol)
    if (!fund) {
      // A fund we could not see through. Its weight is real but unattributed —
      // counting it as an issuer would invent a holding that doesn't exist.
      unresolvedPct += weight
      coverage.push({
        symbol, source: 'catalog', full: false, asOf: null,
        explainedPct: 0, holdingsCount: null, missing: true,
      })
      continue
    }

    const explainedPct = fund.holdings.reduce((sum, h) => sum + Math.max(0, h.weightPct), 0)

    for (const holding of fund.holdings) {
      if (holding.weightPct <= 0) continue
      // Face value, never rescaled — see the module header.
      add(holding.symbol, holding.name, weight * (holding.weightPct / 100), symbol, false)
    }

    // The tail this fund's list doesn't cover. For a full N-PORT list this is
    // ~0; for a partial top-N list it is most of the position.
    unresolvedPct += weight * Math.max(0, 100 - explainedPct) / 100

    coverage.push({
      symbol,
      source: fund.source,
      full: fund.full,
      asOf: fund.asOf,
      explainedPct: round2(explainedPct),
      holdingsCount: fund.holdingsCount,
      missing: false,
    })
  }

  const issuers = [...byKey.values()]
    .map((issuer) => ({
      ...issuer,
      weightPct: round2(issuer.weightPct),
      contributions: issuer.contributions.map((c) => ({ ...c, weightPct: round2(c.weightPct) })),
      heldDirectlyAndViaFund:
        issuer.contributions.some((c) => c.direct) && issuer.contributions.some((c) => !c.direct),
    }))
    .sort((a, b) => b.weightPct - a.weightPct)

  const resolvedPct = round2(issuers.reduce((sum, i) => sum + i.weightPct, 0))

  return {
    issuers,
    resolvedPct,
    unresolvedPct: round2(unresolvedPct),
    coverage,
    partial: coverage.some((c) => !c.full || c.missing),
  }
}

// ─── Pairwise fund overlap ────────────────────────────────────────────────────

export interface FundOverlap {
  a: string
  b: string
  /**
   * Weight held in common, as a percentage. The standard measure: sum over
   * shared issuers of min(weight in A, weight in B). Two identical funds
   * overlap ~100%; two disjoint funds, 0%.
   */
  overlapPct: number
  /** Issuers present in both, largest shared weight first. */
  shared: Array<{ symbol: string | null; name: string; aPct: number; bPct: number; sharedPct: number }>
  coverage: [FundCoverage, FundCoverage]
  /**
   * False when either side is a partial list. The number is then a FLOOR — real
   * overlap can only be higher — and must be presented as such. Comparing two
   * partial top-N lists caps overlap near 30% no matter how similar the funds are.
   */
  comparable: boolean
}

function coverageOf(fund: FundHoldings): FundCoverage {
  return {
    symbol: fund.symbol.toUpperCase(),
    source: fund.source,
    full: fund.full,
    asOf: fund.asOf,
    explainedPct: round2(fund.holdings.reduce((sum, h) => sum + Math.max(0, h.weightPct), 0)),
    holdingsCount: fund.holdingsCount,
    missing: false,
  }
}

/** Overlap between two funds' portfolios. Weights are used as reported. */
export function computeFundOverlap(a: FundHoldings, b: FundHoldings): FundOverlap {
  const indexOf = (fund: FundHoldings) => {
    const map = new Map<string, { symbol: string | null; name: string; weightPct: number }>()
    for (const h of fund.holdings) {
      if (h.weightPct <= 0) continue
      const key = issuerKey(h.symbol, h.name)
      const existing = map.get(key)
      if (existing) existing.weightPct += h.weightPct
      else map.set(key, { symbol: h.symbol, name: h.name, weightPct: h.weightPct })
    }
    return map
  }

  const indexA = indexOf(a)
  const indexB = indexOf(b)

  const shared: FundOverlap['shared'] = []
  let overlapPct = 0

  for (const [key, rowA] of indexA) {
    const rowB = indexB.get(key)
    if (!rowB) continue
    const sharedPct = Math.min(rowA.weightPct, rowB.weightPct)
    overlapPct += sharedPct
    shared.push({
      symbol: rowA.symbol?.toUpperCase() ?? rowB.symbol?.toUpperCase() ?? null,
      name: rowA.name,
      aPct: round2(rowA.weightPct),
      bPct: round2(rowB.weightPct),
      sharedPct: round2(sharedPct),
    })
  }

  shared.sort((x, y) => y.sharedPct - x.sharedPct)

  const coverage: [FundCoverage, FundCoverage] = [coverageOf(a), coverageOf(b)]

  return {
    a: a.symbol.toUpperCase(),
    b: b.symbol.toUpperCase(),
    overlapPct: round2(overlapPct),
    shared,
    coverage,
    comparable: coverage[0].full && coverage[1].full,
  }
}
