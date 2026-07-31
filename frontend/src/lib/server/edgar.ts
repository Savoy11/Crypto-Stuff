// Shared SEC EDGAR plumbing for the live-data routes
// (https://www.sec.gov/search-filings/edgar-application-programming-interfaces)

// EDGAR requires a descriptive User-Agent identifying the requester
export const EDGAR_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Finance Now Free research dashboard (marcusowens94@gmail.com)',
}

interface TickerMapEntry { cik_str: number; ticker: string; title: string }

export interface CikEntry {
  /** Numeric CIK, as the XBRL frames API reports it. */
  cikNum: number
  /** Zero-padded 10-digit CIK, as submissions/archive paths expect it. */
  cik: string
  company: string
}

/**
 * The SEC's full ticker → CIK map (~10k US registrants), keyed by uppercase
 * ticker. Bulk callers should use this rather than looping `resolveCik`, which
 * re-scans the whole map per symbol.
 */
export async function fetchTickerCikMap(): Promise<Map<string, CikEntry>> {
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: EDGAR_HEADERS,
    next: { revalidate: 86_400 }, // ticker→CIK mapping changes rarely
  })
  if (!res.ok) throw new Error(`SEC ticker map: HTTP ${res.status}`)
  const map = await res.json() as Record<string, TickerMapEntry>

  const out = new Map<string, CikEntry>()
  for (const entry of Object.values(map)) {
    if (!entry?.ticker) continue
    out.set(entry.ticker.toUpperCase(), {
      cikNum: entry.cik_str,
      cik: String(entry.cik_str).padStart(10, '0'),
      company: entry.title,
    })
  }
  return out
}

/** Resolve a ticker to its zero-padded 10-digit CIK via the SEC's ticker map. */
export async function resolveCik(symbol: string): Promise<{ cik: string; company: string } | null> {
  const map = await fetchTickerCikMap()
  const entry = map.get(symbol.toUpperCase())
  return entry ? { cik: entry.cik, company: entry.company } : null
}
