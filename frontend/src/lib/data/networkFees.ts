// Single source of truth for network (gas) fees.
//
// Both the internal UI route (/live-data/network-fees) and the public agent API
// (/api/v1/network-fees) compute fees from THIS module, so the two layers can
// never drift. See DATA-AVAILABILITY.md.
//
// Provenance model:
//   - `live`     — fee amount came from a real-time source (a FeeProvider).
//   - `estimate` — a static typical gas amount priced at the live token price.
//                  The USD value moves with price, but the gas amount is an
//                  assumption, so the fee is honestly labeled an estimate.
//
// To upgrade a network from `estimate` to `live`, register a FeeProvider for it
// below (see bitcoinProvider for the reference implementation). This is the
// extension point for real per-chain fee feeds (EVM gas oracles, RPC
// eth_gasPrice, etc.).

export type NetworkKey =
  | 'erc20' | 'arbitrum' | 'base' | 'optimism' | 'bep20' | 'solana'
  | 'trc20' | 'polygon' | 'avalanche' | 'bitcoin' | 'xrpl' | 'litecoin'
  | 'dogecoin' | 'cardano' | 'polkadot' | 'cosmos' | 'ton_network' | 'near_network'

interface NetworkGasInfo {
  /** Typical token-transfer cost in the network's native gas token. */
  native: number
  /** Native gas token symbol (uppercase). */
  token: string
  /** App price-map key (lowercase) used to look up the live USD price. */
  priceKey: string
  /** CoinGecko id used to fetch the live price of the gas token. */
  coingeckoId: string
}

// Static typical gas amounts (native token units) + how to price them.
export const NETWORK_GAS: Record<NetworkKey, NetworkGasInfo> = {
  erc20:        { native: 0.002,    token: 'ETH',  priceKey: 'eth',   coingeckoId: 'ethereum' },
  arbitrum:     { native: 0.00005,  token: 'ETH',  priceKey: 'eth',   coingeckoId: 'ethereum' },
  base:         { native: 0.00003,  token: 'ETH',  priceKey: 'eth',   coingeckoId: 'ethereum' },
  optimism:     { native: 0.00005,  token: 'ETH',  priceKey: 'eth',   coingeckoId: 'ethereum' },
  bep20:        { native: 0.0005,   token: 'BNB',  priceKey: 'bnb',   coingeckoId: 'binancecoin' },
  solana:       { native: 0.000025, token: 'SOL',  priceKey: 'sol',   coingeckoId: 'solana' },
  trc20:        { native: 1.0,      token: 'TRX',  priceKey: 'trx',   coingeckoId: 'tron' },
  polygon:      { native: 0.1,      token: 'POL',  priceKey: 'matic', coingeckoId: 'matic-network' },
  avalanche:    { native: 0.01,     token: 'AVAX', priceKey: 'avax',  coingeckoId: 'avalanche-2' },
  bitcoin:      { native: 0.00015,  token: 'BTC',  priceKey: 'btc',   coingeckoId: 'bitcoin' },
  xrpl:         { native: 0.000012, token: 'XRP',  priceKey: 'xrp',   coingeckoId: 'ripple' },
  litecoin:     { native: 0.001,    token: 'LTC',  priceKey: 'ltc',   coingeckoId: 'litecoin' },
  dogecoin:     { native: 1.0,      token: 'DOGE', priceKey: 'doge',  coingeckoId: 'dogecoin' },
  cardano:      { native: 0.17,     token: 'ADA',  priceKey: 'ada',   coingeckoId: 'cardano' },
  polkadot:     { native: 0.014,    token: 'DOT',  priceKey: 'dot',   coingeckoId: 'polkadot' },
  cosmos:       { native: 0.01,     token: 'ATOM', priceKey: 'atom',  coingeckoId: 'cosmos' },
  ton_network:  { native: 0.0055,   token: 'TON',  priceKey: 'ton',   coingeckoId: 'the-open-network' },
  near_network: { native: 0.0003,   token: 'NEAR', priceKey: 'near',  coingeckoId: 'near' },
}

// Auxiliary (non-gas-token) coins the UI also needs priced — e.g. the transfer
// fee calculator values withdrawal fees in these. Fetched in the same call so
// every layer reads identical prices. Keyed by lowercase priceKey → CoinGecko id.
export const AUX_PRICE_COINS: Record<string, string> = {
  usdt: 'tether', usdc: 'usd-coin', dai: 'dai', link: 'chainlink',
  shib: 'shiba-inu', uni: 'uniswap', arb: 'arbitrum',
}

