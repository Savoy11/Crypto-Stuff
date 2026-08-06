import { describe, it, expect } from 'vitest'
import {
  SOURCE_TERMS,
  SOURCE_TERMS_REVIEW_AFTER_DAYS,
  SourceTermsError,
  assertSourceAllowed,
  assertSourceNotProhibited,
  checkSourceTerms,
  getSourceTermsProvenance,
  hostOf,
  matchTermsEntry,
} from '../sourceTerms'
import { DATA_SOURCES } from '@/lib/data/dataSources'

// `now` is injected everywhere so staleness is testable without touching the
// clock — the same convention every provenance helper in lib/data follows.
const NOW = new Date('2026-08-06T12:00:00Z')

describe('registry integrity', () => {
  it('gives every entry a terms URL, a real finding, and a parseable date', () => {
    for (const e of SOURCE_TERMS) {
      expect(e.termsUrl, e.domain).toMatch(/^https:\/\//)
      // A one-word "allowed" is not a finding; the point of the field is that a
      // later reader can go and check the same clause.
      expect(e.finding.length, e.domain).toBeGreaterThan(40)
      expect(Number.isNaN(Date.parse(`${e.verifiedAt}T00:00:00Z`)), e.domain).toBe(false)
    }
  })

  it('requires conditions on every conditional verdict', () => {
    for (const e of SOURCE_TERMS.filter((x) => x.verdict === 'conditional')) {
      expect(e.conditions?.length, `${e.domain} is conditional on nothing in particular`).toBeGreaterThan(0)
    }
  })

  it('has no duplicate domains', () => {
    const domains = SOURCE_TERMS.map((e) => e.domain)
    expect(new Set(domains).size).toBe(domains.length)
  })
})

describe('matchTermsEntry', () => {
  it('matches the host itself and any subdomain', () => {
    expect(matchTermsEntry('yahoo.com')?.verdict).toBe('prohibited')
    expect(matchTermsEntry('query1.finance.yahoo.com')?.verdict).toBe('prohibited')
    expect(matchTermsEntry('feeds.finance.yahoo.com')?.verdict).toBe('prohibited')
  })

  it('will not match on a label boundary it does not own', () => {
    // The bug a plain endsWith() would introduce: a lookalike domain someone
    // else registered inherits our verdict.
    expect(matchTermsEntry('notyahoo.com')).toBeNull()
    expect(matchTermsEntry('yahoo.com.evil.example')).toBeNull()
  })

  it('is case- and trailing-dot-insensitive', () => {
    expect(matchTermsEntry('QUERY1.Finance.Yahoo.Com.')?.domain).toBe('yahoo.com')
  })

  it('returns null for a host nobody has reviewed', () => {
    expect(matchTermsEntry('some-random-feed.example')).toBeNull()
  })
})

describe('checkSourceTerms', () => {
  it('blocks Yahoo, and says why rather than just refusing', () => {
    const d = checkSourceTerms('https://query1.finance.yahoo.com/v8/finance/spark?symbols=AAPL', NOW)
    expect(d.allowed).toBe(false)
    expect(d.status).toBe('prohibited')
    expect(d.reason).toMatch(/terms do not permit/i)
    expect(d.reason).toMatch(/undocumented internals/i)
  })

  it('denies by default for an unreviewed host', () => {
    const d = checkSourceTerms('https://some-random-feed.example/rss', NOW)
    expect(d.allowed).toBe(false)
    expect(d.status).toBe('unreviewed')
    expect(d.reason).toMatch(/No terms review on record/)
  })

  it('allows an approved host and reports its age', () => {
    const d = checkSourceTerms('https://home.treasury.gov/resource-center/data.xml', NOW)
    expect(d.allowed).toBe(true)
    expect(d.status).toBe('approved')
    expect(d.ageDays).toBe(0)
    expect(d.stale).toBe(false)
  })

  it('allows a conditional host and surfaces the conditions in the reason', () => {
    const d = checkSourceTerms('https://data.sec.gov/api/xbrl/frames/x.json', NOW)
    expect(d.allowed).toBe(true)
    expect(d.status).toBe('conditional')
    expect(d.reason).toMatch(/User-Agent/)
  })

  it('marks a verdict stale past the review window without disallowing it', () => {
    const later = new Date(NOW.getTime() + (SOURCE_TERMS_REVIEW_AFTER_DAYS + 1) * 86_400_000)
    const d = checkSourceTerms('https://home.treasury.gov/x', later)
    expect(d.stale).toBe(true)
    // Stale is a prompt to re-read, not a reason to break the app.
    expect(d.allowed).toBe(true)
  })

  it('refuses an unparseable URL rather than treating it as unreviewed-but-fine', () => {
    expect(checkSourceTerms('not a url', NOW).allowed).toBe(false)
    expect(hostOf('not a url')).toBeNull()
  })
})

describe('the two assert forms differ exactly where they should', () => {
  const prohibited = 'https://finance.yahoo.com/quote/AAPL'
  const unreviewed = 'https://some-random-feed.example/rss'
  const approved = 'https://api.frankfurter.dev/latest'

  it('both refuse a prohibited host', () => {
    expect(() => assertSourceAllowed(prohibited, NOW)).toThrow(SourceTermsError)
    expect(() => assertSourceNotProhibited(prohibited, NOW)).toThrow(SourceTermsError)
  })

  it('only the strict form refuses an unreviewed host', () => {
    expect(() => assertSourceAllowed(unreviewed, NOW)).toThrow(SourceTermsError)
    // The looser form is what the transport layer uses, so a feed the user was
    // shown the terms for and approved can actually be fetched.
    expect(() => assertSourceNotProhibited(unreviewed, NOW)).not.toThrow()
  })

  it('neither refuses an approved host', () => {
    expect(() => assertSourceAllowed(approved, NOW)).not.toThrow()
    expect(() => assertSourceNotProhibited(approved, NOW)).not.toThrow()
  })
})

describe('provenance', () => {
  it('dates the registry by its OLDEST entry, not its newest', () => {
    // Re-reading one site's terms does not refresh the other forty. Same rule
    // the hand-maintained data catalogs follow.
    const oldest = SOURCE_TERMS.reduce((a, b) => (a.verifiedAt <= b.verifiedAt ? a : b))
    expect(getSourceTermsProvenance(NOW).verifiedAt).toBe(oldest.verifiedAt)
  })

  it('counts prohibited entries and entries past the review window', () => {
    const p = getSourceTermsProvenance(NOW)
    expect(p.total).toBe(SOURCE_TERMS.length)
    expect(p.prohibited).toBe(SOURCE_TERMS.filter((e) => e.verdict === 'prohibited').length)
    expect(p.needsReview).toBe(0)

    const later = new Date(NOW.getTime() + (SOURCE_TERMS_REVIEW_AFTER_DAYS + 30) * 86_400_000)
    expect(getSourceTermsProvenance(later).needsReview).toBe(SOURCE_TERMS.length)
    expect(getSourceTermsProvenance(later).stale).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The repo-wide guard.
//
// This is the half of the safeguard that covers BUILT-IN sources. They never
// pass through the Integrations form, so there is no human to ask at save time
// — the review has to be enforced somewhere, and this is it. Add a /live-data
// route that fetches a new host, list it in dataSources.ts as the project
// requires, and this test fails until someone reads that site's terms and
// records a verdict.
// ─────────────────────────────────────────────────────────────────────────────
describe('every declared data-source host has a terms verdict', () => {
  const hosts = [...new Set(
    DATA_SOURCES.flatMap((entry) =>
      entry.providers.map((p) => p.host).filter((h): h is string => !!h)
    )
  )]

  it('finds hosts to check (guards against the list silently emptying)', () => {
    expect(hosts.length).toBeGreaterThan(10)
  })

  it.each(hosts)('%s is registered and permitted', (host) => {
    const decision = checkSourceTerms(`https://${host}/`, NOW)
    expect(decision.status, `${host}: ${decision.reason}`).not.toBe('unreviewed')
    expect(decision.allowed, `${host}: ${decision.reason}`).toBe(true)
  })

  it('lists no yahoo host at all any more', () => {
    expect(hosts.filter((h) => h.endsWith('yahoo.com'))).toEqual([])
  })
})
