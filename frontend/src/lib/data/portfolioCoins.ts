// All coins available for portfolio construction.
// Each entry maps a CoinGecko ID to display metadata and a risk tier (1-10).
// Risk tier is a rough volatility/fundamental proxy — NOT the same as staking risk.
// Lower = more established / less volatile.

export type CoinCategory =
  | 'layer1' | 'layer2' | 'defi' | 'stablecoin'
  | 'exchange' | 'privacy' | 'meme' | 'gaming'
  | 'interop' | 'ai' | 'rwa' | 'storage' | 'unknown'

export interface PortfolioCoin {
  cgId:      string
  symbol:    string
  name:      string
  category:  CoinCategory
  riskTier:  number     // 1–10 (higher = riskier)
  color:     string     // hex for charts
}

export const PORTFOLIO_COINS: PortfolioCoin[] = [
  // ─── Blue chips ────────────────────────────────────────────────────────────
  { cgId: 'bitcoin',              symbol: 'BTC',    name: 'Bitcoin',              category: 'layer1',     riskTier: 3,  color: '#f97316' },
  { cgId: 'ethereum',             symbol: 'ETH',    name: 'Ethereum',             category: 'layer1',     riskTier: 3,  color: '#8b5cf6' },
  { cgId: 'binancecoin',          symbol: 'BNB',    name: 'BNB',                  category: 'exchange',   riskTier: 4,  color: '#f59e0b' },
  { cgId: 'solana',               symbol: 'SOL',    name: 'Solana',               category: 'layer1',     riskTier: 4,  color: '#14b8a6' },

  // ─── Stablecoins ───────────────────────────────────────────────────────────
  { cgId: 'tether',               symbol: 'USDT',   name: 'Tether USD',           category: 'stablecoin', riskTier: 2,  color: '#22c55e' },
  { cgId: 'usd-coin',             symbol: 'USDC',   name: 'USD Coin',             category: 'stablecoin', riskTier: 1,  color: '#3b82f6' },
  { cgId: 'dai',                  symbol: 'DAI',    name: 'Dai',                  category: 'stablecoin', riskTier: 2,  color: '#f59e0b' },
  { cgId: 'frax',                 symbol: 'FRAX',   name: 'Frax',                 category: 'stablecoin', riskTier: 3,  color: '#94a3b8' },
  { cgId: 'true-usd',             symbol: 'TUSD',   name: 'TrueUSD',              category: 'stablecoin', riskTier: 2,  color: '#60a5fa' },
  { cgId: 'paypal-usd',           symbol: 'PYUSD',  name: 'PayPal USD',           category: 'stablecoin', riskTier: 1,  color: '#2563eb' },
  { cgId: 'first-digital-usd',    symbol: 'FDUSD',  name: 'First Digital USD',    category: 'stablecoin', riskTier: 2,  color: '#64748b' },
  { cgId: 'usdd',                 symbol: 'USDD',   name: 'USDD',                 category: 'stablecoin', riskTier: 4,  color: '#dc2626' },
  { cgId: 'gemini-dollar',        symbol: 'GUSD',   name: 'Gemini Dollar',        category: 'stablecoin', riskTier: 1,  color: '#06b6d4' },
  // CoinGecko id for Pax Dollar is the legacy 'paxos-standard' (NOT 'pax-dollar')
  { cgId: 'paxos-standard',       symbol: 'USDP',   name: 'Pax Dollar',           category: 'stablecoin', riskTier: 2,  color: '#34d399' },
  { cgId: 'magic-internet-money', symbol: 'MIM',    name: 'Magic Internet Money', category: 'stablecoin', riskTier: 5,  color: '#818cf8' },

  // ─── Alt L1s ───────────────────────────────────────────────────────────────
  { cgId: 'ripple',               symbol: 'XRP',    name: 'XRP',                  category: 'layer1',     riskTier: 4,  color: '#64748b' },
  { cgId: 'cardano',              symbol: 'ADA',    name: 'Cardano',              category: 'layer1',     riskTier: 5,  color: '#3b82f6' },
  { cgId: 'avalanche-2',          symbol: 'AVAX',   name: 'Avalanche',            category: 'layer1',     riskTier: 5,  color: '#ef4444' },
  { cgId: 'polkadot',             symbol: 'DOT',    name: 'Polkadot',             category: 'interop',    riskTier: 5,  color: '#ec4899' },
  { cgId: 'cosmos',               symbol: 'ATOM',   name: 'Cosmos',               category: 'interop',    riskTier: 5,  color: '#6366f1' },
  // Polygon migrated MATIC → POL in 2024; POL is the current native token.
  // The legacy MATIC entry stays so existing saved portfolios keep resolving.
  { cgId: 'polygon-ecosystem-token', symbol: 'POL', name: 'Polygon',              category: 'layer2',     riskTier: 5,  color: '#8b5cf6' },
  { cgId: 'matic-network',        symbol: 'MATIC',  name: 'Polygon (legacy MATIC)', category: 'layer2',   riskTier: 6,  color: '#a78bfa' },
  { cgId: 'tron',                 symbol: 'TRX',    name: 'Tron',                 category: 'layer1',     riskTier: 5,  color: '#ef4444' },
  { cgId: 'litecoin',             symbol: 'LTC',    name: 'Litecoin',             category: 'layer1',     riskTier: 4,  color: '#94a3b8' },
  { cgId: 'dogecoin',             symbol: 'DOGE',   name: 'Dogecoin',             category: 'meme',       riskTier: 7,  color: '#f59e0b' },
  { cgId: 'stellar',              symbol: 'XLM',    name: 'Stellar',              category: 'layer1',     riskTier: 5,  color: '#64748b' },
  { cgId: 'near',                 symbol: 'NEAR',   name: 'NEAR Protocol',        category: 'layer1',     riskTier: 6,  color: '#10b981' },
  { cgId: 'algorand',             symbol: 'ALGO',   name: 'Algorand',             category: 'layer1',     riskTier: 5,  color: '#64748b' },
  { cgId: 'hedera-hashgraph',     symbol: 'HBAR',   name: 'Hedera',               category: 'layer1',     riskTier: 5,  color: '#06b6d4' },
  { cgId: 'aptos',                symbol: 'APT',    name: 'Aptos',                category: 'layer1',     riskTier: 6,  color: '#10b981' },
  { cgId: 'sui',                  symbol: 'SUI',    name: 'Sui',                  category: 'layer1',     riskTier: 6,  color: '#3b82f6' },
  { cgId: 'internet-computer',    symbol: 'ICP',    name: 'Internet Computer',    category: 'layer1',     riskTier: 6,  color: '#f97316' },
  { cgId: 'vechain',              symbol: 'VET',    name: 'VeChain',              category: 'layer1',     riskTier: 6,  color: '#06b6d4' },
  { cgId: 'tezos',                symbol: 'XTZ',    name: 'Tezos',                category: 'layer1',     riskTier: 5,  color: '#3b82f6' },

  // ─── DeFi ──────────────────────────────────────────────────────────────────
  { cgId: 'chainlink',            symbol: 'LINK',   name: 'Chainlink',            category: 'defi',       riskTier: 5,  color: '#3b82f6' },
  { cgId: 'uniswap',              symbol: 'UNI',    name: 'Uniswap',              category: 'defi',       riskTier: 5,  color: '#ec4899' },
  { cgId: 'aave',                 symbol: 'AAVE',   name: 'Aave',                 category: 'defi',       riskTier: 5,  color: '#8b5cf6' },
  { cgId: 'maker',                symbol: 'MKR',    name: 'Maker',                category: 'defi',       riskTier: 5,  color: '#10b981' },
  { cgId: 'compound-governance-token', symbol: 'COMP', name: 'Compound',         category: 'defi',       riskTier: 6,  color: '#22c55e' },
  { cgId: 'curve-dao-token',      symbol: 'CRV',    name: 'Curve DAO',            category: 'defi',       riskTier: 7,  color: '#ef4444' },
  // CoinGecko id for Synthetix is the legacy 'havven' (NOT 'synthetix-network-token')
  { cgId: 'havven',               symbol: 'SNX',    name: 'Synthetix',            category: 'defi',       riskTier: 7,  color: '#3b82f6' },
  { cgId: 'lido-dao',             symbol: 'LDO',    name: 'Lido DAO',             category: 'defi',       riskTier: 5,  color: '#f97316' },
  { cgId: 'the-graph',            symbol: 'GRT',    name: 'The Graph',            category: 'defi',       riskTier: 6,  color: '#8b5cf6' },

  // ─── Privacy ───────────────────────────────────────────────────────────────
  { cgId: 'monero',               symbol: 'XMR',    name: 'Monero',               category: 'privacy',    riskTier: 5,  color: '#f97316' },
  { cgId: 'zcash',                symbol: 'ZEC',    name: 'Zcash',                category: 'privacy',    riskTier: 6,  color: '#f59e0b' },

  // ─── Legacy ────────────────────────────────────────────────────────────────
  { cgId: 'bitcoin-cash',         symbol: 'BCH',    name: 'Bitcoin Cash',         category: 'layer1',     riskTier: 5,  color: '#22c55e' },
  { cgId: 'ethereum-classic',     symbol: 'ETC',    name: 'Ethereum Classic',     category: 'layer1',     riskTier: 6,  color: '#10b981' },

  // ─── Storage / Infrastructure ──────────────────────────────────────────────
  { cgId: 'filecoin',             symbol: 'FIL',    name: 'Filecoin',             category: 'storage',    riskTier: 6,  color: '#3b82f6' },
]

