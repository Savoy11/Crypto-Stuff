import { NextRequest, NextResponse } from 'next/server'
import { getProviderKey } from '@/lib/api/live/providers'
import { EQUITY_CATALOG, EQUITY_BY_SYMBOL, mapSectorName, type SectorId } from '@/lib/data/equityCatalog'
import { fetchEpsBySymbol, computePeRatio } from '@/lib/server/secFundamentals'

// The equities universe for the Stock Registry.
//   GET /live-data/stock-universe            → full universe (daily-refreshed)
//   GET /live-data/stock-universe?symbol=IBM → single entry (detail-page lookup)
//
// With an FMP key it pulls the whole active common-stock universe from FMP's
// stock-screener (sector-tagged, sorted by market cap) and caches it for a day
// — so index changes and new listings appear automatically. Curated catalog
// entries overlay their hand-written descriptions/betas as enrichment. Without
// a key (or on failure) it falls back to the curated catalog so the page always
// renders. `configured` tells the client whether the live universe is active.

export const dynamic = 'force-dynamic'

export interface UniverseEntry {
  symbol: string
  name: string
  sector: SectorId
  industry: string
  /** Reference market cap in billions USD (daily from FMP, or curated). */
  marketCapB: number
  /** Reference price USD — live quotes override on the visible page. */
  referencePrice: number
  peRatio: number | null
  dividendYieldPct: number | null
  beta: number
  exchange: string | null
  /** Present only for curated names. */
  description?: string
  website?: string
}

export interface StockUniverseResponse {
  ok: boolean
  configured: boolean          // true when the live FMP universe is active
  source: 'fmp' | 'catalog'
  count: number
  entries: UniverseEntry[]
  /** How many entries had P/E backfilled from SEC diluted EPS. */
  peEnriched?: number
  updatedAt: string
  error?: string
}

const MAX_UNIVERSE = 4000

interface FmpScreenerRow {
  symbol: string
  companyName: string | null
  marketCap: number | null
  sector: string | null
  industry: string | null
  beta: number | null
  price: number | null
  lastAnnualDividend: number | null
  exchangeShortName: string | null
  isEtf?: boolean
  isFund?: boolean
  isActivelyTrading?: boolean
}

function curatedEntry(symbol: string): UniverseEntry | undefined {
  const e = EQUITY_BY_SYMBOL[symbol.toUpperCase()]
  if (!e) return undefined
  return {
    symbol: e.symbol, name: e.name, sector: e.sector, industry: e.industry,
    marketCapB: e.marketCapB, referencePrice: e.referencePrice, peRatio: e.peRatio,
    dividendYieldPct: e.dividendYieldPct, beta: e.beta, exchange: null,
    description: e.description, website: e.website,
  }
}

function catalogUniverse(): UniverseEntry[] {
  return EQUITY_CATALOG.map((e) => curatedEntry(e.symbol)!).sort((a, b) => b.marketCapB - a.marketCapB)
}

/** Convert one FMP screener row to a UniverseEntry, enriched with curated data. */
function toEntry(row: FmpScreenerRow): UniverseEntry | null {
  const symbol = row.symbol?.toUpperCase()
  if (!symbol || row.marketCap == null || row.marketCap <= 0) return null
  const curated = EQUITY_BY_SYMBOL[symbol]
  const price = row.price ?? curated?.referencePrice ?? 0
  const dividend = row.lastAnnualDividend && price > 0
    ? parseFloat(((row.lastAnnualDividend / price) * 100).toFixed(2))
    : curated?.dividendYieldPct ?? null
  return {
    symbol,
    name: curated?.name ?? row.companyName ?? symbol,
    sector: curated?.sector ?? mapSectorName(row.sector),
    industry: curated?.industry ?? row.industry ?? '—',
    marketCapB: row.marketCap / 1e9,
    referencePrice: price,
    peRatio: curated?.peRatio ?? null,   // screener has no P/E; detail page computes it
    dividendYieldPct: dividend,
    beta: row.beta ?? curated?.beta ?? 1,
    exchange: row.exchangeShortName ?? null,
    description: curated?.description,
    website: curated?.website,
  }
}

/**
 * Fill in P/E for entries the screener left null, using SEC diluted EPS.
 *
 * FMP's company-screener carries no P/E, so without this every non-curated name
 * has a blank P/E column and is invisible to the registry's min/max P/E filter
 * — even on a paid plan. The result is a *trailing* P/E: last completed fiscal
 * year's diluted EPS against the screener's reference price, so it will differ
 * somewhat from a broker's forward or TTM figure.
 *
 * Mutates in place. Never throws — a P/E is enrichment, and losing it must not
 * cost us the universe.
 */
async function enrichPeRatios(entries: UniverseEntry[]): Promise<number> {
  const missing = entries.filter((e) => e.peRatio == null && e.referencePrice > 0)
  if (missing.length === 0) return 0 // curated-only universe already has P/E

  const epsBySymbol = await fetchEpsBySymbol()
  if (epsBySymbol.size === 0) return 0 // SEC unreachable — leave nulls

  let filled = 0
  for (const entry of missing) {
    const pe = computePeRatio(entry.referencePrice, epsBySymbol.get(entry.symbol))
    if (pe != null) { entry.peRatio = pe; filled++ }
  }
  return filled
}

