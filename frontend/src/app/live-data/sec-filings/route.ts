import { NextRequest, NextResponse } from 'next/server'
import { EDGAR_HEADERS, resolveCik } from '@/lib/server/edgar'

export const dynamic = 'force-dynamic'

// SEC EDGAR filing feed (https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
//   GET /live-data/sec-filings?symbol=AAPL&form=8-K&limit=8
//   GET /live-data/sec-filings?symbol=AAPL&form=10-K,10-Q&limit=20
// Resolves ticker → CIK via the SEC's company_tickers.json, then reads the
// company's submissions feed from data.sec.gov. `form` accepts a comma-
// separated list of form prefixes ('' = all forms). The recent feed covers the
// last ~1,000 filings; when a request needs more history the route walks the
// immutable archive pages (filings.files), which reach back to the 1990s.

export interface SecFiling {
  form: string
  filedAt: string           // YYYY-MM-DD
  reportDate: string | null // event/period date the filing covers
  accessionNumber: string
  items: string[]           // raw 8-K item codes, e.g. ["2.02", "9.01"]
  itemLabels: string[]      // human-readable labels for those codes
  url: string               // primary document (falls back to the filing index)
}

export interface SecFilingsResponse {
  ok: boolean
  symbol: string
  cik: string | null
  company: string | null
  filings: SecFiling[]
  /** More matching filings exist beyond `limit` (deeper history available). */
  hasMore: boolean
  updatedAt: string
  source: string
  error?: string
}

// Official 8-K item codes → what the event actually is
const ITEM_LABELS: Record<string, string> = {
  '1.01': 'Material agreement',
  '1.02': 'Agreement terminated',
  '1.03': 'Bankruptcy / receivership',
  '1.05': 'Material cybersecurity incident',
  '2.01': 'Acquisition or disposition completed',
  '2.02': 'Results of operations (earnings)',
  '2.03': 'New financial obligation',
  '2.04': 'Obligation acceleration event',
  '2.05': 'Exit / disposal costs',
  '2.06': 'Material impairment',
  '3.01': 'Listing standard notice',
  '3.02': 'Unregistered securities sale',
  '3.03': 'Security holder rights modified',
  '4.01': 'Auditor change',
  '4.02': 'Non-reliance on prior financials',
  '5.01': 'Change in control',
  '5.02': 'Director / officer change',
  '5.03': 'Charter or bylaw amendment',
  '5.05': 'Code of ethics change',
  '5.07': 'Shareholder vote results',
  '5.08': 'Shareholder director nominations',
  '7.01': 'Regulation FD disclosure',
  '8.01': 'Other events',
  '9.01': 'Financial statements & exhibits',
}

/** Parallel-array filing block — shape of both filings.recent and each archive page. */
interface FilingBlock {
  form: string[]
  filingDate: string[]
  reportDate: string[]
  accessionNumber: string[]
  primaryDocument: string[]
  items?: string[]
}

function collectMatches(
  block: FilingBlock,
  formPrefixes: string[],
  cikNum: string,
  out: SecFiling[],
  max: number
): void {
  for (let i = 0; i < block.form.length && out.length < max; i++) {
    if (formPrefixes.length > 0 && !formPrefixes.some(p => block.form[i].startsWith(p))) continue
    const accession = block.accessionNumber[i]
    const accessionPath = accession.replace(/-/g, '')
    const primaryDoc = block.primaryDocument[i]
    const items = (block.items?.[i] ?? '').split(',').map(s => s.trim()).filter(Boolean)
    out.push({
      form: block.form[i],
      filedAt: block.filingDate[i],
      reportDate: block.reportDate[i] || null,
      accessionNumber: accession,
      items,
      itemLabels: items.map(code => ITEM_LABELS[code] ?? `Item ${code}`),
      url: primaryDoc
        ? `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionPath}/${primaryDoc}`
        : `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionPath}/${accession}-index.htm`,
    })
  }
}

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? '').trim().toUpperCase()
  const formPrefixes = (req.nextUrl.searchParams.get('form') ?? '8-K')
    .split(',').map(s => s.trim()).filter(Boolean)
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '8', 10)))

  const fail = (status: number, error: string) => NextResponse.json(
    {
      ok: false, symbol, cik: null, company: null, filings: [], hasMore: false,
      updatedAt: new Date().toISOString(), source: 'SEC EDGAR', error,
    } satisfies SecFilingsResponse,
    { status }
  )

  if (!symbol) return fail(400, 'symbol required')

  try {
    const resolved = await resolveCik(symbol)
    if (!resolved) return fail(404, `No SEC registrant found for ticker ${symbol}`)
    const { cik, company } = resolved

    const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: EDGAR_HEADERS,
      next: { revalidate: 900 },
    })
    if (!res.ok) return fail(503, `SEC submissions feed: HTTP ${res.status}`)
    const data = await res.json() as {
      filings?: { recent?: FilingBlock; files?: Array<{ name: string }> }
    }
    const recent = data.filings?.recent
    if (!recent?.form) return fail(503, 'SEC submissions feed returned no filings')

    const cikNum = String(parseInt(cik, 10)) // archive paths use the unpadded CIK
    // Collect one past the limit so hasMore is exact for the scanned range
    const wanted = limit + 1
    const collected: SecFiling[] = []
    collectMatches(recent, formPrefixes, cikNum, collected, wanted)

    // Walk older archive pages (immutable, newest-first) until satisfied
    const archives = data.filings?.files ?? []
    let archivesRemaining = archives.length
    for (const file of archives) {
      if (collected.length >= wanted) break
      const archiveRes = await fetch(`https://data.sec.gov/submissions/${file.name}`, {
        headers: EDGAR_HEADERS,
        next: { revalidate: 86_400 },
      })
      archivesRemaining--
      if (!archiveRes.ok) break
      const block = await archiveRes.json() as FilingBlock
      if (Array.isArray(block.form)) collectMatches(block, formPrefixes, cikNum, collected, wanted)
    }

    return NextResponse.json({
      ok: true, symbol, cik, company,
      filings: collected.slice(0, limit),
      hasMore: collected.length > limit || archivesRemaining > 0,
      updatedAt: new Date().toISOString(), source: 'SEC EDGAR',
    } satisfies SecFilingsResponse)
  } catch (e) {
    return fail(503, e instanceof Error ? e.message : 'SEC EDGAR unreachable')
  }
}
