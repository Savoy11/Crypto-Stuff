// Maps the platform's internal asset ids to CoinGecko coin ids.
//
// Only coins whose CoinGecko id is known with confidence are listed here.
// Assets that are placeholders, fictional, or whose id we cannot verify are
// intentionally omitted: the live layer returns no data for them, and the UI
// renders "N/A" rather than inventing numbers.

export const COINGECKO_IDS: Record<string, string> = {
  // ── Stablecoins ──────────────────────────────────────────────
  usdc: 'usd-coin',
  usdt: 'tether',
  dai: 'dai',
  frax: 'frax',
  tusd: 'true-usd',
  pyusd: 'paypal-usd',
  usdp: 'paxos-standard',
  gusd: 'gemini-dollar',
  lusd: 'liquity-usd',
  busd: 'binance-usd',
  usde: 'ethena-usde',
  usdg: 'global-dollar',
  rlusd: 'ripple-usd',
  usdd: 'usdd',
  eurc: 'euro-coin',
  fdusd: 'first-digital-usd',
  usdy: 'ondo-us-dollar-yield',
  gho: 'gho',
  usd0: 'usual-usd',
  eurcv: 'eur-coinvertible',
  ampl: 'ampleforth',
  usdk: 'usdk',
  xsgd: 'xsgd',
  usdm: 'mountain-protocol-usdm',
  cusd: 'celo-dollar',
  vbusd: 'venus-busd',

  // ── Layer 1 / major assets ───────────────────────────────────
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  bnb: 'binancecoin',
  avax: 'avalanche-2',
  ada: 'cardano',
  xrp: 'ripple',
  dot: 'polkadot',
  pol: 'polygon-ecosystem-token',
  trx: 'tron',
  hype: 'hyperliquid',
  zec: 'zcash',
  xmr: 'monero',
  ton: 'the-open-network',
  bch: 'bitcoin-cash',
  memecore: 'memecore',
  hbar: 'hedera-hashgraph',
  ltc: 'litecoin',
  sui: 'sui',
  cro: 'crypto-com-chain',
  near: 'near',
  tao: 'bittensor',
  pi: 'pi-network',
  icp: 'internet-computer',
  etc: 'ethereum-classic',
  kas: 'kaspa',
  algo: 'algorand',
  flr: 'flare-networks',
  xdc: 'xdce-crowd-sale',
  fil: 'filecoin',
  apt: 'aptos',
  inj: 'injective-protocol',
  vet: 'vechain',
  sei: 'sei-network',
  tia: 'celestia',
  chz: 'chiliz',
  gno: 'gnosis',
  xtz: 'tezos',
  tel: 'telcoin',
  kaia: 'kaia',
  cfx: 'conflux-token',
  iota: 'iota',
  dcr: 'decred',
  theta: 'theta-token',
  atom: 'cosmos',
  doge: 'dogecoin',

  // ── DeFi ─────────────────────────────────────────────────────
  uni: 'uniswap',
  aave: 'aave',
  link: 'chainlink',
  mkr: 'maker',
  snx: 'havven', // Synthetix's CoinGecko id is the legacy project name
  crv: 'curve-dao-token',
  ldo: 'lido-dao',
  grt: 'the-graph',
}

// Reverse map: CoinGecko id → internal asset id (for decoding batch responses).
export const ASSET_ID_BY_COINGECKO: Record<string, string> = Object.fromEntries(
  Object.entries(COINGECKO_IDS).map(([assetId, cgId]) => [cgId, assetId])
)

export function coingeckoIdFor(assetId: string): string | undefined {
  return COINGECKO_IDS[assetId]
}

// Comma-separated list of every mapped CoinGecko id, for batch market calls.
export const ALL_COINGECKO_IDS = Object.values(COINGECKO_IDS)
