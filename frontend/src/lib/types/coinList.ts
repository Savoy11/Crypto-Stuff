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
}
