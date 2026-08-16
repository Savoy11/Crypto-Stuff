import { describe, it, expect } from 'vitest'
import { parseNportReport, parseNportFilingsAtom } from '../nport'

// The N-PORT primary_doc.xml and browse-edgar Atom parsers are regex-based:
// malformed input must degrade to fewer/empty rows, never an uncaught throw,
// because one bad filing would otherwise 503 a diff that other filings could
// still serve.

const sec = (inner: string) => `<invstOrSec>${inner}</invstOrSec>`

const APPLE = sec(`
  <name>Apple Inc</name>
  <cusip>037833100</cusip>
  <identifiers>
    <isin value="US0378331005"/>
    <ticker value="aapl"/>
  </identifiers>
  <balance>1200.5</balance>
  <valUSD>250000.75</valUSD>
  <pctVal>6.53</pctVal>
`)

describe('parseNportReport', () => {
  it('extracts as-of date, identifiers, balance, value, and weight', () => {
    const report = parseNportReport(`
      <edgarSubmission>
        <genInfo><repPdDate>2026-03-31</repPdDate></genInfo>
        ${APPLE}
      </edgarSubmission>
    `)
    expect(report.asOf).toBe('2026-03-31')
    expect(report.holdings).toHaveLength(1)
    expect(report.holdings[0]).toEqual({
      ticker: 'AAPL', // uppercased
      name: 'Apple Inc',
      cusip: '037833100',
      isin: 'US0378331005',
      balance: 1200.5,
      valueUsd: 250000.75,
      pctVal: 6.53,
    })
  })

  it('nulls out EDGAR sentinel and invalid identifiers', () => {
    const report = parseNportReport([
      sec('<name>Bond A</name><cusip>N/A</cusip><pctVal>1</pctVal>'),
      sec('<name>Bond B</name><cusip>000000000</cusip><pctVal>1</pctVal>'),
      // Digits and over-long strings fail the ticker shape check
      sec('<name>Odd</name><identifiers><ticker value="123ABC"/></identifiers><pctVal>1</pctVal>'),
    ].join(''))
    expect(report.holdings.map((h) => h.cusip)).toEqual([null, null, null])
    expect(report.holdings[2].ticker).toBeNull()
  })

  it('falls back to title, then Unknown, for the name and null for missing numbers', () => {
    const report = parseNportReport(
      sec('<title>Repo Agreement</title>') + sec('<pctVal>not-a-number</pctVal>'),
    )
    expect(report.holdings[0].name).toBe('Repo Agreement')
    expect(report.holdings[1].name).toBe('Unknown')
    expect(report.holdings[1].pctVal).toBeNull()
    expect(report.holdings[1].balance).toBeNull()
  })

  it('does not throw on malformed or truncated XML', () => {
    expect(() => parseNportReport('')).not.toThrow()
    expect(() => parseNportReport('<<<not xml >>>')).not.toThrow()
    // A truncated tag never matches (the regex needs the closing tag), so the
    // row degrades to Unknown rather than throwing.
    const truncated = parseNportReport('<invstOrSec><name>Cut off')
    expect(truncated.asOf).toBeNull()
    expect(truncated.holdings).toHaveLength(1)
    expect(truncated.holdings[0].name).toBe('Unknown')
    expect(parseNportReport('no securities here').holdings).toEqual([])
  })
})

const entry = (accession: string, date: string, cik: string) => `
  <entry>
    <accession-number>${accession}</accession-number>
    <filing-date>${date}</filing-date>
    <link href="https://www.sec.gov/Archives/edgar/data/${cik}/000123456789/index.htm"/>
  </entry>`

describe('parseNportFilingsAtom', () => {
  it('extracts accession, filed date, and the trust CIK from the archive link', () => {
    const filings = parseNportFilingsAtom(`<feed>${entry('0001234567-26-000001', '2026-05-28', '884394')}</feed>`)
    expect(filings).toEqual([
      { accession: '0001234567-26-000001', cik: '884394', filedAt: '2026-05-28' },
    ])
  })

  it('dedupes repeated accessions and applies the limit', () => {
    const xml = `<feed>${entry('0001-26-000001', '2026-05-28', '1')}${entry('0001-26-000001', '2026-05-28', '1')}${entry('0001-26-000002', '2026-02-27', '1')}</feed>`
    expect(parseNportFilingsAtom(xml).map((f) => f.accession))
      .toEqual(['0001-26-000001', '0001-26-000002'])
    expect(parseNportFilingsAtom(xml, 1)).toHaveLength(1)
  })

  it('skips entries missing an accession or archive CIK, and survives garbage', () => {
    expect(parseNportFilingsAtom('<feed><entry><title>no ids</title></entry></feed>')).toEqual([])
    expect(() => parseNportFilingsAtom('')).not.toThrow()
    expect(parseNportFilingsAtom('total garbage')).toEqual([])
  })
})
