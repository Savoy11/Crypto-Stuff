/**
 * Turn CoinGecko's `description.en` into text safe and readable in a card.
 *
 * The field is raw HTML authored by many different hands: anchor tags, <br>,
 * occasional <p>, HTML entities, and lengths from empty to several thousand
 * characters. Three rules, each of which exists because the alternative is
 * worse than showing nothing:
 *
 *  1. NEVER render it as HTML. It is third-party content; the app has no
 *     sanitizer and does not need one — we take the text and drop the markup.
 *  2. Truncate at a SENTENCE boundary, not a character count. Cutting
 *     mid-clause produces text that reads as corrupted rather than shortened.
 *  3. An empty or markup-only description returns null, so the caller can say
 *     "no description published" instead of rendering an empty panel.
 */

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&apos;': "'", '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
}

/** Plain text from an HTML fragment. Tags dropped, entities decoded. */
export function stripHtml(html: string): string {
  return html
    // Block-ish tags become spaces so "<p>a</p><p>b</p>" doesn't become "ab".
    .replace(/<\s*(br|\/p|\/div|\/li)\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#39;/gi, (m) => ENTITIES[m.toLowerCase()] ?? ENTITIES[m] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Sanitized, sentence-truncated description, or null when there is nothing
 * worth showing. `maxChars` is a target, not a hard cap: the result ends at the
 * last sentence that fits, so it can come in well under.
 */
export function coinDescription(raw: string | null | undefined, maxChars = 420): string | null {
  if (!raw) return null
  const text = stripHtml(raw)
  // A couple of stray words left after stripping markup is not a description.
  if (text.length < 40) return null
  if (text.length <= maxChars) return text

  const window = text.slice(0, maxChars + 1)
  // Sentence end = . ! ? followed by a space. Guard against abbreviations
  // producing a uselessly short result by requiring a reasonable length.
  const lastStop = Math.max(
    window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '),
  )
  if (lastStop > maxChars * 0.4) return text.slice(0, lastStop + 1)

  // No usable sentence break — fall back to a word boundary with an ellipsis,
  // which at least does not sever a word.
  const lastSpace = window.lastIndexOf(' ')
  return `${text.slice(0, lastSpace > 0 ? lastSpace : maxChars).trimEnd()}…`
}

/** First usable URL from CoinGecko's homepage array (it carries empty slots). */
export function firstUrl(list: unknown): string | null {
  if (!Array.isArray(list)) return typeof list === 'string' && list.trim() ? list.trim() : null
  for (const item of list) {
    if (typeof item === 'string' && /^https?:\/\/\S+$/i.test(item.trim())) return item.trim()
  }
  return null
}
