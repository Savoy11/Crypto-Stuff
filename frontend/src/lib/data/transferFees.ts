// Transfer fee data for the Finance Now Transfer Fee Calculator.
// Exchange withdrawal fees are approximate and change frequently — always verify
// on the exchange website before initiating a transfer.

// Machine-readable date the exchange withdrawal fees were last hand-verified.
// Surfaced in the UI; drives the staleness warning. Update when fees are reviewed.
//
// 2026-07-20 partial re-verification: 21 high-traffic (exchange, coin, network)
// pairs were checked against currently published schedules (see
// docs/assessments/T8-transfer-fees-audit.md addendum) — 12 confirmed, 9
// corrected in place with `re-verified 2026-07` notes. The date below is
// deliberately NOT bumped: it describes the table as a whole, and the ~520
// long-tail entries were not re-checked, so the staleness banner must stay on.
export const TRANSFER_FEES_LAST_VERIFIED = '2025-06-01'

// Days after which the hand-maintained withdrawal fees are considered stale.
export const TRANSFER_FEES_STALE_AFTER_DAYS = 120

export function transferFeesAgeDays(now: Date = new Date()): number {
  const verified = new Date(TRANSFER_FEES_LAST_VERIFIED)
  return Math.floor((now.getTime() - verified.getTime()) / 86_400_000)
}

export function transferFeesAreStale(now: Date = new Date()): boolean {
  return transferFeesAgeDays(now) > TRANSFER_FEES_STALE_AFTER_DAYS
}

export type TransferFeeConfidence = 'high' | 'medium' | 'low'

export interface TransferFeeProvenance {
  source: string
  verifiedAt: string
  ageDays: number
  stale: boolean
  confidence: TransferFeeConfidence
}

/**
 * Provenance for the hand-maintained withdrawal-fee table. The table is verified as
 * a whole on a single date, so confidence is a function of age (we don't fabricate
 * per-fee verification timestamps we don't actually have):
 *   ≤60d → high · ≤120d → medium · beyond the stale threshold → low.
 */
export function getTransferFeeProvenance(now: Date = new Date()): TransferFeeProvenance {
  const ageDays = transferFeesAgeDays(now)
  const stale = ageDays > TRANSFER_FEES_STALE_AFTER_DAYS
  const confidence: TransferFeeConfidence =
    ageDays <= 60 ? 'high' : ageDays <= TRANSFER_FEES_STALE_AFTER_DAYS ? 'medium' : 'low'
  return {
    source: 'Hand-verified exchange withdrawal-fee schedules',
    verifiedAt: TRANSFER_FEES_LAST_VERIFIED,
    ageDays,
    stale,
    confidence,
  }
}


// ─── Spot trading fees (S3, 2026-08-20) ──────────────────────────────────────
//
// The owner's brief for this tool: "a person can see all costs associated with
// an exchange or sale of a coin." Withdrawal + network fees were only part of
// that — the trade itself costs a maker/taker fee (or, on commission-free
// venues, a spread), and leaving it out understated every route that begins
// with a sale.
//
// Rates are the DEFAULT tier (no volume discounts, no exchange-token discount)
// because that is what a person without a fee tier actually pays. Seeded from
// each exchange's published fee schedule; like the source-terms registry,
// seeded ≠ verified — confidence is capped at 'low' until an owner review
// confirms them, regardless of how fresh the compile date is.

export const TRADING_FEES_COMPILED = '2026-08-20'

export interface SpotTradingFees {
  /** Percent, e.g. 0.1 = 0.1%. Default/entry tier, no discounts. */
  makerPct: number
  takerPct: number
  note?: string
}

export interface TradingFeeProvenance {
  source: string
  compiledAt: string
  confidence: TransferFeeConfidence
}

export function getTradingFeeProvenance(): TradingFeeProvenance {
  return {
    source: 'Seeded from published exchange fee schedules — not individually re-verified',
    compiledAt: TRADING_FEES_COMPILED,
    // Deliberately pinned low: a seeded table must not inherit high confidence
    // from a fresh compile date (the sourceTerms lesson).
    confidence: 'low',
  }
}

/**
 * Default-tier spot fees per exchange. `null` = not catalogued — rendered as
 * "unknown", never as zero. Spread-based venues carry 0-commission rates and a
 * note, because "no fee" with a wide spread is not free.
 */
export const SPOT_TRADING_FEES: Record<string, SpotTradingFees | null> = {
  binance:     { makerPct: 0.1, takerPct: 0.1 },
  coinbase:    { makerPct: 0.4, takerPct: 0.6, note: 'Advanced Trade, entry tier; simple Coinbase buys cost more' },
  kraken:      { makerPct: 0.25, takerPct: 0.4, note: 'Kraken Pro, entry tier' },
  okx:         { makerPct: 0.08, takerPct: 0.1 },
  bybit:       { makerPct: 0.1, takerPct: 0.1 },
  bitfinex:    { makerPct: 0.1, takerPct: 0.2 },
  gemini:      { makerPct: 0.2, takerPct: 0.4, note: 'ActiveTrader; the simple interface costs more' },
  cryptocom:   { makerPct: 0.25, takerPct: 0.5, note: 'Entry tier before CRO staking discounts' },
  kucoin:      { makerPct: 0.1, takerPct: 0.1 },
  bitget:      { makerPct: 0.1, takerPct: 0.1 },
  gateio:      { makerPct: 0.2, takerPct: 0.2 },
  mexc:        { makerPct: 0, takerPct: 0.05 },
  htx:         { makerPct: 0.2, takerPct: 0.2 },
  upbit:       { makerPct: 0.05, takerPct: 0.05, note: 'KRW market' },
  bitstamp:    { makerPct: 0.3, takerPct: 0.4, note: 'Entry tier (<$10k monthly volume)' },
  pionex:      { makerPct: 0.05, takerPct: 0.05 },
  lbank:       { makerPct: 0.1, takerPct: 0.1 },
  bitrue:      { makerPct: 0.098, takerPct: 0.098 },
  coinw:       { makerPct: 0.2, takerPct: 0.2 },
  xtcom:       { makerPct: 0.2, takerPct: 0.2 },
  hotcoin:     null,
  azbit:       null,
  toobit:      { makerPct: 0.1, takerPct: 0.1 },
  coinstore:   { makerPct: 0.2, takerPct: 0.2 },
  poloniex:    { makerPct: 0.145, takerPct: 0.155 },
  bingx:       { makerPct: 0.1, takerPct: 0.1 },
  phemex:      { makerPct: 0.1, takerPct: 0.1 },
  woox:        { makerPct: 0.08, takerPct: 0.1 },
  bitmart:     { makerPct: 0.25, takerPct: 0.25 },
  hyperliquid: { makerPct: 0.01, takerPct: 0.035, note: 'DEX — plus any builder fee the front-end adds' },
}

/**
 * All-in cost of SELLING on an exchange and moving the proceeds: taker fee on
 * the sale + the cheapest withdrawal (exchange fee + network fee). Pure, so it
 * is testable; returns null when the trading fee is uncatalogued rather than
 * treating unknown as zero.
 */
export interface SaleCostBreakdown {
  tradeFeeUsd: number
  takerPct: number
  withdrawFeeUsd: number
  networkFeeUsd: number
  totalUsd: number
  totalPct: number
  note?: string
}

export function computeSaleCost(
  exchangeId: string,
  amountUsd: number,
  withdrawFeeUsd: number,
  networkFeeUsd: number,
): SaleCostBreakdown | null {
  const fees = SPOT_TRADING_FEES[exchangeId]
  if (!fees || amountUsd <= 0) return null
  const tradeFeeUsd = amountUsd * (fees.takerPct / 100)
  const totalUsd = tradeFeeUsd + withdrawFeeUsd + networkFeeUsd
  return {
    tradeFeeUsd,
    takerPct: fees.takerPct,
    withdrawFeeUsd,
    networkFeeUsd,
    totalUsd,
    totalPct: (totalUsd / amountUsd) * 100,
    note: fees.note,
  }
}

export type NetworkId =
  | 'erc20' | 'trc20' | 'bep20' | 'solana' | 'polygon'
  | 'arbitrum' | 'base' | 'optimism' | 'avalanche' | 'bitcoin'
  | 'xrpl' | 'litecoin' | 'dogecoin' | 'cardano' | 'polkadot' | 'cosmos'
  | 'ton_network' | 'near_network'

export type AddressFormat =
  | '0x'           // EVM family — erc20, bep20, polygon, arbitrum, base, optimism, avalanche
  | 'tron'         // T... prefix
  | 'base58_sol'   // Solana base58
  | 'bech32_btc'   // bc1... / 1... / 3...
  | 'xrpl_r'       // r... prefix, may include destination tag
  | 'ltc_bech32'   // ltc1... / L...
  | 'doge_d'       // D... prefix
  | 'cardano_addr' // addr1...
  | 'ss58_dot'     // 1... (Polkadot ss58)
  | 'cosmos_bech32'// cosmos1...
  | 'ton_addr'     // TON workchain:hash format
  | 'near_addr'    // human-readable .near or 64-char hex

