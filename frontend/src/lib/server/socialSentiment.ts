// Per-symbol sentiment summaries over a set of social signals. Pure so the
// score users see on the social pages is testable; companion to socialBlend
// (which decides WHICH signals make the page — this scores what's on it).

export type Sentiment = 'positive' | 'negative' | 'neutral'

export interface SentimentTagged {
  sentiment: Sentiment
  symbols: string[]
}

export interface SentimentSummary {
  symbol: string
  label: string
  positive: number
  negative: number
  neutral: number
  total: number
  /** −1 … +1 */
  sentimentScore: number
}

/**
 * Group signals by tagged symbol and score each: (positive − negative) / total.
 * With `focus` set, only that symbol summarizes (even on a single mention);
 * otherwise symbols need ≥2 mentions, ranked by volume, top 6.
 */
export function computeSentimentSummaries<T extends SentimentTagged>(
  signals: T[],
  labelFor: (symbol: string) => string,
  focus?: string,
): SentimentSummary[] {
  const bySymbol = new Map<string, T[]>()
  for (const signal of signals) {
    for (const sym of signal.symbols) {
      const arr = bySymbol.get(sym) ?? []
      arr.push(signal)
      bySymbol.set(sym, arr)
    }
  }
  const entries = Array.from(bySymbol.entries())
    .filter(([sym, list]) => (focus ? sym === focus : list.length >= 2))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
  return entries.map(([sym, list]) => {
    const positive = list.filter((s) => s.sentiment === 'positive').length
    const negative = list.filter((s) => s.sentiment === 'negative').length
    const neutral = list.length - positive - negative
    return {
      symbol: sym,
      label: labelFor(sym),
      positive, negative, neutral,
      total: list.length,
      sentimentScore: list.length ? (positive - negative) / list.length : 0,
    }
  })
}
