import { describe, it, expect } from 'vitest'
import {
  COMMON_TERMS_PATHS,
  PROBE_ROBOTS_TOKEN,
  discoverTermsLinks,
  htmlToText,
  isPathAllowedByRobots,
  parseRobotsTxt,
  scanTermsText,
} from '../termsProbe'

// Only the pure half is tested here — parsing, matching, scanning. probeSiteTerms
// itself is network I/O against someone else's site, and a mocked version of that
// would assert on our own fixture rather than on anything true.

describe('parseRobotsTxt', () => {
  it('keeps consecutive user-agent lines in ONE group', () => {
    // The spec behaviour, and the bug the naive reading introduces: with a
    // group per agent, the rules attach only to the last one and every other
    // agent silently escapes them.
    const robots = parseRobotsTxt(`
User-agent: BadBot
User-agent: OtherBot
Disallow: /private
    `)
    expect(robots.groups).toHaveLength(1)
    expect(robots.groups[0].agents).toEqual(['badbot', 'otherbot'])
    expect(robots.groups[0].disallow).toEqual(['/private'])
  })

  it('starts a new group when rules intervene', () => {
    const robots = parseRobotsTxt(`
User-agent: *
Disallow: /admin

User-agent: Googlebot
Allow: /
    `)
    expect(robots.groups).toHaveLength(2)
    expect(robots.groups[1].agents).toEqual(['googlebot'])
  })

  it('strips comments, ignores unknown directives and blank lines', () => {
    const robots = parseRobotsTxt(`
# a comment
User-agent: *   # trailing comment
Crawl-delay: 10
Sitemap: https://example.com/sitemap.xml
Disallow: /x
    `)
    expect(robots.groups[0].disallow).toEqual(['/x'])
    expect(robots.groups[0].allow).toEqual([])
  })

  it('does not crash on an empty or junk file', () => {
    expect(parseRobotsTxt('').groups).toEqual([])
    expect(parseRobotsTxt('not a robots file at all').groups).toEqual([])
  })
})

describe('isPathAllowedByRobots', () => {
  const of = (t: string) => parseRobotsTxt(t)

  it('allows everything when there are no rules', () => {
    expect(isPathAllowedByRobots(of(''), '/anything')).toBe(true)
  })

  it('honours a wildcard-group disallow', () => {
    const r = of('User-agent: *\nDisallow: /api')
    expect(isPathAllowedByRobots(r, '/api/quote')).toBe(false)
    expect(isPathAllowedByRobots(r, '/rss')).toBe(true)
  })

  it('treats `Disallow:` with no value as allow-all', () => {
    expect(isPathAllowedByRobots(of('User-agent: *\nDisallow:'), '/anything')).toBe(true)
  })

  it('lets the longest matching rule win, so a carve-out works', () => {
    const r = of('User-agent: *\nDisallow: /api\nAllow: /api/public')
    expect(isPathAllowedByRobots(r, '/api/private')).toBe(false)
    expect(isPathAllowedByRobots(r, '/api/public/feed.json')).toBe(true)
  })

  it('gives Allow the tie on equal-length rules', () => {
    const r = of('User-agent: *\nDisallow: /feed\nAllow: /feed')
    expect(isPathAllowedByRobots(r, '/feed')).toBe(true)
  })

  it('supports * and $ in patterns', () => {
    const r = of('User-agent: *\nDisallow: /*.json$')
    expect(isPathAllowedByRobots(r, '/data/prices.json')).toBe(false)
    expect(isPathAllowedByRobots(r, '/data/prices.json.bak')).toBe(true)
  })

  it('prefers a group naming us over the wildcard group, in both directions', () => {
    const strictWildcard = of(`User-agent: *\nDisallow: /\n\nUser-agent: ${PROBE_ROBOTS_TOKEN}\nAllow: /`)
    expect(isPathAllowedByRobots(strictWildcard, '/feed')).toBe(true)

    // And the case that actually matters: a site that bans us by name while
    // leaving everyone else alone must not be read through the '*' group.
    const bannedByName = of(`User-agent: *\nAllow: /\n\nUser-agent: ${PROBE_ROBOTS_TOKEN}\nDisallow: /`)
    expect(isPathAllowedByRobots(bannedByName, '/feed')).toBe(false)
  })
})