export interface NetworkInfo {
  id: NetworkId
  name: string
  shortName: string
  nativeToken: string
  addressFormat: AddressFormat
  addressExample: string
  estimatedTime: string
  color: string
  isL2: boolean
  memoRequired?: boolean   // e.g. XRP destination tag, Cosmos memo
}

export const NETWORKS: Record<NetworkId, NetworkInfo> = {
  erc20: {
    id: 'erc20', name: 'Ethereum (ERC-20)', shortName: 'ERC-20',
    nativeToken: 'ETH', addressFormat: '0x', addressExample: '0x742d35Cc…f44e',
    estimatedTime: '~2–5 min', color: '#627EEA', isL2: false,
  },
  trc20: {
    id: 'trc20', name: 'Tron (TRC-20)', shortName: 'TRC-20',
    nativeToken: 'TRX', addressFormat: 'tron', addressExample: 'TDkfVR7o…4s8',
    estimatedTime: '~1–2 min', color: '#FF0013', isL2: false,
  },
  bep20: {
    id: 'bep20', name: 'BNB Smart Chain (BEP-20)', shortName: 'BEP-20',
    nativeToken: 'BNB', addressFormat: '0x', addressExample: '0x742d35Cc…f44e',
    estimatedTime: '~1–3 min', color: '#F0B90B', isL2: false,
  },
  solana: {
    id: 'solana', name: 'Solana', shortName: 'SOL',
    nativeToken: 'SOL', addressFormat: 'base58_sol', addressExample: '7xKXtg2C…AsU',
    estimatedTime: '~30 sec', color: '#9945FF', isL2: false,
  },
  polygon: {
    id: 'polygon', name: 'Polygon', shortName: 'Polygon',
    nativeToken: 'POL', addressFormat: '0x', addressExample: '0x742d35Cc…f44e',
    estimatedTime: '~2–3 min', color: '#8247E5', isL2: false,
  },
  arbitrum: {
    id: 'arbitrum', name: 'Arbitrum One', shortName: 'Arbitrum',
    nativeToken: 'ETH', addressFormat: '0x', addressExample: '0x742d35Cc…f44e',
    estimatedTime: '~1–2 min', color: '#28A0F0', isL2: true,
  },
  base: {
    id: 'base', name: 'Base', shortName: 'Base',
    nativeToken: 'ETH', addressFormat: '0x', addressExample: '0x742d35Cc…f44e',
    estimatedTime: '~1–2 min', color: '#0052FF', isL2: true,
  },
  optimism: {
    id: 'optimism', name: 'Optimism', shortName: 'OP',
    nativeToken: 'ETH', addressFormat: '0x', addressExample: '0x742d35Cc…f44e',
    estimatedTime: '~1–2 min', color: '#FF0420', isL2: true,
  },
  avalanche: {
    id: 'avalanche', name: 'Avalanche C-Chain', shortName: 'AVAX',
    nativeToken: 'AVAX', addressFormat: '0x', addressExample: '0x742d35Cc…f44e',
    estimatedTime: '~1–2 min', color: '#E84142', isL2: false,
  },
  bitcoin: {
    id: 'bitcoin', name: 'Bitcoin', shortName: 'Bitcoin',
    nativeToken: 'BTC', addressFormat: 'bech32_btc', addressExample: 'bc1qxy2kg…wlh',
    estimatedTime: '~10–60 min', color: '#F7931A', isL2: false,
  },
  xrpl: {
    id: 'xrpl', name: 'XRP Ledger', shortName: 'XRPL',
    nativeToken: 'XRP', addressFormat: 'xrpl_r', addressExample: 'rHb9CJAWyB…zjr',
    estimatedTime: '~4 sec', color: '#00AAE4', isL2: false, memoRequired: true,
  },
  litecoin: {
    id: 'litecoin', name: 'Litecoin', shortName: 'LTC',
    nativeToken: 'LTC', addressFormat: 'ltc_bech32', addressExample: 'ltc1qxy2kg…wlh',
    estimatedTime: '~2–5 min', color: '#BFBBBB', isL2: false,
  },
  dogecoin: {
    id: 'dogecoin', name: 'Dogecoin', shortName: 'DOGE',
    nativeToken: 'DOGE', addressFormat: 'doge_d', addressExample: 'DFundmnte…j3x',
    estimatedTime: '~1–2 min', color: '#C2A633', isL2: false,
  },
  cardano: {
    id: 'cardano', name: 'Cardano', shortName: 'ADA',
    nativeToken: 'ADA', addressFormat: 'cardano_addr', addressExample: 'addr1qx…kcz',
    estimatedTime: '~5–20 min', color: '#0033AD', isL2: false,
  },
  polkadot: {
    id: 'polkadot', name: 'Polkadot', shortName: 'DOT',
    nativeToken: 'DOT', addressFormat: 'ss58_dot', addressExample: '15oF4u…Gkc',
    estimatedTime: '~12 sec', color: '#E6007A', isL2: false,
  },
  cosmos: {
    id: 'cosmos', name: 'Cosmos Hub', shortName: 'ATOM',
    nativeToken: 'ATOM', addressFormat: 'cosmos_bech32', addressExample: 'cosmos1…7xn',
    estimatedTime: '~7 sec', color: '#6F7390', isL2: false, memoRequired: true,
  },
  ton_network: {
    id: 'ton_network', name: 'TON', shortName: 'TON',
    nativeToken: 'TON', addressFormat: 'ton_addr', addressExample: 'EQB…xYz',
    estimatedTime: '~5 sec', color: '#0098EA', isL2: false,
  },
  near_network: {
    id: 'near_network', name: 'NEAR Protocol', shortName: 'NEAR',
    nativeToken: 'NEAR', addressFormat: 'near_addr', addressExample: 'alice.near',
    estimatedTime: '~1–2 sec', color: '#00C08B', isL2: false,
  },
}

// These networks all use 0x-prefixed addresses — looks identical at a glance.
export const EVM_NETWORKS: NetworkId[] = [
  'erc20', 'bep20', 'polygon', 'arbitrum', 'base', 'optimism', 'avalanche',
]

// ─── Coins ────────────────────────────────────────────────────────────────────

export type CoinId =
  | 'btc' | 'eth' | 'usdt' | 'usdc' | 'bnb' | 'sol' | 'dai'
  | 'xrp' | 'ltc' | 'trx' | 'doge' | 'matic' | 'avax' | 'ada' | 'dot' | 'atom'
  | 'link' | 'ton' | 'shib' | 'uni' | 'near' | 'arb'

export const COIN_INFO: Record<CoinId, {
  name: string; symbol: string; color: string; defaultAmount: number
}> = {
  btc:  { name: 'Bitcoin',       symbol: 'BTC',  color: '#F7931A', defaultAmount: 0.1 },
  eth:  { name: 'Ethereum',      symbol: 'ETH',  color: '#627EEA', defaultAmount: 1 },
  usdt: { name: 'Tether',        symbol: 'USDT', color: '#26A17B', defaultAmount: 1000 },
  usdc: { name: 'USD Coin',      symbol: 'USDC', color: '#2775CA', defaultAmount: 1000 },
  bnb:  { name: 'BNB',           symbol: 'BNB',  color: '#F0B90B', defaultAmount: 5 },
  sol:  { name: 'Solana',        symbol: 'SOL',  color: '#9945FF', defaultAmount: 10 },
  dai:  { name: 'DAI',           symbol: 'DAI',  color: '#F5AC37', defaultAmount: 1000 },
  xrp:  { name: 'XRP',           symbol: 'XRP',  color: '#00AAE4', defaultAmount: 500 },
  ltc:  { name: 'Litecoin',      symbol: 'LTC',  color: '#BFBBBB', defaultAmount: 5 },
  trx:  { name: 'TRON',          symbol: 'TRX',  color: '#FF0013', defaultAmount: 5000 },
  doge: { name: 'Dogecoin',      symbol: 'DOGE', color: '#C2A633', defaultAmount: 2000 },
  matic:{ name: 'Polygon (POL)', symbol: 'POL',  color: '#8247E5', defaultAmount: 500 },
  avax: { name: 'Avalanche',     symbol: 'AVAX', color: '#E84142', defaultAmount: 20 },
  ada:  { name: 'Cardano',       symbol: 'ADA',  color: '#0033AD', defaultAmount: 1000 },
  dot:  { name: 'Polkadot',      symbol: 'DOT',  color: '#E6007A', defaultAmount: 50 },
  atom: { name: 'Cosmos',        symbol: 'ATOM', color: '#6F7390', defaultAmount: 50 },
  link: { name: 'Chainlink',     symbol: 'LINK', color: '#2D5BE3', defaultAmount: 100 },
  ton:  { name: 'Toncoin',       symbol: 'TON',  color: '#0098EA', defaultAmount: 200 },
  shib: { name: 'Shiba Inu',     symbol: 'SHIB', color: '#FFA409', defaultAmount: 50_000_000 },
  uni:  { name: 'Uniswap',       symbol: 'UNI',  color: '#FF007A', defaultAmount: 200 },
  near: { name: 'NEAR Protocol', symbol: 'NEAR', color: '#00C08B', defaultAmount: 300 },
  arb:  { name: 'Arbitrum',      symbol: 'ARB',  color: '#28A0F0', defaultAmount: 1000 },
}

