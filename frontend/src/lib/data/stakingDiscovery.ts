import type { ProviderCategory, RiskProfile } from './stakingProviders'

// ─── Risk presets by provider category ───────────────────────────────────────
// These are starting-point values auto-filled into the risk form.
// Higher = riskier on each dimension (1–10 scale).

export const RISK_PRESETS: Record<ProviderCategory, RiskProfile> = {
  cefi: {
    custodyRisk:      7,  // They hold your keys
    counterpartyRisk: 7,  // Company failure risk
    contractRisk:     2,  // Usually no smart contracts
    slashingRisk:     2,  // Exchange absorbs slashing
    liquidityRisk:    5,  // Withdrawal delays common
    regulatoryRisk:   6,  // Regulated exchanges face more exposure
  },
  wallet: {
    custodyRisk:      2,  // You hold your keys
    counterpartyRisk: 3,  // Software/company can still disappear
    contractRisk:     3,  // Some wallet staking uses contracts
    slashingRisk:     4,  // Depends on validator selection
    liquidityRisk:    5,  // Unbonding periods apply
    regulatoryRisk:   3,
  },
  liquid: {
    custodyRisk:      2,  // Smart contract custody, not company
    counterpartyRisk: 3,  // Protocol governance risk
    contractRisk:     6,  // Smart contract bugs are real
    slashingRisk:     4,  // Pooled validator risk
    liquidityRisk:    3,  // Receipt token adds liquidity
    regulatoryRisk:   4,
  },
}

// Adjustments applied on top of presets based on observable signals

export function adjustRiskFromSignals(base: RiskProfile, signals: {
  tvlUsd: number
  auditCount: number
  isSmartContract: boolean
  chainMature: boolean   // mainnet with 2+ years history
  hasReceiptToken: boolean
}): RiskProfile {
  const r = { ...base }

  // TVL as a liquidity/counterparty signal
  if (signals.tvlUsd > 5_000_000_000)      { r.counterpartyRisk = Math.max(1, r.counterpartyRisk - 2); r.liquidityRisk = Math.max(1, r.liquidityRisk - 2) }
  else if (signals.tvlUsd > 500_000_000)   { r.counterpartyRisk = Math.max(1, r.counterpartyRisk - 1); r.liquidityRisk = Math.max(1, r.liquidityRisk - 1) }
  else if (signals.tvlUsd < 10_000_000)    { r.counterpartyRisk = Math.min(10, r.counterpartyRisk + 2); r.liquidityRisk = Math.min(10, r.liquidityRisk + 1) }
  else if (signals.tvlUsd < 50_000_000)    { r.counterpartyRisk = Math.min(10, r.counterpartyRisk + 1) }

  // Audits lower contract risk
  if (signals.isSmartContract) {
    if (signals.auditCount >= 3)           r.contractRisk = Math.max(1, r.contractRisk - 2)
    else if (signals.auditCount >= 1)      r.contractRisk = Math.max(1, r.contractRisk - 1)
    else                                   r.contractRisk = Math.min(10, r.contractRisk + 2)
  }

  // Mature chain lowers regulatory & contract risk slightly
  if (signals.chainMature) {
    r.regulatoryRisk = Math.max(1, r.regulatoryRisk - 1)
    r.contractRisk   = Math.max(1, r.contractRisk - 1)
  }

  // Receipt token improves liquidity
  if (signals.hasReceiptToken) r.liquidityRisk = Math.max(1, r.liquidityRisk - 1)

  return r
}

// ─── Provider IDs already in the built-in list ───────────────────────────────
// Used to deduplicate DefiLlama results. Add new built-in provider IDs here.

export const BUILTIN_PROVIDER_IDS = new Set([
  'celsius', 'coinbase', 'kraken', 'binance', 'okx', 'bybit',
  'ledger', 'metamask', 'phantom', 'trust-wallet', 'exodus',
  'lido', 'rocket-pool', 'marinade', 'jito', 'stride', 'benqi', 'ankr',
])

// DefiLlama project slugs that map to a provider already tracked
export const DEFILLAMA_SLUG_BLOCKLIST = new Set([
  'lido', 'rocket-pool', 'marinade', 'jito', 'stride', 'benqi', 'ankr',
  'coinbase', 'binance',
])

// ─── Finance Now Free stakeable coin symbols → DefiLlama symbol patterns ─────────────────
// DefiLlama uses symbol names like "ETH", "stETH", "WETH", etc.
// We map our coin IDs to the underlying asset symbol to filter relevant pools.

export const COIN_SYMBOL_MAP: Record<string, string[]> = {
  eth:   ['ETH', 'WETH'],
  sol:   ['SOL', 'WSOL'],
  ada:   ['ADA'],
  dot:   ['DOT'],
  atom:  ['ATOM'],
  matic: ['MATIC', 'POL'],
  avax:  ['AVAX'],
  bnb:   ['BNB', 'WBNB'],
  trx:   ['TRX'],
}

export const ALL_STAKING_SYMBOLS = new Set(
  Object.values(COIN_SYMBOL_MAP).flat()
)

// ─── Mature chains ────────────────────────────────────────────────────────────

export const MATURE_CHAINS = new Set([
  'Ethereum', 'Bitcoin', 'Solana', 'BNB', 'Polygon', 'Avalanche',
  'Arbitrum', 'Optimism', 'Base', 'Cosmos', 'Polkadot',
])

// ─── Custody model inference ──────────────────────────────────────────────────

export function inferCustodyModel(category: ProviderCategory): 'custodial' | 'non-custodial' | 'smart-contract' {
  if (category === 'cefi')   return 'custodial'
  if (category === 'wallet') return 'non-custodial'
  return 'smart-contract'
}

// ─── Custom provider interface (stored in Zustand) ───────────────────────────

export interface CustomStakingProvider {
  id:            string               // user-defined slug
  name:          string
  tagline:       string
  category:      ProviderCategory
  custodyModel:  'custodial' | 'non-custodial' | 'smart-contract'
  website:       string
  risks:         RiskProfile
  tvlUsd:        number | null
  auditCount:    number
  coins: Array<{
    symbol:        string             // e.g. 'ETH'
    coinId:        string             // our Finance Now Free coin id, e.g. 'eth'
    apr:           number
    lockupDays:    number
    receiptToken:  string
    liquid:        boolean
    notes:         string
  }>
  source:        'defillama' | 'manual'
  defiLlamaPool: string | null        // pool ID if sourced from DL
  addedAt:       string
  notes:         string
}
