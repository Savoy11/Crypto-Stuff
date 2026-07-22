import { describe, it, expect } from 'vitest'
import { blendByProvider, type Timestamped } from '../socialBlend'

// Regression cover for the Reddit-starvation bug on /live-data/stock-social:
// a merged pool sorted by pure recency handed every slot to the high-volume
// provider, so the slower one was invisible at normal page limits while still
// being named as a source.

interface Item extends Timestamped { id: string }

/** n items for `provider`, newest first, spaced a minute apart from `startMin`. */
function items(provider: string, n: number, startMin: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${provider}-${i}`,
    publishedAt: new Date(Date.UTC(2026, 0, 1, 0, startMin - i)).toISOString(),
  }))
}

const countBy = (list: Item[]) =>
  list.reduce<Record<string, number>>((acc, i) => {
    const p = i.id.split('-')[0]
    acc[p] = (acc[p] ?? 0) + 1
    return acc
  }, {})

describe('blendByProvider', () => {
  it('keeps the slow provider visible when a fast one dominates recency', () => {
    // The real shape: StockTwits posts continuously (all of the newest items),
    // Reddit trickles. Pure recency + slice(20) returned 20/0.
    const byProvider = new Map<string, Item[]>([
      ['stocktwits', items('stocktwits', 60, 59)],
      ['reddit', items('reddit', 15, 20)],
    ])
    const { items: out, contributed } = blendByProvider(byProvider, 20)

    expect(out).toHaveLength(20)
    expect(countBy(out)).toEqual({ stocktwits: 10, reddit: 10 })
    expect(contributed).toEqual(new Set(['stocktwits', 'reddit']))
  })

  it('redistributes the unused share when a provider runs dry', () => {
    // Reddit can only supply 5; the remaining budget must go to StockTwits
    // rather than being wasted on empty slots.
    const byProvider = new Map<string, Item[]>([
      ['stocktwits', items('stocktwits', 60, 59)],
      ['reddit', items('reddit', 5, 20)],
    ])
    const { items: out } = blendByProvider(byProvider, 20)

    expect(out).toHaveLength(20)
    expect(countBy(out)).toEqual({ stocktwits: 15, reddit: 5 })
  })

  it('lets a single active provider fill the whole budget', () => {
    const byProvider = new Map<string, Item[]>([
      ['stocktwits', items('stocktwits', 40, 39)],
      ['reddit', []], // fulfilled but empty — e.g. Reddit 429s
    ])
    const { items: out, contributed } = blendByProvider(byProvider, 30)

    expect(out).toHaveLength(30)
    expect(countBy(out)).toEqual({ stocktwits: 30 })
    // Attribution must not name a provider that contributed nothing — that is
    // what made the starvation invisible in the first place.
    expect(contributed.has('reddit')).toBe(false)
  })

  it('returns the result in reverse-chronological order', () => {
    const byProvider = new Map<string, Item[]>([
      ['a', items('a', 10, 59)],
      ['b', items('b', 10, 30)],
    ])
    const { items: out } = blendByProvider(byProvider, 12)

    const times = out.map((i) => new Date(i.publishedAt).getTime())
    expect(times).toEqual([...times].sort((x, y) => y - x))
  })

  it('takes each provider\'s freshest items, not an arbitrary slice', () => {
    // Deliberately out of order on input — the blend must sort per provider.
    const shuffled: Item[] = [
      { id: 'a-old', publishedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'a-new', publishedAt: '2026-01-03T00:00:00.000Z' },
      { id: 'a-mid', publishedAt: '2026-01-02T00:00:00.000Z' },
    ]
    const { items: out } = blendByProvider(new Map([['a', shuffled]]), 2)

    expect(out.map((i) => i.id)).toEqual(['a-new', 'a-mid'])
  })

  it('does not mutate the caller\'s queues', () => {
    const original = items('a', 5, 10)
    const byProvider = new Map<string, Item[]>([['a', original]])
    blendByProvider(byProvider, 3)

    expect(original).toHaveLength(5)
  })

  it('handles an empty map and a zero limit without spinning', () => {
    expect(blendByProvider(new Map<string, Item[]>(), 10).items).toEqual([])
    expect(blendByProvider(new Map([['a', items('a', 5, 10)]]), 0).items).toEqual([])
  })
})
