// Coins already tracked in Finance Now Free — excluded from discovery recommendations.
// Add CoinGecko IDs here whenever a coin is formally added to the platform.

export const FN_TRACKED_IDS = new Set([
  // Core 16 (transfer fee calculator + staking)
  'bitcoin', 'ethereum', 'tether', 'usd-coin', 'binancecoin', 'solana',
  'dai', 'ripple', 'litecoin', 'tron', 'dogecoin', 'matic-network',
  'avalanche-2', 'cardano', 'polkadot', 'cosmos',
  // Additional stablecoins tracked
  'frax', 'true-usd', 'paypal-usd', 'first-digital-usd', 'usdd',
  'gemini-dollar', 'pax-dollar', 'magic-internet-money',
  // DeFi already in asset registry
  'uniswap', 'aave', 'chainlink', 'maker', 'compound-governance-token',
  'curve-dao-token', 'synthetix-network-token', 'lido-dao', 'the-graph',
  // Other assets in registry
  'bitcoin-cash', 'ethereum-classic', 'monero', 'zcash',
  'hedera-hashgraph', 'near', 'algorand', 'filecoin', 'aptos',
  'sui', 'internet-computer', 'vechain', 'stellar', 'tezos',
])

// ─── Utility category map ─────────────────────────────────────────────────────
// Maps CoinGecko IDs to a category and utility score (1–10).
// Add new coins here to improve recommendation quality.