// Fast lookup maps
export const COIN_BY_CGID: Record<string, PortfolioCoin> = Object.fromEntries(
  PORTFOLIO_COINS.map(c => [c.cgId, c])
)
export const COIN_BY_SYMBOL: Record<string, PortfolioCoin> = Object.fromEntries(
  PORTFOLIO_COINS.map(c => [c.symbol.toLowerCase(), c])
)

// Category display metadata
export const CATEGORY_META: Record<CoinCategory, { label: string; color: string }> = {
  layer1:     { label: 'Layer 1',         color: '#3b82f6' },
  layer2:     { label: 'Layer 2',         color: '#8b5cf6' },
  defi:       { label: 'DeFi',            color: '#10b981' },
  stablecoin: { label: 'Stablecoins',     color: '#22c55e' },
  exchange:   { label: 'Exchange Tokens', color: '#f97316' },
  privacy:    { label: 'Privacy',         color: '#6366f1' },
  meme:       { label: 'Meme',            color: '#eab308' },
  gaming:     { label: 'Gaming / NFT',    color: '#ec4899' },
  interop:    { label: 'Interoperability',color: '#14b8a6' },
  ai:         { label: 'AI / Compute',    color: '#06b6d4' },
  rwa:        { label: 'Real World Asset',color: '#f59e0b' },
  storage:    { label: 'Storage',         color: '#64748b' },
  unknown:    { label: 'Other',           color: '#475569' },
}