// ─── Exchange data ─────────────────────────────────────────────────────────────

export interface NetworkConfig {
  networkId: NetworkId
  withdrawFee: number
  minWithdraw: number
  withdrawEnabled: boolean
  depositEnabled: boolean
  note?: string
  /** True when this row's fee was overlaid from a live exchange API this session. */
  liveFee?: boolean
  /**
   * True when `withdrawEnabled` on this row came from a live exchange API.
   *
   * Separate from `liveFee` on purpose: an adapter can report a fee without
   * reporting availability (Bitfinex's fee map has no status field at all), so
   * "we know the price" and "we know the door is open" are different claims.
   * Absent ⇒ the flag is the 2025-06-01 snapshot's ASSUMPTION, not a check.
   */
  liveAvailability?: boolean
}

// ─── Live withdrawal-fee overlay (S3 Tier-1) ──────────────────────────────────
//
// A few exchanges publish per-chain withdrawal fees on PUBLIC, keyless API
// endpoints. /live-data/withdraw-fees fetches those and produces this override
// map, which findTransferPaths() applies over the static table. Two rules:
//   1. Overlay only — a live entry updates a row that already exists in
//      EXCHANGES; it never adds a coin/network route the curated table doesn't
//      carry (deposit support and route warnings are hand-curated).
//   2. Labeled per-row — an overlaid fee sets `liveFee` so the UI can tag it,
//      and static rows keep the staleness warning. The two are never blended
//      silently.
export interface LiveFeeOverride {
  /**
   * Optional: a source can report a STATUS without a usable fee. When absent the
   * stored fee stands and keeps its stored labelling — a live suspension must
   * not silently promote a 2025 fee to "live".
   */
  withdrawFee?: number
  minWithdraw?: number
  withdrawEnabled?: boolean
}

/** exchangeId → coin → network → override */
export type LiveFeeOverrideMap = Partial<
  Record<string, Partial<Record<CoinId, Partial<Record<NetworkId, LiveFeeOverride>>>>>
>

export interface ExchangeCoin {
  networks: NetworkConfig[]
}

export interface Exchange {
  id: string
  name: string
  tier: 1 | 2
  coins: Partial<Record<CoinId, ExchangeCoin>>
}

export const PERSONAL_WALLET_ID = 'wallet'