describe('discoverTermsLinks', () => {
  const html = `
    <html><body>
      <a href="/about">About us</a>
      <a href="/policies/9182">Legal</a>
      <a href="/terms-of-use">Terms of Use</a>
      <a href="mailto:legal@example.com">Legal team</a>
      <a href="/pricing">Pricing</a>
    </body></html>`

  it('finds candidates by href AND by link text', () => {
    const links = discoverTermsLinks(html, 'https://example.com')
    // /policies/9182 is only discoverable via its text — the exact case an
    // href-only scan misses, and the reason link text is scanned at all.
    expect(links).toContain('https://example.com/policies/9182')
    expect(links).toContain('https://example.com/terms-of-use')
  })

  it('ranks a both-signals match above a text-only one', () => {
    const links = discoverTermsLinks(html, 'https://example.com')
    expect(links.indexOf('https://example.com/terms-of-use'))
      .toBeLessThan(links.indexOf('https://example.com/policies/9182'))
  })

  it('drops non-http schemes and unrelated links', () => {
    const links = discoverTermsLinks(html, 'https://example.com')
    expect(links.some((l) => l.startsWith('mailto:'))).toBe(false)
    expect(links).not.toContain('https://example.com/pricing')
    expect(links).not.toContain('https://example.com/about')
  })

  it('resolves relative links against the base and dedupes', () => {
    const dup = '<a href="/terms">Terms</a><a href="/terms">Terms and conditions</a>'
    expect(discoverTermsLinks(dup, 'https://example.com/some/page')).toEqual(['https://example.com/terms'])
  })

  it('returns nothing for a page with no links, rather than throwing', () => {
    expect(discoverTermsLinks('<html><body>hi</body></html>', 'https://example.com')).toEqual([])
  })

  it('ships a non-empty list of conventional fallback paths', () => {
    expect(COMMON_TERMS_PATHS.length).toBeGreaterThan(4)
    expect(COMMON_TERMS_PATHS.every((p) => p.startsWith('/'))).toBe(true)
  })
})

describe('htmlToText', () => {
  it('drops script and style bodies rather than scanning them', () => {
    // Otherwise a site's analytics blob can trip a keyword and produce a
    // "restrictive clause" that no human ever wrote.
    const text = htmlToText('<style>.a{content:"scraping"}</style><script>var x="robots"</script><p>Hello</p>')
    expect(text).toBe('Hello')
  })

  it('decodes the common entities and collapses whitespace', () => {
    expect(htmlToText('<p>a &amp; b</p>\n\n  <p>c&nbsp;d</p>')).toBe('a & b c d')
  })
})

describe('scanTermsText', () => {
  it('flags a prohibition on automated access, with the negative on either side', () => {
    // "you may not use any robot" and "robots are prohibited" are the same
    // clause; a one-directional regex misses the first, which is the phrasing
    // most terms documents actually use.
    for (const text of [
      'You may not use any robot, spider or other automated means to access the Services.',
      'Access by automated means is prohibited without our prior consent.',
    ]) {
      const signals = scanTermsText(text)
      expect(signals.some((s) => s.kind === 'restrictive' && /automated access/.test(s.label)), text).toBe(true)
    }
  })

  it('flags scraping and redistribution clauses', () => {
    const signals = scanTermsText('Scraping the Site is forbidden. You may not redistribute any content.')
    const labels = signals.filter((s) => s.kind === 'restrictive').map((s) => s.label)
    expect(labels).toContain('prohibits scraping')
    expect(labels).toContain('prohibits redistribution')
  })

  it('flags a personal, non-commercial restriction', () => {
    const signals = scanTermsText('The feed is provided for your personal, non-commercial use only.')
    expect(signals.map((s) => s.label)).toContain('personal / non-commercial use only')
  })

  it('recognises permissive language too', () => {
    const signals = scanTermsText('We offer a free API for developers. Content is licensed under CC BY-SA.')
    const permissive = signals.filter((s) => s.kind === 'permissive').map((s) => s.label)
    expect(permissive).toContain('offers a public API')
    expect(permissive).toContain('open / permissive licence')
  })

  it('carries the sentence each match came from, not just a label', () => {
    // A verdict a human cannot check is not reviewable, and this report exists
    // to be reviewed.
    const sentence = 'You may not redistribute the data to third parties.'
    const signal = scanTermsText(`Some preamble. ${sentence} Some more text.`)
      .find((s) => s.label === 'prohibits redistribution')
    expect(signal?.excerpt).toBe(sentence)
  })

  it('reports each label at most once', () => {
    const signals = scanTermsText('No scraping. Absolutely no scraping. Scraping is banned.')
    expect(signals.filter((s) => s.label === 'prohibits scraping')).toHaveLength(1)
  })

  it('finds nothing in ordinary prose', () => {
    expect(scanTermsText('Welcome to our website. We publish market commentary daily.')).toEqual([])
  })
})
