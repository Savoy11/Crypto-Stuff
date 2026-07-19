export const APP_NAME = 'CAEP'
export const APP_FULL_NAME = 'Crypto Asset Evaluation Platform'
export const APP_VERSION = '1.1.0'

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000/ws'

// CAEP runs in live-only mode. Numeric market fields (price, market cap, volume,
// 24h change, circulating supply) are sourced live from CoinGecko via the
// /live-data/* route handlers. Metadata (name, chain, issuer, etc.) comes from
// the static catalog (lib/data/assetCatalog.ts). Derived metrics (risk,
// reserves, peg analytics) with no free live source are surfaced as "not
// available" rather than fabricated. There is no mock/demo data path — see
// DATA-AVAILABILITY.md.
export const LIVE_DATA = true

// Base path for the in-app live-data proxy routes (see src/app/live-data/*).
export const LIVE_DATA_BASE = '/live-data'

export const DEFAULT_PAGE_SIZE = 25
export const PAGE_SIZE_OPTIONS = [25, 50, 100]

export const STALE_TIME_SHORT = 30_000       // 30s
export const STALE_TIME_MEDIUM = 60_000      // 1m
export const STALE_TIME_LONG = 300_000       // 5m
export const GC_TIME = 600_000               // 10m

export const WS_RECONNECT_INITIAL = 1_000
export const WS_RECONNECT_MAX = 30_000
export const WS_HEARTBEAT_INTERVAL = 25_000

export const TIME_RANGE_OPTIONS = [
  { label: '1H', value: '1h' },
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: '1Y', value: '1y' },
] as const

export const ASSET_TYPE_LABELS: Record<string, string> = {
  stablecoin: 'Stablecoin',
  tokenized: 'Tokenized Asset',
  cbdc: 'CBDC',
  defi: 'DeFi',
  layer1: 'Layer 1',
  all: 'All Types',
}

export const BLOCKCHAIN_LABELS: Record<string, string> = {
  ethereum: 'Ethereum',
  solana: 'Solana',
  polygon: 'Polygon',
  avalanche: 'Avalanche',
  tron: 'Tron',
  bitcoin: 'Bitcoin',
  'bnb-chain': 'BNB Chain',
  cardano: 'Cardano',
  polkadot: 'Polkadot',
  ton: 'TON',
  'bitcoin-cash': 'Bitcoin Cash',
  litecoin: 'Litecoin',
  monero: 'Monero',
  zcash: 'Zcash',
  hedera: 'Hedera',
  sui: 'Sui',
  near: 'NEAR',
  'internet-computer': 'Internet Computer',
  etc: 'Ethereum Classic',
  kaspa: 'Kaspa',
  algorand: 'Algorand',
  filecoin: 'Filecoin',
  aptos: 'Aptos',
  injective: 'Injective',
  vechain: 'VeChain',
  tezos: 'Tezos',
  iota: 'IOTA',
  other: 'Other',
  all: 'All Chains',
}

export const RESERVE_CATEGORY_COLORS: Record<string, string> = {
  'Cash & Equivalents': '#10b981',
  'T-Bills': '#3b82f6',
  'Commercial Paper': '#f59e0b',
  'Crypto Assets': '#f97316',
  'Other': '#64748b',
}

export const CHART_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#ec4899',
]
