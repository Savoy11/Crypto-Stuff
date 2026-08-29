import { NextResponse } from 'next/server'
import {
  FUND_CATALOG, fundRiskLevel, fundStrategy, fundTradingRestriction,
  type FundCategoryId, type FundRiskLevel, type FundStrategy, type FundType,
} from '@/lib/data/fundCatalog'
import type { SectorId } from '@/lib/data/equityCatalog'

// Full ETF universe for the Fund Registry — every US-listed ETF, not just the
// curated catalog. Mirrors /live-data/stock-universe.
//   GET /live-data/fund-universe
//   GET /live-data/fund-universe?symbol=QQQM   — single-fund lookup (detail pages)
//   GET /live-data/fund-universe?q=vanguard    — name/ticker search over the
//     whole universe (top 10, compact rows) — backs the Market News symbol
//     search, where a dropdown over the curated catalog was the entire scope
//
// Sources (both keyless):
//   ETFs — NASDAQ Trader's official symbol directory (refreshed daily): every
//   US-listed security with an ETF flag and security name.
//   Mutual funds — the SEC's Investment Company Series & Class dataset: every
//   registered fund share class with entity/series/class names and tickers.
// Curated catalog entries are merged in with their rich reference facts;
// non-catalog funds carry symbol/name only — quotes come live per page, and
// their detail pages resolve holdings via SEC N-PORT.

export const dynamic = 'force-dynamic'

export interface FundUniverseEntry {
  symbol: string
  name: string
  type: FundType
  /** True when the fund has curated reference facts in fundCatalog.ts. */
  inCatalog: boolean
  category: FundCategoryId | null
  issuer: string | null
  expenseRatioPct: number | null
  aumB: number | null
  referencePrice: number | null
  yieldPct: number | null
  inceptionYear: number | null
  indexTracked: string | null
  focusSector: SectorId | null
  focusIndustry: string | null
  /** Official issuer product page. Catalog funds only — the listing directories carry no URL. */
  website: string | null
  /** Portfolio-construction strategy (catalog funds only). */
  strategy: FundStrategy | null
  /** Coarse suitability band derived from category + strategy (catalog funds only). */
  riskLevel: FundRiskLevel | null
  /** Minimum-holding / frequent-trading / daily-reset disclaimer, when applicable. */
  tradingRestriction: string | null
}

/**
 * Compact wire form for an uncurated fund. Symbol and name are the ONLY facts
 * the listing directories actually carry — every other FundUniverseEntry field
 * is null for these rows, and serializing ~30k of them as full 18-field
 * objects is what made this response 14 MB (audit follow-up F3). The client
 * hydrates these back to full entries; see FundsClient's hydrateDiscovered.
 */
export interface DiscoveredFund {
  symbol: string
  name: string
}

export interface FundUniverseResponse {
  ok: boolean
  updatedAt: string
  source: 'live' | 'catalog'
  /** Non-catalog funds discovered from the live directories. */
  discovered: number
  discoveredEtfs: number
  discoveredMutual: number
  /** Why a directory contributed nothing (null = fetched fine). */
  etfError: string | null
  mutualError: string | null
  /**
   * Rich entries only: the curated catalog on the full-universe path, or the
   * single match on `?symbol=` lookups (where a discovered fund IS returned in
   * full — one row costs nothing and detail pages want the whole shape).
   */
  entries: FundUniverseEntry[]
  /** Uncurated discoveries, compact form. Absent on `?symbol=` lookups. */
  discoveredEtfList?: DiscoveredFund[]
  discoveredMutualList?: DiscoveredFund[]
}

// NASDAQ serves the same daily file from two hosts — try both before giving up.
const DIRECTORY_URLS = [
  'https://ftp.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt',
  'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt',
]
const FETCH_TIMEOUT_MS = 20_000

function catalogEntry(f: (typeof FUND_CATALOG)[number]): FundUniverseEntry {
  return {
    symbol: f.symbol, name: f.name, type: f.type, inCatalog: true,
    category: f.category, issuer: f.issuer, expenseRatioPct: f.expenseRatioPct,
    aumB: f.aumB, referencePrice: f.referencePrice, yieldPct: f.yieldPct,
    inceptionYear: f.inceptionYear, indexTracked: f.indexTracked,
    focusSector: f.focusSector ?? null, focusIndustry: f.focusIndustry ?? null,
    website: f.website ?? null,
    strategy: fundStrategy(f), riskLevel: fundRiskLevel(f),
    tradingRestriction: fundTradingRestriction(f),
  }
}

/** Strip listing-suffix noise NASDAQ appends to fund names. */
function cleanName(raw: string): string {
  return raw
    .replace(/\s*(- )?(Exchange[- ]Traded Fund|ETF Shares?|Common Shares?|Shares of Beneficial Interest)\s*$/i, '')
    .trim()
}

