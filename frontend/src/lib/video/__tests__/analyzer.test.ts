import { describe, it, expect } from 'vitest'
import { extractTimestamps, withTimestamp } from '../analyzer'

// Pure helpers only. Adapter network paths aren't covered here — they need a
// live provider key.

describe('extractTimestamps', () => {
  it('pulls MM:SS references out of prose', () => {
    expect(extractTimestamps('He discusses rate cuts at 12:04 and again at 27:31.')).toEqual([
      { seconds: 724, label: '12:04' },
      { seconds: 1651, label: '27:31' },
    ])
  })

  it('handles HH:MM:SS', () => {
    expect(extractTimestamps('The Q&A starts at 1:02:30.')).toEqual([
      { seconds: 3750, label: '1:02:30' },
    ])
  })

  it('deduplicates repeated references', () => {
    expect(extractTimestamps('At 05:00 he says it, and at 05:00 repeats it.')).toEqual([
      { seconds: 300, label: '05:00' },
    ])
  })

  it('rejects impossible timecodes rather than emitting bad deep links', () => {
    expect(extractTimestamps('Revenue rose 12:99 percent')).toEqual([])
    expect(extractTimestamps('ratio was 1:75:30')).toEqual([])
  })

  it('returns nothing when there are no timecodes', () => {
    expect(extractTimestamps('The video never addresses inflation.')).toEqual([])
    expect(extractTimestamps('')).toEqual([])
  })

  it('handles a zero timestamp', () => {
    expect(extractTimestamps('Right at 00:00 he opens with it.')).toEqual([
      { seconds: 0, label: '00:00' },
    ])
  })
})

describe('withTimestamp', () => {
  it('appends a t= deep link', () => {
    expect(withTimestamp('https://www.youtube.com/watch?v=abc123', 724))
      .toBe('https://www.youtube.com/watch?v=abc123&t=724s')
  })

  it('replaces an existing t= rather than duplicating it', () => {
    expect(withTimestamp('https://www.youtube.com/watch?v=abc123&t=10s', 500))
      .toBe('https://www.youtube.com/watch?v=abc123&t=500s')
  })

  it('floors fractional seconds and clamps negatives', () => {
    expect(withTimestamp('https://www.youtube.com/watch?v=x', 12.7)).toContain('t=12s')
    expect(withTimestamp('https://www.youtube.com/watch?v=x', -5)).toContain('t=0s')
  })
})
