// Parsing for the IPO calendar feed. Pure — no fetching, so the awkward parts
// are testable.
//
// SOURCE: Alpha Vantage's IPO_CALENDAR (free tier, key required). It returns
// CSV, not JSON, and its failure modes look nothing like its success modes —
// which is most of why this file exists.
//
// Verified live 2026-09-03:
//   symbol,name,ipoDate,priceRangeLow,priceRangeHigh,currency,exchange
//   JONE,Jones Energy Inc,2026-09-03,0,0,USD,NASDAQ
//   PTT,Ptt PCL,2026-09-08,0,0,USD,NASDAQ

/** One expected listing. */
export interface IpoEvent {
  symbol: string
  name: string
  /** YYYY-MM-DD. Expected, not settled — issuers move and pull these dates. */
  ipoDate: string
  /**
   * Indicated price range, or null when the issuer has not set one.
   *
   * The feed writes an unset range as `0` — see the verified sample above,
   * where every row is `0,0`. Zero is NOT a price: rendering "$0.00 – $0.00"
   * would state a fact the filing does not contain, and rendering "$0" as a
   * range floor is worse. Unset must reach the UI as null so it can say so.
   */
  priceRangeLow: number | null
  priceRangeHigh: number | null
  currency: string | null
  exchange: string | null
}

export type IpoParseOutcome =
  | { ok: true; events: IpoEvent[] }
  /**
   * The provider answered, but not with data.
   *
   * `rate-limited` is separated from every other failure on purpose: Alpha
   * Vantage's free tier is 25 requests/day (a documented CONDITION of its terms
   * entry, not just a quota), and when exceeded it returns HTTP 200 carrying a
   * JSON note rather than an error status. Reported as an empty calendar that
   * would read as "no IPOs are coming", which is a factual claim about the
   * market rather than about our quota.
   */
  | { ok: false; reason: 'rate-limited' | 'provider-message' | 'unparseable'; detail: string }

/** Header the feed is expected to emit, lower-cased for comparison. */
const EXPECTED_HEADER = ['symbol', 'name', 'ipodate', 'pricerangelow', 'pricerangehigh', 'currency', 'exchange']

function num(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === '') return null
  const n = Number(raw)
  // Zero means "not set" for this feed, so it is null rather than a price.
  // Negative would be nonsense; NaN means the column moved.
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Parse an IPO_CALENDAR response body.
 *
 * Takes the raw text because the provider's content type does not distinguish
 * its CSV success from its JSON failures.
 */
export function parseIpoCalendar(body: string): IpoParseOutcome {
  const text = (body ?? '').trim()
  if (!text) return { ok: false, reason: 'unparseable', detail: 'empty response body' }

  // Alpha Vantage signals throttling and key problems as JSON, with HTTP 200.
  if (text.startsWith('{')) {
    let msg = text.slice(0, 300)
    try {
      const j = JSON.parse(text) as Record<string, string>
      msg = j.Information ?? j.Note ?? j['Error Message'] ?? msg
    } catch { /* keep the raw prefix */ }
    const throttled = /rate limit|per day|higher API call|premium|frequency/i.test(msg)
    return {
      ok: false,
      reason: throttled ? 'rate-limited' : 'provider-message',
      detail: msg,
    }
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return { ok: false, reason: 'unparseable', detail: 'no lines' }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  // Column ORDER is not assumed — resolved by name, so a reordered feed keeps
  // working and a renamed one fails loudly instead of reading the wrong column.
  const idx = Object.fromEntries(EXPECTED_HEADER.map((h) => [h, header.indexOf(h)]))
  for (const required of ['symbol', 'ipodate'] as const) {
    if (idx[required] < 0) {
      return { ok: false, reason: 'unparseable', detail: `missing "${required}" column; header was: ${lines[0]}` }
    }
  }

  const events: IpoEvent[] = []
  for (const line of lines.slice(1)) {
    const c = line.split(',')
    const symbol = c[idx.symbol]?.trim()
    const ipoDate = c[idx.ipodate]?.trim()
    // A row with no symbol or no date is not an event. Skipped, not defaulted:
    // a calendar entry with an invented date is worse than one fewer row.
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(ipoDate ?? '')) continue
    events.push({
      symbol,
      name: (idx.name >= 0 ? c[idx.name]?.trim() : '') || symbol,
      ipoDate,
      priceRangeLow: idx.pricerangelow >= 0 ? num(c[idx.pricerangelow]) : null,
      priceRangeHigh: idx.pricerangehigh >= 0 ? num(c[idx.pricerangehigh]) : null,
      currency: (idx.currency >= 0 ? c[idx.currency]?.trim() : '') || null,
      exchange: (idx.exchange >= 0 ? c[idx.exchange]?.trim() : '') || null,
    })
  }

  events.sort((a, b) => a.ipoDate.localeCompare(b.ipoDate) || a.symbol.localeCompare(b.symbol))
  return { ok: true, events }
}

/**
 * Human-readable price range, or null when the issuer has not set one.
 * Never renders a zero bound — see IpoEvent.priceRangeLow.
 */
export function formatIpoPriceRange(e: Pick<IpoEvent, 'priceRangeLow' | 'priceRangeHigh' | 'currency'>): string | null {
  const cur = e.currency === 'USD' || !e.currency ? '$' : `${e.currency} `
  if (e.priceRangeLow != null && e.priceRangeHigh != null) {
    return e.priceRangeLow === e.priceRangeHigh
      ? `${cur}${e.priceRangeLow.toFixed(2)}`
      : `${cur}${e.priceRangeLow.toFixed(2)}–${cur}${e.priceRangeHigh.toFixed(2)}`
  }
  const one = e.priceRangeLow ?? e.priceRangeHigh
  return one != null ? `${cur}${one.toFixed(2)}` : null
}
