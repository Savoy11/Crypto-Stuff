export type AssetType = 'stablecoin' | 'tokenized' | 'cbdc' | 'defi'
export type RiskBand = 'low' | 'moderate' | 'elevated' | 'high' | 'critical'
export type Blockchain = 'ethereum' | 'solana' | 'polygon' | 'avalanche' | 'tron' | 'other'

export interface Asset {
  id: string
  symbol: string
  name: string
  assetType: AssetType
  blockchain: Blockchain
  contractAddress: string
  isActive: boolean
  marketCap: number
  price: number
  pegDeviation: number // in basis points
  riskScore: number
  riskBand: RiskBand
  reserveRatio: number
  volume24h: number
  createdAt: string
  updatedAt: string
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
  price: number
  marketCap: number
  volume24h: number
  pegDeviation: number
  priceChange24h: number
  priceChangePercent24h: number
  high24h: number
  low24h: number
  circulatingSupply: number
  totalSupply: number
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
  latestRiskScore: RiskScore
  latestMarketData: MarketData
  latestReserve: ReserveAttestation
  analyticsBundle: AnalyticsBundle
}

export interface AssetFilters {
  assetType: AssetType | 'all'
  blockchain: Blockchain | 'all'
  riskBand: RiskBand | 'all'
  search: string
  minRiskScore: number
  maxRiskScore: number
  minMarketCap: number
}

export interface AssetSortConfig {
  key: keyof Asset
  direction: 'asc' | 'desc'
}