export const UTILITY_MAP: Record<string, { category: string; utilityScore: number; note: string }> = {
  // Layer 2 / Scaling
  'optimism':          { category: 'layer2',   utilityScore: 9, note: 'Ethereum L2, OP Stack foundation for the Superchain' },
  'arbitrum':          { category: 'layer2',   utilityScore: 9, note: 'Largest Ethereum L2 by TVL, Arbitrum One + Nova' },
  'starknet':          { category: 'layer2',   utilityScore: 8, note: 'ZK rollup L2, validity proofs via StarkWare' },
  'immutable-x':       { category: 'layer2',   utilityScore: 7, note: 'NFT gaming L2 on Ethereum, ImmutableX' },
  'loopring':          { category: 'layer2',   utilityScore: 6, note: 'ZK rollup DEX protocol' },
  'mantle':            { category: 'layer2',   utilityScore: 7, note: 'Ethereum L2 backed by BitDAO' },
  'linea':             { category: 'layer2',   utilityScore: 7, note: 'Consensys ZK rollup' },
  'scroll':            { category: 'layer2',   utilityScore: 7, note: 'EVM-equivalent ZK rollup' },

  // Layer 1 Blockchains
  'kaspa':             { category: 'layer1',   utilityScore: 7, note: 'PoW DAG-based L1, high throughput' },
  'ton':               { category: 'layer1',   utilityScore: 8, note: 'The Open Network, Telegram-integrated L1' },
  'sei-network':       { category: 'layer1',   utilityScore: 7, note: 'Order-book optimised L1' },
  'injective-protocol':{ category: 'layer1',   utilityScore: 8, note: 'DeFi-native L1, exchange infrastructure' },
  'celestia':          { category: 'layer1',   utilityScore: 8, note: 'Modular data availability layer' },
  'hyperliquid':       { category: 'layer1',   utilityScore: 8, note: 'High-performance perps DEX L1' },
  'berachain-bera':    { category: 'layer1',   utilityScore: 7, note: 'Proof-of-Liquidity L1' },
  'monad':             { category: 'layer1',   utilityScore: 8, note: 'Parallel EVM L1, 10k+ TPS' },
  'iota':              { category: 'layer1',   utilityScore: 6, note: 'Feeless DAG for IoT use cases' },
  'nano':              { category: 'layer1',   utilityScore: 6, note: 'Feeless instant payments' },

  // DeFi Infrastructure
  'jupiter-exchange-solana': { category: 'defi', utilityScore: 9, note: 'Dominant Solana DEX aggregator' },
  'raydium':           { category: 'defi',    utilityScore: 8, note: 'Core Solana AMM' },
  'pancakeswap-token': { category: 'defi',    utilityScore: 7, note: 'Leading BNB Chain DEX' },
  'yearn-finance':     { category: 'defi',    utilityScore: 8, note: 'Yield aggregator, pioneered DeFi vaults' },
  '1inch':             { category: 'defi',    utilityScore: 8, note: 'Multi-chain DEX aggregator' },
  'dydx':              { category: 'defi',    utilityScore: 8, note: 'Decentralised perpetuals exchange' },
  'pendle':            { category: 'defi',    utilityScore: 8, note: 'Yield trading and tokenisation protocol' },
  'ethena':            { category: 'defi',    utilityScore: 8, note: 'Synthetic USD backed by ETH staking + hedging' },
    'ondo-finance':      { category: 'rwa',     utilityScore: 9, note: 'Real-world asset tokenisation (T-bills, bonds)' },
  'maple':             { category: 'rwa',     utilityScore: 7, note: 'Institutional on-chain credit markets' },
  'centrifuge':        { category: 'rwa',     utilityScore: 7, note: 'Real-world asset DeFi protocol' },

  // AI / Infrastructure
  'bittensor':         { category: 'ai',      utilityScore: 9, note: 'Decentralised ML network, strong momentum' },
  'render-token':      { category: 'ai',      utilityScore: 8, note: 'Decentralised GPU rendering network' },
  'fetch-ai':          { category: 'ai',      utilityScore: 7, note: 'Autonomous AI agent infrastructure' },
  'singularitynet':    { category: 'ai',      utilityScore: 7, note: 'Decentralised AI marketplace' },
  'worldcoin-wld':     { category: 'ai',      utilityScore: 6, note: 'Biometric identity + UBI token' },
  'akash-network':     { category: 'ai',      utilityScore: 8, note: 'Decentralised cloud compute marketplace' },
  'io-net':            { category: 'ai',      utilityScore: 8, note: 'Decentralised GPU compute network' },

  // Exchange Tokens
  'okb':               { category: 'exchange', utilityScore: 6, note: 'OKX exchange token, OKX Chain gas' },
  'crypto-com-chain':  { category: 'exchange', utilityScore: 6, note: 'Crypto.com CRO token, exchange ecosystem' },
  'kucoin-shares':     { category: 'exchange', utilityScore: 5, note: 'KuCoin exchange token' },
  'huobi-token':       { category: 'exchange', utilityScore: 5, note: 'HTX (Huobi) exchange token' },
  'bitget-token':      { category: 'exchange', utilityScore: 5, note: 'Bitget exchange token' },
  'gatechain-token':   { category: 'exchange', utilityScore: 4, note: 'Gate.io exchange token' },

  // Privacy
  'zcash':             { category: 'privacy',  utilityScore: 6, note: 'ZK-proof privacy coin' },
  'monero':            { category: 'privacy',  utilityScore: 7, note: 'Ring signature privacy coin, most used' },
  'secret':            { category: 'privacy',  utilityScore: 6, note: 'Encrypted smart contracts (Cosmos SDK)' },

  // Meme / Community
  'shiba-inu':         { category: 'meme',    utilityScore: 3, note: 'Large market cap meme coin, Shibarium L2' },
  'pepe':              { category: 'meme',    utilityScore: 2, note: 'Meme coin, no core utility' },
  'floki':             { category: 'meme',    utilityScore: 2, note: 'Meme/gaming hybrid token' },
  'bonk':              { category: 'meme',    utilityScore: 2, note: 'Solana meme coin' },
  'notcoin':           { category: 'meme',    utilityScore: 2, note: 'TON-based tap-to-earn meme coin' },
  'dogs-2':            { category: 'meme',    utilityScore: 1, note: 'Meme coin' },

  // Gaming / Metaverse
  'axie-infinity':     { category: 'gaming',  utilityScore: 5, note: 'Pioneer P2E game, declining but notable' },
  'the-sandbox':       { category: 'gaming',  utilityScore: 5, note: 'Metaverse land and gaming platform' },
  'decentraland':      { category: 'gaming',  utilityScore: 4, note: 'VR metaverse platform' },
  'gala':              { category: 'gaming',  utilityScore: 5, note: 'Web3 gaming ecosystem' },

  // Interoperability / Cross-chain
  'thorchain':         { category: 'interop', utilityScore: 8, note: 'Native cross-chain liquidity protocol' },
  'stargate-finance':  { category: 'interop', utilityScore: 7, note: 'Cross-chain liquidity via LayerZero' },
  'wormhole':          { category: 'interop', utilityScore: 7, note: 'Cross-chain messaging and bridge' },
  'layerzero':         { category: 'interop', utilityScore: 8, note: 'Omnichain interoperability protocol' },
  'axelar':            { category: 'interop', utilityScore: 7, note: 'Cross-chain communication network' },
}

