import { NextRequest, NextResponse } from 'next/server'
import { resolveFundSeries, listNportFilings, fetchNportReport, type NportFilingRef } from '@/lib/server/nport'

// History of changes in a fund's underlying investments from SEC N-PORT
// disclosures. Compares two quarterly disclosure snapshots and returns the
// diff: new positions, exits, and weight increases/decreases.
//   GET /live-data/fund-holdings-history?symbol=SPY
//   GET /live-data/fund-holdings-history?symbol=SPY&current=2026-Q1&previous=2025-Q4
//
// Primary source: SEC EDGAR directly (keyless, authoritative, no rate caps).
// Fallback: the same N-PORT data via FMP when EDGAR can't resolve the fund
// and an FMP_API_KEY is configured. { configured: false } only when neither
// source is available for the ticker.

export const dynamic = 'force-dynamic'

const FMP_KEY = process.env.FMP_API_KEY && process.env.FMP_API_KEY !== 'your-fmp-api-key'
  ? process.env.FMP_API_KEY : undefined

const MAX_PERIODS = 12
const MAX_CHANGES = 80
/** Weight moves smaller than this (percentage points) count as unchanged. */
const CHANGE_THRESHOLD_PP = 0.02

export interface DisclosurePeriod {
  /** e.g. "2026-Q1" — also the token accepted by ?current= / ?previous= */
  label: string
  year: number
  quarter: number
  date: string
}

export type ChangeAction = 'added' | 'exited' | 'increased' | 'decreased'

export interface HoldingsChangeRow {
  symbol: string | null
  name: string
  action: ChangeAction
  /** Weight in the current period; null for exited positions. */
  weightPct: number | null
  /** Weight in the previous period; null for new positions. */
  prevWeightPct: number | null
  /** weightPct - prevWeightPct (missing side treated as 0). */
  deltaPct: number
  shares: number | null
  prevShares: number | null
}

export interface HoldingsChangeSummary {
  added: number
  exited: number
  increased: number
  decreased: number
  unchanged: number
  /** Σ|Δweight| / 2 across all positions — a one-sided turnover estimate. */
  turnoverPct: number
  currentCount: number
  previousCount: number
}

export interface FundHoldingsHistoryResponse {
  ok: boolean
  configured: boolean
  symbol: string
  updatedAt: string
  periods: DisclosurePeriod[]
  current: DisclosurePeriod | null
  previous: DisclosurePeriod | null
  summary: HoldingsChangeSummary | null
  changes: HoldingsChangeRow[]
  error?: string
}

// ─── FMP fetchers ─────────────────────────────────────────────────────────────

async function fetchDisclosureDates(symbol: string): Promise<DisclosurePeriod[]> {
  const res = await fetch(
    `https://financialmodelingprep.com/stable/funds/disclosure-dates?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_KEY}`,
    { next: { revalidate: 21_600 } }
  )
  if (!res.ok) return []
  const rows = await res.json()
  if (!Array.isArray(rows)) return []

  const seen = new Set<string>()
  const periods: DisclosurePeriod[] = []
  for (const row of rows as Array<{ date?: string; year?: number | string; quarter?: number | string }>) {
    const date = typeof row.date === 'string' ? row.date.slice(0, 10) : null
    let year = Number(row.year ?? NaN)
    let quarter = Number(row.quarter ?? NaN)
    // Derive year/quarter from the disclosure date when not reported directly.
    if ((!Number.isFinite(year) || !Number.isFinite(quarter)) && date) {
      const d = new Date(date)
      if (!Number.isNaN(d.getTime())) {
        year = d.getUTCFullYear()
        quarter = Math.floor(d.getUTCMonth() / 3) + 1
      }
    }
    if (!Number.isFinite(year) || !Number.isFinite(quarter)) continue
    const label = `${year}-Q${quarter}`
    if (seen.has(label)) continue
    seen.add(label)
    periods.push({ label, year, quarter, date: date ?? `${year}` })
  }
  periods.sort((a, b) => b.year - a.year || b.quarter - a.quarter)
  return periods.slice(0, MAX_PERIODS)
}