export const EXCHANGES: Exchange[] = [

  // ─── Binance ───────────────────────────────────────────────────────────────
  {
    id: 'binance', name: 'Binance', tier: 1,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0002,    minWithdraw: 0.001,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.000017,  minWithdraw: 0.0001,  withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.0008,    minWithdraw: 0.003,   withdrawEnabled: true, depositEnabled: true, note: 'Dynamic fee — adjusts with gas (re-verified 2026-07)' },
        { networkId: 'arbitrum', withdrawFee: 0.00025,   minWithdraw: 0.001,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'optimism', withdrawFee: 0.00025,   minWithdraw: 0.001,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.00025,   minWithdraw: 0.001,   withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 3.5,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true, note: 'Dynamic — gas-dependent, $3.5–5 typical (re-verified 2026-07)' },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.8,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.8,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'avalanche',withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.26, minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.29, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 0.29, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 0.29, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.26, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'avalanche',withdrawFee: 0.29, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      bnb:  { networks: [
        { networkId: 'bep20',    withdrawFee: 0.0008, minWithdraw: 0.01, withdrawEnabled: true, depositEnabled: true },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.01,  minWithdraw: 0.1,  withdrawEnabled: true, depositEnabled: true },
      ]},
      dai:  { networks: [
        { networkId: 'erc20',    withdrawFee: 3.5,  minWithdraw: 30,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required for exchange deposits' },
      ]},
      ltc:  { networks: [
        { networkId: 'litecoin', withdrawFee: 0.001, minWithdraw: 0.002, withdrawEnabled: true, depositEnabled: true },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 5.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      matic:{ networks: [
        { networkId: 'polygon',  withdrawFee: 0.1,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'erc20',    withdrawFee: 0.8,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.8,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
      ]},
      avax: { networks: [
        { networkId: 'avalanche',withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'erc20',    withdrawFee: 0.25, minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 1.0,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.05, minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
      ]},
      atom: { networks: [
        { networkId: 'cosmos',   withdrawFee: 0.005, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true, note: 'Memo required for exchange deposits' },
        { networkId: 'bep20',    withdrawFee: 0.005, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      link: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.27,  minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.01,  minWithdraw: 0.2, withdrawEnabled: true, depositEnabled: true },
      ]},
      ton:  { networks: [
        { networkId: 'ton_network', withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',       withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      shib: { networks: [
        { networkId: 'erc20',    withdrawFee: 200_000, minWithdraw: 400_000, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 100_000, minWithdraw: 200_000, withdrawEnabled: true, depositEnabled: true },
      ]},
      uni:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.14,  minWithdraw: 0.2, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.05,  minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      near: { networks: [
        { networkId: 'near_network', withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',        withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      arb:  { networks: [
        { networkId: 'arbitrum', withdrawFee: 0.5,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'erc20',    withdrawFee: 0.79, minWithdraw: 1.5, withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── Coinbase ──────────────────────────────────────────────────────────────
  {
    id: 'coinbase', name: 'Coinbase', tier: 1,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.000025, minWithdraw: 0.0001, withdrawEnabled: true, depositEnabled: true, note: 'Network-fee pass-through (no Coinbase markup) — varies with congestion' },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.001,   minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true, note: 'Network-fee pass-through (no Coinbase markup) — varies with gas' },
        { networkId: 'base',     withdrawFee: 0.0001,  minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 0.0003,  minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 0,    minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true, note: 'No exchange fee — you pay only the network gas' },
        { networkId: 'polygon',  withdrawFee: 0,    minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true, note: 'No exchange fee' },
        { networkId: 'solana',   withdrawFee: 0,    minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true, note: 'No exchange fee' },
        { networkId: 'arbitrum', withdrawFee: 0,    minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true, note: 'No exchange fee' },
        { networkId: 'base',     withdrawFee: 0,    minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true, note: 'No exchange fee' },
        { networkId: 'avalanche',withdrawFee: 0,    minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true, note: 'No exchange fee' },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 2.5,  minWithdraw: 25,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.01, minWithdraw: 0.05, withdrawEnabled: true, depositEnabled: true },
      ]},
      dai:  { networks: [
        { networkId: 'erc20',    withdrawFee: 3.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      ltc:  { networks: [
        { networkId: 'litecoin', withdrawFee: 0.001, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 1.0,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      matic:{ networks: [
        { networkId: 'polygon',  withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'erc20',    withdrawFee: 0.5,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      avax: { networks: [
        { networkId: 'avalanche',withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      atom: { networks: [
        { networkId: 'cosmos',   withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true, note: 'Memo required' },
      ]},
      link: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.3,  minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
      ]},
      uni:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.3,  minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
      ]},
      near: { networks: [
        { networkId: 'near_network', withdrawFee: 0.01, minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
      ]},
      arb:  { networks: [
        { networkId: 'arbitrum', withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── Kraken ────────────────────────────────────────────────────────────────
  {
    id: 'kraken', name: 'Kraken', tier: 1,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.00015, minWithdraw: 0.0004, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.0035, minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.0035, minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'optimism', withdrawFee: 0.0035, minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 2.5,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 2.5,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 1.0,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'base',     withdrawFee: 1.0,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.01, minWithdraw: 0.1,  withdrawEnabled: true, depositEnabled: true },
      ]},
      dai:  { networks: [
        { networkId: 'erc20',    withdrawFee: 3.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.02, minWithdraw: 25,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      ltc:  { networks: [
        { networkId: 'litecoin', withdrawFee: 0.001, minWithdraw: 0.002, withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 2.0,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 0.35, minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.05, minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      atom: { networks: [
        { networkId: 'cosmos',   withdrawFee: 0.0001, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true, note: 'Memo required' },
      ]},
      link: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.31,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      uni:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.31,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      near: { networks: [
        { networkId: 'near_network', withdrawFee: 0.1, minWithdraw: 1, withdrawEnabled: true, depositEnabled: true },
      ]},
      arb:  { networks: [
        { networkId: 'arbitrum', withdrawFee: 0.5,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── OKX ──────────────────────────────────────────────────────────────────
  {
    id: 'okx', name: 'OKX', tier: 1,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0001,   minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true, note: 'Dynamic — often lower (re-verified 2026-07)' },
        { networkId: 'bep20',    withdrawFee: 0.000017, minWithdraw: 0.0001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.0001, minWithdraw: 0.005,  withdrawEnabled: true, depositEnabled: true, note: 'Dynamic — adjusts with gas (re-verified 2026-07)' },
        { networkId: 'arbitrum', withdrawFee: 0.0001, minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'optimism', withdrawFee: 0.0001, minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'base',     withdrawFee: 0.0001, minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 1.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.8,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.8,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'avalanche',withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 1.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      bnb:  { networks: [
        { networkId: 'bep20',    withdrawFee: 0.001, minWithdraw: 0.01, withdrawEnabled: true, depositEnabled: true },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.01, minWithdraw: 0.1,  withdrawEnabled: true, depositEnabled: true },
      ]},
      dai:  { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 40,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.1,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      ltc:  { networks: [
        { networkId: 'litecoin', withdrawFee: 0.001, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 5.0,  minWithdraw: 50,  withdrawEnabled: true, depositEnabled: true },
      ]},
      matic:{ networks: [
        { networkId: 'polygon',  withdrawFee: 0.1,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'erc20',    withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      avax: { networks: [
        { networkId: 'avalanche',withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'erc20',    withdrawFee: 0.1,  minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 1.0,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.05, minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
      ]},
      atom: { networks: [
        { networkId: 'cosmos',   withdrawFee: 0.005, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true, note: 'Memo required' },
        { networkId: 'bep20',    withdrawFee: 0.005, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      link: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.25,  minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.01,  minWithdraw: 0.2, withdrawEnabled: true, depositEnabled: true },
      ]},
      ton:  { networks: [
        { networkId: 'ton_network', withdrawFee: 0.01, minWithdraw: 1, withdrawEnabled: true, depositEnabled: true },
      ]},
      shib: { networks: [
        { networkId: 'erc20',    withdrawFee: 210_000, minWithdraw: 500_000, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 100_000, minWithdraw: 200_000, withdrawEnabled: true, depositEnabled: true },
      ]},
      uni:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.16,  minWithdraw: 0.3, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.05,  minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      near: { networks: [
        { networkId: 'near_network', withdrawFee: 0.01, minWithdraw: 1, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',        withdrawFee: 0.01, minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
      ]},
      arb:  { networks: [
        { networkId: 'arbitrum', withdrawFee: 0.5,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── Bybit ────────────────────────────────────────────────────────────────
  {
    id: 'bybit', name: 'Bybit', tier: 1,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0003,   minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.000017, minWithdraw: 0.0001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.005,  minWithdraw: 0.005,  withdrawEnabled: true, depositEnabled: true, note: 'Mainnet fee — free via Mantle network (re-verified 2026-07)' },
        { networkId: 'arbitrum', withdrawFee: 0.0001, minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'optimism', withdrawFee: 0.0001, minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 3.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 3.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.01, minWithdraw: 0.1,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      ltc:  { networks: [
        { networkId: 'litecoin', withdrawFee: 0.001, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 5.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      matic:{ networks: [
        { networkId: 'polygon',  withdrawFee: 0.1,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'erc20',    withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      avax: { networks: [
        { networkId: 'avalanche',withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 1.0,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      atom: { networks: [
        { networkId: 'cosmos',   withdrawFee: 0.005, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true, note: 'Memo required' },
      ]},
      link: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.28,  minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.01,  minWithdraw: 0.2, withdrawEnabled: true, depositEnabled: true },
      ]},
      ton:  { networks: [
        { networkId: 'ton_network', withdrawFee: 0.01, minWithdraw: 1, withdrawEnabled: true, depositEnabled: true },
      ]},
      shib: { networks: [
        { networkId: 'erc20',    withdrawFee: 200_000, minWithdraw: 400_000, withdrawEnabled: true, depositEnabled: true },
      ]},
      uni:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.15,  minWithdraw: 0.3, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.05,  minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      near: { networks: [
        { networkId: 'near_network', withdrawFee: 0.01, minWithdraw: 1, withdrawEnabled: true, depositEnabled: true },
      ]},
      arb:  { networks: [
        { networkId: 'arbitrum', withdrawFee: 0.5,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── Bitfinex ─────────────────────────────────────────────────────────────
  {
    id: 'bitfinex', name: 'Bitfinex', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.00006,  minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.001, minWithdraw: 0.1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 2.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 2.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 2.1484,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.1, minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 0.3,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.1,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── Gemini ───────────────────────────────────────────────────────────────
  {
    id: 'gemini', name: 'Gemini', tier: 1,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.000025, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true, note: 'Network-fee pass-through — the former 10-free-per-month tier is no longer on Gemini schedule (re-verified 2026-07)' },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.001, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true, note: 'Network-fee pass-through — the former 10-free-per-month tier is no longer on Gemini schedule (re-verified 2026-07)' },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 0,    minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true, note: 'Legacy free-tier value — Gemini has moved to network-fee pass-through; confirm current schedule' },
        { networkId: 'polygon',  withdrawFee: 0,    minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true, note: 'Legacy free-tier value — Gemini has moved to network-fee pass-through; confirm current schedule' },
      ]},
      ltc:  { networks: [
        { networkId: 'litecoin', withdrawFee: 0,    minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true, note: 'Legacy free-tier value — Gemini has moved to network-fee pass-through; confirm current schedule' },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 0,    minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true, note: 'Legacy free-tier value — Gemini has moved to network-fee pass-through; confirm current schedule' },
      ]},
    },
  },

  // ─── Crypto.com ───────────────────────────────────────────────────────────
  {
    id: 'cryptocom', name: 'Crypto.com', tier: 1,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0004, minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.0043, minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.001,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 4.0,  minWithdraw: 40,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 2.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 4.0,  minWithdraw: 40,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.01, minWithdraw: 0.1,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 5.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      matic:{ networks: [
        { networkId: 'polygon',  withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'erc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      avax: { networks: [
        { networkId: 'avalanche',withdrawFee: 0.01, minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 0.5,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      atom: { networks: [
        { networkId: 'cosmos',   withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true, note: 'Memo required' },
      ]},
    },
  },

  // ─── KuCoin ───────────────────────────────────────────────────────────────
  {
    id: 'kucoin', name: 'KuCoin', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.00009, minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.0015, minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.0002, minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.5,  minWithdraw: 8,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.99,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1, minWithdraw: 0.9, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.5,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 0.8,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.5,  minWithdraw: 8,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.45, minWithdraw: 0.9, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.008, minWithdraw: 0.1,  withdrawEnabled: true, depositEnabled: true },
      ]},
      dai:  { networks: [
        { networkId: 'erc20',    withdrawFee: 4.0,  minWithdraw: 8,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.45, minWithdraw: 0.9, withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.3, minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      ltc:  { networks: [
        { networkId: 'litecoin', withdrawFee: 0.006, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 4,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      matic:{ networks: [
        { networkId: 'polygon',  withdrawFee: 3,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'erc20',    withdrawFee: 25,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      avax: { networks: [
        { networkId: 'avalanche',withdrawFee: 0.06, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 2,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      atom: { networks: [
        { networkId: 'cosmos',   withdrawFee: 0.35, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true, note: 'Memo required' },
      ]},
      link: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.32,   minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.02,  minWithdraw: 0.2, withdrawEnabled: true, depositEnabled: true },
      ]},
      ton:  { networks: [
        { networkId: 'ton_network', withdrawFee: 0.02, minWithdraw: 1, withdrawEnabled: true, depositEnabled: true },
      ]},
      shib: { networks: [
        { networkId: 'erc20',    withdrawFee: 420000, minWithdraw: 500_000, withdrawEnabled: true, depositEnabled: true },
      ]},
      uni:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.8,   minWithdraw: 0.3, withdrawEnabled: true, depositEnabled: true },
      ]},
      near: { networks: [
        { networkId: 'near_network', withdrawFee: 0.23, minWithdraw: 1, withdrawEnabled: true, depositEnabled: true },
      ]},
      arb:  { networks: [
        { networkId: 'arbitrum', withdrawFee: 4,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── Bitget ───────────────────────────────────────────────────────────────
  {
    id: 'bitget', name: 'Bitget', tier: 1,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.00003,   minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.00000192, minWithdraw: 0.0001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.0002,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.00004,  minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.00005933,  minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.8,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.15,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.15,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.799921,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Exchange quotes this fee dynamically — the stored value is a 2026-08-22 reading, not a fixed schedule' },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.149986,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Exchange quotes this fee dynamically — the stored value is a 2026-08-22 reading, not a fixed schedule' },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.006, minWithdraw: 0.1,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.2,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      ltc:  { networks: [
        { networkId: 'litecoin', withdrawFee: 0.001, minWithdraw: 0.01, withdrawEnabled: true, depositEnabled: true },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.1,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 4,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      matic:{ networks: [
        { networkId: 'polygon',  withdrawFee: 0.2,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'erc20',    withdrawFee: 8.607704,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Exchange quotes this fee dynamically — the stored value is a 2026-08-22 reading, not a fixed schedule' },
      ]},
      avax: { networks: [
        { networkId: 'avalanche',withdrawFee: 0.0064, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 0.8,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      atom: { networks: [
        { networkId: 'cosmos',   withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true, note: 'Memo required' },
      ]},
    },
  },

  // ─── Gate.io ──────────────────────────────────────────────────────────────
  {
    id: 'gateio', name: 'Gate.io', tier: 1,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.001,  minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.000017, minWithdraw: 0.0001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.0021, minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.0001, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'optimism', withdrawFee: 0.0001, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.0003, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 1.5,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'avalanche',withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 2.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.01, minWithdraw: 0.1,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.1,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      ltc:  { networks: [
        { networkId: 'litecoin', withdrawFee: 0.001, minWithdraw: 0.002, withdrawEnabled: true, depositEnabled: true },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 5.0,  minWithdraw: 50,  withdrawEnabled: true, depositEnabled: true },
      ]},
      matic:{ networks: [
        { networkId: 'polygon',  withdrawFee: 0.1,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'erc20',    withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      avax: { networks: [
        { networkId: 'avalanche',withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 1.0,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      atom: { networks: [
        { networkId: 'cosmos',   withdrawFee: 0.005, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true, note: 'Memo required' },
      ]},
    },
  },

  // ─── MEXC ─────────────────────────────────────────────────────────────────
  {
    id: 'mexc', name: 'MEXC', tier: 1,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0005, minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.000017, minWithdraw: 0.0001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.004,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.0001, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.0003, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.01, minWithdraw: 0.1,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      ltc:  { networks: [
        { networkId: 'litecoin', withdrawFee: 0.001, minWithdraw: 0.01, withdrawEnabled: true, depositEnabled: true },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
      ]},
      matic:{ networks: [
        { networkId: 'polygon',  withdrawFee: 0.1,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'erc20',    withdrawFee: 0.8,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      avax: { networks: [
        { networkId: 'avalanche',withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 1.0,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      atom: { networks: [
        { networkId: 'cosmos',   withdrawFee: 0.005, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true, note: 'Memo required' },
      ]},
    },
  },

  // ─── HTX (formerly Huobi) ─────────────────────────────────────────────────
  {
    id: 'htx', name: 'HTX (Huobi)', tier: 1,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.00005, minWithdraw: 0.005, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.000017, minWithdraw: 0.0001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.0005,  minWithdraw: 0.02,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.0002,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.0003, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.765913,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true, note: 'Exchange quotes this fee dynamically — the stored value is a 2026-08-22 reading, not a fixed schedule' },
        { networkId: 'trc20',    withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'avalanche',withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 1.177832,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true, note: 'Exchange quotes this fee dynamically — the stored value is a 2026-08-22 reading, not a fixed schedule' },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.45360565,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Exchange quotes this fee dynamically — the stored value is a 2026-08-22 reading, not a fixed schedule' },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.001, minWithdraw: 0.1,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      ltc:  { networks: [
        { networkId: 'litecoin', withdrawFee: 0.001, minWithdraw: 0.01, withdrawEnabled: true, depositEnabled: true },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 5.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      matic:{ networks: [
        { networkId: 'polygon',  withdrawFee: 0.1,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'erc20',    withdrawFee: 20.899661,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Exchange quotes this fee dynamically — the stored value is a 2026-08-22 reading, not a fixed schedule' },
      ]},
      avax: { networks: [
        { networkId: 'avalanche',withdrawFee: 0.06, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 1.0,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      atom: { networks: [
        { networkId: 'cosmos',   withdrawFee: 0.005, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true, note: 'Memo required' },
      ]},
    },
  },

  // ─── Upbit ────────────────────────────────────────────────────────────────
  {
    id: 'upbit', name: 'Upbit', tier: 1,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0009, minWithdraw: 0.005, withdrawEnabled: true, depositEnabled: true, note: 'Primarily a Korean exchange — international withdrawals require full KYC verification' },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.01,   minWithdraw: 0.05,  withdrawEnabled: true, depositEnabled: true, note: 'KYC verification required for non-KRW users' },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 1.0,    minWithdraw: 20,    withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required. KYC required.' },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 1.0,    minWithdraw: 5,     withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.1,    minWithdraw: 1,     withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── Bitstamp ─────────────────────────────────────────────────────────────
  {
    id: 'bitstamp', name: 'Bitstamp', tier: 1,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0003, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.001,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 10.0, minWithdraw: 50,  withdrawEnabled: true, depositEnabled: true, note: 'Bitstamp charges a flat fee + 0.1% for crypto withdrawals — ERC-20 is expensive' },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 10.0, minWithdraw: 50,  withdrawEnabled: true, depositEnabled: true, note: 'Flat fee + 0.1% applies' },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.02, minWithdraw: 25,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      ltc:  { networks: [
        { networkId: 'litecoin', withdrawFee: 0.001, minWithdraw: 0.01, withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── Pionex ───────────────────────────────────────────────────────────────
  {
    id: 'pionex', name: 'Pionex', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0005, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.000017, minWithdraw: 0.0001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.005,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.0003, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 10.0, minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 10.0, minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      bnb:  { networks: [
        { networkId: 'bep20',    withdrawFee: 0.001, minWithdraw: 0.01, withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── LBank ────────────────────────────────────────────────────────────────
  {
    id: 'lbank', name: 'LBank', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.00005, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.01,   minWithdraw: 0.02,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.0001,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 1,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.2,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 1,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.1999,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.6872, minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 10.9217,  minWithdraw: 50,  withdrawEnabled: true, depositEnabled: true, note: 'Exchange quotes this fee dynamically — the stored value is a 2026-08-22 reading, not a fixed schedule' },
      ]},
    },
  },

  // ─── Bitrue ───────────────────────────────────────────────────────────────
  {
    id: 'bitrue', name: 'Bitrue', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0005, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.005,  minWithdraw: 0.02,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.001,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'XRP is Bitrue\'s featured asset. Destination tag required.' },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 1.0,  minWithdraw: 5,   withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── CoinW ────────────────────────────────────────────────────────────────
  {
    id: 'coinw', name: 'CoinW', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0005, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.005,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.001,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── XT.com ───────────────────────────────────────────────────────────────
  {
    id: 'xtcom', name: 'XT.com', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0001, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.00001, minWithdraw: 0.0001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.0028,  minWithdraw: 0.02,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.0008, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.0002,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 4,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'polygon',  withdrawFee: 0.02,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 4,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.001,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 4,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 11,  minWithdraw: 50,  withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── Hotcoin ──────────────────────────────────────────────────────────────
  {
    id: 'hotcoin', name: 'Hotcoin', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0005, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.005,  minWithdraw: 0.02,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.001,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 2.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── Azbit ────────────────────────────────────────────────────────────────
  {
    id: 'azbit', name: 'Azbit', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0005, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.005,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 2.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
    },
  },

  // ─── Toobit ───────────────────────────────────────────────────────────────
  {
    id: 'toobit', name: 'Toobit', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0005, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.000017, minWithdraw: 0.0001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.005,  minWithdraw: 0.02,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.001,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
    },
  },

  // ─── Coinstore ────────────────────────────────────────────────────────────
  {
    id: 'coinstore', name: 'Coinstore', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0005, minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.005,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.001,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── Poloniex ─────────────────────────────────────────────────────────────
  {
    id: 'poloniex', name: 'Poloniex', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.000021,  minWithdraw: 0.001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.00029903,   minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.754371, minWithdraw: 50,  withdrawEnabled: true, depositEnabled: true, note: 'Exchange quotes this fee dynamically — the stored value is a 2026-08-22 reading, not a fixed schedule' },
        { networkId: 'trc20',    withdrawFee: 1.2,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.753542,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true, note: 'Exchange quotes this fee dynamically — the stored value is a 2026-08-22 reading, not a fixed schedule' },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.2, minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      trx:  { networks: [
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 5.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      link: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.06241486,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true, note: 'Exchange quotes this fee dynamically — the stored value is a 2026-08-22 reading, not a fixed schedule' },
      ]},
    },
  },

  // ─── BingX ────────────────────────────────────────────────────────────────
  {
    id: 'bingx', name: 'BingX', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0005,   minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.000017, minWithdraw: 0.0001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.0035, minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.0003, minWithdraw: 0.005, withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 3.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 3.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      bnb:  { networks: [
        { networkId: 'bep20',    withdrawFee: 0.001,  minWithdraw: 0.01, withdrawEnabled: true, depositEnabled: true },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.008, minWithdraw: 0.1,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      link: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.3,  minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.01, minWithdraw: 0.2, withdrawEnabled: true, depositEnabled: true },
      ]},
      shib: { networks: [
        { networkId: 'erc20',    withdrawFee: 200_000, minWithdraw: 500_000, withdrawEnabled: true, depositEnabled: true },
      ]},
      uni:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.2,  minWithdraw: 0.3, withdrawEnabled: true, depositEnabled: true },
      ]},
      arb:  { networks: [
        { networkId: 'arbitrum', withdrawFee: 0.5,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── Phemex ───────────────────────────────────────────────────────────────
  {
    id: 'phemex', name: 'Phemex', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0005,   minWithdraw: 0.002,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.000017, minWithdraw: 0.0001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.002,  minWithdraw: 0.01, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.0003, minWithdraw: 0.005, withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 3.0,  minWithdraw: 30,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.8,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 3.0,  minWithdraw: 30,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      link: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.3,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      uni:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.2,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
      arb:  { networks: [
        { networkId: 'arbitrum', withdrawFee: 0.5,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── WOO X ────────────────────────────────────────────────────────────────
  {
    id: 'woox', name: 'WOO X', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0003,   minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.0008, minWithdraw: 0.01, withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.0002, minWithdraw: 0.005, withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 2.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 2.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.5,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.01, minWithdraw: 0.1, withdrawEnabled: true, depositEnabled: true },
      ]},
      near: { networks: [
        { networkId: 'near_network', withdrawFee: 0.05, minWithdraw: 1, withdrawEnabled: true, depositEnabled: true },
      ]},
      arb:  { networks: [
        { networkId: 'arbitrum', withdrawFee: 0.5,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── BitMart ──────────────────────────────────────────────────────────────
  {
    id: 'bitmart', name: 'BitMart', tier: 2,
    coins: {
      btc:  { networks: [
        { networkId: 'bitcoin',  withdrawFee: 0.0006,   minWithdraw: 0.001,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.000017, minWithdraw: 0.0001, withdrawEnabled: true, depositEnabled: true },
      ]},
      eth:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.003,  minWithdraw: 0.01,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'arbitrum', withdrawFee: 0.0005, minWithdraw: 0.005, withdrawEnabled: true, depositEnabled: true },
      ]},
      usdt: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'trc20',    withdrawFee: 2.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      usdc: { networks: [
        { networkId: 'erc20',    withdrawFee: 5.0,  minWithdraw: 20,  withdrawEnabled: true, depositEnabled: true },
        { networkId: 'solana',   withdrawFee: 1.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      bnb:  { networks: [
        { networkId: 'bep20',    withdrawFee: 0.001, minWithdraw: 0.01, withdrawEnabled: true, depositEnabled: true },
      ]},
      sol:  { networks: [
        { networkId: 'solana',   withdrawFee: 0.01, minWithdraw: 0.1,  withdrawEnabled: true, depositEnabled: true },
      ]},
      xrp:  { networks: [
        { networkId: 'xrpl',     withdrawFee: 0.25, minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true, note: 'Destination tag required' },
      ]},
      doge: { networks: [
        { networkId: 'dogecoin', withdrawFee: 5.0,  minWithdraw: 10,  withdrawEnabled: true, depositEnabled: true },
      ]},
      link: { networks: [
        { networkId: 'erc20',    withdrawFee: 0.4,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
        { networkId: 'bep20',    withdrawFee: 0.02, minWithdraw: 0.3, withdrawEnabled: true, depositEnabled: true },
      ]},
      ton:  { networks: [
        { networkId: 'ton_network', withdrawFee: 0.05, minWithdraw: 1, withdrawEnabled: true, depositEnabled: true },
      ]},
      shib: { networks: [
        { networkId: 'erc20',    withdrawFee: 250_000, minWithdraw: 500_000, withdrawEnabled: true, depositEnabled: true },
      ]},
      uni:  { networks: [
        { networkId: 'erc20',    withdrawFee: 0.25, minWithdraw: 0.5, withdrawEnabled: true, depositEnabled: true },
      ]},
      near: { networks: [
        { networkId: 'near_network', withdrawFee: 0.05, minWithdraw: 1, withdrawEnabled: true, depositEnabled: true },
      ]},
      arb:  { networks: [
        { networkId: 'arbitrum', withdrawFee: 0.8,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
      ada:  { networks: [
        { networkId: 'cardano',  withdrawFee: 1.0,  minWithdraw: 2,   withdrawEnabled: true, depositEnabled: true },
      ]},
      dot:  { networks: [
        { networkId: 'polkadot', withdrawFee: 0.1,  minWithdraw: 1,   withdrawEnabled: true, depositEnabled: true },
      ]},
    },
  },

  // ─── Hyperliquid (DEX) ────────────────────────────────────────────────────
  // Hyperliquid is a decentralized perpetual exchange running on its own L1.
  // Withdrawals go to Arbitrum via a native bridge. No exchange withdrawal fee —
  // users pay only the Arbitrum network gas.
  {
    id: 'hyperliquid', name: 'Hyperliquid (DEX)', tier: 1,
    coins: {
      usdc: { networks: [
        { networkId: 'arbitrum', withdrawFee: 1.0, minWithdraw: 5, withdrawEnabled: true, depositEnabled: true, note: 'DEX — withdrawals bridge to Arbitrum. No centralized custodian. You control your keys.' },
      ]},
      eth:  { networks: [
        { networkId: 'arbitrum', withdrawFee: 0.0001, minWithdraw: 0.01, withdrawEnabled: true, depositEnabled: true, note: 'DEX — withdrawals bridge to Arbitrum.' },
      ]},
    },
  },
]

// ─── Path-finding types & logic ───────────────────────────────────────────────

export interface TransferWarning {
  type: 'danger' | 'warning' | 'info'
  title: string
  message: string
}

export interface TransferHop {
  step: number
  from: string
  to: string
  networkId: NetworkId
  exchangeFee: number
  exchangeFeeUsd: number
  networkFee: number
  networkFeeUsd: number
  nativeGasToken: string
  /**
   * True when this hop's on-chain gas is already covered by the exchange
   * withdrawal fee (CEX-source hops). False when the sender pays gas out of
   * their own wallet (wallet-source hops). A hop's true cost is therefore
   * exchangeFeeUsd when covered, exchangeFeeUsd + networkFeeUsd when not —
   * summing both on a covered hop double-counts the gas.
   */
  gasCoveredByFee: boolean
  note?: string
  /** True when the withdrawal fee on this hop came from a live exchange API. */
  feeLive?: boolean
  /**
   * True when this hop's withdrawal STATUS was live-reported. Separate from
   * `feeLive`: coverage is per (exchange, coin, network) row, so an exchange
   * can be a live source while this specific route's status was never reported
   * — claiming otherwise presents a stored "open" as a checked one.
   */
  availabilityLive?: boolean
}

export interface TransferPath {
  id: string
  type: 'direct' | 'multi-hop' | 'no-path'
  networkId: NetworkId | null
  hops: TransferHop[]
  exchangeFeeCoin: number
  exchangeFeeUsd: number
  networkFeeUsd: number
  totalFeeUsd: number
  feePercent: number
  estimatedTime: string
  warnings: TransferWarning[]
  isViable: boolean
  isRecommended: boolean
  /**
   * Why a non-viable path is blocked. `isViable: false` used to mean exactly
   * one thing (amount below the exchange minimum), so the UI hard-coded that
   * label; a suspended withdrawal is a second, materially different reason and
   * must not be reported as "amount too low".
   */
  blockedReason?: 'below-minimum' | 'withdrawals-suspended'
}

export interface NetworkFeeEntry {
  feeNative: number
  feeUsd: number
  nativeToken: string
  source: 'live' | 'estimate'
}

export type NetworkFeeMap = Partial<Record<NetworkId, NetworkFeeEntry>>
export type CoinPriceMap = Partial<Record<string, number>>

function buildWarnings(
  networkId: NetworkId,
  amount: number,
  minWithdraw: number,
  coinId: string,
  totalFeeUsd: number,
  amountUsd: number,
  fromName: string,
  note?: string
): TransferWarning[] {
  const warnings: TransferWarning[] = []
  const network = NETWORKS[networkId]

  // EVM address collision
  if (EVM_NETWORKS.includes(networkId)) {
    const others = EVM_NETWORKS
      .filter(n => n !== networkId)
      .map(n => NETWORKS[n].shortName)
      .slice(0, 4).join(', ')
    warnings.push({
      type: 'danger',
      title: 'Address format collision risk',
      message: `${network.shortName} addresses begin with 0x — identical in appearance to ${others}, and other EVM chains. Always verify the NETWORK tag on both exchanges. Sending to the wrong EVM chain is usually unrecoverable.`,
    })
  }

  // Memo/destination tag required
  if (network.memoRequired) {
    warnings.push({
      type: 'danger',
      title: 'Memo / destination tag required',
      message: `${network.name} transfers to exchanges require a memo or destination tag. Omitting it will cause funds to arrive at the exchange with no account association — they may be lost or require lengthy manual recovery.`,
    })
  }

  // Below minimum
  if (amount < minWithdraw) {
    warnings.push({
      type: 'danger',
      title: 'Below minimum withdrawal',
      message: `${fromName} requires a minimum of ${minWithdraw} ${coinId.toUpperCase()} on ${network.shortName}. Your amount (${amount}) is insufficient.`,
    })
  }

  // High fee ratio
  if (amountUsd > 0) {
    const pct = (totalFeeUsd / amountUsd) * 100
    if (pct > 5) {
      warnings.push({ type: 'danger', title: 'Very high fee ratio', message: `Fees represent ${pct.toFixed(1)}% of your transfer. Consider a larger amount or a cheaper network.` })
    } else if (pct > 2) {
      warnings.push({ type: 'warning', title: 'High fee ratio', message: `Fees represent ${pct.toFixed(1)}% of your transfer. A cheaper network may be available.` })
    }
  }

  // Exchange note (e.g. "free first 10/month")
  if (note) {
    warnings.push({ type: 'info', title: 'Exchange note', message: note })
  }

  return warnings
}

export function findTransferPaths(
  fromId: string,
  toId: string,
  coinId: CoinId,
  amount: number,
  networkFees: NetworkFeeMap,
  coinPrices: CoinPriceMap,
  liveOverrides?: LiveFeeOverrideMap,
  /**
   * When the live overlay was fetched, pre-formatted for display. Passed in
   * rather than read from the clock so this stays a pure function (same
   * reasoning as the injectable `now` on the provenance helpers). Only used to
   * timestamp a live suspension claim, which a user may act on directly.
   */
  liveAsOf?: string
): TransferPath[] {
  if (fromId === toId) return []

  const toEx = toId === PERSONAL_WALLET_ID
    ? null
    : EXCHANGES.find(e => e.id === toId)
  if (toId !== PERSONAL_WALLET_ID && !toEx) return []

  const coinPriceUsd = coinPrices[coinId] ?? 1

  // Wallet → exchange: an on-chain deposit. No withdrawal fee and no exchange
  // minimum applies — the sender pays gas from their own wallet on whichever
  // deposit network the destination accepts. (Both the route builder UI and
  // the public v1 API accept "wallet" as a source; before this branch existed
  // they silently got an empty result.)
  if (fromId === PERSONAL_WALLET_ID) {
    if (!toEx) return []
    const toCoinW = toEx.coins[coinId]
    if (!toCoinW || toCoinW.networks.length === 0) {
      return [{ id: 'no-dest', type: 'no-path', networkId: null, hops: [], exchangeFeeCoin: 0, exchangeFeeUsd: 0, networkFeeUsd: 0, totalFeeUsd: 0, feePercent: 0, estimatedTime: 'N/A', warnings: [{ type: 'danger', title: 'Not supported at destination', message: `${toEx.name} does not support ${coinId.toUpperCase()} deposits.` }], isViable: false, isRecommended: false }]
    }
    const walletPaths: TransferPath[] = []
    const amountUsd = amount * coinPriceUsd
    for (const dNet of toCoinW.networks) {
      if (!dNet.depositEnabled) continue
      const nFee = networkFees[dNet.networkId]
      if (!nFee) continue
      const network = NETWORKS[dNet.networkId]
      const totalFeeUsd = nFee.feeUsd
      walletPaths.push({
        id: `wallet-${dNet.networkId}`,
        type: 'direct',
        networkId: dNet.networkId,
        hops: [{
          step: 1, from: 'Personal Wallet', to: toEx.name, networkId: dNet.networkId,
          exchangeFee: 0, exchangeFeeUsd: 0,
          networkFee: nFee.feeNative, networkFeeUsd: nFee.feeUsd,
          nativeGasToken: nFee.nativeToken, gasCoveredByFee: false, note: dNet.note,
        }],
        exchangeFeeCoin: 0, exchangeFeeUsd: 0, networkFeeUsd: nFee.feeUsd,
        totalFeeUsd,
        feePercent: amountUsd > 0 ? (totalFeeUsd / amountUsd) * 100 : 0,
        estimatedTime: network.estimatedTime,
        warnings: [
          ...buildWarnings(dNet.networkId, amount, 0, coinId, totalFeeUsd, amountUsd, 'Personal Wallet', dNet.note),
          { type: 'info', title: 'Gas paid from your wallet', message: `You must hold ${nFee.nativeToken} in the sending wallet to pay on-chain gas for this deposit.` },
        ],
        isViable: true, isRecommended: false,
      })
    }
    if (walletPaths.length === 0) {
      return [{ id: 'no-path', type: 'no-path', networkId: null, hops: [], exchangeFeeCoin: 0, exchangeFeeUsd: 0, networkFeeUsd: 0, totalFeeUsd: 0, feePercent: 0, estimatedTime: 'N/A', warnings: [{ type: 'danger', title: 'No transfer path found', message: `No deposit network with fee data found at ${toEx.name} for ${coinId.toUpperCase()}.` }], isViable: false, isRecommended: false }]
    }
    walletPaths.sort((a, b) => a.totalFeeUsd - b.totalFeeUsd)
    walletPaths[0].isRecommended = true
    return walletPaths
  }

  const fromEx = EXCHANGES.find(e => e.id === fromId)
  if (!fromEx) return []

  // Apply live fee overrides to the WITHDRAWING side only (deposits are free).
  // Overlay, never extend: only rows already in the static table are touched.
  const rawFromCoin = fromEx.coins[coinId]
  const coinOverrides = liveOverrides?.[fromId]?.[coinId]
  const fromCoin: ExchangeCoin | undefined = rawFromCoin && coinOverrides
    ? {
        networks: rawFromCoin.networks.map(n => {
          const o = coinOverrides[n.networkId]
          if (!o) return n
          // The two halves overlay independently: a source may report a fee, a
          // status, or both, and each carries its own "live" label. Coupling
          // them would either promote a stored fee to live off the back of a
          // status, or discard a known status because the fee was unparseable.
          return {
            ...n,
            withdrawFee: o.withdrawFee ?? n.withdrawFee,
            minWithdraw: o.minWithdraw ?? n.minWithdraw,
            withdrawEnabled: o.withdrawEnabled ?? n.withdrawEnabled,
            liveFee: o.withdrawFee !== undefined ? true : n.liveFee,
            liveAvailability: o.withdrawEnabled !== undefined ? true : n.liveAvailability,
          }
        }),
      }
    : rawFromCoin

  if (!fromCoin || fromCoin.networks.length === 0) {
    return [{ id: 'no-source', type: 'no-path', networkId: null, hops: [], exchangeFeeCoin: 0, exchangeFeeUsd: 0, networkFeeUsd: 0, totalFeeUsd: 0, feePercent: 0, estimatedTime: 'N/A', warnings: [{ type: 'danger', title: 'Not supported', message: `${fromEx.name} does not support ${coinId.toUpperCase()} withdrawals.` }], isViable: false, isRecommended: false }]
  }

  const toCoin = toEx?.coins[coinId]
  if (toEx && (!toCoin || toCoin.networks.length === 0)) {
    return [{ id: 'no-dest', type: 'no-path', networkId: null, hops: [], exchangeFeeCoin: 0, exchangeFeeUsd: 0, networkFeeUsd: 0, totalFeeUsd: 0, feePercent: 0, estimatedTime: 'N/A', warnings: [{ type: 'danger', title: 'Not supported at destination', message: `${toEx.name} does not support ${coinId.toUpperCase()} deposits.` }], isViable: false, isRecommended: false }]
  }

  // ⚠ KNOWN GAP (the mirror of the withdrawal-suspension work below): a closed
  // DEPOSIT silently removes the route here, and no live source reports deposit
  // status, so all 543 catalogued rows assert depositEnabled: true from the
  // stored snapshot. A suspended deposit strands funds just as a suspended
  // withdrawal does — the coin leaves the source and the destination will not
  // credit it. Closing this needs a deposit-status source; until then the
  // page-level notice covers availability generally rather than implying only
  // withdrawals are uncertain.
  const depositNetworkIds = toEx
    ? new Set(toCoin!.networks.filter(n => n.depositEnabled).map(n => n.networkId))
    : null

  const paths: TransferPath[] = []

  for (const wNet of fromCoin.networks) {
    if (depositNetworkIds && !depositNetworkIds.has(wNet.networkId)) continue

    const nFee = networkFees[wNet.networkId]
    if (!nFee) continue

    // A closed withdrawal used to `continue` here, so the route simply vanished
    // from the list — the user saw fewer options and no reason why, which is
    // worse than knowing. Surface it as a blocked route instead, and say who
    // says so: a live API report is a fact with a timestamp, while the static
    // table's flag is a 2025-06-01 assumption.
    if (!wNet.withdrawEnabled) {
      const netName = NETWORKS[wNet.networkId].shortName
      paths.push({
        id: `suspended-${wNet.networkId}`,
        type: 'direct',
        networkId: wNet.networkId,
        hops: [],
        exchangeFeeCoin: 0, exchangeFeeUsd: 0, networkFeeUsd: 0, totalFeeUsd: 0, feePercent: 0,
        estimatedTime: 'N/A',
        warnings: [{
          type: 'danger',
          title: 'Withdrawals suspended',
          message: wNet.liveAvailability
            ? `${fromEx.name} reports ${coinId.toUpperCase()} withdrawals on ${netName} as suspended in its public API${liveAsOf ? ` (checked ${liveAsOf})` : ''}. Suspensions are usually temporary — check the exchange's status page before planning around this.`
            : `The withdrawal-fee table records ${coinId.toUpperCase()} withdrawals on ${netName} at ${fromEx.name} as disabled — a stored value from ${TRANSFER_FEES_LAST_VERIFIED}, not a live check. Confirm on the exchange.`,
        }],
        isViable: false,
        isRecommended: false,
        blockedReason: 'withdrawals-suspended',
      })
      continue
    }

    const network = NETWORKS[wNet.networkId]
    const exchangeFeeUsd = wNet.withdrawFee * coinPriceUsd
    const networkFeeUsd = nFee.feeUsd
    // A CEX withdrawal fee already covers the on-chain gas — the network fee
    // is shown for context, not added on top (it was double-counted before).
    const totalFeeUsd = exchangeFeeUsd
    const amountUsd = amount * coinPriceUsd
    const feePercent = amountUsd > 0 ? (totalFeeUsd / amountUsd) * 100 : 0
    const isViable = amount >= wNet.minWithdraw
    const toName = toEx?.name ?? 'Personal Wallet'

    paths.push({
      id: `direct-${wNet.networkId}`,
      type: 'direct',
      networkId: wNet.networkId,
      hops: [{
        step: 1, from: fromEx.name, to: toName, networkId: wNet.networkId,
        exchangeFee: wNet.withdrawFee, exchangeFeeUsd,
        networkFee: nFee.feeNative, networkFeeUsd: nFee.feeUsd,
        nativeGasToken: nFee.nativeToken, gasCoveredByFee: true, note: wNet.note,
        feeLive: wNet.liveFee, availabilityLive: wNet.liveAvailability,
      }],
      exchangeFeeCoin: wNet.withdrawFee, exchangeFeeUsd, networkFeeUsd,
      totalFeeUsd, feePercent,
      estimatedTime: network.estimatedTime,
      warnings: buildWarnings(wNet.networkId, amount, wNet.minWithdraw, coinId, totalFeeUsd, amountUsd, fromEx.name, wNet.note),
      isViable, isRecommended: false,
      ...(isViable ? {} : { blockedReason: 'below-minimum' as const }),
    })
  }

  // No shared network → multi-hop via wallet.
  // Suspended routes are pushed above but must NOT count as "we found a route",
  // or a closed direct network would suppress the wallet alternative — which is
  // exactly the case where the user most needs it.
  const hasDirectRoute = paths.some(p => p.blockedReason !== 'withdrawals-suspended')
  if (!hasDirectRoute && toEx) {
    // Prefer a network both legs support so no bridge/swap is implied
    const sharedNet = fromCoin.networks.find(n =>
      n.withdrawEnabled && networkFees[n.networkId] &&
      toCoin!.networks.some(d => d.networkId === n.networkId && d.depositEnabled)
    )
    const srcNet = sharedNet ?? fromCoin.networks.find(n => n.withdrawEnabled && networkFees[n.networkId])
    const dstNet = sharedNet ?? toCoin!.networks.find(n => n.depositEnabled && networkFees[n.networkId])

    if (srcNet && dstNet) {
      const dstNFee = networkFees[dstNet.networkId]!
      const srcNetwork = NETWORKS[srcNet.networkId]
      const dstNetwork = NETWORKS[dstNet.networkId]
      const exchangeFeeUsd = srcNet.withdrawFee * coinPriceUsd
      // Exchange fee covers leg-1 gas; the user pays gas on the wallet→exchange leg
      const networkFeeUsd = dstNFee.feeUsd
      const totalFeeUsd = exchangeFeeUsd + networkFeeUsd
      const amountUsd = amount * coinPriceUsd

      paths.push({
        id: 'multi-hop-wallet',
        type: 'multi-hop',
        networkId: srcNet.networkId,
        hops: [
          { step: 1, from: fromEx.name, to: 'Personal Wallet', networkId: srcNet.networkId, exchangeFee: srcNet.withdrawFee, exchangeFeeUsd, networkFee: 0, networkFeeUsd: 0, nativeGasToken: NETWORKS[srcNet.networkId].nativeToken, gasCoveredByFee: true, feeLive: srcNet.liveFee, availabilityLive: srcNet.liveAvailability },
          { step: 2, from: 'Personal Wallet', to: toEx.name, networkId: dstNet.networkId, exchangeFee: 0, exchangeFeeUsd: 0, networkFee: dstNFee.feeNative, networkFeeUsd: dstNFee.feeUsd, nativeGasToken: dstNFee.nativeToken, gasCoveredByFee: false },
        ],
        exchangeFeeCoin: srcNet.withdrawFee, exchangeFeeUsd, networkFeeUsd, totalFeeUsd,
        feePercent: amountUsd > 0 ? (totalFeeUsd / amountUsd) * 100 : 0,
        estimatedTime: `${srcNetwork.estimatedTime} + ${dstNetwork.estimatedTime}`,
        warnings: [
          { type: 'warning', title: 'No shared network — multi-hop required', message: `${fromEx.name} and ${toEx.name} share no common network for ${coinId.toUpperCase()}. This route withdraws to a personal wallet on ${srcNetwork.shortName}, then deposits to ${toEx.name} on ${dstNetwork.shortName}. A bridge or swap may be needed if the networks differ.` },
          ...buildWarnings(srcNet.networkId, amount, srcNet.minWithdraw, coinId, totalFeeUsd, amountUsd, fromEx.name, srcNet.note),
        ],
        isViable: amount >= srcNet.minWithdraw,
        isRecommended: false,
        ...(amount >= srcNet.minWithdraw ? {} : { blockedReason: 'below-minimum' as const }),
      })
    } else {
      // State the real cause. When every candidate network is SUSPENDED the
      // networks are perfectly compatible — saying otherwise sends the user
      // hunting for a different exchange when they should be waiting out a
      // temporary halt (or checking the status page).
      const suspendedCount = paths.filter(p => p.blockedReason === 'withdrawals-suspended').length
      paths.push({
        id: 'no-path', type: 'no-path', networkId: null, hops: [],
        exchangeFeeCoin: 0, exchangeFeeUsd: 0, networkFeeUsd: 0, totalFeeUsd: 0, feePercent: 0,
        estimatedTime: 'N/A',
        warnings: [suspendedCount > 0
          ? { type: 'danger' as const, title: 'No route available — withdrawals suspended', message: `${fromEx.name} and ${toEx.name} do share a network for ${coinId.toUpperCase()}, but every route out of ${fromEx.name} is currently reported as suspended. This is usually temporary — check ${fromEx.name}'s status page rather than switching exchanges.` }
          : { type: 'danger' as const, title: 'No transfer path found', message: `No compatible network found between ${fromEx.name} and ${toEx.name} for ${coinId.toUpperCase()}.` }],
        isViable: false, isRecommended: false,
      })
    }
  }

  paths.sort((a, b) => {
    if (a.isViable !== b.isViable) return a.isViable ? -1 : 1
    return a.totalFeeUsd - b.totalFeeUsd
  })

  const firstViable = paths.find(p => p.isViable)
  if (firstViable) firstViable.isRecommended = true

  return paths
}

// ─── Custom multi-hop route builder helpers ────────────────────────────────────

export interface SegmentOption {
  networkId: NetworkId
  withdrawFee: number       // coin units (0 if from wallet)
  withdrawFeeUsd: number
  networkFeeUsd: number
  totalFeeUsd: number
  minWithdraw: number
  viable: boolean           // amount >= minWithdraw
}

/**
 * Returns all viable network options for a single segment (from → to),
 * sorted cheapest-first. Used by the custom route builder.
 */
export function computeSegmentOptions(
  fromId: string,
  toId: string,
  coinId: CoinId,
  amount: number,
  networkFees: NetworkFeeMap,
  coinPrices: CoinPriceMap,
): SegmentOption[] {
  const coinPrice = coinPrices[coinId] ?? 1
  const isFromWallet = fromId === PERSONAL_WALLET_ID
  const isToWallet   = toId   === PERSONAL_WALLET_ID

  if (isFromWallet) {
    // Sending from a personal wallet — no exchange withdrawal fee, just gas.
    // Show every network for which we have a gas fee.
    return (Object.entries(networkFees) as [NetworkId, NetworkFeeEntry][])
      .map(([netId, fee]) => ({
        networkId: netId,
        withdrawFee: 0,
        withdrawFeeUsd: 0,
        networkFeeUsd: fee.feeUsd,
        totalFeeUsd: fee.feeUsd,
        minWithdraw: 0,
        viable: true,
      }))
      .sort((a, b) => a.totalFeeUsd - b.totalFeeUsd)
  }

  const fromEx = EXCHANGES.find(e => e.id === fromId)
  if (!fromEx) return []

  const coinConfig = fromEx.coins[coinId]
  if (!coinConfig) return []

  const toEx = isToWallet ? null : EXCHANGES.find(e => e.id === toId)

  return coinConfig.networks
    .filter(n => {
      if (!n.withdrawEnabled) return false
      if (toEx) {
        const toCoin = toEx.coins[coinId]
        if (!toCoin) return false
        const toNet = toCoin.networks.find(tn => tn.networkId === n.networkId)
        if (!toNet || !toNet.depositEnabled) return false
      }
      return true
    })
    .map(n => {
      const fee = networkFees[n.networkId]
      const withdrawFeeUsd = n.withdrawFee * coinPrice
      const networkFeeUsd  = fee?.feeUsd ?? 0
      return {
        networkId: n.networkId,
        withdrawFee: n.withdrawFee,
        withdrawFeeUsd,
        networkFeeUsd,
        totalFeeUsd: withdrawFeeUsd + networkFeeUsd,
        minWithdraw: n.minWithdraw,
        viable: amount >= n.minWithdraw,
      }
    })
    .sort((a, b) => a.totalFeeUsd - b.totalFeeUsd)
}
