import { describe, it, expect } from 'vitest'
import { computeSentimentSummaries, type SentimentTagged } from '../socialSentiment'

// Note: the score is (positive − negative) / total on a −1…+1 scale, matching
// the documented StockSentimentSummary contract and what SentimentBar renders.
// It is NOT a −100…+100 figure — any consumer wanting that must scale it.

const sig = (sentiment: SentimentTagged['sentiment'], ...symbols: string[]): SentimentTagged =>
  ({ sentiment, symbols })

const label = (sym: string) => `Label(${sym})`

describe('computeSentimentSummaries', () => {
  it('scores an all-positive symbol at exactly +1', () => {
    const [s] = computeSentimentSummaries(
      [sig('positive', 'AAPL'), sig('positive', 'AAPL'), sig('positive', 'AAPL')],
      label,
    )
    expect(s).toEqual({
      symbol: 'AAPL', label: 'Label(AAPL)',
      positive: 3, negative: 0, neutral: 0, total: 3, sentimentScore: 1,
    })
  })

  it('scores an all-negative symbol at exactly -1', () => {
    const [s] = computeSentimentSummaries([sig('negative', 'TSLA'), sig('negative', 'TSLA')], label)
    expect(s.sentimentScore).toBe(-1)
    expect(s.negative).toBe(2)
  })

  it('scores a mix as (positive - negative) / total, neutral diluting', () => {
    const [s] = computeSentimentSummaries(
      [sig('positive', 'NVDA'), sig('positive', 'NVDA'), sig('negative', 'NVDA'), sig('neutral', 'NVDA')],
      label,
    )
    expect(s).toMatchObject({ positive: 2, negative: 1, neutral: 1, total: 4, sentimentScore: 0.25 })
  })

  it('returns no summaries for empty input — never divides by zero', () => {
    expect(computeSentimentSummaries([], label)).toEqual([])
    expect(computeSentimentSummaries([], label, 'AAPL')).toEqual([])
  })

  it('stays within [-1, +1] for any mix', () => {
    const signals = Array.from({ length: 50 }, (_, i) =>
      sig((['positive', 'negative', 'neutral'] as const)[i % 3], 'SPY'))
    const [s] = computeSentimentSummaries(signals, label)
    expect(s.sentimentScore).toBeGreaterThanOrEqual(-1)
    expect(s.sentimentScore).toBeLessThanOrEqual(1)
  })

  it('drops single-mention symbols unless they are the focus', () => {
    const signals = [sig('positive', 'AAPL'), sig('positive', 'MSFT'), sig('negative', 'MSFT')]
    expect(computeSentimentSummaries(signals, label).map((s) => s.symbol)).toEqual(['MSFT'])
    expect(computeSentimentSummaries(signals, label, 'AAPL').map((s) => s.symbol)).toEqual(['AAPL'])
  })

  it('ranks by mention volume and caps at six symbols', () => {
    const signals = Array.from({ length: 8 }, (_, i) =>
      [sig('neutral', `S${i}`), ...Array.from({ length: i + 1 }, () => sig('neutral', `S${i}`))]).flat()
    const out = computeSentimentSummaries(signals, label)
    expect(out).toHaveLength(6)
    expect(out[0].symbol).toBe('S7')
    expect(out[0].total).toBeGreaterThanOrEqual(out[5].total)
  })

  it('counts a signal once per tagged symbol', () => {
    const out = computeSentimentSummaries(
      [sig('positive', 'AAPL', 'MSFT'), sig('negative', 'AAPL', 'MSFT')],
      label,
    )
    expect(out.map((s) => s.symbol).sort()).toEqual(['AAPL', 'MSFT'])
    for (const s of out) expect(s.sentimentScore).toBe(0)
  })
})
