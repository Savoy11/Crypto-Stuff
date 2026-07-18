import { NextRequest, NextResponse } from 'next/server'
import { EDGAR_HEADERS, resolveCik } from '@/lib/server/edgar'

export const dynamic = 'force-dynamic'

// Company profile: structured registrant metadata from the SEC EDGAR
// submissions feed (SIC industry classification, HQ, incorporation, fiscal
// year end, exchanges, former names) plus an optional Wikipedia summary for
// general background. GET /live-data/company-profile?symbol=NVDA&name=NVIDIA

export interface CompanyProfile {
  company: string
  sic: string | null
  sicDescription: string | null      // SEC's official industry classification
  stateOfIncorporation: string | null
  fiscalYearEnd: string | null       // formatted, e.g. "Sep 27"
  headquarters: string | null        // "Santa Clara, CA"
  phone: string | null
  exchanges: string[]
  filerCategory: string | null       // e.g. "Large accelerated filer"
  formerNames: Array<{ name: string; from: string | null; to: string | null }>
}

export interface WikiSummary {
  title: string
  extract: string
  url: string | null
}

export interface CompanyProfileResponse {
  ok: boolean
  symbol: string
  cik: string | null
  profile: CompanyProfile | null
  wiki: WikiSummary | null
  updatedAt: string
  source: string
  error?: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatFiscalYearEnd(mmdd: string | undefined): string | null {
  if (!mmdd || !/^\d{4}$/.test(mmdd)) return null
  const month = parseInt(mmdd.slice(0, 2), 10)
  if (month < 1 || month > 12) return null
  return `${MONTHS[month - 1]} ${parseInt(mmdd.slice(2), 10)}`
}

const WIKI_HEADERS = { Accept: 'application/json', 'User-Agent': 'CAEP research dashboard (marcusowens94@gmail.com)' }

/** Best-effort Wikipedia summary — search for the article, then fetch its summary. Fail-silent. */
async function fetchWikiSummary(name: string): Promise<WikiSummary | null> {
  try {
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(name)}&limit=1`,
      { headers: WIKI_HEADERS, next: { revalidate: 86_400 } }
    )
    if (!searchRes.ok) return null
    const search = await searchRes.json() as { pages?: Array<{ key: string }> }
    const key = search.pages?.[0]?.key
    if (!key) return null

    const sumRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`,
      { headers: WIKI_HEADERS, next: { revalidate: 86_400 } }
    )
    if (!sumRes.ok) return null
    const sum = await sumRes.json() as {
      title?: string; extract?: string; type?: string
      content_urls?: { desktop?: { page?: string } }
    }
    if (!sum.extract || sum.type === 'disambiguation') return null
    return {
      title: sum.title ?? key,
      extract: sum.extract.length > 600 ? `${sum.extract.slice(0, 600).replace(/\s+\S*$/, '')}…` : sum.extract,
      url: sum.content_urls?.desktop?.page ?? null,
    }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? '').trim().toUpperCase()
  const name = (req.nextUrl.searchParams.get('name') ?? '').trim() // display name for the Wikipedia lookup

  const fail = (status: number, error: string) => NextResponse.json(
    {
      ok: false, symbol, cik: null, profile: null, wiki: null,
      updatedAt: new Date().toISOString(), source: 'SEC EDGAR + Wikipedia', error,
    } satisfies CompanyProfileResponse,
    { status }
  )

  if (!symbol) return fail(400, 'symbol required')

  try {
    const resolved = await resolveCik(symbol)
    if (!resolved) return fail(404, `No SEC registrant found for ticker ${symbol}`)
    const { cik } = resolved

    // Same submissions document the filings feed uses — the data cache dedupes the fetch
    const [subRes, wiki] = await Promise.all([
      fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: EDGAR_HEADERS,
        next: { revalidate: 900 },
      }),
      fetchWikiSummary(name || resolved.company),
    ])
    if (!subRes.ok) return fail(503, `SEC submissions feed: HTTP ${subRes.status}`)
    const sub = await subRes.json() as {
      name?: string
      sic?: string
      sicDescription?: string
      stateOfIncorporationDescription?: string
      fiscalYearEnd?: string
      phone?: string
      category?: string
      exchanges?: string[]
      formerNames?: Array<{ name: string; from?: string; to?: string }>
      addresses?: { business?: { city?: string; stateOrCountryDescription?: string } }
    }

    const biz = sub.addresses?.business
    const profile: CompanyProfile = {
      company: sub.name ?? resolved.company,
      sic: sub.sic ?? null,
      sicDescription: sub.sicDescription ?? null,
      stateOfIncorporation: sub.stateOfIncorporationDescription ?? null,
      fiscalYearEnd: formatFiscalYearEnd(sub.fiscalYearEnd),
      headquarters: biz?.city
        ? `${biz.city.replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase())}${biz.stateOrCountryDescription ? `, ${biz.stateOrCountryDescription}` : ''}`
        : null,
      phone: sub.phone ?? null,
      exchanges: [...new Set((sub.exchanges ?? []).filter(Boolean))],
      filerCategory: sub.category?.replace(/<[^>]+>/g, '') ?? null,
      formerNames: (sub.formerNames ?? []).map(f => ({
        name: f.name,
        from: f.from?.slice(0, 10) ?? null,
        to: f.to?.slice(0, 10) ?? null,
      })),
    }

    return NextResponse.json({
      ok: true, symbol, cik, profile, wiki,
      updatedAt: new Date().toISOString(), source: 'SEC EDGAR + Wikipedia',
    } satisfies CompanyProfileResponse)
  } catch (e) {
    return fail(503, e instanceof Error ? e.message : 'SEC EDGAR unreachable')
  }
}
