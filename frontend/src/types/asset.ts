export type AssetType = 'stablecoin' | 'tokenized' | 'cbdc' | 'defi' | 'layer1'
// Single source of truth for the band vocabulary is lib/risk/types.ts. Imported
// locally (used below) and re-exported so existing `@/types/asset` importers work.
import type { RiskBand } from '@/lib/risk/types'
export type { RiskBand }
export type Blockchain =
  | 'ethereum' | 'solana' | 'polygon' | 'avalanche' | 'tron' | 'bitcoin'
  | 'bnb-chain' | 'cardano' | 'polkadot' | 'ton' | 'bitcoin-cash' | 'litecoin'
  | 'monero' | 'zcash' | 'hedera' | 'sui' | 'near' | 'internet-computer'
  | 'etc' | 'kaspa' | 'algorand' | 'filecoin' | 'aptos' | 'injective'
  | 'vechain' | 'tezos' | 'iota' | 'other'

export interface Asset {
  id: string
  symbol: string
  name: string
  assetType: AssetType
  blockchain: Blockchain
  contractAddress: string
  isActive: boolean
  // Live-sourced numeric fields are null when no live quote is available.
  marketCap: number | null
  price: number | null
  volume24h: number | null
  priceChange24h?: number | null
  priceChangePercent24h?: number | null
  // Valuation / technical fields used by the Coins screener. Null whenever the
  // serving provider did not carry them — never derived from partial data.
  fdv?: number | null
  priceChange7d?: number | null
  priceChange30d?: number | null
  /** Negative: percent below the all-time high. */
  athChangePct?: number | null
  circulatingSupply?: number | null
  totalSupply?: number | null
  maxSupply?: number | null
  marketCapRank?: number | null
  // Derived metrics have no free live source — strict N/A (always null in live mode).
  pegDeviation: number | null // fractional, e.g. 0.0001 = 1 bps
  pegDeviationBps?: number | null // alias in basis points
  pegTarget?: number
  riskScore: number | null
  riskBand: RiskBand | null
  reserveRatio: number | null
  createdAt: string
  updatedAt: string
  // Optional enrichment fields
  description?: string
  issuer?: string
  website?: string
  whitepaper?: string
  coingeckoId?: string
  // Layer 1 specific fields
  consensusMechanism?: string
  stakingAPY?: number
  validatorCount?: number
  maxTPS?: number
  marketDominance?: number
}

export interface ScoreBreakdown {
  reserveScore: number
  reserveWeight: number
  pegScore: number
  pegWeight: number
  networkScore: number
  networkWeight: number
  securityScore: number
  securityWeight: number
}

export interface RiskScore {
  id: string
  assetId: string
  overallScore: number
  reserveScore: number
  pegScore: number
  networkScore: number
  securityScore: number
  riskBand: RiskBand
  confidence: number
  percentileRank: number
  scoreBreakdown: ScoreBreakdown
  scoreDate: string
  previousScore: number | null
  scoreDelta: number | null
}

export interface MarketData {
  id: string
  assetId: string
  price: number | null
  marketCap: number | null
  volume24h: number | null
  pegDeviation: number | null
  priceChange24h: number | null
  priceChangePercent24h: number | null
  high24h: number | null
  low24h: number | null
  circulatingSupply: number | null
  totalSupply: number | null
  timestamp: string
}

export interface ReserveAttestation {
  id: string
  assetId: string
  attestationDate: string
  totalReserves: number
  totalLiabilities: number
  reserveRatio: number
  attestor: string
  reportUrl: string | null
  composition: ReserveCompositionItem[]
  isVerified: boolean
}

export interface ReserveCompositionItem {
  category: string
  amount: number
  percentage: number
  description: string
}

export interface PegDataPoint {
  timestamp: string
  price: number
  pegDeviation: number
  volume: number
}

export interface ScoreDataPoint {
  date: string
  score: number
  riskBand: RiskBand
}

export interface AnalyticsBundle {
  pegHistory: PegDataPoint[]
  scoreHistory: ScoreDataPoint[]
  liquidityDepth: LiquidityDepthItem[]
  walletConcentration: WalletConcentrationData
  transferVelocity: VelocityDataPoint[]
}

export interface LiquidityDepthItem {
  price: number
  bidDepth: number
  askDepth: number
}

export interface WalletConcentrationData {
  giniCoefficient: number
  herfindahlIndex: number
  top10HoldersPercent: number
  top50HoldersPercent: number
  totalHolders: number
}

export interface VelocityDataPoint {
  date: string
  transferCount: number
  transferVolume: number
  uniqueAddresses: number
}

export interface AssetDetail extends Asset {
  // Derived bundles are null in live mode — no free live source (strict N/A).
  latestRiskScore: RiskScore | null
  latestMarketData: MarketData
  latestReserve: ReserveAttestation | null
  analyticsBundle: AnalyticsBundle | null
}

export interface AssetFilters {
  assetType: AssetType | 'all'
  blockchain: Blockchain | 'all'
  riskBand: RiskBand | 'all'
  search: string
  minRiskScore: number
  maxRiskScore: number
  minMarketCap: number
  /**
   * Minimum 24h-volume/market-cap ratio, in percent (W3-2 — "search by
   * liquidity"). 0 = no filter. A fact from the feed, same definition as Coin
   * Discovery's liquidity ratio.
   */
  minLiquidityPct: number
}

export interface AssetSortConfig {
  key: keyof Asset
  direction: 'asc' | 'desc'
}
