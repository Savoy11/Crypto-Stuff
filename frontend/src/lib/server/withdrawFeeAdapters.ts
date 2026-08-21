// Parsers for the keyless exchange withdrawal-fee APIs behind
// /live-data/withdraw-fees (S3 Tier-1 live overlay).
//
// Design rules (mirrored in lib/data/transferFees.ts):
//   1. OVERLAY ONLY — buildFeeOverrideMap() keeps a parsed row only when the
//      same (exchange, coin, network) row already exists in the hand-curated
//      EXCHANGES table. Live data updates fees on known routes; it never
//      invents routes, because deposit support and route warnings are curated.
//   2. Tolerant parsing — these are third-party payloads; a malformed row is
//      skipped, never thrown on. A fee that is missing/empty/non-finite is
//      dropped (unknown is not zero).
//
// Every parser is pure (JSON in, rows out) so the chain-name mapping — the
// bug-prone part — is unit-testable without network access.

import {
  EXCHANGES,
  type CoinId,
  type NetworkId,
  type LiveFeeOverrideMap,
} from '@/lib/data/transferFees'

export interface ParsedFeeRow {
  exchangeId: string
  coin: CoinId
  network: NetworkId
  withdrawFee: number
  minWithdraw?: number
  withdrawEnabled?: boolean
}

// ─── Symbol → CoinId ──────────────────────────────────────────────────────────

const SYMBOL_TO_COIN: Record<string, CoinId> = {
  BTC: 'btc', ETH: 'eth', USDT: 'usdt', USDC: 'usdc', BNB: 'bnb', SOL: 'sol',
  DAI: 'dai', XRP: 'xrp', LTC: 'ltc', TRX: 'trx', DOGE: 'doge', MATIC: 'matic',
  // Polygon's token rename — exchanges list POL, our catalog id stays `matic`.
  POL: 'matic',
  AVAX: 'avax', ADA: 'ada', DOT: 'dot', ATOM: 'atom', LINK: 'link', TON: 'ton',
  SHIB: 'shib', UNI: 'uni', NEAR: 'near', ARB: 'arb',
}

export function normalizeSymbol(symbol: string): CoinId | null {
  return SYMBOL_TO_COIN[symbol.toUpperCase()] ?? null
}

// ─── Chain name → NetworkId ───────────────────────────────────────────────────
//
// Each exchange spells chain names its own way ("ERC20", "ETH", "Ethereum",
// "AVAX C-Chain", "BEP20(BSC)"...). Normalize on a lowercase alphanumeric key.

const CHAIN_TO_NETWORK: Record<string, NetworkId> = {
  btc: 'bitcoin', bitcoin: 'bitcoin',
  eth: 'erc20', erc20: 'erc20', ethereum: 'erc20', eth2: 'erc20',
  trx: 'trc20', trc20: 'trc20', tron: 'trc20',
  bsc: 'bep20', bep20: 'bep20', bep20bsc: 'bep20', bnbsmartchain: 'bep20', bnbsmartchainbep20: 'bep20',
  sol: 'solana', solana: 'solana',
  matic: 'polygon', polygon: 'polygon', pol: 'polygon', polygonpos: 'polygon',
  arb: 'arbitrum', arbitrum: 'arbitrum', arbitrumone: 'arbitrum', arbone: 'arbitrum',
  op: 'optimism', optimism: 'optimism',
  base: 'base',
  avax: 'avalanche', avaxc: 'avalanche', avaxcchain: 'avalanche', avalanche: 'avalanche',
  avalanchecchain: 'avalanche', cavax: 'avalanche', cchain: 'avalanche',
  xrp: 'xrpl', xrpl: 'xrpl', ripple: 'xrpl',
  ltc: 'litecoin', litecoin: 'litecoin',
  doge: 'dogecoin', dogecoin: 'dogecoin', dogechain: 'dogecoin',
  ada: 'cardano', cardano: 'cardano',
  dot: 'polkadot', polkadot: 'polkadot',
  atom: 'cosmos', cosmos: 'cosmos', cosmoshub: 'cosmos',
  ton: 'ton_network', toncoin: 'ton_network', theopennetwork: 'ton_network',
  near: 'near_network', nearprotocol: 'near_network',
}

