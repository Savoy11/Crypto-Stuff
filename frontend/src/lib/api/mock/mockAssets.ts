import type { Asset, AssetDetail, MarketData, PegDataPoint, ReserveAttestation, AnalyticsBundle } from '@/types/asset'
import type { PaginatedResponse, TimeRange } from '@/types/api'
import type { GetAssetsParams } from '../assets'
import { subDays, subHours, format } from 'date-fns'

export const MOCK_ASSETS: Asset[] = [
  {
    id: 'usdc',
    symbol: 'USDC',
    name: 'USD Coin',
    assetType: 'stablecoin',
    blockchain: 'ethereum',
    contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    isActive: true,
    marketCap: 43_200_000_000,
    price: 1.0001,
    pegTarget: 1.0,
    pegDeviation: 0.0001,
    pegDeviationBps: 1.0,
    riskScore: 91.2,
    riskBand: 'low',
    reserveRatio: 1.002,
    volume24h: 8_400_000_000,
    priceChange24h: 0.01,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
    issuer: 'Circle',
    description: 'USD-backed stablecoin issued by Circle, fully regulated and audited.',
    website: 'https://circle.com/usdc',
  },
  {
    id: 'usdt',
    symbol: 'USDT',
    name: 'Tether USD',
    assetType: 'stablecoin',
    blockchain: 'ethereum',
    contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    isActive: true,
    marketCap: 110_000_000_000,
    price: 1.0002,
    pegTarget: 1.0,
    pegDeviation: 0.0002,
    pegDeviationBps: 2.0,
    riskScore: 62.8,
    riskBand: 'moderate',
    reserveRatio: 1.001,
    volume24h: 31_500_000_000,
    priceChange24h: 0.02,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
    issuer: 'Tether Limited',
    description: 'The largest stablecoin by market cap, backed by a mix of USD reserves.',
    website: 'https://tether.to',
  },
  {
    id: 'dai',
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    assetType: 'stablecoin',
    blockchain: 'ethereum',
    contractAddress: '0x6b175474e89094c44da98b954eedeac495271d0f',
    isActive: true,
    marketCap: 5_400_000_000,
    price: 0.9998,
    pegTarget: 1.0,
    pegDeviation: -0.0002,
    pegDeviationBps: -2.0,
    riskScore: 74.5,
    riskBand: 'moderate',
    reserveRatio: 1.55,
    volume24h: 420_000_000,
    priceChange24h: -0.02,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
    issuer: 'MakerDAO',
    description: 'Decentralized stablecoin over-collateralized by crypto assets.',
    website: 'https://makerdao.com',
  },
  {
    id: 'frax',
    symbol: 'FRAX',
    name: 'Frax',
    assetType: 'stablecoin',
    blockchain: 'ethereum',
    contractAddress: '0x853d955acef822db058eb8505911ed77f175b99e',
    isActive: true,
    marketCap: 650_000_000,
    price: 0.9991,
    pegTarget: 1.0,
    pegDeviation: -0.0009,
    pegDeviationBps: -9.0,
    riskScore: 55.1,
    riskBand: 'elevated',
    reserveRatio: 1.02,
    volume24h: 38_000_000,
    priceChange24h: -0.09,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
    issuer: 'Frax Finance',
    description: 'Fractional-algorithmic stablecoin with partial collateralization.',
    website: 'https://frax.finance',
  },
  {
    id: 'tusd',
    symbol: 'TUSD',
    name: 'TrueUSD',
    assetType: 'stablecoin',
    blockchain: 'ethereum',
    contractAddress: '0x0000000000085d4780b73119b644ae5ecd22b376',
    isActive: true,
    marketCap: 480_000_000,
    price: 1.0012,
    pegTarget: 1.0,
    pegDeviation: 0.0012,
    pegDeviationBps: 12.0,
    riskScore: 58.3,
    riskBand: 'elevated',
    reserveRatio: 1.0,
    volume24h: 62_000_000,
    priceChange24h: 0.12,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
    issuer: 'TrustToken',
    description: 'USD-backed stablecoin with real-time on-chain attestations.',
    website: 'https://trueusd.com',
  },
  {
    id: 'pyusd',
    symbol: 'PYUSD',
    name: 'PayPal USD',
    assetType: 'stablecoin',
    blockchain: 'ethereum',
    contractAddress: '0x6c3ea9036406852006290770bedfcaba0e23a0e8',
    isActive: true,
    marketCap: 310_000_000,
    price: 1.0003,
    pegTarget: 1.0,
    pegDeviation: 0.0003,
    pegDeviationBps: 3.0,
    riskScore: 82.7,
    riskBand: 'low',
    reserveRatio: 1.001,
    volume24h: 29_000_000,
    priceChange24h: 0.03,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
    issuer: 'PayPal / Paxos',
    description: 'USD-backed stablecoin issued by PayPal in partnership with Paxos.',
    website: 'https://paypal.com/pyusd',
  },
  {
    id: 'usdp',
    symbol: 'USDP',
    name: 'Pax Dollar',
    assetType: 'stablecoin',
    blockchain: 'ethereum',
    contractAddress: '0x8e870d67f660d95d5be530380d0ec0bd388289e1',
    isActive: true,
    marketCap: 175_000_000,
    price: 0.9999,
    pegTarget: 1.0,
    pegDeviation: -0.0001,
    pegDeviationBps: -1.0,
    riskScore: 85.4,
    riskBand: 'low',
    reserveRatio: 1.0,
    volume24h: 12_000_000,
    priceChange24h: -0.01,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
    issuer: 'Paxos',
    description: 'Regulated USD-backed stablecoin from Paxos Trust Company.',
    website: 'https://paxos.com/usdp',
  },
  {
    id: 'gusd',
    symbol: 'GUSD',
    name: 'Gemini Dollar',
    assetType: 'stablecoin',
    blockchain: 'ethereum',
    contractAddress: '0x056fd409e1d7a124bd7017459dfea2f387b6d5cd',
    isActive: true,
    marketCap: 98_000_000,
    price: 1.0001,
    pegTarget: 1.0,
    pegDeviation: 0.0001,
    pegDeviationBps: 1.0,
    riskScore: 87.1,
    riskBand: 'low',
    reserveRatio: 1.001,
    volume24h: 8_500_000,
    priceChange24h: 0.01,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
    issuer: 'Gemini Trust Company',
    description: 'Regulated stablecoin issued by the Gemini cryptocurrency exchange.',
    website: 'https://gemini.com/dollar',
  },
  {
    id: 'lusd',
    symbol: 'LUSD',
    name: 'Liquity USD',
    assetType: 'stablecoin',
    blockchain: 'ethereum',
    contractAddress: '0x5f98805a4e8be255a32880fdec7f6728c6568ba0',
    isActive: true,
    marketCap: 230_000_000,
    price: 1.0088,
    pegTarget: 1.0,
    pegDeviation: 0.0088,
    pegDeviationBps: 88.0,
    riskScore: 38.2,
    riskBand: 'high',
    reserveRatio: 1.11,
    volume24h: 18_000_000,
    priceChange24h: 0.88,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
    issuer: 'Liquity Protocol',
    description: 'Decentralized stablecoin backed exclusively by ETH with 0% interest.',
    website: 'https://liquity.org',
  },
  {
    id: 'busd',
    symbol: 'BUSD',
    name: 'Binance USD',
    assetType: 'stablecoin',
    blockchain: 'ethereum',
    contractAddress: '0x4fabb145d64652a948d72533023f6e7a623c7c53',
    isActive: false,
    marketCap: 2_100_000,
    price: 0.9745,
    pegTarget: 1.0,
    pegDeviation: -0.0255,
    pegDeviationBps: -255.0,
    riskScore: 12.4,
    riskBand: 'critical',
    reserveRatio: 0.97,
    volume24h: 550_000,
    priceChange24h: -2.55,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
    issuer: 'Paxos / Binance',
    description: 'Deprecated USD-backed stablecoin; Paxos ceased minting in Feb 2023.',
    website: 'https://binance.com',
  },
]

