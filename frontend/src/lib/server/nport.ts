// SEC EDGAR N-PORT plumbing — the authoritative, keyless source for fund
// holdings. Every registered fund files form NPORT-P; the public filing
// discloses the complete portfolio (name, CUSIP/ISIN/ticker, shares, value,
// % of net assets) as of the last month of each fiscal quarter, ~60 days
// delayed. Free and definitive, unlike key-gated aggregator APIs.
//
// Flow: ticker → series id (company_tickers_mf.json) → NPORT-P filings for
// that series (browse-edgar atom) → primary_doc.xml → parsed holdings.

import { EDGAR_HEADERS } from './edgar'

export interface FundSeries {
  seriesId: string
  classId: string
}

export interface NportFilingRef {
  accession: string
  cik: string
  /** Filing date (the report period inside is ~2 months earlier). */
  filedAt: string
}

export interface NportHolding {
  /** Exchange ticker when disclosed; many debt instruments have none. */
  ticker: string | null
  name: string
  cusip: string | null
  isin: string | null
  /** Shares/units held (N-PORT "balance"). */
  balance: number | null
  /** Position value in USD. */
  valueUsd: number | null
  /** Percent of net assets (0–100). */
  pctVal: number | null
  /**
   * N-PORT `assetCat` code for the position — 'EC' (equity-common), 'EP'
   * (equity-preferred), 'DBT' (debt), 'STIV' (short-term investment vehicle),
   * 'RA' (repurchase agreement), 'DE' (derivative), and so on. Null when the
   * filer omits it, which happens on derivative blocks that carry the category
   * on a nested element instead.
   *
   * Added 2026-08-18 for NT9: this is the field the stock/bond/cash mix is
   * derived from, keylessly, from a filing the app already fetches.
   */
  assetCat: string | null
}

export interface NportReport {
  /** Portfolio as-of date (repPdDate), YYYY-MM-DD. */
  asOf: string | null
  holdings: NportHolding[]
}

/** Resolve a fund ticker to its EDGAR series/class ids via the SEC's mutual-fund
 *  ticker map (covers ETFs and mutual funds — both are series/class registrants). */
export async function resolveFundSeries(symbol: string): Promise<FundSeries | null> {
  const res = await fetch('https://www.sec.gov/files/company_tickers_mf.json', {
    headers: EDGAR_HEADERS,
    next: { revalidate: 86_400 },
  })
  if (!res.ok) throw new Error(`SEC MF ticker map: HTTP ${res.status}`)
  const payload = await res.json() as { fields?: string[]; data?: Array<Array<string | number>> }
  const fields = payload.fields ?? []
  const iSeries = fields.indexOf('seriesId')
  const iClass = fields.indexOf('classId')
  const iSymbol = fields.indexOf('symbol')
  if (iSeries < 0 || iSymbol < 0) return null
  const wanted = symbol.toUpperCase()
  for (const row of payload.data ?? []) {
    if (String(row[iSymbol]).toUpperCase() === wanted) {
      return { seriesId: String(row[iSeries]), classId: iClass >= 0 ? String(row[iClass]) : '' }
    }
  }
  return null
}

/** List recent NPORT-P filings for a series, newest first. browse-edgar accepts
 *  a series id in the CIK slot and returns that series' filings as Atom XML. */
export async function listNportFilings(seriesId: string, limit = 12): Promise<NportFilingRef[]> {
  const params = new URLSearchParams({
    action: 'getcompany', CIK: seriesId, type: 'NPORT-P',
    dateb: '', owner: 'include', count: String(Math.min(limit, 40)), output: 'atom',
  })
  const res = await fetch(`https://www.sec.gov/cgi-bin/browse-edgar?${params}`, {
    headers: { ...EDGAR_HEADERS, Accept: 'application/atom+xml' },
    next: { revalidate: 21_600 },
  })
  if (!res.ok) throw new Error(`EDGAR browse: HTTP ${res.status}`)
  return parseNportFilingsAtom(await res.text(), limit)
}

/** Parse a browse-edgar Atom listing into filing refs. Pure — regex-based, so
 *  malformed input yields fewer rows rather than a throw. */
export function parseNportFilingsAtom(xml: string, limit = 12): NportFilingRef[] {
  const filings: NportFilingRef[] = []
  const entries = xml.split(/<entry>/).slice(1)
  for (const entry of entries) {
    const accession = entry.match(/<accession-n(?:umbe)?r>\s*([\d-]+)\s*</)?.[1]
      ?? entry.match(/accession[-_]number=([\d-]+)/)?.[1]
    const filedAt = entry.match(/<filing-date>\s*([\d-]+)\s*</)?.[1] ?? null
    // The archive CIK is the trust's, not the series'; recover it from the index link.
    const cik = entry.match(/Archives\/edgar\/data\/(\d+)\//)?.[1] ?? null
    if (accession && cik) {
      filings.push({ accession, cik, filedAt: filedAt ?? '' })
    }
  }
  // Atom is newest-first already; dedupe on accession just in case.
  const seen = new Set<string>()
  return filings.filter((f) => !seen.has(f.accession) && seen.add(f.accession)).slice(0, limit)
}

const num = (s: string | undefined): number | null => {
  if (s == null) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

const tag = (block: string, name: string): string | undefined =>
  block.match(new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`))?.[1]

const attr = (block: string, name: string): string | undefined =>
  block.match(new RegExp(`<${name}[^>]*\\bvalue="([^"]*)"`))?.[1]

/** Fetch and parse one NPORT-P primary document into holdings. */
export async function fetchNportReport(ref: NportFilingRef): Promise<NportReport> {
  const adsh = ref.accession.replace(/-/g, '')
  const url = `https://www.sec.gov/Archives/edgar/data/${ref.cik}/${adsh}/primary_doc.xml`
  const res = await fetch(url, {
    headers: { ...EDGAR_HEADERS, Accept: 'application/xml' },
    next: { revalidate: 86_400 }, // filings are immutable
  })
  if (!res.ok) throw new Error(`EDGAR filing: HTTP ${res.status}`)
  return parseNportReport(await res.text())
}

/** Parse an NPORT-P primary document into holdings. Pure — regex-based, so
 *  malformed input yields empty/partial results rather than a throw. */
export function parseNportReport(xml: string): NportReport {
  const asOf = xml.match(/<repPdDate>\s*([\d-]+)\s*<\/repPdDate>/)?.[1] ?? null

  const holdings: NportHolding[] = []
  const blocks = xml.split(/<invstOrSec>/).slice(1)
  for (const raw of blocks) {
    const block = raw.split(/<\/invstOrSec>/)[0]
    const name = tag(block, 'name') ?? tag(block, 'title') ?? 'Unknown'
    const cusipRaw = tag(block, 'cusip')
    // EDGAR uses sentinel strings for missing identifiers
    const cusip = cusipRaw && !/^(N\/A|0{9})$/i.test(cusipRaw) ? cusipRaw : null
    const isin = attr(block, 'isin') ?? null
    const tickerRaw = attr(block, 'ticker') ?? null
    const ticker = tickerRaw && /^[A-Za-z.-]{1,10}$/.test(tickerRaw) ? tickerRaw.toUpperCase() : null
    holdings.push({
      ticker, name, cusip, isin,
      balance: num(tag(block, 'balance')),
      valueUsd: num(tag(block, 'valUSD')),
      pctVal: num(tag(block, 'pctVal')),
      assetCat: tag(block, 'assetCat')?.trim().toUpperCase() || null,
    })
  }
  return { asOf, holdings }
}
