export interface CoinListEntry {
  id: string
  symbol: string
  name: string
  price: number
  marketCap: number
  rank: number
  image: string
}

export interface CoinListResponse {
  ok: boolean
  coins: CoinListEntry[]
  updatedAt: string
  source: string
  /**
   * True when some CoinGecko pages were rate-limited, so this list is a prefix
   * of the intended 750 rather than the whole set. Serving 250 coins while
   * implying 750 is the silent-degradation failure mode this codebase treats as
   * a bug — callers should surface it rather than assume completeness.
   */
  partial?: boolean
  /** Per-page upstream failures, present when `partial` is true. */
  error?: string
}
