export const APP_NAME = 'CAEP'
export const APP_FULL_NAME = 'Crypto Asset Evaluation Platform'
export const APP_VERSION = '1.0.0'

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000/ws'
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true'

export const DEFAULT_PAGE_SIZE = 25
export const PAGE_SIZE_OPTIONS = [25, 50, 100]

export const STALE_TIME_SHORT = 30_000       // 30s
export const STALE_TIME_MEDIUM = 60_000      // 1m
export const STALE_TIME_LONG = 300_000       // 5m
export const GC_TIME = 600_000               // 10m

export const WS_RECONNECT_INITIAL = 1_000
export const WS_RECONNECT_MAX = 30_000
export const WS_HEARTBEAT_INTERVAL = 25_000

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { href: '/assets', label: 'Assets', icon: 'Database' },
  { href: '/risk-scores', label: 'Risk Scores', icon: 'Shield' },
  { href: '/reserves', label: 'Reserves', icon: 'Vault' },
  { href: '/alerts', label: 'Alerts', icon: 'Bell' },
  { href: '/watchlist', label: 'Watchlist', icon: 'Star' },
  { href: '/reports', label: 'Reports', icon: 'FileBarChart' },
] as const

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
