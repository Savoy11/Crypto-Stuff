import { decodeEntities, stripCdata, stripTags } from '@/lib/utils/html'
import { parsePubDate } from './pubDate'

// One RSS/Atom item extractor for every feed route (W4-C3, W4-C5).
//
// There were three copies. Only the crypto `news` route's handled Atom, so a
// custom feed registered as `atom` on `market-news` or `macro-news` parsed to
// **zero articles** — the regex matched `<item>` and Atom uses `<entry>`. The
// route reported a healthy fetch and an empty list, which reads as "this feed
// has no news" rather than "this feed was never parsed".
//
// Two of the three also stamped dates with a bare `new Date(raw).toISOString()`:
// that throws RangeError on a malformed date, and one bad item takes the whole
// feed down with it. `parsePubDate` was written for exactly this and was wired
// into only one route, so the others also inherited the future-timestamp bug it
// fixes — an article stamped ahead of now makes `isBreaking` (`now - published <
// 1h`) trivially true, and floats it above genuinely newer stories.

/** Split on `<item>` (RSS 2.0) or `<entry>` (Atom), whichever the feed uses. */
const RSS_ITEM = /<item[\s>][\s\S]*?<\/item>/gi
const ATOM_ENTRY = /<entry[\s>][\s\S]*?<\/entry>/gi

export interface FeedItem {
  title: string
  url: string
  /** Plain text: tags stripped, entities decoded, whitespace collapsed. */
  summary: string
  /** Epoch ms — timezone-normalised, clamped to `now`, never NaN. */
  publishedAt: number
  /** The feed's own `<source>` name where it declares one. */
  sourceName: string | null
}

function tag(item: string, name: string): string | null {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decodeEntities(stripCdata(m[1])) : null
}

/** First tag present, in preference order. */
function firstTag(item: string, ...names: string[]): string | null {
  for (const name of names) {
    const v = tag(item, name)
    if (v != null && v.trim()) return v
  }
  return null
}

function plainText(raw: string | null): string {
  if (!raw) return ''
  // Decode after stripping tags, so an escaped &lt;b&gt; survives as literal
  // text rather than becoming a tag the strip pass then eats.
  return decodeEntities(stripTags(raw)).replace(/\s+/g, ' ').trim()
}

/**
 * Parse an RSS 2.0 or Atom document into a normalised item list.
 *
 * `now` is injectable so date handling is testable without freezing the clock.
 */
export function parseFeedItems(xml: string, now: number = Date.now()): FeedItem[] {
  const rssItems = xml.match(RSS_ITEM) ?? []
  const atomItems = xml.match(ATOM_ENTRY) ?? []

  // A feed is one or the other. Prefer whichever yielded more elements rather
  // than sniffing the root tag: some feeds wrap Atom entries in an RSS shell,
  // and a miscount here silently empties the list.
  const isAtom = atomItems.length > rssItems.length
  const items = isAtom ? atomItems : rssItems

  return items
    .map((item): FeedItem => {
      // Atom links are `<link href="..."/>`; RSS puts the URL in the text node.
      const atomHref = item.match(/<link[^>]*href="([^"]+)"/i)?.[1]
      const url = (isAtom ? atomHref ?? tag(item, 'link') : tag(item, 'link') ?? atomHref) ?? ''

      return {
        title: plainText(tag(item, 'title')),
        url: url.trim(),
        // Atom: <content> or <summary>. RSS: <description>.
        summary: plainText(firstTag(item, 'description', 'content', 'summary')),
        // Atom: <published> or <updated>. RSS: <pubDate>.
        publishedAt: parsePubDate(firstTag(item, 'pubDate', 'published', 'updated') ?? '', now),
        sourceName: firstTag(item, 'source'),
      }
    })
    .filter((a) => a.title && a.url)
}
