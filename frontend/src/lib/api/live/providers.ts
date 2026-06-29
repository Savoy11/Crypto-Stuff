import fs from 'fs'
import path from 'path'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProviderCategory = 'price' | 'news' | 'social'
export type ProviderStatus = 'active' | 'error' | 'unconfigured' | 'disabled'
export type AuthMethod = 'none' | 'header' | 'query' | 'bearer'
export type FeedFormat = 'rss' | 'atom' | 'json-news' | 'json-price' | 'json-social' | 'graphql' | 'websocket' | 'native'

export interface CustomProviderDef {
  /** Unique id — generated on creation, e.g. "custom-1718000000000" */
  id: string
  name: string
  category: ProviderCategory
  description: string
  isCustom: true
  /** Base URL or full endpoint URL. May contain {asset} placeholder. */
  url: string
  authMethod: AuthMethod
  /** Header name when authMethod === 'header' (e.g. "X-Api-Key") */
  authHeaderName?: string
  /** Query param name when authMethod === 'query' (e.g. "apikey") */
  authQueryParam?: string
  /** Expected response format */
  format: FeedFormat
  /** JSON path to the articles array when format === 'json-news' (e.g. "data.articles") */
  jsonArrayPath?: string
  /** Field mappings when format === 'json-news': {headline, url, publishedAt, source?, summary?} */
  jsonFieldMap?: Record<string, string>
}

export interface BuiltinProviderDef {
  id: string
  name: string
  category: ProviderCategory
  description: string
  features: string[]
  requiresKey: boolean
  keyUrl: string
  freeTierLabel?: string
  priority?: number
  isCustom?: false
}

export type ProviderDef = BuiltinProviderDef | CustomProviderDef

export interface ProviderConfig {
  apiKey?: string
  enabled: boolean
  lastTested?: string
  lastStatus?: ProviderStatus
  lastError?: string
}

export interface ActiveProvider extends BuiltinProviderDef {
  config: ProviderConfig
  status: ProviderStatus
}

export interface ActiveCustomProvider extends CustomProviderDef {
  config: ProviderConfig
  status: ProviderStatus
}

export type AnyActiveProvider = ActiveProvider | ActiveCustomProvider

// ─── Built-in provider definitions ───────────────────────────────────────────