function generatePegHistory(assetId: string, timeRange: TimeRange): PegDataPoint[] {
  const asset = MOCK_ASSETS.find((a) => a.id === assetId)
  const baseDev = asset?.pegDeviationBps ?? 5
  const points: PegDataPoint[] = []

  const rangeHours: Record<TimeRange, number> = {
    '1h': 1,
    '24h': 24,
    '7d': 168,
    '30d': 720,
    '90d': 2160,
    '1y': 8760,
  }
  const hours = rangeHours[timeRange] ?? 168
  const intervalHours = hours > 720 ? 24 : hours > 168 ? 6 : hours > 24 ? 1 : 0.25

  let now = new Date()
  let currentDev = baseDev

  for (let i = hours; i >= 0; i -= intervalHours) {
    const ts = subHours(now, i)
    // Random walk
    currentDev += (Math.random() - 0.5) * 4
    currentDev = Math.max(-300, Math.min(300, currentDev))
    // Revert to mean
    currentDev = currentDev * 0.95 + baseDev * 0.05

    const devFraction = currentDev / 10000
    const price = 1.0 + devFraction

    points.push({
      timestamp: ts.toISOString(),
      price: parseFloat(price.toFixed(6)),
      pegDeviation: devFraction,
      volume: 1_000_000 + Math.random() * 5_000_000,
    })
  }

  return points
}