// Last-resort prices used only when the live price fetch fails, so a fee is
// never blank. Keyed by the lowercase priceKey. Dated (V6): a stale constant
// disclosed as fallback but undated still reads as roughly current — update
// FALLBACK_PRICES_AS_OF when refreshing these.
export const FALLBACK_PRICES_AS_OF = '2026-07-22' // per git history of these constants
export const FALLBACK_PRICES: Record<string, number> = {
  eth: 3200, bnb: 600, sol: 160, trx: 0.14, matic: 0.60, avax: 28,
  btc: 95000, xrp: 2.20, ltc: 90, doge: 0.18, ada: 0.45, dot: 7.0,
  atom: 5.50, ton: 3.0, near: 3.0,
  usdt: 1.0, usdc: 1.0, dai: 1.0, link: 14.0, shib: 0.000012, uni: 7.0, arb: 0.50,
}

export type FeeSource = 'live' | 'estimate'

export interface NetworkFee {
  feeNative: number
  feeUsd: number
  nativeToken: string
  source: FeeSource
}

export interface ComputedNetworkFees {
  fees: Record<NetworkKey, NetworkFee>
  /** Live USD prices keyed by lowercase priceKey (falls back where needed). */
  prices: Record<string, number>
  priceSource: 'live' | 'fallback'
  /** Live BTC fee rate when available. */
  btcSatPerVbyte: number | null
  updatedAt: string
}

// ── Live fee providers (the Phase-3 extension point) ─────────────────────────
//
// A FeeProvider returns a real-time fee amount (in native token units) for one
// network, or null if it can't. Register additional providers here to move more
// networks from `estimate` to `live`. All providers run with Promise.allSettled,
// so a provider failing never breaks the response — it just falls back to the
// static estimate.

export interface FeeProviderResult {
  network: NetworkKey
  feeNative: number
  /** Optional extra telemetry (e.g. BTC sat/vByte) surfaced on the response. */
  meta?: Record<string, number>
}

export interface FeeProvider {
  network: NetworkKey
  label: string
  fetchFee(): Promise<FeeProviderResult | null>
}

// ── EVM live gas (public JSON-RPC, keyless) ──────────────────────────────────
//
// `eth_gasPrice` gives the current gas PRICE; the gas LIMIT for a token
// transfer stays an assumption, so a live EVM fee is "live price x assumed
// limit" — exactly the shape of the Bitcoin provider (live sat/vByte x assumed
// 250 vBytes), and labelled `live` on the same basis. The volatile half is the
// price, which is the half that made the static estimates wrong.
//
// ⚠ L1s ONLY — Arbitrum, Optimism and Base are deliberately NOT here.
// On OP-stack chains a transaction pays L2 execution gas PLUS an L1 data fee
// for posting the transaction to Ethereum, and the L1 component usually
// dominates. `eth_gasPrice` returns only the L2 execution price, so multiplying
// it by a gas limit understates the true cost — and understating a fee is the
// dangerous direction, since the user budgets too little and the withdrawal
// fails. A correct L2 number needs the GasPriceOracle predeploy
// (0x420...0F) and the Fjord FastLZ size model; until that is built, the honest
// static estimate stands. Arbitrum charges its L1 component through extra gas
// units rather than the price, so a fixed limit misses it there too.
//
// Rate limits are irrelevant at our cadence: one call per chain per revalidate
// window, server-side.

/** Typical gas units for an ERC-20-style token transfer. Still an assumption. */
export const EVM_TOKEN_TRANSFER_GAS = 65_000

interface EvmLiveGas {
  /** Tried in order; first success wins. */
  rpcUrls: string[]
  gasLimit: number
}

export const EVM_LIVE_GAS: Partial<Record<NetworkKey, EvmLiveGas>> = {
  erc20: {
    rpcUrls: ['https://ethereum-rpc.publicnode.com', 'https://ethereum.publicnode.com'],
    gasLimit: EVM_TOKEN_TRANSFER_GAS,
  },
  bep20: {
    rpcUrls: ['https://bsc-rpc.publicnode.com', 'https://bsc.publicnode.com'],
    gasLimit: EVM_TOKEN_TRANSFER_GAS,
  },
  polygon: {
    rpcUrls: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.publicnode.com'],
    gasLimit: EVM_TOKEN_TRANSFER_GAS,
  },
  avalanche: {
    rpcUrls: ['https://avalanche-c-chain-rpc.publicnode.com', 'https://avalanche.publicnode.com'],
    gasLimit: EVM_TOKEN_TRANSFER_GAS,
  },
}

/**
 * Hex wei gas price + gas limit -> fee in native token units. Pure so the
 * unit-conversion (the part that silently produces a fee 1e9x wrong) is tested
 * without a network.
 *
 * Returns null on anything malformed rather than a number — a gas price we
 * could not read must fall back to the static estimate, never to zero.
 */
export function feeFromGasPriceHex(hex: unknown, gasLimit: number): number | null {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]+$/.test(hex)) return null
  // Number, not BigInt: the project targets ES2017, and a realistic gas price
  // is many orders of magnitude below MAX_SAFE_INTEGER (100 gwei = 1e11 wei),
  // so precision is not at risk. An implausibly large reading is caught by the
  // sanity bound below rather than by the parse.
  const wei = Number(hex)
  if (!Number.isFinite(wei) || wei <= 0) return null
  const fee = (wei * gasLimit) / 1e18
  // Guard against an absurd reading (a malfunctioning node, or a chain whose
  // units we have wrong) turning into a headline dollar figure.
  if (!Number.isFinite(fee) || fee <= 0 || fee > 10) return null
  return fee
}

