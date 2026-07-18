// Shared SEC EDGAR plumbing for the live-data routes
// (https://www.sec.gov/search-filings/edgar-application-programming-interfaces)

// EDGAR requires a descriptive User-Agent identifying the requester
export const EDGAR_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'CAEP research dashboard (marcusowens94@gmail.com)',
}

interface TickerMapEntry { cik_str: number; ticker: string; title: string }

/** Resolve a ticker to its zero-padded 10-digit CIK via the SEC's ticker map. */
export async function resolveCik(symbol: string): Promise<{ cik: string; company: string } | null> {
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: EDGAR_HEADERS,
    next: { revalidate: 86_400 }, // ticker→CIK mapping changes rarely
  })
  if (!res.ok) throw new Error(`SEC ticker map: HTTP ${res.status}`)
  const map = await res.json() as Record<string, TickerMapEntry>
  const wanted = symbol.toUpperCase()
  for (const entry of Object.values(map)) {
    if (entry.ticker === wanted) {
      return { cik: String(entry.cik_str).padStart(10, '0'), company: entry.title }
    }
  }
  return null
}
