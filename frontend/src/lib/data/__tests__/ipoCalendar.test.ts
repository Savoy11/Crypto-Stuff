import { describe, it, expect } from 'vitest'
import { parseIpoCalendar, formatIpoPriceRange } from '../ipoCalendar'

// The exact body Alpha Vantage returned on 2026-09-03, verified live.
const REAL = `symbol,name,ipoDate,priceRangeLow,priceRangeHigh,currency,exchange
JONE,Jones Energy Inc,2026-09-03,0,0,USD,NASDAQ
PJSM,PGIM ETF Trust,2026-09-03,0,0,USD,NYSE
PTT,Ptt PCL,2026-09-08,0,0,USD,NASDAQ`

describe('parseIpoCalendar', () => {
  it('parses the real feed shape', () => {
    const r = parseIpoCalendar(REAL)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.events).toHaveLength(3)
    expect(r.events[0]).toMatchObject({ symbol: 'JONE', name: 'Jones Energy Inc', exchange: 'NASDAQ' })
  })

  it('reads an unset price range as null, NEVER as $0', () => {
    // Every row in the live sample was 0,0. Rendering "$0.00" would state a
    // price the filing does not contain.
    const r = parseIpoCalendar(REAL)
    if (!r.ok) throw new Error('expected ok')
    for (const e of r.events) {
      expect(e.priceRangeLow).toBeNull()
      expect(e.priceRangeHigh).toBeNull()
    }
  })

  it('keeps a real price range', () => {
    const r = parseIpoCalendar(`symbol,name,ipoDate,priceRangeLow,priceRangeHigh,currency,exchange
ACME,Acme Corp,2026-10-01,17,19,USD,NASDAQ`)
    if (!r.ok) throw new Error('expected ok')
    expect(r.events[0]).toMatchObject({ priceRangeLow: 17, priceRangeHigh: 19 })
  })

  it('sorts by date, then symbol', () => {
    const r = parseIpoCalendar(`symbol,name,ipoDate,priceRangeLow,priceRangeHigh,currency,exchange
ZZZ,Zeta,2026-10-05,0,0,USD,NYSE
AAA,Alpha,2026-10-05,0,0,USD,NYSE
MMM,Mid,2026-09-30,0,0,USD,NYSE`)
    if (!r.ok) throw new Error('expected ok')
    expect(r.events.map((e) => e.symbol)).toEqual(['MMM', 'AAA', 'ZZZ'])
  })

  it('resolves columns by NAME, so a reordered feed still parses', () => {
    const r = parseIpoCalendar(`exchange,ipoDate,symbol,name,currency,priceRangeHigh,priceRangeLow
NYSE,2026-11-02,BETA,Beta Inc,USD,21,19`)
    if (!r.ok) throw new Error('expected ok')
    expect(r.events[0]).toMatchObject({ symbol: 'BETA', ipoDate: '2026-11-02', priceRangeLow: 19, priceRangeHigh: 21 })
  })

  it('fails loudly when a required column is renamed, rather than reading the wrong one', () => {
    const r = parseIpoCalendar(`ticker,name,ipoDate\nACME,Acme,2026-10-01`)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('unparseable')
    expect(r.detail).toMatch(/symbol/)
  })

  it('skips rows with no symbol or no valid date, rather than inventing one', () => {
    const r = parseIpoCalendar(`symbol,name,ipoDate,priceRangeLow,priceRangeHigh,currency,exchange
,Nameless,2026-10-01,0,0,USD,NYSE
GOOD,Good Co,2026-10-02,0,0,USD,NYSE
BAD,Bad Date,not-a-date,0,0,USD,NYSE
ALSO,Empty Date,,0,0,USD,NYSE`)
    if (!r.ok) throw new Error('expected ok')
    expect(r.events.map((e) => e.symbol)).toEqual(['GOOD'])
  })

  // ── The failure modes that matter ──────────────────────────────────────────
  it('reports a rate-limit note as RATE-LIMITED, not as an empty calendar', () => {
    // Alpha Vantage returns HTTP 200 with this body when the free tier's 25
    // requests/day is exceeded. An empty calendar would read as "no IPOs are
    // coming" — a claim about the market instead of about our quota.
    const r = parseIpoCalendar(JSON.stringify({
      Information: 'We have detected your API key ... our standard API rate limit is 25 requests per day.',
    }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('rate-limited')
    expect(r.detail).toMatch(/25 requests per day/)
  })

  it('treats a premium-endpoint note as rate-limited too', () => {
    const r = parseIpoCalendar(JSON.stringify({ Information: 'This is a premium endpoint.' }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('rate-limited')
  })

  it('reports an invalid-key message as a provider message, distinctly', () => {
    const r = parseIpoCalendar(JSON.stringify({ 'Error Message': 'Invalid API call.' }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('provider-message')
    expect(r.detail).toBe('Invalid API call.')
  })

  it('handles empty and junk bodies without throwing', () => {
    expect(parseIpoCalendar('').ok).toBe(false)
    expect(parseIpoCalendar('   ').ok).toBe(false)
    expect(parseIpoCalendar('<html>502</html>').ok).toBe(false)
  })

  it('returns an EMPTY list, not an error, for a header with no rows', () => {
    // A genuinely quiet calendar is a real answer and must be distinguishable
    // from a failure.
    const r = parseIpoCalendar('symbol,name,ipoDate,priceRangeLow,priceRangeHigh,currency,exchange')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.events).toEqual([])
  })
})

describe('formatIpoPriceRange', () => {
  it('returns null when no range is set — the caller must say so in words', () => {
    expect(formatIpoPriceRange({ priceRangeLow: null, priceRangeHigh: null, currency: 'USD' })).toBeNull()
  })

  it('formats a two-sided range', () => {
    expect(formatIpoPriceRange({ priceRangeLow: 17, priceRangeHigh: 19, currency: 'USD' })).toBe('$17.00–$19.00')
  })

  it('collapses an equal range to one price', () => {
    expect(formatIpoPriceRange({ priceRangeLow: 18, priceRangeHigh: 18, currency: 'USD' })).toBe('$18.00')
  })

  it('handles a one-sided range', () => {
    expect(formatIpoPriceRange({ priceRangeLow: null, priceRangeHigh: 19, currency: 'USD' })).toBe('$19.00')
  })

  it('labels a non-USD currency instead of assuming dollars', () => {
    expect(formatIpoPriceRange({ priceRangeLow: 10, priceRangeHigh: 12, currency: 'EUR' })).toBe('EUR 10.00–EUR 12.00')
  })
})
