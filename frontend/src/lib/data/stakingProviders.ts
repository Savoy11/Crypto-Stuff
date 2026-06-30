// Staking providers data — CeFi exchanges, self-custody wallets, liquid staking protocols.
// Risk scores are on a 1–10 scale (10 = highest risk) across 6 dimensions.

export type StakingCoinId = 'eth' | 'sol' | 'ada' | 'dot' | 'atom' | 'matic' | 'avax' | 'bnb' | 'trx' | 'btc' | 'cro' | 'osmo' | 'ksm' | 'inj' | 'tia' | 'near'
export type ProviderCategory = 'cefi' | 'wallet' | 'liquid'

/**
 * What *kind* of yield a product actually is. The coarse ProviderCategory
 * (cefi/wallet/liquid) doesn't distinguish a true ETH liquid-staking token from a
 * governance-token staking position or a lending product — so opportunities for the
 * same coin used to be mixed together. YieldType separates them.
 */
export type YieldType = 'native' | 'liquid' | 'cefi' | 'lending' | 'governance' | 'restaking'

export const YIELD_TYPE_META: Record<YieldType, {
  label: string
  short: string
  description: string
  /** Does this product actually stake the queried coin via a validator (vs. lending it or staking a different token)? */
  stakesQueriedAsset: boolean
  badge: string
}> = {
  native:     { label: 'Native staking',        short: 'Native',     description: 'Direct proof-of-stake delegation of the asset to a validator.',                              stakesQueriedAsset: true,  badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  liquid:     { label: 'Liquid staking',        short: 'Liquid',     description: 'Stakes the asset and issues a tradeable receipt token (e.g. stETH, mSOL) you can exit anytime.', stakesQueriedAsset: true,  badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  cefi:       { label: 'CeFi staking',          short: 'CeFi',       description: 'Custodial exchange staking — the platform stakes on your behalf and holds the keys.',          stakesQueriedAsset: true,  badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  restaking:  { label: 'Restaking',             short: 'Restaking',  description: 'Restakes the asset for shared security / extra rewards (EigenLayer, Babylon). Added smart-contract risk.', stakesQueriedAsset: true, badge: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  governance: { label: 'Governance-token yield', short: 'Governance', description: 'Stakes a separate governance token (not the queried asset) to earn protocol revenue. Not asset staking.', stakesQueriedAsset: false, badge: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30' },
  lending:    { label: 'Lending yield',         short: 'Lending',    description: 'Yield from lending the asset to borrowers — not validator staking. Counterparty/credit risk.',  stakesQueriedAsset: false, badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
}

export const STAKING_COIN_INFO: Record<StakingCoinId, { name: string; symbol: string; color: string; aprNote?: string }> = {
  eth:  { name: 'Ethereum',  symbol: 'ETH',  color: '#627EEA', aprNote: 'PoS — network APR ~3–4%' },
  sol:  { name: 'Solana',    symbol: 'SOL',  color: '#9945FF', aprNote: 'Inflation-based ~6–8%' },
  ada:  { name: 'Cardano',   symbol: 'ADA',  color: '#0033AD', aprNote: 'No lockup, ~3–5%' },
  dot:  { name: 'Polkadot',  symbol: 'DOT',  color: '#E6007A', aprNote: '28-day unbonding, ~10–14%' },
  atom: { name: 'Cosmos',    symbol: 'ATOM', color: '#2E3148', aprNote: '21-day unbonding, ~8–15%' },
  matic:{ name: 'Polygon',   symbol: 'POL',  color: '#8247E5', aprNote: '~3–5%, ~9 day unbonding' },
  avax: { name: 'Avalanche', symbol: 'AVAX', color: '#E84142', aprNote: 'Min 25 AVAX, 2-week lockup' },
  bnb:  { name: 'BNB Chain', symbol: 'BNB',  color: '#F3BA2F', aprNote: '~4–6%, BSC validator' },
  trx:  { name: 'TRON',      symbol: 'TRX',  color: '#FF0013', aprNote: 'Energy/bandwidth model' },
  btc:  { name: 'Bitcoin',   symbol: 'BTC',  color: '#F7931A', aprNote: 'No native PoS — yield via restaking protocols (Babylon, Lombard)' },
  cro:  { name: 'Cronos',    symbol: 'CRO',  color: '#002D74', aprNote: 'Crypto.com chain token, ~10–12% via CDC app' },
  osmo: { name: 'Osmosis',   symbol: 'OSMO', color: '#750BBB', aprNote: 'Cosmos DEX token, ~8–12% superfluid staking' },
  ksm:  { name: 'Kusama',    symbol: 'KSM',  color: '#E8026D', aprNote: 'Polkadot canary network, ~12–16%' },
  inj:  { name: 'Injective', symbol: 'INJ',  color: '#0052D9', aprNote: '21-day unbonding, ~13–15%' },
  tia:  { name: 'Celestia',  symbol: 'TIA',  color: '#7B2FBE', aprNote: '21-day unbonding, ~15–20%' },
  near: { name: 'NEAR Protocol', symbol: 'NEAR', color: '#00C08B', aprNote: 'No forced lockup, ~10–12%' },
}

export interface RiskProfile {
  custodyRisk: number       // 1–10: who controls the keys
  counterpartyRisk: number  // 1–10: platform solvency / integrity
  contractRisk: number      // 1–10: smart contract exposure
  slashingRisk: number      // 1–10: validator penalty risk
  liquidityRisk: number     // 1–10: ability to exit quickly
  regulatoryRisk: number    // 1–10: regulatory/legal exposure
}

export interface StakingAsset {
  coinId: StakingCoinId
  staticApr: number          // fallback APR in % (shown when live data unavailable)
  minStakeNative: number     // minimum stake in coin units
  lockupDays: number         // 0 = no forced lockup
  lockupNote?: string
  receiptToken?: string      // e.g. 'stETH', 'rETH', 'mSOL'
  liquid: boolean            // is the staked position itself liquid/tradeable?
  liveAprKey?: string        // key in StakingRatesResponse
  features: string[]
  assetRisks?: Partial<RiskProfile> // overrides provider base risks for this asset
  yieldType?: YieldType      // overrides the provider/category-derived classification for this asset
}

export interface StakingProvider {
  id: string
  name: string
  category: ProviderCategory
  defaultYieldType?: YieldType  // provider-wide yield classification when assets don't specify their own
  defunct?: boolean
  defunctDate?: string
  defunctNote?: string
  tagline: string
  description: string
  custodyModel: 'custodial' | 'non-custodial' | 'smart-contract'
  tvlBillions?: number
  auditCount?: number
  founded?: number
  website?: string
  risks: RiskProfile
  assets: Partial<Record<StakingCoinId, StakingAsset>>
}

export function computeOverallRisk(risks: RiskProfile): number {
  return (
    risks.custodyRisk      * 0.20 +
    risks.counterpartyRisk * 0.25 +
    risks.contractRisk     * 0.15 +
    risks.slashingRisk     * 0.10 +
    risks.liquidityRisk    * 0.20 +
    risks.regulatoryRisk   * 0.10
  )
}

export function mergedRisks(base: RiskProfile, overrides?: Partial<RiskProfile>): RiskProfile {
  if (!overrides) return base
  return { ...base, ...overrides }
}

export function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score <= 3.0) return 'low'
  if (score <= 5.5) return 'medium'
  if (score <= 7.5) return 'high'
  return 'critical'
}

/**
 * Resolve the yield classification for a provider/asset pair. Precedence:
 *   1. asset.yieldType (most specific)
 *   2. provider.defaultYieldType
 *   3. derived from category + whether the position is liquid with a receipt token
 */
export function resolveYieldType(provider: StakingProvider, asset: StakingAsset): YieldType {
  if (asset.yieldType) return asset.yieldType
  if (provider.defaultYieldType) return provider.defaultYieldType
  if (provider.category === 'cefi') return 'cefi'
  if (provider.category === 'liquid') return asset.liquid && asset.receiptToken ? 'liquid' : 'native'
  return 'native' // wallet = self-custody native staking
}

/**
 * Default live APR key for each coin when a specific asset doesn't define liveAprKey.
 * Keys match the rates object returned by /live-data/staking-rates.
 */
export const DEFAULT_LIVE_APR_KEY: Partial<Record<StakingCoinId, string>> = {
  eth:  'lido_eth',
  sol:  'native_sol',
  ada:  'native_ada',
  dot:  'native_dot',
  atom: 'native_atom',
  matic:'native_matic',
  avax: 'native_avax',
  bnb:  'native_bnb',
  trx:  'native_trx',
  btc:  'babylon_btc',
  cro:  'native_cro',
  osmo: 'osmo_native',
  ksm:  'native_ksm',
  inj:  'native_inj',
  tia:  'native_tia',
  near: 'native_near',
}

export const RISK_DIMENSION_LABELS: Record<keyof RiskProfile, { label: string; description: string }> = {
  custodyRisk:      { label: 'Custody',      description: 'Who controls your private keys? Self-custody (1) vs. fully custodial exchange (10).' },
  counterpartyRisk: { label: 'Counterparty', description: 'Risk that the platform becomes insolvent, freezes funds, or commits fraud (see: Celsius).' },
  contractRisk:     { label: 'Smart Contract', description: 'Exposure to bugs or exploits in on-chain code. Audited protocols score lower.' },
  slashingRisk:     { label: 'Slashing',     description: 'Can your stake be penalized (slashed) for validator misbehavior? Cosmos and ETH staking have slashing.' },
  liquidityRisk:    { label: 'Liquidity',    description: 'How long until you can access your funds? Instant exit scores 1; 28-day unbonding scores 8.' },
  regulatoryRisk:   { label: 'Regulatory',   description: 'Legal uncertainty or active enforcement actions. SEC has targeted exchange staking programs.' },
}

// ─────────────────────────────────────────────────────────────────────────────
// STAKING PROVIDERS
// ─────────────────────────────────────────────────────────────────────────────

export const STAKING_PROVIDERS: StakingProvider[] = [

  // ════════════════════════════════════════════════════════════════════════════
  // DEFUNCT — CELSIUS (cautionary example, always shown)
  // ════════════════════════════════════════════════════════════════════════════
  {
    id: 'celsius',
    name: 'Celsius Network',
    category: 'cefi',
    defunct: true,
    defunctDate: 'July 13, 2022',
    website: 'https://celsius.network',
    defunctNote: `Celsius Network filed for Chapter 11 bankruptcy on July 13, 2022. On June 12, 2022, without warning, the company halted ALL withdrawals, swaps, and transfers for its 1.7 million customers. At filing, Celsius owed customers approximately $4.72 billion it no longer had. CEO Alex Mashinsky was arrested on July 26, 2023 on federal fraud and market manipulation charges. Customers waited years for a partial recovery through bankruptcy proceedings — many received pennies on the dollar. Celsius had secretly deployed customer deposits into risky DeFi protocols (including the collapsed Terra/LUNA ecosystem) and used new deposits to pay existing customers — characteristics of a Ponzi scheme.`,
    tagline: 'Advertised 17%+ APY on crypto — secretly running risky lending with customer funds',
    description: 'Celsius marketed itself as a safe crypto savings account with industry-leading yields. In reality, it was lending customer funds to institutional borrowers and deploying them in high-risk DeFi protocols without disclosure.',
    custodyModel: 'custodial',
    founded: 2017,
    risks: {
      custodyRisk:      10,
      counterpartyRisk: 10,
      contractRisk:     8,
      slashingRisk:     2,
      liquidityRisk:    10,
      regulatoryRisk:   10,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 7.1,  minStakeNative: 0, lockupDays: 0, liquid: true,  features: ['Advertised 7.1% APY', 'Weekly compounding', 'Instant withdrawal (until frozen June 2022)'] },
      sol:  { coinId: 'sol',  staticApr: 6.5,  minStakeNative: 0, lockupDays: 0, liquid: true,  features: ['Advertised 6.5% APY'] },
      ada:  { coinId: 'ada',  staticApr: 7.5,  minStakeNative: 0, lockupDays: 0, liquid: true,  features: ['Advertised 7.5% APY'] },
      bnb:  { coinId: 'bnb',  staticApr: 6.2,  minStakeNative: 0, lockupDays: 0, liquid: true,  features: ['Advertised 6.2% APY'] },
      atom: { coinId: 'atom', staticApr: 17.8, minStakeNative: 0, lockupDays: 0, liquid: true,  features: ['Advertised 17.8% APY — funded by undisclosed risky loans'] },
      dot:  { coinId: 'dot',  staticApr: 13.0, minStakeNative: 0, lockupDays: 0, liquid: true,  features: ['Advertised 13% APY'] },
      matic:{ coinId: 'matic',staticApr: 10.5, minStakeNative: 0, lockupDays: 0, liquid: true,  features: ['Advertised 10.5% APY'] },
      avax: { coinId: 'avax', staticApr: 9.0,  minStakeNative: 0, lockupDays: 0, liquid: true,  features: ['Advertised 9% APY'] },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // CEFI — EXCHANGE STAKING
  // ════════════════════════════════════════════════════════════════════════════

  {
    id: 'coinbase',
    name: 'Coinbase',
    category: 'cefi',
    tagline: 'Largest US-regulated exchange — simple staking, NASDAQ-listed, but fully custodial',
    description: 'Coinbase offers staking for ETH (via cbETH wrapped token), SOL, ADA, ATOM, DOT, and MATIC. As a publicly traded, SEC-regulated entity, counterparty risk is lower than unregulated exchanges — but the SEC has sued Coinbase over its staking program and it was paused in several US states.',
    custodyModel: 'custodial',
    founded: 2012,
    website: 'https://www.coinbase.com/earn',
    tvlBillions: 2.1,
    risks: {
      custodyRisk:      8,
      counterpartyRisk: 4,
      contractRisk:     2,
      slashingRisk:     1,
      liquidityRisk:    3,
      regulatoryRisk:   7,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.2,  minStakeNative: 0,    lockupDays: 0,  receiptToken: 'cbETH', liquid: true,  liveAprKey: 'coinbase_eth',  features: ['cbETH — liquid ERC-20 receipt token', 'Coinbase covers slashing losses', 'NASDAQ-listed — audited financials'] },
      sol:  { coinId: 'sol',  staticApr: 4.5,  minStakeNative: 0.01, lockupDays: 3,  liquid: false, features: ['~2–3 day unstaking', 'Auto-compound', 'Coinbase selects validators'] },
      ada:  { coinId: 'ada',  staticApr: 3.0,  minStakeNative: 1,    lockupDays: 0,  liquid: false, features: ['No lockup (Cardano protocol)', 'Rewards every epoch (~5 days)'] },
      atom: { coinId: 'atom', staticApr: 9.0,  minStakeNative: 1,    lockupDays: 21, lockupNote: '21-day Cosmos unbonding applies', liquid: false, features: ['21-day unbonding', 'High APY vs. liquid staking alternatives'] },
      dot:  { coinId: 'dot',  staticApr: 11.0, minStakeNative: 1,    lockupDays: 28, lockupNote: '28-day Polkadot unbonding applies', liquid: false, features: ['28-day unbonding', 'Coinbase handles nomination complexity'], assetRisks: { liquidityRisk: 7 } },
      matic:{ coinId: 'matic',staticApr: 3.5,  minStakeNative: 1,    lockupDays: 9,  liquid: false, features: ['~9 day unbonding', 'Auto-compound'] },
      avax: { coinId: 'avax', staticApr: 5.0,  minStakeNative: 0.1,  lockupDays: 14, liquid: false, features: ['2-week minimum lockup (AVAX protocol)', 'Coinbase handles validator selection'] },
      near: { coinId: 'near', staticApr: 9.5,  minStakeNative: 1,    lockupDays: 4,  lockupNote: '~4-day NEAR unstaking', liquid: false, features: ['~4-day unstaking (NEAR protocol)', 'Coinbase handles validator selection'] },
    },
  },

  {
    id: 'kraken',
    name: 'Kraken',
    category: 'cefi',
    tagline: 'Strong security track record — but US staking shut down after SEC settlement',
    description: 'Kraken has excellent security and a long track record. However, in February 2023, Kraken paid $30M to settle SEC charges and permanently shut down its US staking-as-a-service program. Non-US users can still stake on Kraken. Generally offers higher APY than Coinbase due to passing through more validator rewards.',
    custodyModel: 'custodial',
    founded: 2011,
    website: 'https://www.kraken.com/earn',
    tvlBillions: 1.3,
    risks: {
      custodyRisk:      8,
      counterpartyRisk: 4,
      contractRisk:     2,
      slashingRisk:     1,
      liquidityRisk:    4,
      regulatoryRisk:   8,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.5,  minStakeNative: 0.0001, lockupDays: 7,  liquid: false, features: ['Flexible unstaking (days, not weeks)', 'US staking discontinued after SEC settlement', 'Slashing protection included'], assetRisks: { regulatoryRisk: 9 } },
      sol:  { coinId: 'sol',  staticApr: 6.0,  minStakeNative: 1,      lockupDays: 5,  liquid: false, features: ['Higher APY than most CeFi', 'Kraken selects top validators'] },
      ada:  { coinId: 'ada',  staticApr: 5.0,  minStakeNative: 1,      lockupDays: 0,  liquid: false, features: ['No lockup', 'Paid in ADA'] },
      dot:  { coinId: 'dot',  staticApr: 12.0, minStakeNative: 1,      lockupDays: 28, lockupNote: '28-day Polkadot unbonding', liquid: false, features: ['One of the highest CeFi DOT yields', '28-day unbonding'], assetRisks: { liquidityRisk: 7 } },
      atom: { coinId: 'atom', staticApr: 18.0, minStakeNative: 1,      lockupDays: 21, lockupNote: '21-day Cosmos unbonding', liquid: false, features: ['Very high APY — includes governance rewards', '21-day unbonding'] },
      matic:{ coinId: 'matic',staticApr: 4.0,  minStakeNative: 1,      lockupDays: 9,  liquid: false, features: ['~9 day unbonding'] },
      avax: { coinId: 'avax', staticApr: 5.5,  minStakeNative: 0.1,    lockupDays: 14, liquid: false, features: ['Minimum 2-week lockup (protocol)'] },
    },
  },

  {
    id: 'binance',
    name: 'Binance',
    category: 'cefi',
    tagline: 'Highest volume exchange — multiple staking products, but regulatory battles globally',
    description: 'Binance offers Locked Staking, ETH Staking (BETH/WBETH), and BNB staking. As the world\'s largest exchange, it has massive liquidity and product depth, but has faced significant regulatory actions in the US (CFTC lawsuit, Zhao\'s guilty plea), UK, EU, and elsewhere. Higher counterparty risk than regulated US exchanges.',
    custodyModel: 'custodial',
    founded: 2017,
    website: 'https://www.binance.com/en/pos',
    tvlBillions: 5.0,
    risks: {
      custodyRisk:      8,
      counterpartyRisk: 6,
      contractRisk:     2,
      slashingRisk:     1,
      liquidityRisk:    4,
      regulatoryRisk:   8,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.1,  minStakeNative: 0.0001, lockupDays: 0,  receiptToken: 'WBETH', liquid: true,  features: ['WBETH — liquid wrapped ETH', 'BETH legacy token also supported', 'Unstaking queue can be long'] },
      sol:  { coinId: 'sol',  staticApr: 5.0,  minStakeNative: 0.1,    lockupDays: 3,  liquid: false, features: ['Flexible and locked staking options', 'Competitive APY'] },
      ada:  { coinId: 'ada',  staticApr: 3.5,  minStakeNative: 1,      lockupDays: 0,  liquid: false, features: ['No lockup (Cardano protocol)'] },
      bnb:  { coinId: 'bnb',  staticApr: 5.0,  minStakeNative: 0.001,  lockupDays: 7,  liquid: false, features: ['BNB is both the fee token and staking asset', 'BSC validator delegation'] },
      dot:  { coinId: 'dot',  staticApr: 11.5, minStakeNative: 1,      lockupDays: 28, lockupNote: '28-day unbonding', liquid: false, features: ['28-day unbonding', 'Bundled nomination'] },
      atom: { coinId: 'atom', staticApr: 10.0, minStakeNative: 1,      lockupDays: 21, lockupNote: '21-day unbonding', liquid: false, features: ['21-day unbonding'] },
      matic:{ coinId: 'matic',staticApr: 3.8,  minStakeNative: 1,      lockupDays: 9,  liquid: false, features: ['Polygon staking'] },
      avax: { coinId: 'avax', staticApr: 5.2,  minStakeNative: 25,     lockupDays: 14, lockupNote: 'AVAX protocol minimum: 25 AVAX, 2 weeks', liquid: false, features: ['High minimum (25 AVAX)', '2-week lockup minimum'], assetRisks: { liquidityRisk: 6 } },
      trx:  { coinId: 'trx',  staticApr: 4.5,  minStakeNative: 1,      lockupDays: 3,  liquid: false, features: ['TRON energy staking model', '3-day unstake'] },
      inj:  { coinId: 'inj',  staticApr: 13.5, minStakeNative: 1,      lockupDays: 21, lockupNote: '21-day Injective unbonding', liquid: false, features: ['21-day unbonding', 'Binance handles validator selection'] },
      tia:  { coinId: 'tia',  staticApr: 15.5, minStakeNative: 1,      lockupDays: 21, lockupNote: '21-day Celestia unbonding', liquid: false, features: ['21-day unbonding', 'High APY reflects new network inflation'] },
      near: { coinId: 'near', staticApr: 8.0,  minStakeNative: 1,      lockupDays: 0,  liquid: false, features: ['No lockup — NEAR protocol delegation', '~2 epoch exit delay (~48 hours)'] },
    },
  },

  {
    id: 'okx',
    name: 'OKX',
    category: 'cefi',
    tagline: 'Major global exchange with flexible and on-chain staking options',
    description: 'OKX offers both Simple Earn (custodial yield) and On-Chain Earn (delegated staking). The On-Chain Earn product gives users more transparency as assets are staked on-chain, though OKX retains custody of the underlying keys. OKX has faced regulatory pressure but remains operational in most jurisdictions.',
    custodyModel: 'custodial',
    founded: 2017,
    website: 'https://www.okx.com/earn',
    tvlBillions: 1.5,
    risks: {
      custodyRisk:      8,
      counterpartyRisk: 5,
      contractRisk:     3,
      slashingRisk:     1,
      liquidityRisk:    4,
      regulatoryRisk:   7,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.2,  minStakeNative: 0.01,  lockupDays: 0,  liquid: false, features: ['On-chain ETH staking', 'Queue-based withdrawal', 'Slashing protection'] },
      sol:  { coinId: 'sol',  staticApr: 5.5,  minStakeNative: 1,     lockupDays: 5,  liquid: false, features: ['On-Chain Earn product', 'Competitive rate'] },
      dot:  { coinId: 'dot',  staticApr: 12.0, minStakeNative: 1,     lockupDays: 28, lockupNote: '28-day unbonding', liquid: false, features: ['28-day unbonding', 'Handled nomination'] },
      atom: { coinId: 'atom', staticApr: 12.0, minStakeNative: 1,     lockupDays: 21, lockupNote: '21-day Cosmos unbonding', liquid: false, features: ['21-day unbonding', 'High APY'] },
      matic:{ coinId: 'matic',staticApr: 4.0,  minStakeNative: 1,     lockupDays: 9,  liquid: false, features: ['Polygon staking'] },
      inj:  { coinId: 'inj',  staticApr: 13.0, minStakeNative: 1,     lockupDays: 21, lockupNote: '21-day Injective unbonding', liquid: false, features: ['21-day unbonding', 'On-Chain Earn product'] },
      tia:  { coinId: 'tia',  staticApr: 15.0, minStakeNative: 1,     lockupDays: 21, lockupNote: '21-day Celestia unbonding', liquid: false, features: ['21-day unbonding', 'High network inflation APY'] },
      near: { coinId: 'near', staticApr: 8.0,  minStakeNative: 1,     lockupDays: 0,  liquid: false, features: ['No lockup', 'NEAR delegation via OKX validator'] },
    },
  },

  {
    id: 'bybit',
    name: 'Bybit',
    category: 'cefi',
    tagline: 'Derivatives-focused exchange with growing spot and staking products',
    description: 'Bybit primarily serves derivatives traders but offers Bybit Earn with staking products. Has stronger user growth since FTX\'s collapse. Lower regulatory presence and oversight than US-listed exchanges, which cuts both ways — more flexibility, but less accountability.',
    custodyModel: 'custodial',
    founded: 2018,
    website: 'https://www.bybit.com/en/earn/staking',
    tvlBillions: 0.8,
    risks: {
      custodyRisk:      8,
      counterpartyRisk: 5,
      contractRisk:     2,
      slashingRisk:     1,
      liquidityRisk:    4,
      regulatoryRisk:   6,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.3,  minStakeNative: 0.01,  lockupDays: 7,  liquid: false, features: ['Bybit covers slashing', 'Flexible exit (queue-based)'] },
      sol:  { coinId: 'sol',  staticApr: 5.8,  minStakeNative: 0.1,   lockupDays: 5,  liquid: false, features: ['Competitive APY', 'Auto-compound'] },
      atom: { coinId: 'atom', staticApr: 11.0, minStakeNative: 1,     lockupDays: 21, lockupNote: '21-day Cosmos unbonding', liquid: false, features: ['21-day unbonding'] },
      dot:  { coinId: 'dot',  staticApr: 11.0, minStakeNative: 1,     lockupDays: 28, lockupNote: '28-day Polkadot unbonding', liquid: false, features: ['28-day unbonding'] },
      matic:{ coinId: 'matic',staticApr: 4.0,  minStakeNative: 1,     lockupDays: 9,  liquid: false, features: ['Polygon staking'] },
      inj:  { coinId: 'inj',  staticApr: 12.5, minStakeNative: 1,     lockupDays: 21, lockupNote: '21-day Injective unbonding', liquid: false, features: ['21-day unbonding'] },
      tia:  { coinId: 'tia',  staticApr: 14.5, minStakeNative: 1,     lockupDays: 21, lockupNote: '21-day Celestia unbonding', liquid: false, features: ['21-day unbonding', 'High APY from new chain inflation'] },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // SELF-CUSTODY WALLETS
  // ════════════════════════════════════════════════════════════════════════════

  {
    id: 'ledger-live',
    name: 'Ledger Live',
    category: 'wallet',
    tagline: 'Hardware wallet staking — your keys, your coins, signing stays offline',
    description: 'Ledger Live lets you stake directly from a hardware wallet (Ledger Nano S/X/S Plus/Stax). Your private keys never leave the device. Staking transactions are signed on the hardware wallet but the protocol delegation is on-chain. Ledger integrates Lido for ETH liquid staking and native delegation for SOL, DOT, ATOM, ADA, AVAX, and MATIC.',
    custodyModel: 'non-custodial',
    founded: 2014,
    website: 'https://www.ledger.com/staking',
    risks: {
      custodyRisk:      1,
      counterpartyRisk: 2,
      contractRisk:     3,
      slashingRisk:     4,
      liquidityRisk:    5,
      regulatoryRisk:   2,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.8,  minStakeNative: 0,    lockupDays: 0,  receiptToken: 'stETH', liquid: true,  liveAprKey: 'lido_eth',  features: ['Via Lido integration — stETH received', 'Keys stay on hardware wallet', 'No minimum ETH required'] },
      sol:  { coinId: 'sol',  staticApr: 6.5,  minStakeNative: 0.01, lockupDays: 3,  liquid: false, features: ['Native Solana delegation', 'You choose validator', '~2–3 day unstake cooldown'] },
      ada:  { coinId: 'ada',  staticApr: 4.5,  minStakeNative: 5,    lockupDays: 0,  liquid: false, features: ['No lockup — Cardano native delegation', 'ADA never leaves your wallet', 'Rewards every epoch (~5 days)'], assetRisks: { slashingRisk: 1, liquidityRisk: 1 } },
      dot:  { coinId: 'dot',  staticApr: 13.0, minStakeNative: 10,   lockupDays: 28, lockupNote: '28-day Polkadot unbonding — plan carefully', liquid: false, features: ['Direct nomination', '28-day unbonding period', 'Slashing enabled on Polkadot'], assetRisks: { slashingRisk: 5, liquidityRisk: 8 } },
      atom: { coinId: 'atom', staticApr: 14.0, minStakeNative: 0.1,  lockupDays: 21, lockupNote: '21-day Cosmos Hub unbonding', liquid: false, features: ['Direct delegation to validators', '21-day unbonding', 'Slashing for double-signing'], assetRisks: { slashingRisk: 4, liquidityRisk: 7 } },
      matic:{ coinId: 'matic',staticApr: 4.5,  minStakeNative: 1,    lockupDays: 9,  liquid: false, features: ['Via Lido stMATIC integration', '~9 day unbonding'] },
      avax: { coinId: 'avax', staticApr: 7.0,  minStakeNative: 25,   lockupDays: 14, lockupNote: 'AVAX network requires 25 AVAX minimum, 2-week minimum stake', liquid: false, features: ['Protocol-level staking', 'High minimum (25 AVAX)', '2-week lockup minimum'], assetRisks: { liquidityRisk: 6 } },
    },
  },

  {
    id: 'metamask',
    name: 'MetaMask',
    category: 'wallet',
    tagline: 'Most popular Ethereum wallet — ETH staking via integrated Lido and Rocket Pool',
    description: 'MetaMask added native staking in 2024, integrating with Lido, Rocket Pool, and other liquid staking providers directly in the wallet UI. You retain custody of your keys; MetaMask\'s staking is purely a UI wrapper around on-chain liquid staking protocols. MetaMask collects a small referral fee from protocols.',
    custodyModel: 'non-custodial',
    founded: 2016,
    website: 'https://portfolio.metamask.io/stake',
    risks: {
      custodyRisk:      1,
      counterpartyRisk: 2,
      contractRisk:     5,
      slashingRisk:     4,
      liquidityRisk:    2,
      regulatoryRisk:   3,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.8,  minStakeNative: 0, lockupDays: 0,  receiptToken: 'stETH/rETH', liquid: true,  liveAprKey: 'lido_eth',  features: ['Choose Lido (stETH) or Rocket Pool (rETH)', 'Fully non-custodial', 'MetaMask earns referral fee (~10% of protocol rewards)', 'No minimum'] },
      matic:{ coinId: 'matic',staticApr: 4.5,  minStakeNative: 1, lockupDays: 9,  liquid: false, features: ['Polygon network staking', '~9-day unbonding'] },
    },
  },

  {
    id: 'phantom',
    name: 'Phantom',
    category: 'wallet',
    tagline: 'Leading Solana wallet — native staking with full validator choice',
    description: 'Phantom is the most popular Solana wallet. It supports native SOL staking directly in the wallet UI — you delegate your SOL to a validator of your choice, your keys stay in your wallet, and rewards compound each epoch (~2.5 days). Phantom also supports Marinade liquid staking (mSOL) and Jito (jitoSOL) for liquid alternatives.',
    custodyModel: 'non-custodial',
    founded: 2021,
    website: 'https://phantom.app',
    risks: {
      custodyRisk:      1,
      counterpartyRisk: 1,
      contractRisk:     1,
      slashingRisk:     2,
      liquidityRisk:    4,
      regulatoryRisk:   2,
    },
    assets: {
      sol: {
        coinId: 'sol',
        staticApr: 7.0,
        minStakeNative: 0.01,
        lockupDays: 3,
        lockupNote: '~2-3 epoch warmup/cooldown (~2.5 days each)',
        liquid: false,
        features: [
          'Native delegation — you choose the validator',
          'Keys never leave your wallet',
          'Rewards every epoch (~2.5 days)',
          'SOL slashing not currently enforced but exists in protocol',
          'Also supports Marinade (mSOL) and Jito (jitoSOL) liquid staking',
        ],
        assetRisks: { slashingRisk: 2, liquidityRisk: 3 },
      },
    },
  },

  {
    id: 'trust-wallet',
    name: 'Trust Wallet',
    category: 'wallet',
    tagline: 'Binance-owned multi-chain wallet with native staking for many PoS networks',
    description: 'Trust Wallet supports native staking for BNB, SOL, ADA, ATOM, DOT, AVAX, and TRX. Despite being owned by Binance, it is non-custodial — Binance cannot access your funds. Trust Wallet is a convenient option for users already in the BNB ecosystem. Note: the 2023 security vulnerability (later patched) affected older wallet versions.',
    custodyModel: 'non-custodial',
    founded: 2017,
    website: 'https://trustwallet.com/staking',
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     2,
      slashingRisk:     4,
      liquidityRisk:    5,
      regulatoryRisk:   4,
    },
    assets: {
      bnb:  { coinId: 'bnb',  staticApr: 6.0,  minStakeNative: 1,    lockupDays: 7,  liquid: false, features: ['BSC validator delegation', '7-day unbonding', 'Owned by Binance but non-custodial'] },
      sol:  { coinId: 'sol',  staticApr: 6.5,  minStakeNative: 0.01, lockupDays: 3,  liquid: false, features: ['Native Solana delegation', '~3-day cooldown'] },
      ada:  { coinId: 'ada',  staticApr: 4.5,  minStakeNative: 5,    lockupDays: 0,  liquid: false, features: ['No lockup', 'ADA never leaves wallet'], assetRisks: { liquidityRisk: 1, slashingRisk: 1 } },
      atom: { coinId: 'atom', staticApr: 13.0, minStakeNative: 0.1,  lockupDays: 21, lockupNote: '21-day Cosmos unbonding', liquid: false, features: ['Validator choice', '21-day unbonding'], assetRisks: { liquidityRisk: 7 } },
      dot:  { coinId: 'dot',  staticApr: 12.0, minStakeNative: 10,   lockupDays: 28, lockupNote: '28-day Polkadot unbonding', liquid: false, features: ['28-day unbonding', 'Manual nomination required'], assetRisks: { liquidityRisk: 8, slashingRisk: 5 } },
      avax: { coinId: 'avax', staticApr: 7.5,  minStakeNative: 25,   lockupDays: 14, lockupNote: 'AVAX protocol: 25 AVAX min, 2 weeks min', liquid: false, features: ['25 AVAX minimum', '2-week minimum lockup'], assetRisks: { liquidityRisk: 6 } },
      trx:  { coinId: 'trx',  staticApr: 4.5,  minStakeNative: 1,    lockupDays: 3,  liquid: false, features: ['TRON energy model — earn bandwidth/energy rewards', '3-day unstake'] },
    },
  },

  {
    id: 'exodus',
    name: 'Exodus',
    category: 'wallet',
    tagline: 'Beautiful multi-chain desktop/mobile wallet with built-in staking',
    description: 'Exodus is a popular non-custodial wallet with built-in staking for SOL, ADA, ATOM, AVAX, and DOT. It\'s known for its polished UI and ease of use, making it a good choice for newer users who want self-custody without complexity. Exodus takes a portion of staking rewards as a fee.',
    custodyModel: 'non-custodial',
    founded: 2015,
    website: 'https://www.exodus.com/crypto-staking',
    risks: {
      custodyRisk:      1,
      counterpartyRisk: 2,
      contractRisk:     2,
      slashingRisk:     4,
      liquidityRisk:    5,
      regulatoryRisk:   2,
    },
    assets: {
      sol:  { coinId: 'sol',  staticApr: 6.0,  minStakeNative: 0.01, lockupDays: 3,  liquid: false, features: ['Native Solana delegation', 'Exodus selects validators', '~3-day cooldown', 'Exodus takes ~5% of rewards as fee'] },
      ada:  { coinId: 'ada',  staticApr: 4.3,  minStakeNative: 5,    lockupDays: 0,  liquid: false, features: ['No lockup', 'ADA stays in your wallet', 'Simple UI for beginners'], assetRisks: { liquidityRisk: 1, slashingRisk: 1 } },
      atom: { coinId: 'atom', staticApr: 12.0, minStakeNative: 0.1,  lockupDays: 21, lockupNote: '21-day Cosmos unbonding', liquid: false, features: ['21-day unbonding', 'Exodus handles validator selection'] },
      avax: { coinId: 'avax', staticApr: 7.0,  minStakeNative: 25,   lockupDays: 14, lockupNote: 'AVAX: 25 min, 2-week minimum', liquid: false, features: ['25 AVAX minimum', 'Exodus selects validators'] },
      dot:  { coinId: 'dot',  staticApr: 11.5, minStakeNative: 10,   lockupDays: 28, lockupNote: '28-day Polkadot unbonding', liquid: false, features: ['28-day unbonding', 'Exodus manages nomination'], assetRisks: { liquidityRisk: 8 } },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // LIQUID STAKING PROTOCOLS
  // ════════════════════════════════════════════════════════════════════════════

  {
    id: 'lido',
    name: 'Lido Finance',
    category: 'liquid',
    tagline: 'Largest liquid staking protocol — stETH for ETH, stMATIC for Polygon',
    description: 'Lido is the dominant liquid staking protocol with ~$30B TVL. You deposit ETH and receive stETH (staked ETH) which accrues rewards daily and can be used in DeFi. Lido\'s curated set of ~30 professional validators introduces centralization risk — Lido controls ~32% of all staked ETH, approaching the critical 33% threshold. Lido DAO governance manages the protocol.',
    custodyModel: 'smart-contract',
    founded: 2020,
    website: 'https://lido.fi',
    tvlBillions: 30.0,
    auditCount: 12,
    risks: {
      custodyRisk:      3,
      counterpartyRisk: 3,
      contractRisk:     5,
      slashingRisk:     4,
      liquidityRisk:    1,
      regulatoryRisk:   4,
    },
    assets: {
      eth: {
        coinId: 'eth',
        staticApr: 3.8,
        minStakeNative: 0,
        lockupDays: 0,
        receiptToken: 'stETH',
        liquid: true,
        liveAprKey: 'lido_eth',
        features: [
          'stETH — liquid receipt token, tradeable any time',
          'stETH balance increases daily (rebasing token)',
          'Used as collateral across major DeFi protocols (Aave, Curve, etc.)',
          'Lido Node Operator Registry: ~30 professional validators',
          'Lido controls ~32% of all staked ETH — centralization concern',
          'Slashing Insurance Fund covers user losses from validator slashing',
          '12+ security audits (Quantstamp, SigmaPrime, Sigma, etc.)',
        ],
        assetRisks: { contractRisk: 5, slashingRisk: 4 },
      },
      matic: {
        coinId: 'matic',
        staticApr: 4.5,
        minStakeNative: 1,
        lockupDays: 0,
        receiptToken: 'stMATIC',
        liquid: true,
        features: ['stMATIC liquid token', 'Polygon PoS delegation', 'Instant exit via secondary market'],
        assetRisks: { slashingRisk: 3 },
      },
    },
  },

  {
    id: 'rocketpool',
    name: 'Rocket Pool',
    category: 'liquid',
    tagline: 'Most decentralized ETH liquid staking — permissionless node operators, rETH token',
    description: 'Rocket Pool is the most decentralized ETH liquid staking protocol. Anyone can become a node operator with 8 ETH (vs. 32 ETH for solo staking). rETH is a non-rebasing token that appreciates in value vs ETH over time. With 3,000+ node operators, it\'s far more decentralized than Lido. Smart contract risk remains, but the distributed validator set reduces single points of failure.',
    custodyModel: 'smart-contract',
    founded: 2016,
    website: 'https://rocketpool.net',
    tvlBillions: 4.5,
    auditCount: 7,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 1,
      contractRisk:     5,
      slashingRisk:     3,
      liquidityRisk:    2,
      regulatoryRisk:   2,
    },
    assets: {
      eth: {
        coinId: 'eth',
        staticApr: 3.6,
        minStakeNative: 0.01,
        lockupDays: 0,
        receiptToken: 'rETH',
        liquid: true,
        liveAprKey: 'rocketpool_eth',
        features: [
          'rETH — non-rebasing token that increases in ETH value over time',
          '3,000+ permissionless node operators (most decentralized ETH LST)',
          'Node operators stake 8 ETH + 2.4 ETH worth of RPL as insurance',
          'No company — protocol DAO governance only',
          '7 independent security audits',
          'Lower TVL means less systemic risk to Ethereum consensus',
          'rETH usable as DeFi collateral (Aave, Maker, Compound)',
        ],
      },
    },
  },

  {
    id: 'marinade',
    name: 'Marinade Finance',
    category: 'liquid',
    tagline: 'Largest Solana liquid staking — mSOL stakes across 100+ validators',
    description: 'Marinade is the leading Solana liquid staking protocol. Depositing SOL gives you mSOL, which accrues staking rewards and can be used in Solana DeFi. Marinade stakes across 100+ validators using an algorithmic delegation strategy that optimizes for decentralization and performance. Fully audited and DAO-governed.',
    custodyModel: 'smart-contract',
    founded: 2021,
    website: 'https://marinade.finance',
    tvlBillions: 0.9,
    auditCount: 4,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     4,
      slashingRisk:     2,
      liquidityRisk:    1,
      regulatoryRisk:   2,
    },
    assets: {
      sol: {
        coinId: 'sol',
        staticApr: 7.0,
        minStakeNative: 0.01,
        lockupDays: 0,
        receiptToken: 'mSOL',
        liquid: true,
        liveAprKey: 'marinade_sol',
        features: [
          'mSOL — liquid receipt, usable in Solana DeFi',
          '100+ validators via algorithmic delegation',
          'Delayed unstaking option: 1–2 epoch wait for full face value',
          'Instant unstake available via AMM liquidity pool (slight fee)',
          '4 security audits',
          'Marinade DAO governance',
        ],
      },
    },
  },

  {
    id: 'jito',
    name: 'Jito',
    category: 'liquid',
    tagline: 'Solana liquid staking with MEV rewards — jitoSOL earns more than native staking',
    description: 'Jito runs MEV-aware Solana validators that capture Maximum Extractable Value (MEV) and distribute it back to stakers. jitoSOL holders earn both normal staking rewards AND a portion of MEV tips, typically resulting in higher APY than native staking. Jito has become the largest Solana liquid staking protocol by TVL.',
    custodyModel: 'smart-contract',
    founded: 2022,
    website: 'https://www.jito.network/staking/',
    tvlBillions: 2.2,
    auditCount: 3,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     4,
      slashingRisk:     2,
      liquidityRisk:    1,
      regulatoryRisk:   3,
    },
    assets: {
      sol: {
        coinId: 'sol',
        staticApr: 7.5,
        minStakeNative: 0.01,
        lockupDays: 0,
        receiptToken: 'jitoSOL',
        liquid: true,
        liveAprKey: 'jito_sol',
        features: [
          'jitoSOL — liquid token with MEV rewards included',
          'MEV tips distributed on top of base staking APY',
          'Largest Solana liquid staking protocol by TVL',
          'Instant unstake via liquidity pool (small fee) or delayed (2 epochs)',
          'Used across Solana DeFi as collateral',
        ],
      },
    },
  },

  {
    id: 'stride',
    name: 'Stride',
    category: 'liquid',
    tagline: 'Cosmos ecosystem liquid staking — stATOM, stOSMO, stTIA and more',
    description: 'Stride is the leading liquid staking protocol for the Cosmos ecosystem, supporting ATOM, OSMO, TIA, INJ, and several other IBC-connected chains. You deposit ATOM and receive stATOM, which accrues rewards and can be used across Cosmos DeFi. Stride uses IBC to delegate to validators on the native chain — your ATOM never leaves the Cosmos Hub.',
    custodyModel: 'smart-contract',
    founded: 2022,
    website: 'https://app.stride.zone',
    tvlBillions: 0.25,
    auditCount: 3,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     5,
      slashingRisk:     5,
      liquidityRisk:    2,
      regulatoryRisk:   2,
    },
    assets: {
      atom: {
        coinId: 'atom',
        staticApr: 14.0,
        minStakeNative: 0.1,
        lockupDays: 0,
        receiptToken: 'stATOM',
        liquid: true,
        liveAprKey: 'stride_atom',
        features: [
          'stATOM — liquid, tradeable on Osmosis DEX and other venues',
          'IBC-based delegation — ATOM stays on Cosmos Hub',
          'Instant exit via Osmosis stATOM/ATOM pool (small slippage)',
          'Slashing on Cosmos Hub is enabled — risk is real but distributed',
          '3 security audits',
          'Stride DAO governs protocol',
        ],
        assetRisks: { slashingRisk: 5, contractRisk: 5 },
      },
      inj: {
        coinId: 'inj',
        staticApr: 13.0,
        minStakeNative: 0.1,
        lockupDays: 0,
        receiptToken: 'stINJ',
        liquid: true,
        liveAprKey: 'stride_inj',
        features: [
          'stINJ — liquid Injective staking via Stride',
          'IBC-based delegation — INJ stays on Injective chain',
          'Instant exit via stINJ/INJ pool (small slippage)',
          '3 security audits',
          'Stride DAO governs protocol',
        ],
        assetRisks: { slashingRisk: 5, contractRisk: 5 },
      },
      tia: {
        coinId: 'tia',
        staticApr: 16.0,
        minStakeNative: 0.1,
        lockupDays: 0,
        receiptToken: 'stTIA',
        liquid: true,
        liveAprKey: 'stride_tia',
        features: [
          'stTIA — liquid Celestia staking via Stride',
          'IBC-based delegation — TIA stays on Celestia chain',
          'Instant exit via stTIA/TIA pool (small slippage)',
          'High inflation-driven APY on new chain',
          '3 security audits',
        ],
        assetRisks: { slashingRisk: 5, contractRisk: 5 },
      },
    },
  },

  {
    id: 'benqi',
    name: 'Benqi',
    category: 'liquid',
    tagline: 'Avalanche native liquid staking — sAVAX earns staking rewards with full liquidity',
    description: 'Benqi is the leading Avalanche DeFi protocol offering both lending/borrowing and liquid staking. sAVAX is the liquid staking receipt for AVAX, solving the 2-week lockup problem of native AVAX staking. sAVAX can be used as collateral in Benqi\'s lending market and other Avalanche DeFi protocols.',
    custodyModel: 'smart-contract',
    founded: 2021,
    website: 'https://staking.benqi.fi',
    tvlBillions: 0.35,
    auditCount: 3,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 3,
      contractRisk:     5,
      slashingRisk:     2,
      liquidityRisk:    2,
      regulatoryRisk:   2,
    },
    assets: {
      avax: {
        coinId: 'avax',
        staticApr: 6.5,
        minStakeNative: 0.1,
        lockupDays: 0,
        receiptToken: 'sAVAX',
        liquid: true,
        features: [
          'sAVAX — liquid AVAX staking, bypasses 2-week lockup',
          'sAVAX usable as collateral in Benqi Liquidity Market',
          'No minimum (vs. 25 AVAX for native staking)',
          '3 security audits',
          'Instant exit via Trader Joe / Platypus AMM pools',
        ],
        assetRisks: { liquidityRisk: 2, slashingRisk: 2 },
      },
    },
  },

  {
    id: 'etherfi',
    name: 'EtherFi',
    category: 'liquid',
    defaultYieldType: 'restaking',
    tagline: 'Native restaking protocol — eETH earns ETH staking + EigenLayer restaking rewards',
    description: 'EtherFi is the largest native restaking protocol built on EigenLayer. Depositing ETH gives you eETH, which earns standard Ethereum PoS staking rewards plus additional restaking rewards from EigenLayer AVS operators. Node operators in EtherFi use distributed validator technology for resilience. EtherFi is the only protocol where node operators never hold user keys.',
    custodyModel: 'smart-contract',
    founded: 2023,
    website: 'https://app.ether.fi',
    tvlBillions: 7.5,
    auditCount: 6,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 3,
      contractRisk:     6,
      slashingRisk:     5,
      liquidityRisk:    2,
      regulatoryRisk:   3,
    },
    assets: {
      eth: {
        coinId: 'eth',
        staticApr: 4.8,
        minStakeNative: 0,
        lockupDays: 0,
        receiptToken: 'eETH',
        liquid: true,
        features: [
          'eETH — liquid receipt token redeemable via withdrawal queue',
          'EigenLayer restaking rewards on top of base staking APY',
          'Distributed validator technology — no single node operator holds full key',
          '6 security audits',
          'Loyalty points (ETHFI rewards) for early depositors',
          'Instant exit via Curve/Uniswap eETH liquidity pools',
        ],
        assetRisks: { contractRisk: 6, slashingRisk: 5 },
      },
    },
  },

  {
    id: 'uniswap',
    name: 'Uniswap',
    category: 'liquid',
    tagline: 'Leading DEX — earn trading fees by providing liquidity, or stake UNI for governance rewards',
    description: 'Uniswap is the largest decentralized exchange on Ethereum and multiple EVM chains. Users can earn yield two ways: (1) provide liquidity to trading pools (v3 concentrated liquidity) and earn a share of trading fees, or (2) stake UNI tokens for governance participation. Liquidity provision is not traditional staking — returns vary with trading volume and impermanent loss risk applies.',
    custodyModel: 'smart-contract',
    founded: 2018,
    website: 'https://app.uniswap.org',
    tvlBillions: 6.8,
    auditCount: 8,
    risks: {
      custodyRisk:      1,
      counterpartyRisk: 1,
      contractRisk:     4,
      slashingRisk:     1,
      liquidityRisk:    3,
      regulatoryRisk:   5,
    },
    assets: {
      eth: {
        coinId: 'eth',
        staticApr: 3.5,
        minStakeNative: 0,
        lockupDays: 0,
        liquid: true,
        features: [
          'ETH/USDC and ETH/USDT pools — earn trading fees (0.05–1% fee tier)',
          'v3 concentrated liquidity — requires active range management',
          'Impermanent loss risk — returns vary with price volatility',
          'Available on Ethereum, Arbitrum, Base, Optimism, Polygon',
          'Fully non-custodial — smart contract holds position',
          '8 security audits including Trail of Bits, OpenZeppelin',
        ],
        assetRisks: { contractRisk: 4, liquidityRisk: 4, slashingRisk: 1 },
      },
    },
  },

  {
    id: 'kucoin',
    name: 'KuCoin',
    category: 'cefi',
    tagline: 'Major offshore exchange — broad staking selection, KCS staking bonus, lower regulation',
    description: 'KuCoin offers staking through KuCoin Earn with both soft staking (flexible) and fixed-term products. KCS (KuCoin Token) holders receive a daily dividend from 50% of trading fees. KuCoin has faced regulatory scrutiny (2023 DOJ indictment of founders) and operates without formal licensing in most jurisdictions. Higher yield but higher counterparty risk than regulated US exchanges.',
    custodyModel: 'custodial',
    founded: 2017,
    website: 'https://www.kucoin.com/earn',
    tvlBillions: 0.6,
    risks: {
      custodyRisk:      8,
      counterpartyRisk: 7,
      contractRisk:     2,
      slashingRisk:     1,
      liquidityRisk:    4,
      regulatoryRisk:   9,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.5,  minStakeNative: 0.01,  lockupDays: 0,  liquid: false, features: ['Soft staking — no lockup', 'Competitive rate', 'DOJ-indicted founders — elevated counterparty risk'] },
      sol:  { coinId: 'sol',  staticApr: 6.5,  minStakeNative: 1,     lockupDays: 7,  liquid: false, features: ['Fixed-term and flexible options', 'Higher APY than most CeFi'] },
      dot:  { coinId: 'dot',  staticApr: 12.5, minStakeNative: 1,     lockupDays: 28, lockupNote: '28-day Polkadot unbonding', liquid: false, features: ['28-day unbonding', 'High APY'] },
      atom: { coinId: 'atom', staticApr: 16.0, minStakeNative: 1,     lockupDays: 21, lockupNote: '21-day Cosmos unbonding', liquid: false, features: ['Among highest CeFi ATOM rates', '21-day unbonding'] },
      bnb:  { coinId: 'bnb',  staticApr: 5.5,  minStakeNative: 0.1,   lockupDays: 7,  liquid: false, features: ['BNB staking via BSC delegation'] },
      ada:  { coinId: 'ada',  staticApr: 4.2,  minStakeNative: 1,     lockupDays: 0,  liquid: false, features: ['No lockup — Cardano protocol', 'Soft staking'] },
      avax: { coinId: 'avax', staticApr: 5.8,  minStakeNative: 0.1,   lockupDays: 14, lockupNote: 'AVAX 2-week minimum', liquid: false, features: ['2-week lockup (protocol requirement)'] },
      inj:  { coinId: 'inj',  staticApr: 13.0, minStakeNative: 1,     lockupDays: 21, lockupNote: '21-day Injective unbonding', liquid: false, features: ['Injective staking via KuCoin Earn', '21-day unbonding'] },
      tia:  { coinId: 'tia',  staticApr: 15.5, minStakeNative: 1,     lockupDays: 21, lockupNote: '21-day Celestia unbonding', liquid: false, features: ['High inflation-driven APY', '21-day unbonding'] },
      near: { coinId: 'near', staticApr: 10.0, minStakeNative: 1,     lockupDays: 4,  lockupNote: '~4-day NEAR unstaking', liquid: false, features: ['~4-day unbonding (NEAR protocol)', 'Competitive rate'] },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // CEFI — ADDITIONAL EXCHANGES
  // ════════════════════════════════════════════════════════════════════════════

  {
    id: 'crypto-com',
    name: 'Crypto.com',
    category: 'cefi',
    tagline: 'Singapore-based exchange with deep staking rewards for CRO stakers and Visa card holders',
    description: 'Crypto.com offers staking through its app and exchange, with bonus APY tiers unlocked by staking CRO tokens. It has faced criticism for opaque financials and the collapse of its Cronos chain ecosystem in 2022, though the exchange itself remained solvent. Available in most jurisdictions.',
    custodyModel: 'custodial',
    founded: 2016,
    website: 'https://crypto.com/earn',
    tvlBillions: 0.7,
    risks: {
      custodyRisk:      8,
      counterpartyRisk: 6,
      contractRisk:     2,
      slashingRisk:     1,
      liquidityRisk:    4,
      regulatoryRisk:   6,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.0,  minStakeNative: 0.01, lockupDays: 0,  liquid: false, features: ['Flexible staking, no lockup', 'CRO staking boosts APY by up to 2×'] },
      sol:  { coinId: 'sol',  staticApr: 4.5,  minStakeNative: 1,    lockupDays: 5,  liquid: false, features: ['~5-day cooldown', 'Auto-compound'] },
      ada:  { coinId: 'ada',  staticApr: 3.0,  minStakeNative: 1,    lockupDays: 0,  liquid: false, features: ['No lockup, Cardano native delegation'] },
      dot:  { coinId: 'dot',  staticApr: 10.0, minStakeNative: 1,    lockupDays: 28, lockupNote: '28-day Polkadot unbonding', liquid: false, features: ['28-day unbonding'] },
      atom: { coinId: 'atom', staticApr: 8.0,  minStakeNative: 1,    lockupDays: 21, lockupNote: '21-day Cosmos unbonding', liquid: false, features: ['21-day unbonding'] },
      bnb:  { coinId: 'bnb',  staticApr: 4.0,  minStakeNative: 0.1,  lockupDays: 7,  liquid: false, features: ['BSC delegation, 7-day unbonding'] },
      avax: { coinId: 'avax', staticApr: 5.0,  minStakeNative: 0.1,  lockupDays: 14, lockupNote: 'AVAX 2-week minimum', liquid: false, features: ['2-week lockup (protocol minimum)'] },
      cro:  { coinId: 'cro',  staticApr: 12.0, minStakeNative: 5000, lockupDays: 180, lockupNote: '180-day lockup for Visa card tier staking', liquid: false, features: ['Required for Visa card tier benefits', '6-month lockup for highest tier', 'Unlocks boosted APY on all assets'], assetRisks: { liquidityRisk: 9 } },
    },
  },

  {
    id: 'bitget',
    name: 'Bitget',
    category: 'cefi',
    tagline: 'Top-10 derivatives exchange by volume with growing spot staking products',
    description: 'Bitget has grown rapidly post-FTX as a derivatives-focused exchange, now offering staking via Bitget Earn. Strong copy-trading community. Registered in Seychelles with a user protection fund. Regulatory status varies by jurisdiction — not available to US users.',
    custodyModel: 'custodial',
    founded: 2018,
    website: 'https://www.bitget.com/earn',
    tvlBillions: 0.5,
    risks: {
      custodyRisk:      8,
      counterpartyRisk: 5,
      contractRisk:     2,
      slashingRisk:     1,
      liquidityRisk:    4,
      regulatoryRisk:   6,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.2,  minStakeNative: 0.01, lockupDays: 0,  liquid: false, features: ['Flexible ETH staking', 'Slashing protection included'] },
      sol:  { coinId: 'sol',  staticApr: 5.5,  minStakeNative: 1,    lockupDays: 5,  liquid: false, features: ['Competitive SOL rate', '~5-day cooldown'] },
      dot:  { coinId: 'dot',  staticApr: 11.0, minStakeNative: 1,    lockupDays: 28, lockupNote: '28-day unbonding', liquid: false, features: ['28-day Polkadot unbonding'] },
      atom: { coinId: 'atom', staticApr: 10.0, minStakeNative: 1,    lockupDays: 21, lockupNote: '21-day unbonding', liquid: false, features: ['21-day Cosmos unbonding'] },
      bnb:  { coinId: 'bnb',  staticApr: 4.5,  minStakeNative: 0.1,  lockupDays: 7,  liquid: false, features: ['BSC validator delegation'] },
    },
  },

  {
    id: 'gate-io',
    name: 'Gate.io',
    category: 'cefi',
    tagline: 'Established exchange with one of the broadest staking asset selections',
    description: 'Gate.io has operated since 2013 and offers staking across a very broad range of assets including many long-tail coins not found on other exchanges. It has maintained operations without major hacks or insolvency events. Regulatory standing is limited — primarily serves non-US users.',
    custodyModel: 'custodial',
    founded: 2013,
    website: 'https://www.gate.io/earn',
    tvlBillions: 0.9,
    risks: {
      custodyRisk:      8,
      counterpartyRisk: 5,
      contractRisk:     2,
      slashingRisk:     1,
      liquidityRisk:    4,
      regulatoryRisk:   7,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.3,  minStakeNative: 0.01, lockupDays: 0,  liquid: false, features: ['Flexible ETH staking'] },
      sol:  { coinId: 'sol',  staticApr: 6.0,  minStakeNative: 1,    lockupDays: 5,  liquid: false, features: ['Competitive rate', '~5-day cooldown'] },
      ada:  { coinId: 'ada',  staticApr: 4.0,  minStakeNative: 1,    lockupDays: 0,  liquid: false, features: ['No lockup, Cardano delegation'] },
      dot:  { coinId: 'dot',  staticApr: 12.0, minStakeNative: 1,    lockupDays: 28, lockupNote: '28-day unbonding', liquid: false, features: ['28-day Polkadot unbonding'] },
      atom: { coinId: 'atom', staticApr: 12.0, minStakeNative: 1,    lockupDays: 21, lockupNote: '21-day unbonding', liquid: false, features: ['High APY, 21-day unbonding'] },
      bnb:  { coinId: 'bnb',  staticApr: 5.0,  minStakeNative: 0.1,  lockupDays: 7,  liquid: false, features: ['BSC delegation'] },
      avax: { coinId: 'avax', staticApr: 5.5,  minStakeNative: 0.1,  lockupDays: 14, lockupNote: '2-week AVAX protocol minimum', liquid: false, features: ['2-week lockup minimum'] },
      trx:  { coinId: 'trx',  staticApr: 4.2,  minStakeNative: 1,    lockupDays: 3,  liquid: false, features: ['TRON energy staking'] },
      inj:  { coinId: 'inj',  staticApr: 13.5, minStakeNative: 1,    lockupDays: 21, lockupNote: '21-day Injective unbonding', liquid: false, features: ['Broad asset selection', '21-day unbonding'] },
      tia:  { coinId: 'tia',  staticApr: 16.0, minStakeNative: 1,    lockupDays: 21, lockupNote: '21-day Celestia unbonding', liquid: false, features: ['High inflation-driven APY', '21-day unbonding'] },
      near: { coinId: 'near', staticApr: 10.5, minStakeNative: 1,    lockupDays: 4,  lockupNote: '~4-day NEAR unstaking', liquid: false, features: ['~4-day unbonding (NEAR protocol)'] },
    },
  },

  {
    id: 'htx',
    name: 'HTX (Huobi)',
    category: 'cefi',
    tagline: 'One of the oldest exchanges — rebranded from Huobi in 2023 after ownership change',
    description: 'HTX (formerly Huobi) was founded in 2013 and is one of the longest-running crypto exchanges. In 2022–2023, Huobi changed ownership to About Capital (linked to Justin Sun of TRON), rebranding to HTX. This ownership change introduced new counterparty concerns. Regulatory standing has weakened — no longer operates in many major markets.',
    custodyModel: 'custodial',
    founded: 2013,
    website: 'https://www.htx.com/en-us/finance',
    tvlBillions: 0.4,
    risks: {
      custodyRisk:      8,
      counterpartyRisk: 7,
      contractRisk:     2,
      slashingRisk:     1,
      liquidityRisk:    5,
      regulatoryRisk:   8,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.5,  minStakeNative: 0.01, lockupDays: 0,  liquid: false, features: ['Flexible staking', 'Justin Sun-linked ownership — elevated counterparty risk'] },
      sol:  { coinId: 'sol',  staticApr: 5.5,  minStakeNative: 1,    lockupDays: 5,  liquid: false, features: ['~5-day cooldown'] },
      dot:  { coinId: 'dot',  staticApr: 11.0, minStakeNative: 1,    lockupDays: 28, lockupNote: '28-day unbonding', liquid: false, features: ['28-day Polkadot unbonding'] },
      atom: { coinId: 'atom', staticApr: 10.0, minStakeNative: 1,    lockupDays: 21, lockupNote: '21-day Cosmos unbonding', liquid: false, features: ['21-day unbonding'] },
      bnb:  { coinId: 'bnb',  staticApr: 5.0,  minStakeNative: 0.1,  lockupDays: 7,  liquid: false, features: ['BSC delegation'] },
      trx:  { coinId: 'trx',  staticApr: 5.0,  minStakeNative: 1,    lockupDays: 3,  liquid: false, features: ["TRON — Justin Sun's chain; HTX is closely associated", '3-day unstake'] },
    },
  },

  {
    id: 'robinhood',
    name: 'Robinhood',
    category: 'cefi',
    tagline: 'US retail brokerage — simple ETH and SOL staking for beginners',
    description: 'Robinhood added crypto staking in 2023–2024. As a FINRA-regulated US broker, it offers ETH and SOL staking with a simplified UI aimed at retail investors. Robinhood takes a fee from staking rewards. Not available in all US states due to regulatory requirements. Lower yields than specialist platforms but maximum simplicity.',
    custodyModel: 'custodial',
    founded: 2013,
    website: 'https://robinhood.com/us/en/learn/articles/crypto-staking',
    risks: {
      custodyRisk:      8,
      counterpartyRisk: 3,
      contractRisk:     1,
      slashingRisk:     1,
      liquidityRisk:    3,
      regulatoryRisk:   4,
    },
    assets: {
      eth: { coinId: 'eth', staticApr: 3.0, minStakeNative: 0, lockupDays: 0, liquid: false, features: ['FINRA-regulated broker', 'Simplified UI, no technical knowledge required', 'Robinhood covers slashing losses', 'Not available in all US states'] },
      sol: { coinId: 'sol', staticApr: 4.5, minStakeNative: 0, lockupDays: 3, liquid: false, features: ['~3-day cooldown', 'Auto-compound'] },
    },
  },

  {
    id: 'nexo',
    name: 'Nexo',
    category: 'cefi',
    defaultYieldType: 'lending',
    tagline: 'Crypto lending platform offering yield on deposited assets — not pure staking',
    description: 'Nexo offers yield on crypto deposits by lending them to institutional borrowers. This is lending-based yield, not validator staking — similar in risk profile to Celsius. Nexo survived 2022 but faced regulatory investigations in Bulgaria and the US. It exited the US market in 2023. Higher yields come with higher counterparty and lending risk.',
    custodyModel: 'custodial',
    founded: 2018,
    website: 'https://nexo.com/earn-crypto',
    risks: {
      custodyRisk:      9,
      counterpartyRisk: 7,
      contractRisk:     3,
      slashingRisk:     1,
      liquidityRisk:    7,
      regulatoryRisk:   8,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 5.0,  minStakeNative: 0, lockupDays: 0,  liquid: false, features: ['Lending-based yield, not validator staking', 'Flexible terms', 'Exited US market 2023', 'Regulatory investigation in Bulgaria'] },
      sol:  { coinId: 'sol',  staticApr: 7.0,  minStakeNative: 0, lockupDays: 0,  liquid: false, features: ['Lending-based yield', 'Higher rate but higher counterparty risk'] },
      bnb:  { coinId: 'bnb',  staticApr: 6.0,  minStakeNative: 0, lockupDays: 0,  liquid: false, features: ['Flexible lending yield'] },
      avax: { coinId: 'avax', staticApr: 7.0,  minStakeNative: 0, lockupDays: 0,  liquid: false, features: ['Lending-based, not validator staking'] },
      dot:  { coinId: 'dot',  staticApr: 10.0, minStakeNative: 0, lockupDays: 0,  liquid: false, features: ['Flexible lending yield on DOT'] },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // SELF-CUSTODY WALLETS — ADDITIONAL
  // ════════════════════════════════════════════════════════════════════════════

  {
    id: 'keplr',
    name: 'Keplr Wallet',
    category: 'wallet',
    tagline: 'The standard Cosmos wallet — native staking for ATOM and 50+ IBC-connected chains',
    description: 'Keplr is the dominant browser extension and mobile wallet for the Cosmos ecosystem. It supports native delegation staking across Cosmos Hub (ATOM), Osmosis (OSMO), Celestia (TIA), Injective (INJ), Stargaze, and 50+ IBC-connected chains. You control your keys entirely; Keplr is purely a UI for submitting on-chain transactions. Validator choice, slashing risk, and unbonding periods all apply natively.',
    custodyModel: 'non-custodial',
    founded: 2020,
    website: 'https://www.keplr.app',
    risks: {
      custodyRisk:      1,
      counterpartyRisk: 1,
      contractRisk:     1,
      slashingRisk:     5,
      liquidityRisk:    7,
      regulatoryRisk:   2,
    },
    assets: {
      atom: { coinId: 'atom', staticApr: 14.0, minStakeNative: 0.1, lockupDays: 21, lockupNote: '21-day Cosmos Hub unbonding', liquid: false, features: ['Direct on-chain delegation', 'You choose validator', '21-day unbonding', 'Slashing for double-signing and downtime', 'Governance participation included'], assetRisks: { slashingRisk: 5, liquidityRisk: 7 } },
      osmo: { coinId: 'osmo', staticApr: 10.0, minStakeNative: 1,   lockupDays: 14, lockupNote: '14-day Osmosis unbonding', liquid: false, features: ['Superfluid staking — stake while providing liquidity', '14-day unbonding on Osmosis', 'Governance voting power'], assetRisks: { slashingRisk: 4, liquidityRisk: 6 } },
      dot:  { coinId: 'dot',  staticApr: 13.0, minStakeNative: 10,  lockupDays: 28, lockupNote: '28-day Polkadot unbonding', liquid: false, features: ['Via Polkadot.js integration', '28-day unbonding', 'Manual nomination selection'], assetRisks: { slashingRisk: 5, liquidityRisk: 8 } },
      inj:  { coinId: 'inj',  staticApr: 14.5, minStakeNative: 0.1, lockupDays: 21, lockupNote: '21-day Injective unbonding', liquid: false, features: ['Native Injective delegation', 'You choose validator', '21-day unbonding', 'Slashing enabled'], assetRisks: { slashingRisk: 5, liquidityRisk: 7 } },
      tia:  { coinId: 'tia',  staticApr: 18.0, minStakeNative: 0.1, lockupDays: 21, lockupNote: '21-day Celestia unbonding', liquid: false, features: ['Native Celestia delegation', 'You choose validator', '21-day unbonding', 'High inflation-driven APY'], assetRisks: { slashingRisk: 5, liquidityRisk: 7 } },
    },
  },

  {
    id: 'solflare',
    name: 'Solflare',
    category: 'wallet',
    tagline: 'Solana-native wallet with full staking, LST support, and validator analytics',
    description: 'Solflare is one of the two leading Solana wallets (alongside Phantom). It supports native SOL staking with detailed validator analytics and performance history, helping users pick validators intelligently. It also integrates Marinade (mSOL), Jito (jitoSOL), and Sanctum LSTs for liquid staking alternatives. Built by the Solana Foundation-backed team at Solflare.',
    custodyModel: 'non-custodial',
    founded: 2021,
    website: 'https://solflare.com',
    risks: {
      custodyRisk:      1,
      counterpartyRisk: 1,
      contractRisk:     1,
      slashingRisk:     2,
      liquidityRisk:    3,
      regulatoryRisk:   2,
    },
    assets: {
      sol: { coinId: 'sol', staticApr: 7.0, minStakeNative: 0.01, lockupDays: 3, lockupNote: '~2-3 epoch warmup/cooldown', liquid: false, features: ['Native Solana delegation with validator analytics', 'Built-in validator performance scoring', 'Supports Marinade (mSOL), Jito (jitoSOL), Sanctum LSTs', 'Keys never leave the wallet', 'Rewards every epoch (~2.5 days)'], assetRisks: { slashingRisk: 2, liquidityRisk: 3 } },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // LIQUID STAKING — ADDITIONAL ETH PROTOCOLS
  // ════════════════════════════════════════════════════════════════════════════

  {
    id: 'frax',
    name: 'Frax Finance',
    category: 'liquid',
    tagline: 'sfrxETH — highest-yield ETH liquid staking token via the frxETH/sfrxETH dual-token model',
    description: 'Frax Finance offers ETH liquid staking through a dual-token system: frxETH (pegged to ETH, used in DeFi) and sfrxETH (staked version that accrues all validator rewards). Because frxETH deposited in Curve earns only trading fees while sfrxETH earns all staking rewards for the entire pool, sfrxETH typically achieves higher APY than single-token liquid staking protocols. Frax also issues FRAX stablecoin and has a broad DeFi ecosystem.',
    custodyModel: 'smart-contract',
    founded: 2021,
    website: 'https://app.frax.finance/frxeth/mint',
    tvlBillions: 0.6,
    auditCount: 5,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     6,
      slashingRisk:     4,
      liquidityRisk:    2,
      regulatoryRisk:   3,
    },
    assets: {
      eth: {
        coinId: 'eth',
        staticApr: 4.5,
        minStakeNative: 0,
        lockupDays: 0,
        receiptToken: 'sfrxETH',
        liquid: true,
        features: [
          'sfrxETH accrues all validator rewards from the entire frxETH supply',
          'Higher APY than Lido/Rocket Pool due to dual-token model',
          'frxETH/ETH Curve pool provides instant exit at near-zero slippage',
          '5 security audits',
          'Frax is a complex multi-product protocol — systemic risk is higher',
          'sfrxETH accepted as collateral in Frax Lend and Fraxlend markets',
        ],
        assetRisks: { contractRisk: 6, slashingRisk: 4 },
      },
    },
  },

  {
    id: 'stakewise',
    name: 'StakeWise v3',
    category: 'liquid',
    tagline: 'Permissionless ETH staking vaults — osETH liquid token backed by any vault',
    description: 'StakeWise v3 introduced a vault-based model where anyone can launch a staking vault with custom validator sets. Users deposit ETH into a vault and receive osETH, a universal liquid staking token backed by the entire StakeWise ecosystem. This enables institutional stakers, solo validators, and protocols to offer staking while depositors retain liquidity through osETH.',
    custodyModel: 'smart-contract',
    founded: 2021,
    website: 'https://app.stakewise.io',
    tvlBillions: 0.35,
    auditCount: 4,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     5,
      slashingRisk:     4,
      liquidityRisk:    3,
      regulatoryRisk:   2,
    },
    assets: {
      eth: {
        coinId: 'eth',
        staticApr: 3.7,
        minStakeNative: 0,
        lockupDays: 0,
        receiptToken: 'osETH',
        liquid: true,
        features: [
          'osETH — universal liquid token across all StakeWise vaults',
          'Permissionless vault creation for custom validator sets',
          'Institutional vault option for KYC/AML-compliant staking',
          'osETH redeemable any time via withdrawal queue or secondary market',
          '4 independent audits',
        ],
        assetRisks: { contractRisk: 5, slashingRisk: 4 },
      },
    },
  },

  {
    id: 'stader',
    name: 'Stader Labs',
    category: 'liquid',
    tagline: 'Multi-chain liquid staking — ETHx, MaticX, BNBx across Ethereum, Polygon, BNB Chain',
    description: 'Stader Labs operates liquid staking protocols across multiple chains, issuing chain-specific receipt tokens: ETHx on Ethereum, MaticX on Polygon, BNBx on BNB Chain, and others. ETHx uses a permissioned node operator model with a community pool alongside permissioned operators. Stader has grown rapidly as a multi-chain alternative to single-chain protocols.',
    custodyModel: 'smart-contract',
    founded: 2021,
    website: 'https://www.staderlabs.com',
    tvlBillions: 0.8,
    auditCount: 6,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     5,
      slashingRisk:     4,
      liquidityRisk:    2,
      regulatoryRisk:   2,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.9,  minStakeNative: 0, lockupDays: 0, receiptToken: 'ETHx',   liquid: true, features: ['ETHx — liquid receipt for Ethereum staking', 'Permissioned + community node operators', 'Instant exit via Curve ETHx pool', '6 audits'], assetRisks: { contractRisk: 5 } },
      matic:{ coinId: 'matic',staticApr: 4.5,  minStakeNative: 1, lockupDays: 0, receiptToken: 'MaticX', liquid: true, features: ['MaticX — largest Polygon liquid staking token', 'Used as collateral on Aave, Compound', 'Instant exit via AMM'], assetRisks: { contractRisk: 4 } },
      bnb:  { coinId: 'bnb',  staticApr: 5.0,  minStakeNative: 0, lockupDays: 0, receiptToken: 'BNBx',   liquid: true, features: ['BNBx — liquid BNB staking, bypasses 7-day unbonding', 'Available on BNB Chain DeFi'], assetRisks: { contractRisk: 4 } },
    },
  },

  {
    id: 'swell',
    name: 'Swell Network',
    category: 'liquid',
    defaultYieldType: 'restaking',
    tagline: 'swETH + rswETH — ETH liquid staking with native EigenLayer restaking integration',
    description: 'Swell offers two tokens: swETH (standard ETH liquid staking) and rswETH (restaked ETH via EigenLayer). Both can be used across DeFi. Swell became a significant player in the EigenLayer restaking narrative in 2024, accumulating significant restaked TVL. The protocol also runs a points program that will convert to SWELL governance token rewards.',
    custodyModel: 'smart-contract',
    founded: 2022,
    website: 'https://app.swellnetwork.io',
    tvlBillions: 1.2,
    auditCount: 4,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     6,
      slashingRisk:     5,
      liquidityRisk:    2,
      regulatoryRisk:   3,
    },
    assets: {
      eth: {
        coinId: 'eth',
        staticApr: 4.2,
        minStakeNative: 0,
        lockupDays: 0,
        receiptToken: 'rswETH',
        liquid: true,
        features: [
          'rswETH — restaked ETH earning staking + EigenLayer AVS rewards',
          'swETH available for standard liquid staking (no restaking)',
          'EigenLayer integration adds restaking slashing risk',
          'Points program → SWELL token airdrop',
          '4 security audits',
          'Instant exit via rswETH/ETH Pendle/Curve pools',
        ],
        assetRisks: { contractRisk: 6, slashingRisk: 5 },
      },
    },
  },

  {
    id: 'renzo',
    name: 'Renzo Protocol',
    category: 'liquid',
    defaultYieldType: 'restaking',
    tagline: 'ezETH — one of the largest EigenLayer restaking protocols by TVL',
    description: 'Renzo is a liquid restaking protocol on top of EigenLayer, issuing ezETH as the liquid receipt token. Users deposit ETH (or LSTs like stETH) and receive ezETH, which earns Ethereum staking rewards plus EigenLayer restaking rewards from multiple Active Validator Services (AVSs). Renzo reached $3B+ TVL in early 2024 driven by EigenLayer points farming.',
    custodyModel: 'smart-contract',
    founded: 2023,
    website: 'https://app.renzoprotocol.com',
    tvlBillions: 2.5,
    auditCount: 4,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 3,
      contractRisk:     7,
      slashingRisk:     6,
      liquidityRisk:    3,
      regulatoryRisk:   3,
    },
    assets: {
      eth: {
        coinId: 'eth',
        staticApr: 4.5,
        minStakeNative: 0,
        lockupDays: 0,
        receiptToken: 'ezETH',
        liquid: true,
        features: [
          'ezETH — liquid restaking token earning ETH staking + EigenLayer AVS rewards',
          'Accepts ETH, stETH, cbETH, rETH as deposits',
          'Multiple AVS operators — restaking slashing risk is real',
          'EigenLayer points + Renzo points → REZ airdrop',
          'Experienced a depeg event in April 2024 (recovered)',
          'Instant exit via Balancer/Curve ezETH pools',
        ],
        assetRisks: { contractRisk: 7, slashingRisk: 6 },
      },
    },
  },

  {
    id: 'kelp-dao',
    name: 'Kelp DAO',
    category: 'liquid',
    defaultYieldType: 'restaking',
    tagline: 'rsETH — multi-AVS EigenLayer restaking with broad LST acceptance',
    description: 'Kelp DAO is a liquid restaking protocol issuing rsETH, which represents ETH restaked across multiple EigenLayer AVS operators. A key differentiator is that Kelp accepts a wide range of LSTs (stETH, cbETH, rETH, sfrxETH, ETHx) as deposit collateral, allowing users to restake their existing liquid staking positions without unwrapping. Backed by the StaderLabs team.',
    custodyModel: 'smart-contract',
    founded: 2023,
    website: 'https://kelpdao.xyz',
    tvlBillions: 1.2,
    auditCount: 3,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 3,
      contractRisk:     7,
      slashingRisk:     6,
      liquidityRisk:    3,
      regulatoryRisk:   3,
    },
    assets: {
      eth: {
        coinId: 'eth',
        staticApr: 4.3,
        minStakeNative: 0,
        lockupDays: 0,
        receiptToken: 'rsETH',
        liquid: true,
        features: [
          'rsETH — accepts ETH, stETH, cbETH, rETH, sfrxETH, ETHx as deposit',
          'Restake existing LSTs without unwrapping',
          'Earns ETH staking + EigenLayer AVS rewards + KEP points',
          'Built by the StaderLabs team — shared infrastructure',
          'Instant exit via rsETH/ETH Balancer/Curve pools',
        ],
        assetRisks: { contractRisk: 7, slashingRisk: 6 },
      },
    },
  },

  {
    id: 'puffer',
    name: 'Puffer Finance',
    category: 'liquid',
    defaultYieldType: 'restaking',
    tagline: 'pufETH — native restaking with anti-slashing hardware security modules',
    description: 'Puffer Finance is a native liquid restaking protocol using secure-enclave hardware (Intel TDX) to protect validators from slashing. Node operators run in trusted execution environments, which allows Puffer to permit operators with much less ETH collateral (1 ETH instead of the typical 2 ETH in Rocket Pool). pufETH earns both staking and EigenLayer restaking rewards.',
    custodyModel: 'smart-contract',
    founded: 2023,
    website: 'https://app.puffer.fi',
    tvlBillions: 1.5,
    auditCount: 4,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     6,
      slashingRisk:     3,
      liquidityRisk:    2,
      regulatoryRisk:   3,
    },
    assets: {
      eth: {
        coinId: 'eth',
        staticApr: 4.0,
        minStakeNative: 0,
        lockupDays: 0,
        receiptToken: 'pufETH',
        liquid: true,
        features: [
          'pufETH — native restaking, earns staking + EigenLayer AVS rewards',
          'Validator anti-slashing: Intel TDX trusted execution environments',
          'Permissionless node operators with reduced ETH collateral requirement',
          '4 security audits including Trail of Bits',
          'pufETH/ETH pool on Curve for instant exit',
          'PUFFER governance token rewards',
        ],
        assetRisks: { contractRisk: 6, slashingRisk: 3 },
      },
    },
  },

  {
    id: 'origin-protocol',
    name: 'Origin Protocol',
    category: 'liquid',
    tagline: 'OETH — yield-optimised ETH that auto-compounds across Lido, Rocket Pool, and Frax',
    description: 'Origin Ether (OETH) is a yield-bearing ETH token that auto-routes deposited ETH across the best liquid staking protocols (Lido, Rocket Pool, Frax) and DeFi strategies (Curve, Convex) to maximise yield. As a rebasing token, OETH holders see their balance grow daily without any action. Origin Protocol also operates OUSD (yield-bearing stablecoin) and has been audited extensively.',
    custodyModel: 'smart-contract',
    founded: 2018,
    website: 'https://app.oeth.com',
    tvlBillions: 0.3,
    auditCount: 8,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     6,
      slashingRisk:     3,
      liquidityRisk:    2,
      regulatoryRisk:   3,
    },
    assets: {
      eth: {
        coinId: 'eth',
        staticApr: 4.2,
        minStakeNative: 0,
        lockupDays: 0,
        receiptToken: 'OETH',
        liquid: true,
        features: [
          'OETH auto-routes to highest-yield LSTs and DeFi strategies',
          'Rebasing token — balance grows automatically each day',
          '8 security audits (one of the most-audited DeFi protocols)',
          'Instant exit: OETH/ETH Curve pool',
          'wOETH (wrapped) available for non-rebasing DeFi integrations',
          'Origin Protocol has been running since 2018 — long track record',
        ],
        assetRisks: { contractRisk: 6, slashingRisk: 3 },
      },
    },
  },

  {
    id: 'bedrock',
    name: 'Bedrock',
    category: 'liquid',
    defaultYieldType: 'restaking',
    tagline: 'uniETH and uniBTC — multi-chain liquid staking with Bitcoin restaking support',
    description: 'Bedrock (by RockX) offers liquid staking tokens for ETH (uniETH) and Bitcoin (uniBTC). uniETH integrates with EigenLayer for restaking rewards. uniBTC is notable for enabling Bitcoin to earn yield via the Babylon restaking protocol, wrapped on EVM chains. Bedrock targets institutional and retail stakers across Ethereum and the emerging Bitcoin restaking narrative.',
    custodyModel: 'smart-contract',
    founded: 2022,
    website: 'https://app.bedrock.technology',
    tvlBillions: 0.5,
    auditCount: 3,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 3,
      contractRisk:     6,
      slashingRisk:     5,
      liquidityRisk:    3,
      regulatoryRisk:   3,
    },
    assets: {
      eth: { coinId: 'eth', staticApr: 4.1, minStakeNative: 0, lockupDays: 0, receiptToken: 'uniETH', liquid: true, features: ['uniETH — liquid ETH staking with EigenLayer restaking', 'Instant exit via uniETH/ETH Curve pool', '3 audits'], assetRisks: { contractRisk: 6 } },
      btc: { coinId: 'btc', staticApr: 3.5, minStakeNative: 0.001, lockupDays: 0, receiptToken: 'uniBTC', liquid: true, features: ['uniBTC — BTC liquid restaking via Babylon protocol', 'Earn BTC yield by restaking through EVM wrapper', 'Nascent product — elevated smart contract risk'], assetRisks: { contractRisk: 8, slashingRisk: 5 } },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // LIQUID STAKING — SOLANA ADDITIONAL
  // ════════════════════════════════════════════════════════════════════════════

  {
    id: 'sanctum',
    name: 'Sanctum',
    category: 'liquid',
    tagline: 'Solana LST aggregator — Infinity pool and validator-branded LSTs with instant liquidity',
    description: 'Sanctum solves the liquidity problem for small Solana LSTs by creating a shared reserve pool (the Infinity pool) that any LST can tap for instant liquidity. It also enables validators to create their own branded LSTs (e.g., bonkSOL, jupSOL, compassSOL) while sharing liquidity infrastructure. The Infinity pool itself is an auto-routing LST that holds the best-yield SOL staking positions.',
    custodyModel: 'smart-contract',
    founded: 2023,
    website: 'https://app.sanctum.so',
    tvlBillions: 0.8,
    auditCount: 3,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     5,
      slashingRisk:     2,
      liquidityRisk:    1,
      regulatoryRisk:   2,
    },
    assets: {
      sol: {
        coinId: 'sol',
        staticApr: 7.8,
        minStakeNative: 0.01,
        lockupDays: 0,
        receiptToken: 'INF',
        liquid: true,
        features: [
          'INF (Infinity) — auto-routing LST picking highest-yield Solana validators',
          'Instant exit from any LST via shared Infinity reserve pool',
          'Supports 50+ validator-branded LSTs (bonkSOL, jupSOL, etc.)',
          'Sanctum router finds lowest slippage LST swaps',
          '3 security audits',
          'CLOUD governance token rewards',
        ],
        assetRisks: { contractRisk: 5, slashingRisk: 2 },
      },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // LIQUID STAKING — COSMOS ECOSYSTEM
  // ════════════════════════════════════════════════════════════════════════════

  {
    id: 'quicksilver',
    name: 'Quicksilver Protocol',
    category: 'liquid',
    tagline: 'IBC-native liquid staking for the Cosmos ecosystem — qAssets retain governance rights',
    description: 'Quicksilver is a Cosmos-native liquid staking protocol that issues qAssets (qATOM, qOSMO, qSTARS, etc.). A key differentiator is that Quicksilver passes governance voting rights through to qAsset holders, letting users participate in governance of the underlying chain while retaining liquidity. Operates as its own Cosmos chain, using IBC for cross-chain staking.',
    custodyModel: 'smart-contract',
    founded: 2022,
    website: 'https://app.quicksilver.zone',
    tvlBillions: 0.08,
    auditCount: 2,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 3,
      contractRisk:     6,
      slashingRisk:     5,
      liquidityRisk:    4,
      regulatoryRisk:   2,
    },
    assets: {
      atom: { coinId: 'atom', staticApr: 13.0, minStakeNative: 0.1, lockupDays: 0, receiptToken: 'qATOM', liquid: true, features: ['qATOM retains Cosmos Hub governance voting rights', 'IBC-based cross-chain staking', 'Exit via qATOM/ATOM Osmosis pool', '2 security audits', 'Smaller TVL — lower liquidity than Stride'], assetRisks: { contractRisk: 6, slashingRisk: 5, liquidityRisk: 5 } },
      osmo: { coinId: 'osmo', staticApr: 9.0,  minStakeNative: 1,   lockupDays: 0, receiptToken: 'qOSMO', liquid: true, features: ['qOSMO — liquid Osmosis staking with governance', 'Exit via Osmosis DEX'], assetRisks: { contractRisk: 6, liquidityRisk: 5 } },
    },
  },

  {
    id: 'pstake',
    name: 'pSTAKE Finance',
    category: 'liquid',
    tagline: 'Cosmos and BNB liquid staking — stkATOM, stkBNB with DeFi integrations',
    description: 'pSTAKE Finance offers liquid staking for Cosmos (stkATOM), BNB (stkBNB), and other assets. It was one of the early Cosmos liquid staking protocols and has integrations with major DeFi venues on Osmosis and BNB Chain. Backed by Binance Labs among others. Smaller TVL than Stride but well-established with multiple audits.',
    custodyModel: 'smart-contract',
    founded: 2021,
    website: 'https://pstake.finance',
    tvlBillions: 0.12,
    auditCount: 4,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 3,
      contractRisk:     5,
      slashingRisk:     5,
      liquidityRisk:    4,
      regulatoryRisk:   2,
    },
    assets: {
      atom: { coinId: 'atom', staticApr: 12.5, minStakeNative: 0.1, lockupDays: 0, receiptToken: 'stkATOM', liquid: true, features: ['stkATOM — liquid Cosmos staking', 'Listed on Osmosis DEX', '4 audits including Halborn', 'Backed by Binance Labs'], assetRisks: { contractRisk: 5, slashingRisk: 5 } },
      bnb:  { coinId: 'bnb',  staticApr: 5.5,  minStakeNative: 0.1, lockupDays: 0, receiptToken: 'stkBNB', liquid: true, features: ['stkBNB — liquid BNB staking on BNB Chain', 'Integrated with Venus Protocol as collateral'], assetRisks: { contractRisk: 5 } },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // LIQUID STAKING — POLKADOT ECOSYSTEM
  // ════════════════════════════════════════════════════════════════════════════

  {
    id: 'bifrost',
    name: 'Bifrost Finance',
    category: 'liquid',
    tagline: 'Polkadot parachain offering vDOT, vKSM — liquid staking for the Polkadot ecosystem',
    description: 'Bifrost is a Polkadot parachain purpose-built for liquid staking across the Polkadot and Kusama ecosystem. It issues vDOT (voucher DOT) and vKSM (voucher KSM), which bypass the 28-day and 7-day unbonding periods respectively. vTokens can be used in DeFi on Bifrost and via bridges to other ecosystems. The protocol also supports vGLMR, vASTR, and other parachain tokens.',
    custodyModel: 'smart-contract',
    founded: 2021,
    website: 'https://bifrost.app',
    tvlBillions: 0.15,
    auditCount: 3,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 3,
      contractRisk:     5,
      slashingRisk:     5,
      liquidityRisk:    3,
      regulatoryRisk:   2,
    },
    assets: {
      dot: { coinId: 'dot', staticApr: 12.0, minStakeNative: 1, lockupDays: 0, receiptToken: 'vDOT', liquid: true, features: ['vDOT — bypasses 28-day Polkadot unbonding period', 'Instant exit via vDOT/DOT pool on Bifrost DEX', '3 audits', 'Polkadot parachain — fully on-chain governance'], assetRisks: { contractRisk: 5, slashingRisk: 5 } },
      ksm: { coinId: 'ksm', staticApr: 14.0, minStakeNative: 0.1, lockupDays: 0, receiptToken: 'vKSM', liquid: true, features: ['vKSM — bypasses 7-day Kusama unbonding', 'Higher yield than DOT (canary network premiums)', 'Liquid exit via Bifrost DEX'], assetRisks: { contractRisk: 5, slashingRisk: 5, liquidityRisk: 4 } },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // BITCOIN STAKING
  // ════════════════════════════════════════════════════════════════════════════

  {
    id: 'babylon',
    name: 'Babylon Protocol',
    category: 'liquid',
    defaultYieldType: 'restaking',
    tagline: 'The first Bitcoin native staking protocol — BTC secures PoS chains without bridging',
    description: 'Babylon enables Bitcoin holders to stake BTC without bridging or wrapping. BTC remains on the Bitcoin L1 in a self-custodial timelock script; if a staker misbehaves (provable double-signing on a PoS chain), the BTC is slashable via Bitcoin\'s own script logic. Babylon connects to PoS chains as a shared security provider, earning BTC rewards from those chains. As of 2024, Babylon had over $4B in BTC staking commitments in its cap-limited mainnet phases.',
    custodyModel: 'smart-contract',
    founded: 2022,
    website: 'https://babylonlabs.io',
    tvlBillions: 4.0,
    auditCount: 4,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     7,
      slashingRisk:     6,
      liquidityRisk:    7,
      regulatoryRisk:   3,
    },
    assets: {
      btc: {
        coinId: 'btc',
        staticApr: 3.5,
        minStakeNative: 0.005,
        lockupDays: 7,
        lockupNote: 'Timelock-based unbonding (~7 days depending on parameters)',
        liquid: false,
        features: [
          'BTC stays on Bitcoin L1 — no bridging, no wrapping',
          'Self-custodial Bitcoin script timelock — not custodial',
          'BTC can be slashed via Bitcoin script for provable misbehavior',
          'Earns yield from PoS chains secured by Babylon',
          '4 security audits (ZKSecurity, Halborn, CertiK)',
          'Mainnet Phase 1 launched 2024 — cap-limited allocations',
          'Phase 2 adds full rewards; currently in phased rollout',
        ],
        assetRisks: { custodyRisk: 2, contractRisk: 7, slashingRisk: 6, liquidityRisk: 7 },
      },
    },
  },

  {
    id: 'lombard',
    name: 'Lombard Finance',
    category: 'liquid',
    defaultYieldType: 'restaking',
    tagline: 'LBTC — liquid Bitcoin staking token backed by Babylon-staked BTC',
    description: 'Lombard wraps Babylon-staked Bitcoin into LBTC, an EVM-compatible liquid token that enables BTC holders to earn staking yield while using their position in DeFi. LBTC is minted 1:1 against BTC that is staked on Babylon\'s protocol. It trades on Ethereum and other EVM chains, providing the DeFi composability that native Bitcoin staking lacks.',
    custodyModel: 'smart-contract',
    founded: 2024,
    website: 'https://lombard.finance',
    tvlBillions: 1.5,
    auditCount: 3,
    risks: {
      custodyRisk:      3,
      counterpartyRisk: 3,
      contractRisk:     8,
      slashingRisk:     6,
      liquidityRisk:    3,
      regulatoryRisk:   3,
    },
    assets: {
      btc: {
        coinId: 'btc',
        staticApr: 3.2,
        minStakeNative: 0.001,
        lockupDays: 0,
        receiptToken: 'LBTC',
        liquid: true,
        features: [
          'LBTC — liquid EVM-native BTC staking token',
          'Backed 1:1 by Babylon-staked Bitcoin',
          'Use LBTC as DeFi collateral while earning BTC staking yield',
          'Available on Ethereum, BNB Chain, Base',
          'Inherits Babylon slashing risk plus EVM bridge risk',
          '3 audits — newer protocol, exercise caution with large positions',
        ],
        assetRisks: { contractRisk: 8, slashingRisk: 6 },
      },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // DEFI — PROTOCOL TOKEN STAKING
  // ════════════════════════════════════════════════════════════════════════════

  {
    id: 'aave',
    name: 'Aave (Safety Module)',
    category: 'liquid',
    tagline: 'Stake AAVE or GHO/AAVE LP tokens to earn protocol fees — and backstop the protocol',
    description: 'Aave\'s Safety Module lets holders stake AAVE tokens (or AAVE/GHO Balancer LP tokens) to earn a portion of protocol revenue. In exchange, staked AAVE can be slashed up to 30% as a backstop if the protocol becomes undercollateralised (a "shortfall event"). This is governance token staking with meaningful counterparty risk tied to Aave\'s lending book health. The Safety Module also earns AAVE emission rewards on top of protocol fee revenue.',
    custodyModel: 'smart-contract',
    founded: 2017,
    website: 'https://app.aave.com/staking',
    tvlBillions: 0.5,
    auditCount: 15,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 3,
      contractRisk:     4,
      slashingRisk:     6,
      liquidityRisk:    3,
      regulatoryRisk:   4,
    },
    assets: {
      eth: {
        coinId: 'eth',
        staticApr: 5.0,
        minStakeNative: 0,
        lockupDays: 10,
        lockupNote: '10-day cooldown before unstaking is permitted',
        liquid: false,
        features: [
          'Stakes AAVE governance token (not ETH directly)',
          'Earns AAVE emission rewards + protocol revenue share',
          'Up to 30% slash risk in shortfall event (bad debt crystallisation)',
          '10-day cooldown before unstake; 2-day claim window after cooldown',
          '15+ independent security audits — one of the most-audited DeFi protocols',
          'stkAAVE has voting power in Aave governance',
        ],
        assetRisks: { slashingRisk: 6, liquidityRisk: 5 },
        yieldType: 'governance',
      },
    },
  },

  {
    id: 'convex',
    name: 'Convex Finance',
    category: 'liquid',
    tagline: 'Boost Curve LP rewards by staking cvxCRV — the dominant CRV yield layer',
    description: 'Convex Finance sits on top of Curve Finance, letting users deposit Curve LP tokens to earn boosted CRV rewards without locking CRV themselves. Staking cvxCRV earns a share of the CRV fees collected by Convex\'s locked veCRV position. Convex controls a dominant share of all veCRV, making it the primary venue for CRV governance influence and boosted Curve yields.',
    custodyModel: 'smart-contract',
    founded: 2021,
    website: 'https://www.convexfinance.com/stake',
    tvlBillions: 2.0,
    auditCount: 4,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     5,
      slashingRisk:     1,
      liquidityRisk:    4,
      regulatoryRisk:   3,
    },
    assets: {
      eth: {
        coinId: 'eth',
        staticApr: 6.0,
        minStakeNative: 0,
        lockupDays: 0,
        liquid: false,
        features: [
          'Stakes cvxCRV (Convex CRV) — not ETH directly',
          'Earns CRV, CVX, and 3CRV (USDT/USDC/DAI) rewards',
          'No lockup (unlike native veCRV 4-year lock)',
          'Convex controls ~50% of all veCRV — dominant Curve governance influence',
          'cvxCRV/CRV liquidity pool for instant exit (may have slippage)',
          '4 security audits',
        ],
        assetRisks: { contractRisk: 5, liquidityRisk: 4, slashingRisk: 1 },
        yieldType: 'governance',
      },
    },
  },

  {
    id: 'ankr',
    name: 'Ankr Staking',
    category: 'liquid',
    tagline: 'Multi-chain liquid staking across ETH, BNB, SOL, AVAX, and more',
    description: 'Ankr offers liquid staking across multiple chains under one protocol. You deposit native assets and receive ankr tokens (ankrETH, ankrBNB, ankrSOL, etc.) which can be used in DeFi. Ankr\'s approach is broader but shallower than specialized protocols like Lido or Marinade — lower TVL per chain means less DeFi integrations for the receipt tokens.',
    custodyModel: 'smart-contract',
    founded: 2017,
    website: 'https://www.ankr.com/staking-crypto/',
    tvlBillions: 0.5,
    auditCount: 5,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 3,
      contractRisk:     5,
      slashingRisk:     3,
      liquidityRisk:    3,
      regulatoryRisk:   3,
    },
    assets: {
      eth:  { coinId: 'eth',  staticApr: 3.7,  minStakeNative: 0.5,  lockupDays: 0, receiptToken: 'ankrETH', liquid: true,  liveAprKey: 'ankr_eth',  features: ['ankrETH non-rebasing token', 'Lower DeFi liquidity vs Lido/Rocket Pool', '5 security audits'] },
      bnb:  { coinId: 'bnb',  staticApr: 5.5,  minStakeNative: 0.1,  lockupDays: 0, receiptToken: 'ankrBNB', liquid: true,  features: ['ankrBNB liquid BNB staking', 'Bypass 7-day BNB unbonding'] },
      avax: { coinId: 'avax', staticApr: 6.0,  minStakeNative: 1,    lockupDays: 0, receiptToken: 'ankrAVAX',liquid: true,  features: ['ankrAVAX — alternative to Benqi sAVAX', 'No 25 AVAX minimum'] },
      sol:  { coinId: 'sol',  staticApr: 6.2,  minStakeNative: 0.01, lockupDays: 0, receiptToken: 'ankrSOL', liquid: true,  features: ['ankrSOL liquid Solana staking', 'Lower liquidity than Marinade/Jito'] },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // DEFI — NEAR LIQUID STAKING
  // ════════════════════════════════════════════════════════════════════════════

  {
    id: 'metapool',
    name: 'Meta Pool',
    category: 'liquid',
    tagline: 'Leading NEAR liquid staking — stNEAR earns rewards with no lockup',
    description: 'Meta Pool is the dominant liquid staking protocol on NEAR Protocol, issuing stNEAR in exchange for NEAR deposits. stNEAR accrues staking rewards automatically and can be used across NEAR DeFi. Unlike native NEAR staking (~4-day unbonding), stNEAR holders can swap back to NEAR instantly via liquidity pools. Meta Pool distributes stake across dozens of validators to minimize slashing concentration risk.',
    custodyModel: 'smart-contract',
    founded: 2021,
    website: 'https://www.metapool.app',
    tvlBillions: 0.08,
    auditCount: 2,
    risks: {
      custodyRisk:      2,
      counterpartyRisk: 2,
      contractRisk:     5,
      slashingRisk:     3,
      liquidityRisk:    4,
      regulatoryRisk:   2,
    },
    assets: {
      near: {
        coinId: 'near',
        staticApr: 9.5,
        minStakeNative: 1,
        lockupDays: 0,
        receiptToken: 'stNEAR',
        liquid: true,
        liveAprKey: 'metapool_near',
        features: [
          'stNEAR — liquid NEAR receipt token',
          'Instant exit via stNEAR/NEAR liquidity pool (small slippage)',
          'Stake distributed across 60+ validators — lower slashing concentration',
          '2 security audits',
          'Meta Pool DAO governance',
          'No minimum stake requirement',
        ],
        assetRisks: { contractRisk: 5, slashingRisk: 3, liquidityRisk: 4 },
      },
    },
  },
]
