// Master list of every asset tracked by the platform.
// id = internal asset id (matches COINGECKO_IDS keys, route params, filter values)
// Add new assets here whenever they are added to coingeckoIds.ts.

export interface AssetEntry {
  id: string
  name: string
  symbol: string
  category: 'stablecoin' | 'l1' | 'defi' | 'other'
}

export const ASSET_LIST: AssetEntry[] = [
  // ── Stablecoins ──────────────────────────────────────────────────────────────
  { id: 'usdt',   name: 'Tether',               symbol: 'USDT',   category: 'stablecoin' },
  { id: 'usdc',   name: 'USD Coin',              symbol: 'USDC',   category: 'stablecoin' },
  { id: 'dai',    name: 'DAI',                   symbol: 'DAI',    category: 'stablecoin' },
  { id: 'frax',   name: 'Frax',                  symbol: 'FRAX',   category: 'stablecoin' },
  { id: 'tusd',   name: 'TrueUSD',               symbol: 'TUSD',   category: 'stablecoin' },
  { id: 'pyusd',  name: 'PayPal USD',            symbol: 'PYUSD',  category: 'stablecoin' },
  { id: 'usdp',   name: 'Pax Dollar',            symbol: 'USDP',   category: 'stablecoin' },
  { id: 'gusd',   name: 'Gemini Dollar',         symbol: 'GUSD',   category: 'stablecoin' },
  { id: 'lusd',   name: 'Liquity USD',           symbol: 'LUSD',   category: 'stablecoin' },
  { id: 'busd',   name: 'Binance USD',           symbol: 'BUSD',   category: 'stablecoin' },
  { id: 'usde',   name: 'Ethena USDe',           symbol: 'USDe',   category: 'stablecoin' },
  { id: 'usdg',   name: 'Global Dollar',         symbol: 'USDG',   category: 'stablecoin' },
  { id: 'rlusd',  name: 'Ripple USD',            symbol: 'RLUSD',  category: 'stablecoin' },
  { id: 'usdd',   name: 'USDD',                  symbol: 'USDD',   category: 'stablecoin' },
  { id: 'eurc',   name: 'Euro Coin',             symbol: 'EURC',   category: 'stablecoin' },
  { id: 'fdusd',  name: 'First Digital USD',     symbol: 'FDUSD',  category: 'stablecoin' },
  { id: 'usdy',   name: 'Ondo US Dollar Yield',  symbol: 'USDY',   category: 'stablecoin' },
  { id: 'gho',    name: 'GHO',                   symbol: 'GHO',    category: 'stablecoin' },
  { id: 'usd0',   name: 'Usual USD',             symbol: 'USD0',   category: 'stablecoin' },
  { id: 'ampl',   name: 'Ampleforth',            symbol: 'AMPL',   category: 'stablecoin' },
  { id: 'cusd',   name: 'Celo Dollar',           symbol: 'cUSD',   category: 'stablecoin' },
  { id: 'usdm',   name: 'Mountain Protocol USDM', symbol: 'USDM',  category: 'stablecoin' },

  // ── Layer 1 / major ──────────────────────────────────────────────────────────
  { id: 'btc',    name: 'Bitcoin',               symbol: 'BTC',    category: 'l1' },
  { id: 'eth',    name: 'Ethereum',              symbol: 'ETH',    category: 'l1' },
  { id: 'sol',    name: 'Solana',                symbol: 'SOL',    category: 'l1' },
  { id: 'bnb',    name: 'BNB',                   symbol: 'BNB',    category: 'l1' },
  { id: 'avax',   name: 'Avalanche',             symbol: 'AVAX',   category: 'l1' },
  { id: 'ada',    name: 'Cardano',               symbol: 'ADA',    category: 'l1' },
  { id: 'xrp',    name: 'XRP',                   symbol: 'XRP',    category: 'l1' },
  { id: 'dot',    name: 'Polkadot',              symbol: 'DOT',    category: 'l1' },
  { id: 'pol',    name: 'Polygon',               symbol: 'POL',    category: 'l1' },
  { id: 'trx',    name: 'Tron',                  symbol: 'TRX',    category: 'l1' },
  { id: 'ton',    name: 'Toncoin',               symbol: 'TON',    category: 'l1' },
  { id: 'bch',    name: 'Bitcoin Cash',          symbol: 'BCH',    category: 'l1' },
  { id: 'ltc',    name: 'Litecoin',              symbol: 'LTC',    category: 'l1' },
  { id: 'xmr',    name: 'Monero',                symbol: 'XMR',    category: 'l1' },
  { id: 'zec',    name: 'Zcash',                 symbol: 'ZEC',    category: 'l1' },
  { id: 'hbar',   name: 'Hedera',                symbol: 'HBAR',   category: 'l1' },
  { id: 'sui',    name: 'Sui',                   symbol: 'SUI',    category: 'l1' },
  { id: 'near',   name: 'NEAR Protocol',         symbol: 'NEAR',   category: 'l1' },
  { id: 'apt',    name: 'Aptos',                 symbol: 'APT',    category: 'l1' },
  { id: 'algo',   name: 'Algorand',              symbol: 'ALGO',   category: 'l1' },
  { id: 'atom',   name: 'Cosmos',                symbol: 'ATOM',   category: 'l1' },
  { id: 'icp',    name: 'Internet Computer',     symbol: 'ICP',    category: 'l1' },
  { id: 'fil',    name: 'Filecoin',              symbol: 'FIL',    category: 'l1' },
  { id: 'vet',    name: 'VeChain',               symbol: 'VET',    category: 'l1' },
  { id: 'xtz',    name: 'Tezos',                 symbol: 'XTZ',    category: 'l1' },
  { id: 'etc',    name: 'Ethereum Classic',      symbol: 'ETC',    category: 'l1' },
  { id: 'theta',  name: 'Theta Network',         symbol: 'THETA',  category: 'l1' },
  { id: 'iota',   name: 'IOTA',                  symbol: 'IOTA',   category: 'l1' },
  { id: 'tao',    name: 'Bittensor',             symbol: 'TAO',    category: 'l1' },
  { id: 'kas',    name: 'Kaspa',                 symbol: 'KAS',    category: 'l1' },
  { id: 'sei',    name: 'Sei',                   symbol: 'SEI',    category: 'l1' },
  { id: 'tia',    name: 'Celestia',              symbol: 'TIA',    category: 'l1' },
  { id: 'inj',    name: 'Injective',             symbol: 'INJ',    category: 'l1' },
  { id: 'cro',    name: 'Cronos',                symbol: 'CRO',    category: 'l1' },
  { id: 'hype',   name: 'Hyperliquid',           symbol: 'HYPE',   category: 'l1' },
  { id: 'flr',    name: 'Flare',                 symbol: 'FLR',    category: 'l1' },
  { id: 'kaia',   name: 'Kaia',                  symbol: 'KAIA',   category: 'l1' },
  { id: 'cfx',    name: 'Conflux',               symbol: 'CFX',    category: 'l1' },
  { id: 'chz',    name: 'Chiliz',                symbol: 'CHZ',    category: 'l1' },
  { id: 'dcr',    name: 'Decred',                symbol: 'DCR',    category: 'l1' },
  { id: 'gno',    name: 'Gnosis',                symbol: 'GNO',    category: 'l1' },
  { id: 'tel',    name: 'Telcoin',               symbol: 'TEL',    category: 'l1' },
  { id: 'xdc',    name: 'XDC Network',           symbol: 'XDC',    category: 'l1' },
  { id: 'pi',     name: 'Pi Network',            symbol: 'PI',     category: 'l1' },

  // ── DeFi ─────────────────────────────────────────────────────────────────────
  { id: 'uni',    name: 'Uniswap',               symbol: 'UNI',    category: 'defi' },
  { id: 'aave',   name: 'Aave',                  symbol: 'AAVE',   category: 'defi' },
  { id: 'link',   name: 'Chainlink',             symbol: 'LINK',   category: 'defi' },
  { id: 'mkr',    name: 'Maker',                 symbol: 'MKR',    category: 'defi' },
  { id: 'snx',    name: 'Synthetix',             symbol: 'SNX',    category: 'defi' },
  { id: 'crv',    name: 'Curve DAO',             symbol: 'CRV',    category: 'defi' },
  { id: 'ldo',    name: 'Lido DAO',              symbol: 'LDO',    category: 'defi' },
  { id: 'grt',    name: 'The Graph',             symbol: 'GRT',    category: 'defi' },
  { id: 'doge',   name: 'Dogecoin',              symbol: 'DOGE',   category: 'other' },
]

// Sorted alphabetically by name for display in dropdowns.
export const ASSET_LIST_SORTED = [...ASSET_LIST].sort((a, b) => a.name.localeCompare(b.name))
