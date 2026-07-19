import { EDGAR_HEADERS, fetchTickerCikMap } from './edgar'

// Bulk fundamentals from the SEC's XBRL "frames" API.
//
// https://data.sec.gov/api/xbrl/frames/{taxonomy}/{concept}/{unit}/{period}.json
// returns one reported concept across EVERY filer for a period — the bulk
// counterpart to the per-company `companyfacts` endpoint the detail pages use.
//
// Why this exists: FMP's company-screener powers the Stock Registry universe but
// returns no P/E at all, so the column and its filter are blank for every name
// that isn't in the 79-entry curated catalog — even on a paid plan. Diluted EPS
// from frames plus the screener's price fills that gap for free.
//
// Coverage caveat: XBRL frames only cover US domestic filers whose reporting
// period aligns with the requested frame. Foreign private issuers (20-F), many
// ADRs, and off-calendar fiscal years fall out. This is enrichment — every
// helper degrades to "no value" rather than throwing.

interface FrameRow {
  cik: number
  entityName: string
  val: number
  /** Period end, ISO date. Used to prefer the most recent restatement. */
  end: string
}

interface FrameResponse {
  data?: FrameRow[]
}

/**
 * Annual frames to consult, newest first.
 *
 * Derived from the clock rather than hardcoded so this doesn't silently go
 * stale every January. Annual XBRL for year Y lands through roughly Q1–Q2 of
 * Y+1, so the previous complete year is the freshest reliable frame; the year
 * before it backfills late filers and off-calendar registrants.
 */
export function recentAnnualFrames(now: Date = new Date()): string[] {
  const year = now.getUTCFullYear()
  return [`CY${year - 1}`, `CY${year - 2}`]
}

/** Fetch one frame. Returns [] rather than throwing — enrichment is optional. */
async function fetchFrame(concept: string, unit: string, period: string): Promise<FrameRow[]> {
  const url = `https://data.sec.gov/api/xbrl/frames/us-gaap/${concept}/${unit}/${period}.json`
  try {
    const res = await fetch(url, {
      headers: EDGAR_HEADERS,
      next: { revalidate: 86_400 }, // annual figures change at most quarterly
    })
    if (!res.ok) return []
    const json = await res.json() as FrameResponse
    return Array.isArray(json.data) ? json.data : []
  } catch {
    return []
  }
}

/**
 * Merge one concept across the annual frames, newest winning.
 *
 * Frames are applied oldest-first so a newer period overwrites an older one,
 * and within a period a later `end` wins — restatements and amended filings can
 * repeat a CIK.
 */
async function mergeConceptFrames(concept: string): Promise<Map<number, { val: number; end: string }>> {
  const frames = await Promise.all(
    recentAnnualFrames().map((p) => fetchFrame(concept, 'USD-per-shares', p))
  )

  const out = new Map<number, { val: number; end: string }>()
  for (const rows of [...frames].reverse()) {
    for (const row of rows) {
      if (typeof row.val !== 'number' || !Number.isFinite(row.val)) continue
      const prev = out.get(row.cik)
      if (prev && prev.end > row.end) continue
      out.set(row.cik, { val: row.val, end: row.end })
    }
  }
  return out
}

/**
 * EPS by CIK: diluted preferred, basic as fallback.
 *
 * Diluted is the conservative figure and the right default for a P/E, but the
 * two concepts cover overlapping-not-identical filer sets (~5.6k each), so
 * letting basic fill diluted's gaps is a free coverage gain. `EarningsPerShare\
 * BasicAndDiluted` was measured too and is not worth a request — 5 filers.
 */
async function fetchEpsByCik(): Promise<Map<number, { val: number; end: string }>> {
  const [diluted, basic] = await Promise.all([
    mergeConceptFrames('EarningsPerShareDiluted'),
    mergeConceptFrames('EarningsPerShareBasic'),
  ])

  const out = new Map(basic)
  for (const [cik, entry] of diluted) out.set(cik, entry) // diluted wins
  return out
}

/**
 * EPS keyed by ticker symbol.
 *
 * Returns an empty map if SEC is unreachable — callers treat a miss as "no
 * value" and leave the field null.
 *
 * Known gap: the SEC ticker map points at a company's *current* CIK, which for
 * a recently reorganized registrant can be a brand-new holding-co entity with
 * no XBRL history (ExxonMobil is a live example — XOM maps to a 2025-era
 * holdings CIK, while the EPS history sits under the legacy one). Those resolve
 * to no value rather than a wrong one.
 */
export async function fetchEpsBySymbol(): Promise<Map<string, number>> {
  try {
    const [tickers, epsByCik] = await Promise.all([
      fetchTickerCikMap(),
      fetchEpsByCik(),
    ])

    const out = new Map<string, number>()
    for (const [symbol, entry] of tickers) {
      const eps = epsByCik.get(entry.cikNum)
      if (eps) out.set(symbol, eps.val)
    }
    return out
  } catch {
    return new Map()
  }
}

/**
 * Trailing P/E from a reference price and diluted EPS.
 *
 * Null for non-positive EPS: a loss-making company has no meaningful P/E, and
 * emitting a negative multiple would corrupt the registry's min/max P/E filter.
 */
export function computePeRatio(price: number, eps: number | undefined): number | null {
  if (eps == null || !Number.isFinite(eps) || eps <= 0) return null
  if (!Number.isFinite(price) || price <= 0) return null
  const pe = price / eps
  if (!Number.isFinite(pe) || pe > 10_000) return null // guard absurd micro-EPS blowups
  return parseFloat(pe.toFixed(2))
}