export const BUILTIN_PROVIDERS: BuiltinProviderDef[] = [
  // ── Price ──
  {
    id: 'coingecko',
    name: 'CoinGecko',
    category: 'price',
    description: 'Price, market cap, volume, and historical chart data for 10,000+ assets.',
    features: ['Real-time prices', 'Market cap & volume', 'Price history charts', 'Circulating supply'],
    requiresKey: false,
    freeTierLabel: '30 calls/min — already active',
    keyUrl: 'https://www.coingecko.com/en/api/pricing',
    priority: 1,
  },
  {
    id: 'coinmarketcap',
    name: 'CoinMarketCap',
    category: 'price',
    description: 'Industry-standard market data. Pro tiers offer real-time streaming and higher rate limits.',
    features: ['Real-time prices', 'Market cap & volume', 'Price history', 'Dominance data'],
    requiresKey: true,
    keyUrl: 'https://coinmarketcap.com/api/',
    priority: 2,
  },
  {
    id: 'binance',
    name: 'Binance',
    category: 'price',
    description: 'Exchange-native tick data. Public endpoints require no key; WebSocket streams available.',
    features: ['Real-time tick prices', '24h OHLCV', 'Order book depth', 'Trade history'],
    requiresKey: false,
    freeTierLabel: 'Public endpoints — no key needed',
    keyUrl: 'https://www.binance.com/en/binance-api',
    priority: 3,
  },
  // ── Social ──
  {
    id: 'reddit',
    name: 'Reddit',
    category: 'social',
    description: 'Public Reddit posts from r/CryptoCurrency, r/stablecoins, r/defi, and related subreddits. No API key required.',
    features: ['Post sentiment', 'Upvote ratio', 'Community discussion', 'Subreddit coverage'],
    requiresKey: false,
    freeTierLabel: 'Public API — no key needed',
    keyUrl: 'https://www.reddit.com/wiki/api',
    priority: 1,
  },
  {
    id: 'lunarcrush',
    name: 'LunarCrush',
    category: 'social',
    description: 'Crypto-native social analytics. Galaxy Score, social volume, and sentiment across Twitter, Reddit, and more.',
    features: ['Galaxy Score', 'Social volume', 'Sentiment score', 'Influencer activity'],
    requiresKey: true,
    keyUrl: 'https://lunarcrush.com/developers/api/authentication',
    freeTierLabel: 'Free tier available',
  },
  {
    id: 'santiment',
    name: 'Santiment',
    category: 'social',
    description: 'On-chain and social data for crypto assets. Social dominance, social volume, and developer activity metrics.',
    features: ['Social dominance', 'Social volume', 'Dev activity', 'Weighted sentiment'],
    requiresKey: true,
    keyUrl: 'https://santiment.net/api/',
  },
  // ── News ──
  {
    id: 'cryptopanic',
    name: 'CryptoPanic',
    category: 'news',
    description: 'Aggregates 50+ crypto news sources with per-asset tagging and sentiment scoring. Free API key available on signup.',
    features: ['Asset-tagged articles', 'Sentiment scoring', 'Breaking news flags', 'Source attribution'],
    requiresKey: true,
    freeTierLabel: 'Free tier available — sign up to get a key',
    keyUrl: 'https://cryptopanic.com/developers/api/',
  },
  {
    id: 'messari',
    name: 'Messari',
    category: 'news',
    description: 'Institutional-grade research, news, and on-chain analytics.',
    features: ['Editorial research', 'Protocol updates', 'Governance news', 'On-chain metrics'],
    requiresKey: true,
    keyUrl: 'https://messari.io/api',
  },
  {
    id: 'newsapi',
    name: 'NewsAPI',
    category: 'news',
    description: 'Searches 150,000+ news sources by keyword. Returns headlines from mainstream financial and crypto media — great for catching coverage of your favorite sites.',
    features: ['150k+ sources', 'Keyword search', 'Source filtering', 'Full article metadata'],
    requiresKey: true,
    freeTierLabel: 'Free tier: 100 requests/day',
    keyUrl: 'https://newsapi.org/pricing',
  },
  {
    id: 'gnews',
    name: 'GNews',
    category: 'news',
    description: 'Google News-backed aggregator. Search across thousands of news sources by keyword or topic — covers any website indexed by Google News.',
    features: ['Google News index', 'Keyword & topic search', 'Any website coverage', 'Language filtering'],
    requiresKey: true,
    freeTierLabel: 'Free tier: 100 requests/day',
    keyUrl: 'https://gnews.io/pricing',
  },
]

// ─── Persistent config file ───────────────────────────────────────────────────

const CONFIG_PATH = path.join(process.cwd(), '.provider-config.json')

interface ConfigFile {
  /** Per-provider runtime config (api key, enabled, test results) */
  configs: Record<string, ProviderConfig>
  /** User-defined custom providers */
  customProviders: CustomProviderDef[]
}

function readConfigFile(): ConfigFile {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
      return {
        configs: raw.configs ?? raw, // back-compat: old files stored only configs at top level
        customProviders: raw.customProviders ?? [],
      }
    }
  } catch {}
  return { configs: {}, customProviders: [] }
}

function writeConfigFile(file: ConfigFile): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(file, null, 2), 'utf8')
  } catch (e) {
    console.error('[providers] Failed to write config file:', e)
  }
}

// ─── Env-var baseline ─────────────────────────────────────────────────────────