function evmGasProvider(network: NetworkKey, label: string): FeeProvider {
  const cfg = EVM_LIVE_GAS[network]!
  return {
    network,
    label,
    async fetchFee() {
      for (const url of cfg.rpcUrls) {
        try {
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] }),
            // Gas is the most volatile input on the page; 2 min keeps it current
            // while staying one request per chain per window.
            next: { revalidate: 120 },
          })
          if (!r.ok) continue
          const d = (await r.json()) as { result?: unknown }
          const fee = feeFromGasPriceHex(d?.result, cfg.gasLimit)
          if (fee !== null) return { network, feeNative: fee }
        } catch {
          // try the next endpoint
        }
      }
      return null
    },
  }
}

const bitcoinProvider: FeeProvider = {
  network: 'bitcoin',
  label: 'mempool.space',
  async fetchFee() {
    try {
      const r = await fetch('https://mempool.space/api/v1/fees/recommended', {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 },
      })
      if (!r.ok) return null
      const d = (await r.json()) as { halfHourFee?: number; fastestFee?: number; hourFee?: number }
      const satPerVbyte = d.halfHourFee ?? d.fastestFee ?? null
      if (!satPerVbyte) return null
      // Typical transfer ~250 vBytes.
      return { network: 'bitcoin', feeNative: (satPerVbyte * 250) / 1e8, meta: { btcSatPerVbyte: satPerVbyte } }
    } catch {
      return null
    }
  },
}

// Registered live fee providers. Networks with no provider stay `estimate`.
export const FEE_PROVIDERS: FeeProvider[] = [
  bitcoinProvider,
  evmGasProvider('erc20', 'publicnode eth_gasPrice'),
  evmGasProvider('bep20', 'publicnode eth_gasPrice'),
  evmGasProvider('polygon', 'publicnode eth_gasPrice'),
  evmGasProvider('avalanche', 'publicnode eth_gasPrice'),
]

async function fetchLivePrices(): Promise<{ prices: Record<string, number>; source: 'live' | 'fallback' }> {
  const prices = { ...FALLBACK_PRICES }
  // CoinGecko id → priceKey, for both gas tokens and auxiliary coins.
  const idToKey = new Map<string, string>()
  for (const g of Object.values(NETWORK_GAS)) idToKey.set(g.coingeckoId, g.priceKey)
  for (const [key, id] of Object.entries(AUX_PRICE_COINS)) idToKey.set(id, key)
  const ids = Array.from(idToKey.keys()).join(',')
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&precision=6`,
      { headers: { Accept: 'application/json' }, next: { revalidate: 300 } }
    )
    if (!r.ok) return { prices, source: 'fallback' }
    const data = (await r.json()) as Record<string, { usd: number }>
    let any = false
    for (const [id, key] of idToKey) {
      const usd = data[id]?.usd
      if (usd) {
        prices[key] = usd
        any = true
      }
    }
    return { prices, source: any ? 'live' : 'fallback' }
  } catch {
    return { prices, source: 'fallback' }
  }
}

/**
 * Computes fees for every network from the single source of truth. Fetches live
 * prices + runs all registered FeeProviders, all resilient (Promise.allSettled).
 */
export async function computeNetworkFees(): Promise<ComputedNetworkFees> {
  const [{ prices, source: priceSource }, ...providerResults] = await Promise.all([
    fetchLivePrices(),
    ...FEE_PROVIDERS.map((p) => p.fetchFee().catch(() => null)),
  ])

  // Collect successful live fee overrides + telemetry.
  const liveOverrides = new Map<NetworkKey, number>()
  let btcSatPerVbyte: number | null = null
  for (const res of providerResults) {
    if (!res) continue
    liveOverrides.set(res.network, res.feeNative)
    if (res.meta?.btcSatPerVbyte) btcSatPerVbyte = res.meta.btcSatPerVbyte
  }

  const fees = {} as Record<NetworkKey, NetworkFee>
  for (const key of Object.keys(NETWORK_GAS) as NetworkKey[]) {
    const info = NETWORK_GAS[key]
    const price = prices[info.priceKey] ?? FALLBACK_PRICES[info.priceKey] ?? 1
    const liveNative = liveOverrides.get(key)
    const feeNative = liveNative ?? info.native
    fees[key] = {
      feeNative,
      feeUsd: parseFloat((feeNative * price).toFixed(4)),
      nativeToken: info.token,
      // Live only when a provider supplied the gas amount. A static gas amount
      // priced live is still an estimate.
      source: liveNative != null ? 'live' : 'estimate',
    }
  }

  return { fees, prices, priceSource, btcSatPerVbyte, updatedAt: new Date().toISOString() }
}
