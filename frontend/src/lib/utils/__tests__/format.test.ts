import { describe, it, expect } from 'vitest'
import { timeAgoCompact } from '../format'

const NOW = Date.parse('2026-07-30T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

// W4-C8: eight pages each carried their own copy of this and they disagreed
// visibly. These pin the two behaviours the copies got wrong.
describe('timeAgoCompact', () => {
  it('renders minutes, hours, days and years', () => {
    expect(timeAgoCompact(ago(42 * MIN), NOW)).toBe('42m ago')
    expect(timeAgoCompact(ago(3 * HOUR), NOW)).toBe('3h ago')
    expect(timeAgoCompact(ago(5 * DAY), NOW)).toBe('5d ago')
    expect(timeAgoCompact(ago(800 * DAY), NOW)).toBe('2y ago')
  })

  it('says "just now" under a minute instead of "0m ago"', () => {
    expect(timeAgoCompact(ago(0), NOW)).toBe('just now')
    expect(timeAgoCompact(ago(59_000), NOW)).toBe('just now')
    expect(timeAgoCompact(ago(MIN), NOW)).toBe('1m ago')
  })

  // Most copies printed the raw difference, so a future timestamp rendered
  // "-3m ago". Feed timestamps genuinely do arrive in the future — that is why
  // lib/server/pubDate.ts exists.
  it('never renders a negative age', () => {
    expect(timeAgoCompact(new Date(NOW + 3 * MIN).toISOString(), NOW)).toBe('just now')
    expect(timeAgoCompact(new Date(NOW + 5 * DAY).toISOString(), NOW)).toBe('just now')
  })

  it('crosses each boundary at the right point', () => {
    expect(timeAgoCompact(ago(59 * MIN), NOW)).toBe('59m ago')
    expect(timeAgoCompact(ago(HOUR), NOW)).toBe('1h ago')
    expect(timeAgoCompact(ago(23 * HOUR), NOW)).toBe('23h ago')
    expect(timeAgoCompact(ago(DAY), NOW)).toBe('1d ago')
    expect(timeAgoCompact(ago(364 * DAY), NOW)).toBe('364d ago')
    expect(timeAgoCompact(ago(365 * DAY), NOW)).toBe('1y ago')
  })

  it('returns a dash for an unparseable date rather than "NaNm ago"', () => {
    expect(timeAgoCompact('not a date', NOW)).toBe('—')
    expect(timeAgoCompact('', NOW)).toBe('—')
  })

  it('accepts a Date as well as an ISO string', () => {
    expect(timeAgoCompact(new Date(NOW - 2 * HOUR), NOW)).toBe('2h ago')
  })
})