export function normalizeChain(chain: string): NetworkId | null {
  const key = chain.toLowerCase().replace(/[^a-z0-9]/g, '')
  return CHAIN_TO_NETWORK[key] ?? null
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

// ─── Per-exchange parsers ─────────────────────────────────────────────────────

// (Bybit's coin/query-info endpoint was probed 2026-08-21 and returned 403 —
// it is authenticated, not public. Keyless-only rule → no Bybit adapter.)

/** KuCoin `GET /api/v3/currencies` → { code: '200000', data: [{ currency, chains: [...] }] } */
export function parseKucoinCurrencies(json: any): ParsedFeeRow[] {
  const rows: ParsedFeeRow[] = []
  if (!json || json.code !== '200000') return rows
  for (const cur of json.data ?? []) {
    const coin = normalizeSymbol(String(cur?.currency ?? ''))
    if (!coin) continue
    for (const c of cur?.chains ?? []) {
      const network = normalizeChain(String(c?.chainName ?? c?.chainId ?? ''))
      const withdrawFee = num(c?.withdrawalMinFee)
      if (!network || withdrawFee === undefined) continue
      rows.push({
        exchangeId: 'kucoin', coin, network, withdrawFee,
        minWithdraw: num(c?.withdrawalMinSize),
        withdrawEnabled: typeof c?.isWithdrawEnabled === 'boolean' ? c.isWithdrawEnabled : undefined,
      })
    }
  }
  return rows
}

/** HTX (Huobi) `GET /v2/reference/currencies` → { code: 200, data: [{ currency, chains: [...] }] } */
export function parseHtxCurrencies(json: any): ParsedFeeRow[] {
  const rows: ParsedFeeRow[] = []
  if (!json || json.code !== 200) return rows
  for (const cur of json.data ?? []) {
    const coin = normalizeSymbol(String(cur?.currency ?? ''))
    if (!coin) continue
    for (const c of cur?.chains ?? []) {
      // HTX only quotes a flat fee when feeType is 'fixed'; ratio/circulated
      // fee types don't map to a per-withdrawal coin amount — skip those.
      if (c?.withdrawFeeType !== 'fixed') continue
      const network = normalizeChain(String(c?.displayName ?? c?.baseChain ?? c?.chain ?? ''))
      const withdrawFee = num(c?.transactFeeWithdraw)
      if (!network || withdrawFee === undefined) continue
      rows.push({
        exchangeId: 'htx', coin, network, withdrawFee,
        minWithdraw: num(c?.minWithdrawAmt),
        withdrawEnabled: c?.withdrawStatus === undefined ? undefined : c.withdrawStatus === 'allowed',
      })
    }
  }
  return rows
}

// ─── Overlay filter ───────────────────────────────────────────────────────────

/**
 * Parsed rows → override map, keeping only rows whose (exchange, coin, network)
 * already exists in the static EXCHANGES table. Returns the map plus counts so
 * the route can report how much of the live data was actually applicable.
 */
export function buildFeeOverrideMap(rows: ParsedFeeRow[]): {
  overrides: LiveFeeOverrideMap
  applied: number
  skipped: number
} {
  const overrides: LiveFeeOverrideMap = {}
  let applied = 0
  let skipped = 0
  for (const row of rows) {
    const ex = EXCHANGES.find(e => e.id === row.exchangeId)
    const known = ex?.coins[row.coin]?.networks.some(n => n.networkId === row.network)
    if (!known) { skipped++; continue }
    const byCoin = (overrides[row.exchangeId] ??= {})
    const byNet = (byCoin[row.coin] ??= {})
    byNet[row.network] = {
      withdrawFee: row.withdrawFee,
      minWithdraw: row.minWithdraw,
      withdrawEnabled: row.withdrawEnabled,
    }
    applied++
  }
  return { overrides, applied, skipped }
}
