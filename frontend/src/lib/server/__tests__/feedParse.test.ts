import { describe, it, expect } from 'vitest'
import { parseFeedItems } from '../feedParse'

const NOW = Date.parse('2026-07-30T12:00:00Z')

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Feed title, not an item</title>
  <item>
    <title>Gold hits a record</title>
    <link>https://example.com/gold</link>
    <pubDate>Wed, 29 Jul 2026 10:00:00 GMT</pubDate>
    <description>&lt;p&gt;Spot gold   rose 2%.&lt;/p&gt;</description>
    <source>Example Wire</source>
  </item>
  <item>
    <title>Oil slips</title>
    <link>https://example.com/oil</link>
    <pubDate>Wed, 29 Jul 2026 09:00:00 GMT</pubDate>
    <description>Crude fell.</description>
  </item>
</channel></rss>`

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom feed title</title>
  <entry>
    <title>Treasury yields ease</title>
    <link rel="alternate" href="https://example.com/yields"/>
    <published>2026-07-29T08:00:00Z</published>
    <summary>The 10-year fell 4bps.</summary>
  </entry>
  <entry>
    <title>Dollar steadies</title>
    <link href="https://example.com/dollar"/>
    <updated>2026-07-29T07:00:00Z</updated>
    <content>DXY flat on the session.</content>
  </entry>
</feed>`

describe('parseFeedItems', () => {
  it('parses RSS 2.0 items', () => {
    const items = parseFeedItems(RSS, NOW)
    expect(items).toHaveLength(2)
    expect(items[0].title).toBe('Gold hits a record')
    expect(items[0].url).toBe('https://example.com/gold')
    expect(items[0].sourceName).toBe('Example Wire')
    expect(items[1].url).toBe('https://example.com/oil')
  })

  // W4-C3: market-news and macro-news matched only <item>, so every Atom feed
  // parsed to zero articles and the route reported a healthy, empty fetch.
  it('parses Atom entries', () => {
    const items = parseFeedItems(ATOM, NOW)
    expect(items).toHaveLength(2)
    expect(items[0].title).toBe('Treasury yields ease')
    expect(items[1].title).toBe('Dollar steadies')
  })

  it('reads Atom link href rather than the element text', () => {
    const items = parseFeedItems(ATOM, NOW)
    expect(items[0].url).toBe('https://example.com/yields')
    expect(items[1].url).toBe('https://example.com/dollar')
  })

  it('reads Atom published and updated as the date', () => {
    const items = parseFeedItems(ATOM, NOW)
    expect(items[0].publishedAt).toBe(Date.parse('2026-07-29T08:00:00Z'))
    expect(items[1].publishedAt).toBe(Date.parse('2026-07-29T07:00:00Z'))
  })

  it('reads Atom summary and content as the description', () => {
    const items = parseFeedItems(ATOM, NOW)
    expect(items[0].summary).toBe('The 10-year fell 4bps.')
    expect(items[1].summary).toBe('DXY flat on the session.')
  })

  it('strips tags and collapses whitespace in descriptions', () => {
    expect(parseFeedItems(RSS, NOW)[0].summary).toBe('Spot gold rose 2%.')
  })

  it('does not treat the channel title as an item', () => {
    expect(parseFeedItems(RSS, NOW).map((i) => i.title)).not.toContain('Feed title, not an item')
  })

  // W4-C5: `new Date(raw).toISOString()` throws RangeError on a bad date, and
  // one malformed item took the entire feed down with it.
  it('survives a malformed date without losing the feed', () => {
    const xml = `<rss><channel>
      <item><title>Bad date</title><link>https://example.com/a</link><pubDate>not a date</pubDate></item>
      <item><title>Good date</title><link>https://example.com/b</link><pubDate>Wed, 29 Jul 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>`
    const items = parseFeedItems(xml, NOW)
    expect(items).toHaveLength(2)
    expect(items[0].publishedAt).toBe(NOW)                       // falls back, doesn't throw
    expect(Number.isFinite(items[1].publishedAt)).toBe(true)
  })

  it('clamps genuinely future-stamped articles to now', () => {
    // A backstop, not the main event: a clamped article still sorts newest and
    // still trips `isBreaking`. What it buys is that nothing renders as
    // "in 3 hours".
    const xml = `<rss><channel><item>
      <title>From the future</title><link>https://example.com/f</link>
      <pubDate>Fri, 31 Jul 2026 10:00:00 GMT</pubDate>
    </item></channel></rss>`
    expect(parseFeedItems(xml, NOW)[0].publishedAt).toBe(NOW)
  })

  it('reads a timezone-less stamp as UTC, not as server-local time', () => {
    // This is the fix that matters, and the reason pubDate.ts exists: read as
    // local time on a UTC−4 host, a zone-less stamp lands 4 hours in the FUTURE,
    // gets clamped to the fetch instant, and the whole block renders "just now",
    // flagged Breaking, above genuinely newer stories. Investing.com emits this
    // shape, and macro-news was the only route normalising it.
    const xml = `<rss><channel><item>
      <title>Zone-less</title><link>https://example.com/z</link>
      <pubDate>2026-07-29 10:00:00</pubDate>
    </item></channel></rss>`
    expect(parseFeedItems(xml, NOW)[0].publishedAt).toBe(Date.parse('2026-07-29T10:00:00Z'))
  })

  it('drops items with no title or no url', () => {
    const xml = `<rss><channel>
      <item><title>No link</title></item>
      <item><link>https://example.com/no-title</link></item>
      <item><title>Complete</title><link>https://example.com/ok</link></item>
    </channel></rss>`
    expect(parseFeedItems(xml, NOW).map((i) => i.title)).toEqual(['Complete'])
  })

  it('returns an empty list for junk input rather than throwing', () => {
    expect(parseFeedItems('', NOW)).toEqual([])
    expect(parseFeedItems('<html><body>not a feed</body></html>', NOW)).toEqual([])
  })

  it('decodes entities in titles', () => {
    const xml = `<rss><channel><item>
      <title>AT&amp;T &amp; Verizon</title><link>https://example.com/t</link>
    </item></channel></rss>`
    expect(parseFeedItems(xml, NOW)[0].title).toBe('AT&T & Verizon')
  })

  it('unwraps CDATA', () => {
    const xml = `<rss><channel><item>
      <title><![CDATA[Fed holds rates]]></title><link><![CDATA[https://example.com/fed]]></link>
    </item></channel></rss>`
    const item = parseFeedItems(xml, NOW)[0]
    expect(item.title).toBe('Fed holds rates')
    expect(item.url).toBe('https://example.com/fed')
  })
})