// ─── Category metadata ────────────────────────────────────────────────────────
export const CATEGORY_INFO: Record<string, { label: string; color: string; defaultUtility: number }> = {
  layer1:    { label: 'Layer 1',         color: '#3b82f6', defaultUtility: 7 },
  layer2:    { label: 'Layer 2',         color: '#8b5cf6', defaultUtility: 7 },
  defi:      { label: 'DeFi',            color: '#10b981', defaultUtility: 7 },
  rwa:       { label: 'Real World Asset',color: '#f59e0b', defaultUtility: 8 },
  ai:        { label: 'AI / Compute',    color: '#06b6d4', defaultUtility: 7 },
  exchange:  { label: 'Exchange Token',  color: '#f97316', defaultUtility: 5 },
  privacy:   { label: 'Privacy',         color: '#6366f1', defaultUtility: 6 },
  stablecoin:{ label: 'Stablecoin',      color: '#22c55e', defaultUtility: 8 },
  gaming:    { label: 'Gaming / NFT',    color: '#ec4899', defaultUtility: 4 },
  interop:   { label: 'Interoperability',color: '#14b8a6', defaultUtility: 7 },
  meme:      { label: 'Meme / Community',color: '#eab308', defaultUtility: 2 },
  unknown:   { label: 'Unknown',         color: '#64748b', defaultUtility: 4 },
}

// ─── Scoring config ───────────────────────────────────────────────────────────
// Weights must sum to 1.0. Thresholds are the breakpoints for each band.
// Edit here when the framework is expanded later.

export const SCORING_CONFIG = {
  weights: {
    marketCap: 0.40,
    utility:   0.35,
    risk:      0.25,
  },
  marketCapTiers: [
    { min: 50_000_000_000, score: 10, label: 'Mega cap (>$50B)' },
    { min: 10_000_000_000, score: 8,  label: 'Large cap ($10B–$50B)' },
    { min:  1_000_000_000, score: 6,  label: 'Mid-large cap ($1B–$10B)' },
    { min:    100_000_000, score: 4,  label: 'Mid cap ($100M–$1B)' },
    { min:     10_000_000, score: 2,  label: 'Small cap ($10M–$100M)' },
    { min:              0, score: 1,  label: 'Micro cap (<$10M)' },
  ],
  recommendationThresholds: {
    strongAdd:     7.0,
    consider:      5.5,
    monitor:       4.0,
    // below 4.0 → 'too-speculative'
  },
}

export type RecommendationLevel = 'strong-add' | 'consider' | 'monitor' | 'too-speculative'

export function getRecommendationLevel(score: number): RecommendationLevel {
  if (score >= SCORING_CONFIG.recommendationThresholds.strongAdd)  return 'strong-add'
  if (score >= SCORING_CONFIG.recommendationThresholds.consider)    return 'consider'
  if (score >= SCORING_CONFIG.recommendationThresholds.monitor)     return 'monitor'
  return 'too-speculative'
}
