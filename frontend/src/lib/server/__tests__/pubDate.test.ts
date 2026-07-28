import { describe, it, expect } from 'vitest'
import { parsePubDate } from '@/lib/server/pubDate'

// Regression cover for the Investing.com timestamp bug: a zone-less pubDate was
// read as LOCAL time, so on a UTC−4 host every article landed ~4h in the future,
// the clamp pinned it to "now", and the whole feed rendered as "just now" +
// Breaking. These assertions are timezone-independent — they must hold whether
// CI runs in UTC or the owner's machine runs in EDT.

const NOW = Date.parse('2026-07-22T18:00:00.000Z')

describe('parsePubDate', () => {
  it('reads a zone-less timestamp as UTC, not server-local', () => {
    // The exact shape Investing.com emits.
    expect(parsePubDate('2026-07-22 13:16:28', NOW)).toBe(Date.parse('2026-07-22T13:16:28.000Z'))
  })

  it('reads a zone-less ISO timestamp as UTC too', () => {
    expect(parsePubDate('2026-07-22T13:16:28', NOW)).toBe(Date.parse('2026-07-22T13:16:28.000Z'))
  })

  it('does not mark a 4-hour-old article as breaking', () => {
    // The bug: this landed at `now`, so `now - published < 1h` was trivially
    // true and the article was badged Breaking.
    const published = parsePubDate('2026-07-22 14:00:00', NOW)
    expect(NOW - published).toBe(4 * 3600_000)
    expect(NOW - published < 3600_000).toBe(false)
  })

  it('honours an explicit timezone when the feed supplies one', () => {
    expect(parsePubDate('Tue, 22 Jul 2026 13:16:28 GMT', NOW)).toBe(Date.parse('2026-07-22T13:16:28.000Z'))
    expect(parsePubDate('2026-07-22T13:16:28+02:00', NOW)).toBe(Date.parse('2026-07-22T11:16:28.000Z'))
  })

  it('still clamps a genuinely future timestamp to now', () => {
    expect(parsePubDate('2026-07-23 09:00:00', NOW)).toBe(NOW)
  })

  it('falls back to now on empty or unparseable input', () => {
    expect(parsePubDate('', NOW)).toBe(NOW)
    expect(parsePubDate('not a date', NOW)).toBe(NOW)
  })
})