function parseNasdaqFile(text: string): Array<{ symbol: string; name: string }> {
  const lines = text.split(/\r?\n/)
  const header = lines[0]?.split('|') ?? []
  const iSymbol = header.indexOf('Symbol')
  const iName = header.indexOf('Security Name')
  const iEtf = header.indexOf('ETF')
  const iTest = header.indexOf('Test Issue')
  if (iSymbol < 0 || iName < 0 || iEtf < 0) throw new Error('unexpected header format')

  const out: Array<{ symbol: string; name: string }> = []
  for (const line of lines.slice(1)) {
    if (line.startsWith('File Creation Time')) break
    const cols = line.split('|')
    if (cols[iEtf] !== 'Y') continue
    if (iTest >= 0 && cols[iTest] === 'Y') continue
    const symbol = cols[iSymbol]?.trim().toUpperCase()
    // Plain tickers only — skip units/warrants/preferred notation ($, =, +, etc.)
    if (!symbol || !/^[A-Z]{1,6}(\.[A-Z])?$/.test(symbol)) continue
    const name = cleanName(cols[iName] ?? '')
    if (!name) continue
    out.push({ symbol, name })
  }
  if (out.length === 0) throw new Error('no ETF rows parsed')
  return out
}

async function fetchNasdaqEtfs(): Promise<Array<{ symbol: string; name: string }>> {
  let lastError = 'no mirror attempted'
  for (const url of DIRECTORY_URLS) {
    const host = new URL(url).host
    try {
      const res = await fetch(url, {
        headers: { Accept: 'text/plain', 'User-Agent': 'Finance Now research dashboard (marcusowens94@gmail.com)' },
        next: { revalidate: 86_400 },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) { lastError = `HTTP ${res.status} from ${host}`; continue }
      return parseNasdaqFile(await res.text())
    } catch (e) {
      lastError = `${host}: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  throw new Error(`NASDAQ symbol directory unreachable (${lastError})`)
}

// ─── SEC series/class dataset (mutual funds) ─────────────────────────────────

/** Minimal CSV row parser that honors double-quoted fields with commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

async function fetchSecMutualFunds(): Promise<Array<{ symbol: string; name: string }>> {
  // The dataset is published annually; try the current year back two years.
  const year = new Date().getFullYear()
  let text: string | null = null
  let lastError = 'no year attempted'
  for (const y of [year, year - 1, year - 2]) {
    const url = `https://www.sec.gov/files/investment/data/other/investment-company-series-class-information/investment-company-series-class-${y}.csv`
    try {
      const res = await fetch(url, {
        headers: { Accept: 'text/csv', 'User-Agent': 'Finance Now research dashboard (marcusowens94@gmail.com)' },
        next: { revalidate: 86_400 },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (res.ok) { text = await res.text(); break }
      lastError = `HTTP ${res.status} for ${y} dataset`
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }
  if (!text) throw new Error(`SEC series/class dataset unreachable (${lastError})`)

  const lines = text.split(/\r?\n/)
  const header = parseCsvLine(lines[0] ?? '').map((h) => h.trim().toLowerCase())
  const col = (needle: string) => header.findIndex((h) => h.includes(needle))
  const iTicker = col('class ticker')
  const iSeries = col('series name')
  const iClass = col('class name')
  const iEntity = col('entity name')
  if (iTicker < 0 || iSeries < 0) throw new Error('SEC series/class dataset: unexpected header')

  const out: Array<{ symbol: string; name: string }> = []
  const seen = new Set<string>()
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const cols = parseCsvLine(line)
    const symbol = cols[iTicker]?.trim().toUpperCase()
    if (!symbol || !/^[A-Z]{4,6}X$/.test(symbol) || seen.has(symbol)) continue // US mutual fund tickers end in X
    const series = cols[iSeries]?.trim()
    const cls = iClass >= 0 ? cols[iClass]?.trim() : ''
    const entity = iEntity >= 0 ? cols[iEntity]?.trim() : ''
    const name = series || entity
    if (!name) continue
    seen.add(symbol)
    out.push({ symbol, name: cls && !/^(class\s)?[a-z0-9]{0,4}$/i.test(cls) ? `${name} — ${cls}` : name })
  }
  return out
}

function skeleton(e: { symbol: string; name: string }, type: FundType): FundUniverseEntry {
  return {
    symbol: e.symbol, name: e.name, type, inCatalog: false,
    category: null, issuer: null, expenseRatioPct: null, aumB: null,
    referencePrice: null, yieldPct: null, inceptionYear: null,
    indexTracked: null, focusSector: null, focusIndustry: null,
    // Nasdaq's traded-symbol file and the SEC series/class CSV carry no issuer
    // URL, so uncurated funds genuinely have none. Better null than a guessed
    // link that 404s.
    website: null,
    strategy: null, riskLevel: null,
    // Mutual funds get the honest generic policy note even without curation.
    tradingRestriction: type === 'mutual' ? fundTradingRestriction({ tradingRestriction: undefined, type, issuer: '' }) : null,
  }
}

export async function GET(request: Request) {
  const base = { updatedAt: new Date().toISOString() }
  const catalog = FUND_CATALOG.map(catalogEntry)
  const known = new Set(catalog.map((c) => c.symbol))
  const symbolParam = new URL(request.url).searchParams.get('symbol')?.trim().toUpperCase() || null
  const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase() || null

  // Search mode: substring over symbol+name, catalog first (it has the richer
  // rows and vetted names), then both live directories. The directory fetches
  // are day-cached, so this is a filter over cached data, not a new download.
  if (q && !symbolParam) {
    const out: FundUniverseEntry[] = []
    const seen = new Set<string>()
    const push = (e: FundUniverseEntry) => {
      if (!seen.has(e.symbol) && out.length < 10) { seen.add(e.symbol); out.push(e) }
    }
    for (const c of catalog) {
      if (c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)) push(c)
    }
    if (out.length < 10) {
      const [etfRes, mfRes] = await Promise.allSettled([fetchNasdaqEtfs(), fetchSecMutualFunds()])
      if (etfRes.status === 'fulfilled') {
        for (const e of etfRes.value) {
          if (e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)) push(skeleton(e, 'etf'))
        }
      }
      if (mfRes.status === 'fulfilled') {
        for (const e of mfRes.value) {
          if (e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)) push(skeleton(e, 'mutual'))
        }
      }
    }
    return NextResponse.json({
      ok: true, ...base, source: 'live',
      discovered: out.filter((e) => !e.inCatalog).length,
      discoveredEtfs: out.filter((e) => !e.inCatalog && e.type === 'etf').length,
      discoveredMutual: out.filter((e) => !e.inCatalog && e.type === 'mutual').length,
      etfError: null, mutualError: null, entries: out,
    } satisfies FundUniverseResponse)
  }

  if (symbolParam) {
    const single = (entry: FundUniverseEntry | null, source: 'live' | 'catalog'): NextResponse =>
      NextResponse.json({
        ok: true, ...base, source, discovered: entry && !entry.inCatalog ? 1 : 0,
        discoveredEtfs: entry && !entry.inCatalog && entry.type === 'etf' ? 1 : 0,
        discoveredMutual: entry && !entry.inCatalog && entry.type === 'mutual' ? 1 : 0,
        etfError: null, mutualError: null,
        entries: entry ? [entry] : [],
      } satisfies FundUniverseResponse)

    const cat = catalog.find((c) => c.symbol === symbolParam)
    if (cat) return single(cat, 'catalog')

    // Mutual fund tickers end in X — check the matching directory first, then the other.
    const looksMutual = /^[A-Z]{4,6}X$/.test(symbolParam)
    const lookups: Array<() => Promise<FundUniverseEntry | null>> = [
      async () => {
        const hit = (await fetchNasdaqEtfs()).find((e) => e.symbol === symbolParam)
        return hit ? skeleton(hit, 'etf') : null
      },
      async () => {
        const hit = (await fetchSecMutualFunds()).find((e) => e.symbol === symbolParam)
        return hit ? skeleton(hit, 'mutual') : null
      },
    ]
    if (looksMutual) lookups.reverse()
    for (const lookup of lookups) {
      try {
        const hit = await lookup()
        if (hit) return single(hit, 'live')
      } catch { /* directory unreachable — try the other */ }
    }
    return single(null, 'live')
  }

  const [etfRes, mfRes] = await Promise.allSettled([fetchNasdaqEtfs(), fetchSecMutualFunds()])
  const reason = (r: PromiseSettledResult<unknown>): string | null =>
    r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : null
  const etfError = reason(etfRes)
  const mutualError = reason(mfRes)
  // Compact form on the full-universe path — see DiscoveredFund. The skeleton
  // expansion happens client-side; sending it over the wire ~30k times is the
  // 14 MB this shape replaced.
  const etfs = etfRes.status === 'fulfilled'
    ? etfRes.value.filter((e) => !known.has(e.symbol))
    : []
  const etfSymbols = new Set(etfs.map((e) => e.symbol))
  const mutuals = mfRes.status === 'fulfilled'
    ? mfRes.value.filter((e) => !known.has(e.symbol) && !etfSymbols.has(e.symbol))
    : []

  if (etfs.length === 0 && mutuals.length === 0) {
    return NextResponse.json({
      ok: true, ...base, source: 'catalog', discovered: 0, discoveredEtfs: 0, discoveredMutual: 0,
      etfError, mutualError, entries: catalog,
    } satisfies FundUniverseResponse)
  }
  return NextResponse.json({
    ok: true, ...base, source: 'live',
    discovered: etfs.length + mutuals.length,
    discoveredEtfs: etfs.length, discoveredMutual: mutuals.length,
    etfError, mutualError,
    entries: catalog,
    discoveredEtfList: etfs,
    discoveredMutualList: mutuals,
  } satisfies FundUniverseResponse)
}