function envKey(providerId: string): string | undefined {
  const map: Record<string, string> = {
    coingecko: 'COINGECKO_API_KEY',
    coinmarketcap: 'COINMARKETCAP_API_KEY',
    binance: 'BINANCE_API_KEY',
    cryptopanic: 'CRYPTOPANIC_API_KEY',
    messari: 'MESSARI_API_KEY',
    newsapi: 'NEWSAPI_API_KEY',
    gnews: 'GNEWS_API_KEY',
    lunarcrush: 'LUNARCRUSH_API_KEY',
    santiment: 'SANTIMENT_API_KEY',
  }
  const k = map[providerId]
  if (!k) return undefined
  const val = process.env[k]
  return val && val !== `your-${providerId}-api-key` ? val : undefined
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** All providers (built-in + custom) with their merged runtime config. */
export function getAllProviders(): AnyActiveProvider[] {
  const file = readConfigFile()
  const results: AnyActiveProvider[] = []

  // Built-in providers
  for (const def of BUILTIN_PROVIDERS) {
    const cfg = file.configs[def.id] ?? {}
    const apiKey = cfg.apiKey ?? envKey(def.id)
    const enabled = cfg.enabled ?? !def.requiresKey
    let status: ProviderStatus = 'unconfigured'
    if (!enabled) status = 'disabled'
    else if (cfg.lastStatus === 'error') status = 'error'
    else if (apiKey || !def.requiresKey) status = 'active'
    results.push({
      ...def,
      config: { enabled, apiKey, lastTested: cfg.lastTested, lastStatus: cfg.lastStatus, lastError: cfg.lastError },
      status,
    })
  }

  // Custom providers
  for (const def of file.customProviders) {
    const cfg = file.configs[def.id] ?? {}
    const apiKey = cfg.apiKey
    const enabled = cfg.enabled ?? true
    let status: ProviderStatus = 'unconfigured'
    if (!enabled) status = 'disabled'
    else if (cfg.lastStatus === 'error') status = 'error'
    else status = 'active'
    results.push({
      ...def,
      config: { enabled, apiKey, lastTested: cfg.lastTested, lastStatus: cfg.lastStatus, lastError: cfg.lastError },
      status,
    })
  }

  return results
}

/** Returns the raw custom provider definitions from config. */
export function getCustomProviders(): CustomProviderDef[] {
  return readConfigFile().customProviders
}

/** Add a new custom provider. */
export function addCustomProvider(def: CustomProviderDef): void {
  const file = readConfigFile()
  file.customProviders = [...file.customProviders.filter((p) => p.id !== def.id), def]
  file.configs[def.id] = { enabled: true }
  writeConfigFile(file)
}

/** Remove a custom provider by id. */
export function removeCustomProvider(providerId: string): void {
  const file = readConfigFile()
  file.customProviders = file.customProviders.filter((p) => p.id !== providerId)
  delete file.configs[providerId]
  writeConfigFile(file)
}

/** Update an existing custom provider definition (preserves runtime config / API key). */
export function updateCustomProvider(providerId: string, patch: Omit<CustomProviderDef, 'id' | 'isCustom'>): void {
  const file = readConfigFile()
  file.customProviders = file.customProviders.map((p) =>
    p.id === providerId ? { ...p, ...patch, id: providerId, isCustom: true } : p
  )
  writeConfigFile(file)
}

/** Enabled price providers ordered by priority. */
export function getPriceProviders(): AnyActiveProvider[] {
  return getAllProviders()
    .filter((p) => p.category === 'price' && p.status === 'active')
    .sort((a, b) => ((a as BuiltinProviderDef).priority ?? 99) - ((b as BuiltinProviderDef).priority ?? 99))
}

/** Enabled news providers. */
export function getNewsProviders(): AnyActiveProvider[] {
  return getAllProviders().filter((p) => p.category === 'news' && p.status === 'active')
}

/** Enabled social providers. */
export function getSocialProviders(): AnyActiveProvider[] {
  return getAllProviders().filter((p) => p.category === 'social' && p.status === 'active')
}

/** Save runtime config update for any provider (built-in or custom). */
export function saveProviderConfig(providerId: string, update: Partial<ProviderConfig>): void {
  const file = readConfigFile()
  file.configs[providerId] = { ...(file.configs[providerId] ?? {}), ...update }
  writeConfigFile(file)
}