export async function getMockAssets(params: GetAssetsParams): Promise<PaginatedResponse<Asset>> {
  let assets = [...MOCK_ASSETS]

  if (params.search) {
    const q = params.search.toLowerCase()
    assets = assets.filter(
      (a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    )
  }
  if (params.assetType && params.assetType !== 'all') {
    assets = assets.filter((a) => a.assetType === params.assetType)
  }
  if (params.blockchain && params.blockchain !== 'all') {
    assets = assets.filter((a) => a.blockchain === params.blockchain)
  }
  if (params.riskBand && params.riskBand !== 'all') {
    assets = assets.filter((a) => a.riskBand === params.riskBand)
  }
  if (params.minRiskScore !== undefined) {
    assets = assets.filter((a) => a.riskScore >= (params.minRiskScore ?? 0))
  }
  if (params.maxRiskScore !== undefined) {
    assets = assets.filter((a) => a.riskScore <= (params.maxRiskScore ?? 100))
  }

  // Sort
  if (params.sortBy) {
    const key = params.sortBy as keyof Asset
    const dir = params.sortDirection === 'asc' ? 1 : -1
    assets = assets.sort((a, b) => {
      const av = a[key] as number | string
      const bv = b[key] as number | string
      if (av < bv) return -dir
      if (av > bv) return dir
      return 0
    })
  }

  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25
  const start = (page - 1) * pageSize
  const paginated = assets.slice(start, start + pageSize)

  return {
    data: paginated,
    total: assets.length,
    page,
    pageSize,
    totalPages: Math.ceil(assets.length / pageSize),
    hasNext: start + pageSize < assets.length,
    hasPrev: page > 1,
  }
}

export async function getMockAssetDetail(id: string): Promise<AssetDetail> {
  const asset = MOCK_ASSETS.find((a) => a.id === id) ?? MOCK_ASSETS[0]

  const latestRiskScore = {
    id: `rs-${asset.id}-latest`,
    assetId: asset.id,
    overallScore: asset.riskScore,
    reserveScore: asset.riskScore * 0.95 + Math.random() * 5,
    pegScore: asset.riskScore * 1.02 - Math.random() * 3,
    networkScore: asset.riskScore * 0.98 + Math.random() * 4,
    securityScore: asset.riskScore * 1.01 - Math.random() * 2,
    riskBand: asset.riskBand,
    confidence: 0.87 + Math.random() * 0.1,
    percentileRank: Math.round(asset.riskScore * 0.9 + Math.random() * 10),
    scoreBreakdown: {
      reserveScore: Math.min(100, asset.riskScore * 0.95 + 2),
      reserveWeight: 35,
      pegScore: Math.min(100, asset.riskScore + 2),
      pegWeight: 30,
      networkScore: Math.min(100, asset.riskScore * 0.98 + 1),
      networkWeight: 20,
      securityScore: Math.min(100, asset.riskScore * 1.02 - 1),
      securityWeight: 15,
    },
    scoreDate: new Date().toISOString(),
    previousScore: asset.riskScore - (Math.random() * 4 - 2),
    scoreDelta: Math.random() * 4 - 2,
  }

  const latestMarketData: MarketData = {
    id: `md-${asset.id}-latest`,
    assetId: asset.id,
    price: asset.price,
    marketCap: asset.marketCap,
    volume24h: asset.volume24h,
    pegDeviation: asset.pegDeviation,
    priceChange24h: asset.priceChange24h,
    priceChangePercent24h: asset.priceChange24h,
    high24h: asset.price * 1.002,
    low24h: asset.price * 0.998,
    circulatingSupply: Math.round(asset.marketCap / asset.price),
    totalSupply: Math.round(asset.marketCap / asset.price * 1.01),
    timestamp: new Date().toISOString(),
  }

  const latestReserve: ReserveAttestation = {
    id: `ra-${asset.id}-latest`,
    assetId: asset.id,
    attestationDate: subDays(new Date(), 3).toISOString(),
    totalReserves: asset.marketCap * asset.reserveRatio,
    totalLiabilities: asset.marketCap,
    reserveRatio: asset.reserveRatio,
    attestor: asset.assetType === 'stablecoin' ? 'Grant Thornton LLP' : 'Deloitte & Touche',
    reportUrl: 'https://example.com/attestation.pdf',
    isVerified: true,
    composition: [
      { category: 'Cash & Equivalents', amount: asset.marketCap * 0.25, percentage: 25, description: 'Bank deposits' },
      { category: 'T-Bills', amount: asset.marketCap * 0.55, percentage: 55, description: 'US Treasury Bills <3mo' },
      { category: 'Commercial Paper', amount: asset.marketCap * 0.10, percentage: 10, description: 'A1/P1 rated' },
      { category: 'Crypto Assets', amount: asset.marketCap * 0.05, percentage: 5, description: 'BTC/ETH collateral' },
      { category: 'Other', amount: asset.marketCap * 0.05, percentage: 5, description: 'Money market funds' },
    ],
  }

  const analyticsBundle: AnalyticsBundle = {
    pegHistory: generatePegHistory(asset.id, '30d'),
    scoreHistory: Array.from({ length: 30 }, (_, i) => ({
      date: format(subDays(new Date(), 30 - i), 'yyyy-MM-dd'),
      score: Math.min(100, Math.max(0, asset.riskScore + (Math.random() - 0.5) * 8)),
      riskBand: asset.riskBand,
    })),
    liquidityDepth: Array.from({ length: 20 }, (_, i) => ({
      price: 1.0 - 0.01 + i * 0.001,
      bidDepth: Math.max(0, 5_000_000 - i * 200_000 + Math.random() * 100_000),
      askDepth: Math.max(0, 5_000_000 - i * 200_000 + Math.random() * 100_000),
    })),
    walletConcentration: {
      giniCoefficient: 0.72 + Math.random() * 0.15,
      herfindahlIndex: 0.08 + Math.random() * 0.12,
      top10HoldersPercent: 38 + Math.random() * 20,
      top50HoldersPercent: 61 + Math.random() * 15,
      totalHolders: Math.round(asset.marketCap / 10000),
    },
    transferVelocity: Array.from({ length: 30 }, (_, i) => ({
      date: format(subDays(new Date(), 30 - i), 'yyyy-MM-dd'),
      transferCount: Math.round(10000 + Math.random() * 5000),
      transferVolume: asset.volume24h * (0.8 + Math.random() * 0.4),
      uniqueAddresses: Math.round(3000 + Math.random() * 2000),
    })),
  }

  return { ...asset, latestRiskScore, latestMarketData, latestReserve, analyticsBundle }
}

export async function getMockMarketData(assetId: string): Promise<MarketData> {
  const asset = MOCK_ASSETS.find((a) => a.id === assetId) ?? MOCK_ASSETS[0]
  return {
    id: `md-${asset.id}`,
    assetId: asset.id,
    price: asset.price,
    marketCap: asset.marketCap,
    volume24h: asset.volume24h,
    pegDeviation: asset.pegDeviation,
    priceChange24h: asset.priceChange24h,
    priceChangePercent24h: asset.priceChange24h,
    high24h: asset.price * 1.002,
    low24h: asset.price * 0.998,
    circulatingSupply: Math.round(asset.marketCap / asset.price),
    totalSupply: Math.round(asset.marketCap / asset.price * 1.01),
    timestamp: new Date().toISOString(),
  }
}

export async function getMockPegHistory(assetId: string, timeRange: TimeRange): Promise<PegDataPoint[]> {
  return generatePegHistory(assetId, timeRange)
}