interface DisclosedHolding {
  key: string
  symbol: string | null
  name: string
  weightPct: number
  shares: number | null
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40)
}

async function fetchDisclosure(symbol: string, period: DisclosurePeriod): Promise<Map<string, DisclosedHolding>> {
  const res = await fetch(
    `https://financialmodelingprep.com/stable/funds/disclosure?symbol=${encodeURIComponent(symbol)}&year=${period.year}&quarter=${period.quarter}&apikey=${FMP_KEY}`,
    { next: { revalidate: 21_600 } }
  )
  const holdings = new Map<string, DisclosedHolding>()
  if (!res.ok) return holdings
  const rows = await res.json()
  if (!Array.isArray(rows)) return holdings

  interface Row {
    symbol?: string; holdingSymbol?: string; name?: string; title?: string
    cusip?: string; isin?: string; pctVal?: number | string; balance?: number | string
  }
  const parsed: Array<DisclosedHolding & { raw: number }> = []
  for (const row of rows as Row[]) {
    const weight = Number(row.pctVal ?? NaN)
    if (!Number.isFinite(weight) || weight <= 0) continue
    const ticker = (row.symbol ?? row.holdingSymbol ?? '').trim() || null
    const name = (row.name ?? row.title ?? ticker ?? 'Unknown').trim()
    // Stable identity for diffing: ticker, else security identifiers, else name.
    const key = ticker?.toUpperCase() ?? row.cusip ?? row.isin ?? normalizeName(name)
    const shares = Number(row.balance ?? NaN)
    parsed.push({
      key, symbol: ticker?.toUpperCase() ?? null, name,
      weightPct: weight, raw: weight,
      shares: Number.isFinite(shares) ? shares : null,
    })
  }

  // N-PORT pctVal is percent of net assets (0–100), but normalize defensively
  // in case a source reports fractions summing to ~1.
  const total = parsed.reduce((sum, h) => sum + h.raw, 0)
  const scale = total > 0 && total < 2 ? 100 : 1
  for (const h of parsed) {
    const existing = holdings.get(h.key)
    const weightPct = h.weightPct * scale
    if (existing) {
      // Same security disclosed in multiple lots — merge.
      existing.weightPct += weightPct
      if (existing.shares != null && h.shares != null) existing.shares += h.shares
    } else {
      holdings.set(h.key, { key: h.key, symbol: h.symbol, name: h.name, weightPct, shares: h.shares })
    }
  }
  return holdings
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

function diffHoldings(
  current: Map<string, DisclosedHolding>,
  previous: Map<string, DisclosedHolding>,
): { summary: HoldingsChangeSummary; changes: HoldingsChangeRow[] } {
  const changes: HoldingsChangeRow[] = []
  let increased = 0, decreased = 0, unchanged = 0, turnover = 0

  for (const [key, cur] of current) {
    const prev = previous.get(key)
    if (!prev) {
      turnover += cur.weightPct
      changes.push({
        symbol: cur.symbol, name: cur.name, action: 'added',
        weightPct: cur.weightPct, prevWeightPct: null, deltaPct: cur.weightPct,
        shares: cur.shares, prevShares: null,
      })
      continue
    }
    const delta = cur.weightPct - prev.weightPct
    turnover += Math.abs(delta)
    if (Math.abs(delta) < CHANGE_THRESHOLD_PP) { unchanged++; continue }
    if (delta > 0) increased++; else decreased++
    changes.push({
      symbol: cur.symbol, name: cur.name, action: delta > 0 ? 'increased' : 'decreased',
      weightPct: cur.weightPct, prevWeightPct: prev.weightPct, deltaPct: delta,
      shares: cur.shares, prevShares: prev.shares,
    })
  }
  for (const [key, prev] of previous) {
    if (current.has(key)) continue
    turnover += prev.weightPct
    changes.push({
      symbol: prev.symbol, name: prev.name, action: 'exited',
      weightPct: null, prevWeightPct: prev.weightPct, deltaPct: -prev.weightPct,
      shares: null, prevShares: prev.shares,
    })
  }

  changes.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
  const added = changes.filter((c) => c.action === 'added').length
  const exited = changes.filter((c) => c.action === 'exited').length

  return {
    summary: {
      added, exited, increased, decreased, unchanged,
      turnoverPct: Number((turnover / 2).toFixed(2)),
      currentCount: current.size,
      previousCount: previous.size,
    },
    changes: changes.slice(0, MAX_CHANGES).map((c) => ({
      ...c,
      weightPct: c.weightPct != null ? Number(c.weightPct.toFixed(3)) : null,
      prevWeightPct: c.prevWeightPct != null ? Number(c.prevWeightPct.toFixed(3)) : null,
      deltaPct: Number(c.deltaPct.toFixed(3)),
    })),
  }
}

// ─── SEC EDGAR direct (primary) ───────────────────────────────────────────────

/** NPORT-P is due within 60 days of quarter end; walking the filing date back
 *  ~75 days lands inside the reporting quarter for on-time filings. The
 *  estimate only labels the period picker — the diff itself uses the real
 *  repPdDate from inside the two fetched filings. */
function estimatePeriod(filedAt: string): DisclosurePeriod | null {
  const filed = new Date(filedAt)
  if (Number.isNaN(filed.getTime())) return null
  const inQuarter = new Date(filed.getTime() - 75 * 86_400_000)
  const year = inQuarter.getUTCFullYear()
  const quarter = Math.floor(inQuarter.getUTCMonth() / 3) + 1
  const endMonth = quarter * 3
  const endDay = [31, 30, 30, 31][quarter - 1]
  return {
    label: `${year}-Q${quarter}`, year, quarter,
    date: `${year}-${String(endMonth).padStart(2, '0')}-${endDay}`,
  }
}

async function fetchSecDisclosure(ref: NportFilingRef): Promise<Map<string, DisclosedHolding>> {
  const report = await fetchNportReport(ref)
  const rows = report.holdings.filter((h) => h.pctVal != null && h.pctVal > 0)
  const total = rows.reduce((s, h) => s + (h.pctVal ?? 0), 0)
  const scale = total > 0 && total < 2 ? 100 : 1
  const holdings = new Map<string, DisclosedHolding>()
  for (const h of rows) {
    const key = h.ticker ?? h.cusip ?? h.isin ?? normalizeName(h.name)
    const weightPct = (h.pctVal ?? 0) * scale
    const existing = holdings.get(key)
    if (existing) {
      existing.weightPct += weightPct
      if (existing.shares != null && h.balance != null) existing.shares += h.balance
    } else {
      holdings.set(key, { key, symbol: h.ticker, name: h.name, weightPct, shares: h.balance })
    }
  }
  return holdings
}

/** Full SEC-direct history flow; null = couldn't resolve (caller falls back to FMP). */
async function secHistory(symbol: string, request: NextRequest, base: { symbol: string; updatedAt: string }) {
  const series = await resolveFundSeries(symbol)
  if (!series) return null
  const filings = await listNportFilings(series.seriesId, 12)
  if (filings.length < 2) return null

  // Newest-first filings → periods; dedupe amended filings that land on the same quarter.
  const paired: Array<{ period: DisclosurePeriod; filing: NportFilingRef }> = []
  for (const filing of filings) {
    const period = estimatePeriod(filing.filedAt)
    if (period && !paired.some((p) => p.period.label === period.label)) paired.push({ period, filing })
  }
  if (paired.length < 2) return null
  const periods = paired.map((p) => p.period).slice(0, MAX_PERIODS)

  const current = findPeriod(periods, request.nextUrl.searchParams.get('current')) ?? periods[0]
  const previous = findPeriod(periods, request.nextUrl.searchParams.get('previous'))
    ?? periods[periods.indexOf(current) + 1]
    ?? periods[1]
  const curFiling = paired.find((p) => p.period.label === current.label)!.filing
  const prevFiling = paired.find((p) => p.period.label === previous.label)!.filing

  const [curRes, prevRes] = await Promise.allSettled([
    fetchSecDisclosure(curFiling),
    fetchSecDisclosure(prevFiling),
  ])
  const curHoldings = curRes.status === 'fulfilled' ? curRes.value : new Map<string, DisclosedHolding>()
  const prevHoldings = prevRes.status === 'fulfilled' ? prevRes.value : new Map<string, DisclosedHolding>()
  if (curHoldings.size === 0 || prevHoldings.size === 0) return null

  const { summary, changes } = diffHoldings(curHoldings, prevHoldings)
  return NextResponse.json({
    ok: true, configured: true, ...base,
    periods, current, previous, summary, changes,
  } satisfies FundHoldingsHistoryResponse)
}

// ─── Route ────────────────────────────────────────────────────────────────────

function findPeriod(periods: DisclosurePeriod[], token: string | null): DisclosurePeriod | undefined {
  if (!token) return undefined
  return periods.find((p) => p.label.toLowerCase() === token.trim().toLowerCase())
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  if (!symbol) {
    return NextResponse.json({ ok: false, error: 'Pass ?symbol=SPY' }, { status: 400 })
  }
  const base = { symbol, updatedAt: new Date().toISOString() }

  // SEC EDGAR direct — keyless and authoritative. Falls through on any failure.
  try {
    const secResponse = await secHistory(symbol, request, base)
    if (secResponse) return secResponse
  } catch { /* fall through to FMP */ }

  if (!FMP_KEY) {
    return NextResponse.json({
      ok: false, configured: false, ...base,
      periods: [], current: null, previous: null, summary: null, changes: [],
      error: 'No SEC N-PORT disclosure series found for this ticker, and no FMP_API_KEY is configured as a fallback.',
    } satisfies FundHoldingsHistoryResponse)
  }

  try {
    const periods = await fetchDisclosureDates(symbol)
    if (periods.length < 2) {
      return NextResponse.json({
        ok: true, configured: true, ...base,
        periods, current: periods[0] ?? null, previous: null, summary: null, changes: [],
        error: periods.length === 0
          ? 'No SEC disclosure history found for this fund.'
          : 'Only one disclosure period available — nothing to compare yet.',
      } satisfies FundHoldingsHistoryResponse)
    }

    const current = findPeriod(periods, request.nextUrl.searchParams.get('current')) ?? periods[0]
    const previous = findPeriod(periods, request.nextUrl.searchParams.get('previous'))
      ?? periods[periods.indexOf(current) + 1]
      ?? periods[1]

    const [curRes, prevRes] = await Promise.allSettled([
      fetchDisclosure(symbol, current),
      fetchDisclosure(symbol, previous),
    ])
    const curHoldings = curRes.status === 'fulfilled' ? curRes.value : new Map<string, DisclosedHolding>()
    const prevHoldings = prevRes.status === 'fulfilled' ? prevRes.value : new Map<string, DisclosedHolding>()

    if (curHoldings.size === 0 || prevHoldings.size === 0) {
      return NextResponse.json({
        ok: true, configured: true, ...base,
        periods, current, previous, summary: null, changes: [],
        error: 'Disclosure data unavailable for one of the selected periods.',
      } satisfies FundHoldingsHistoryResponse)
    }

    const { summary, changes } = diffHoldings(curHoldings, prevHoldings)
    return NextResponse.json({
      ok: true, configured: true, ...base,
      periods, current, previous, summary, changes,
    } satisfies FundHoldingsHistoryResponse)
  } catch (e) {
    return NextResponse.json({
      ok: false, configured: true, ...base,
      periods: [], current: null, previous: null, summary: null, changes: [],
      error: e instanceof Error ? e.message : 'Failed to load disclosure history',
    } satisfies FundHoldingsHistoryResponse)
  }
}
