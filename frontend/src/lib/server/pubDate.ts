/** `2026-07-22 13:16:28` or `2026-07-22T13:16:28` with no trailing zone. */
const TZLESS_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/

/**
 * Parse an RSS pubDate to an epoch, defaulting a missing timezone to UTC.
 *
 * Investing.com (3 of the 8 feeds) emits `<pubDate>2026-07-22 13:16:28</pubDate>`
 * with no zone, and `new Date()` reads a zone-less string as LOCAL time. On a
 * UTC−4 host that stamps every article 4 hours in the FUTURE — so the previous
 * clamp-to-now pinned the whole block to the fetch instant, which made every
 * one of them render as "just now", flagged them all Breaking (`now - published
 * < 1h` is trivially true after clamping), and floated them above genuinely
 * newer stories from the other feeds. It also meant the same feed produced
 * different timestamps depending on the server's timezone.
 *
 * Treating a zone-less stamp as UTC fixes the offset at the source. The clamp
 * stays as a backstop for feeds that really are ahead, but it should now be
 * rare rather than routine.
 */
export function parsePubDate(raw: string, now: number): number {
  const s = raw.trim()
  if (!s) return now
  const normalized = TZLESS_DATETIME.test(s) ? `${s.replace(' ', 'T')}Z` : s
  const t = new Date(normalized).getTime()
  if (!Number.isFinite(t)) return now
  return Math.min(t, now)
}