async function fetchFmpUniverse(key: string): Promise<UniverseEntry[]> {
  // Active common stocks (no ETFs/funds), largest first. NOTE: FMP's screener /
  // constituent-list endpoints are PAID (402 on the free tier); this only
  // returns a broad universe on a paid plan. Free keys fall back to the curated
  // catalog. Exchanges/countries are left open so a paid plan's international
  // coverage flows through.
  const url =
    'https://financialmodelingprep.com/stable/company-screener' +
    `?limit=${MAX_UNIVERSE}&isEtf=false&isFund=false&isActivelyTrading=true&apikey=${key}`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 86_400 } })
  if (!res.ok) throw new Error(`FMP screener ${res.status}${res.status === 402 ? ' (paid endpoint — the broad universe needs an FMP paid plan)' : ''}`)
  const rows = await res.json() as FmpScreenerRow[]
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('FMP screener returned no rows')

  const seen = new Set<string>()
  const entries: UniverseEntry[] = []
  for (const row of rows) {
    if (row.isEtf || row.isFund) continue
    const entry = toEntry(row)
    if (!entry || seen.has(entry.symbol)) continue
    seen.add(entry.symbol)
    entries.push(entry)
  }
  // Ensure curated names are always present even if the screener omitted them.
  for (const e of EQUITY_CATALOG) {
    if (!seen.has(e.symbol.toUpperCase())) { entries.push(curatedEntry(e.symbol)!); seen.add(e.symbol.toUpperCase()) }
  }
  entries.sort((a, b) => b.marketCapB - a.marketCapB)
  return entries
}

export async function GET(req: NextRequest) {
  const symbolParam = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  const key = getProviderKey('fmp')

  // Single-symbol lookup (detail page). Try curated first, then FMP profile.
  if (symbolParam) {
    const curated = curatedEntry(symbolParam)
    if (curated) {
      return NextResponse.json({ ok: true, configured: !!key, source: 'catalog', count: 1, entries: [curated], updatedAt: new Date().toISOString() } satisfies StockUniverseResponse)
    }
    if (key) {
      try {
        // FMP /stable profile — works on the free tier (single symbol).
        const res = await fetch(`https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(symbolParam)}&apikey=${key}`, {
          headers: { Accept: 'application/json' }, next: { revalidate: 86_400 },
        })
        if (res.ok) {
          const rows = await res.json() as Array<{ symbol: string; companyName: string; sector: string; industry: string; marketCap: number; price: number; beta: number; lastDividend: number; exchange: string; website: string }>
          const p = rows[0]
          if (p) {
            const entry: UniverseEntry = {
              symbol: p.symbol.toUpperCase(), name: p.companyName ?? p.symbol,
              sector: mapSectorName(p.sector), industry: p.industry ?? '—',
              marketCapB: (p.marketCap ?? 0) / 1e9, referencePrice: p.price ?? 0,
              peRatio: null, dividendYieldPct: p.lastDividend && p.price ? parseFloat(((p.lastDividend / p.price) * 100).toFixed(2)) : null,
              beta: p.beta ?? 1, exchange: p.exchange ?? null, website: p.website || undefined,
            }
            return NextResponse.json({ ok: true, configured: true, source: 'fmp', count: 1, entries: [entry], updatedAt: new Date().toISOString() } satisfies StockUniverseResponse)
          }
        }
      } catch { /* fall through to not-found */ }
    }
    return NextResponse.json({ ok: false, configured: !!key, source: 'catalog', count: 0, entries: [], updatedAt: new Date().toISOString(), error: `Unknown symbol ${symbolParam}` }, { status: 404 })
  }

  // Full universe.
  if (!key) {
    const entries = catalogUniverse()
    return NextResponse.json({ ok: true, configured: false, source: 'catalog', count: entries.length, entries, updatedAt: new Date().toISOString() } satisfies StockUniverseResponse)
  }
  try {
    const entries = await fetchFmpUniverse(key)
    // Separate boundary: the universe is already good here, so a SEC hiccup
    // should cost us the P/E column, not the whole response.
    let peEnriched = 0
    try {
      peEnriched = await enrichPeRatios(entries)
    } catch { /* leave P/E null */ }
    return NextResponse.json({ ok: true, configured: true, source: 'fmp', count: entries.length, entries, peEnriched, updatedAt: new Date().toISOString() } satisfies StockUniverseResponse)
  } catch (e) {
    const entries = catalogUniverse()
    return NextResponse.json({
      ok: true, configured: false, source: 'catalog', count: entries.length, entries,
      updatedAt: new Date().toISOString(), error: e instanceof Error ? e.message : 'FMP universe unavailable',
    } satisfies StockUniverseResponse)
  }
}
