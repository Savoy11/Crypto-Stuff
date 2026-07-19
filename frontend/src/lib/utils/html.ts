// Shared HTML/XML text helpers for the RSS-consuming live-data routes.
//
// Both /live-data/news (crypto) and /live-data/market-news (equities) parse raw
// feed XML by hand. They previously had divergent implementations — market-news
// decoded a handful of named entities, and news decoded none at all, which is
// why crypto headlines rendered as "France&#8217;s ...". Keep the decoding here
// so both routes stay in step.

/** Named entities seen in the wild across the feeds we consume. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  trade: '™',
  reg: '®',
  copy: '©',
}

/**
 * Decode HTML entities — named (`&amp;`), decimal (`&#8217;`), and hex
 * (`&#x2019;`).
 *
 * Deliberately a single left-to-right pass rather than chained `.replace()`
 * calls: chaining decodes `&amp;` first, so `&amp;lt;` would collapse to `<`
 * instead of the literal `&lt;` the feed actually meant. One pass consumes each
 * entity exactly once and never re-scans its own output.
 *
 * Unknown or out-of-range entities are left verbatim rather than dropped, so
 * nothing silently disappears from a headline.
 */
export function decodeEntities(value: string): string {
  return value.replace(
    /&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g,
    (match, body: string) => {
      if (body.startsWith('#')) {
        const isHex = body[1] === 'x' || body[1] === 'X'
        const codePoint = isHex
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10)

        // Reject NUL, out-of-range, and lone surrogates — String.fromCodePoint
        // throws on the latter two.
        if (!Number.isFinite(codePoint) || codePoint < 1 || codePoint > 0x10ffff) return match
        if (codePoint >= 0xd800 && codePoint <= 0xdfff) return match

        try {
          return String.fromCodePoint(codePoint)
        } catch {
          return match
        }
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? match
    }
  )
}

/** Unwrap `<![CDATA[ ... ]]>` sections. */
export function stripCdata(value: string): string {
  return value
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .trim()
}

/** Strip markup tags and collapse the resulting whitespace. */
export function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Full cleanup for a feed text node: unwrap CDATA, drop markup, then decode
 * entities.
 *
 * Order matters — decoding last means an escaped `&lt;b&gt;` survives as the
 * literal text `<b>` instead of being decoded into a tag and then stripped.
 */
export function cleanFeedText(value: string): string {
  return decodeEntities(stripTags(stripCdata(value)))
}
