import fs from 'fs'
import path from 'path'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProviderCategory = 'price' | 'news' | 'social' | 'video' | 'llm'
/** Which side of the suite a provider feeds. Absent = 'crypto' (back-compat with stored configs). */
export type ProviderMarket = 'crypto' | 'equities'
export type ProviderStatus = 'active' | 'error' | 'unconfigured' | 'disabled'
export type AuthMethod = 'none' | 'header' | 'query' | 'bearer'
export type FeedFormat = 'rss' | 'atom' | 'youtube' | 'json-news' | 'json-price' | 'json-social' | 'json-quote' | 'json-ohlcv' | 'graphql' | 'websocket' | 'native'

export interface CustomProviderDef {
  /** Unique id — generated on creation, e.g. "custom-1718000000000" */
  id: string
  name: string
  category: ProviderCategory
  market?: ProviderMarket
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
  market?: ProviderMarket
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
  /** Utilization tracking — written by data routes after each real fetch */
  lastFetchAt?: string
  lastFetchCount?: number
  lastFetchError?: string
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
    features: ['Post sentiment', 'Community discussion', 'Subreddit coverage'],
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
    description: 'Aggregates 50+ crypto news sources with per-asset tagging and sentiment scoring. Requires a paid API key — the free tier was discontinued in April 2026.',
    features: ['Asset-tagged articles', 'Sentiment scoring', 'Breaking news flags', 'Source attribution'],
    requiresKey: true,
    freeTierLabel: 'Paid plan required (free tier ended Apr 2026)',
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

  // ── Equity quotes (market: 'equities') ──
  // Providers are tried in priority order; the first that returns quotes wins.
  // Keyed providers only enter the ladder once a key is saved (or env var set).
  {
    id: 'fmp',
    name: 'Financial Modeling Prep',
    category: 'price',
    market: 'equities',
    description: 'Richest equity source: batched quotes with market cap and true previous-close change, plus price history and the earnings/economic calendar.',
    features: ['Batch quotes', 'Market cap', 'Change vs prev close', 'Price history', 'Earnings calendar'],
    requiresKey: true,
    freeTierLabel: 'Free tier: 250 requests/day',
    keyUrl: 'https://site.financialmodelingprep.com/developer/docs/pricing',
    priority: 1,
  },
  {
    id: 'finnhub',
    name: 'Finnhub',
    category: 'price',
    market: 'equities',
    description: 'Real-time quotes fetched per symbol. Free tier allows 60 requests/minute — used for batches up to 60 symbols.',
    features: ['Real-time quotes', 'Change vs prev close', 'Per-symbol precision'],
    requiresKey: true,
    freeTierLabel: 'Free tier: 60 requests/min',
    keyUrl: 'https://finnhub.io/register',
    priority: 2,
  },
  {
    id: 'twelve-data',
    name: 'Twelve Data',
    category: 'price',
    market: 'equities',
    description: 'Quotes and time series. Free tier allows 8 requests/minute, so it serves small batches (detail pages, compare) and defers large ones.',
    features: ['Quotes', 'Change vs prev close', 'Volume'],
    requiresKey: true,
    freeTierLabel: 'Free tier: 8 requests/min',
    keyUrl: 'https://twelvedata.com/pricing',
    priority: 3,
  },
  {
    id: 'tiingo',
    name: 'Tiingo',
    category: 'price',
    market: 'equities',
    description: 'IEX-sourced batch quotes with previous close. Generous free tier for personal use.',
    features: ['Batch quotes', 'IEX prices', 'Change vs prev close'],
    requiresKey: true,
    freeTierLabel: 'Free tier: 1,000 requests/day',
    keyUrl: 'https://www.tiingo.com/about/pricing',
    priority: 4,
  },
  {
    id: 'alpha-vantage',
    name: 'Alpha Vantage',
    category: 'price',
    market: 'equities',
    description: 'Global quotes fetched per symbol. Free tier is only 25 requests/day, so it serves small batches only — best as a spot-check source.',
    features: ['Global quotes', 'Change vs prev close'],
    requiresKey: true,
    freeTierLabel: 'Free tier: 25 requests/day',
    keyUrl: 'https://www.alphavantage.co/support/#api-key',
    priority: 5,
  },
  {
    id: 'yahoo-finance',
    name: 'Yahoo Finance',
    category: 'price',
    market: 'equities',
    description: 'Batched spark quotes covering stocks, ETFs, and mutual funds. The keyless workhorse — on by default.',
    features: ['Batch quotes', 'Stocks + ETFs + mutual funds', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://finance.yahoo.com',
    priority: 6,
  },

  // ── Equity news (market: 'equities') ── all active feeds run in parallel
  {
    id: 'yahoo-news',
    name: 'Yahoo Finance News',
    category: 'news',
    market: 'equities',
    description: 'Yahoo Finance headlines, including the only free per-ticker RSS feed — powers symbol-specific news on detail pages.',
    features: ['Market headlines', 'Per-ticker feeds', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://finance.yahoo.com/news',
    priority: 1,
  },
  {
    id: 'marketwatch',
    name: 'MarketWatch',
    category: 'news',
    market: 'equities',
    description: 'Dow Jones-owned market coverage — top stories RSS feed.',
    features: ['Top stories', 'Macro coverage', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.marketwatch.com',
    priority: 2,
  },
  {
    id: 'cnbc',
    name: 'CNBC',
    category: 'news',
    market: 'equities',
    description: 'CNBC markets desk — breaking business news RSS feed.',
    features: ['Breaking news', 'Markets desk', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.cnbc.com/markets/',
    priority: 3,
  },

  // ── Video (category: 'video') ── keyless YouTube channel feeds
  // YouTube publishes per-channel Atom at /feeds/videos.xml?channel_id=…, no key
  // and no quota. Channel ids live in /live-data/videos/route.ts, mirroring how
  // market-news keeps its feed URLs route-side. Every id below was verified to
  // resolve before being added — do the same for any new entry.
  {
    id: 'yt-bloomberg',
    name: 'Bloomberg Television',
    category: 'video',
    market: 'equities',
    description: 'Bloomberg TV segments — markets, macro, and company coverage.',
    features: ['Market coverage', 'Macro interviews', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@markets',
    priority: 1,
  },
  {
    id: 'yt-cnbc',
    name: 'CNBC Television',
    category: 'video',
    market: 'equities',
    description: 'CNBC broadcast clips — earnings reaction, interviews, market open/close.',
    features: ['Earnings reaction', 'Interviews', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@CNBCtelevision',
    priority: 2,
  },
  {
    id: 'yt-yahoo-finance',
    name: 'Yahoo Finance',
    category: 'video',
    market: 'equities',
    description: 'Yahoo Finance video desk — market recaps and company analysis.',
    features: ['Market recaps', 'Company analysis', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@YahooFinance',
    priority: 3,
  },
  {
    id: 'yt-ft',
    name: 'Financial Times',
    category: 'video',
    market: 'equities',
    description: 'FT video explainers on markets, economics, and business.',
    features: ['Explainers', 'Global markets', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@FinancialTimes',
    priority: 4,
  },
  {
    id: 'yt-wsj',
    name: 'The Wall Street Journal',
    category: 'video',
    market: 'equities',
    description: 'WSJ video coverage of markets, business, and economics.',
    features: ['Business coverage', 'Explainers', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@WSJ',
    priority: 5,
  },
  {
    id: 'yt-coin-bureau',
    name: 'Coin Bureau',
    category: 'video',
    market: 'crypto',
    description: 'Long-form crypto research and protocol breakdowns.',
    features: ['Protocol research', 'Market outlook', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@CoinBureau',
    priority: 1,
  },
  {
    id: 'yt-bankless',
    name: 'Bankless',
    category: 'video',
    market: 'crypto',
    description: 'DeFi and Ethereum ecosystem interviews and analysis.',
    features: ['DeFi coverage', 'Founder interviews', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@Bankless',
    priority: 2,
  },
  {
    id: 'yt-benjamin-cowen',
    name: 'Benjamin Cowen',
    category: 'video',
    market: 'crypto',
    description: 'Quantitative crypto market analysis and cycle work.',
    features: ['Quant analysis', 'Cycle models', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@intothecryptoverse',
    priority: 3,
  },
  {
    id: 'yt-altcoin-daily',
    name: 'Altcoin Daily',
    category: 'video',
    market: 'crypto',
    description: 'Daily crypto news roundups and altcoin commentary.',
    features: ['Daily roundups', 'Altcoin coverage', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@AltcoinDaily',
    priority: 4,
  },

  {
    id: 'yt-cnbc-intl',
    name: 'CNBC International',
    category: 'video',
    market: 'equities',
    description: 'CNBC’s international desk — Europe and Asia market coverage.',
    features: ['Global markets', 'Europe/Asia desks', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@CNBCi',
    priority: 6,
  },
  {
    id: 'yt-reuters',
    name: 'Reuters',
    category: 'video',
    market: 'equities',
    description: 'Reuters video desk — breaking business and world coverage.',
    features: ['Breaking news', 'Global wire', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@Reuters',
    priority: 7,
  },
  {
    id: 'yt-economist',
    name: 'The Economist',
    category: 'video',
    market: 'equities',
    description: 'Economist explainers on economics, policy, and global business.',
    features: ['Explainers', 'Policy analysis', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@TheEconomist',
    priority: 8,
  },
  {
    id: 'yt-unchained',
    name: 'Unchained',
    category: 'video',
    market: 'crypto',
    description: 'Laura Shin’s crypto interviews and industry reporting.',
    features: ['Long-form interviews', 'Industry reporting', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@UnchainedCrypto',
    priority: 5,
  },
  {
    id: 'yt-the-defiant',
    name: 'The Defiant',
    category: 'video',
    market: 'crypto',
    description: 'DeFi-focused news, protocol coverage, and interviews.',
    features: ['DeFi news', 'Protocol coverage', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@TheDefiant',
    priority: 6,
  },
  {
    id: 'yt-crypto-banter',
    name: 'Crypto Banter',
    category: 'video',
    market: 'crypto',
    description: 'Daily live crypto market commentary and trading discussion.',
    features: ['Daily live shows', 'Market commentary', 'No key needed'],
    requiresKey: false,
    freeTierLabel: 'Keyless — already active',
    keyUrl: 'https://www.youtube.com/@CryptoBanterGroup',
    priority: 7,
  },

  // Keyed, and deliberately not part of the channel merge: this one powers
  // on-demand YouTube-wide keyword search rather than a standing feed. The
  // Data API v3 charges 100 quota units per search against a 10,000/day free
  // allowance (~100 searches/day), so the Videos page only calls it on an
  // explicit user action, never per keystroke.
  {
    id: 'youtube-search',
    name: 'YouTube Search',
    category: 'video',
    market: 'equities',
    description: 'Search all of YouTube by keyword, beyond the standing channel feeds. Data API v3 — 100 quota units per search against a 10,000/day free allowance.',
    features: ['Whole-of-YouTube search', 'Relevance or date ordering', 'Quota-limited'],
    requiresKey: true,
    freeTierLabel: 'Free tier: ~100 searches/day',
    keyUrl: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
    priority: 10,
  },

  // ── Equity social (market: 'equities') ── all active providers run in parallel
  {
    id: 'reddit-stocks',
    name: 'Reddit Finance',
    category: 'social',
    market: 'equities',
    description: 'Public posts from r/stocks, r/investing, r/StockMarket, and r/wallstreetbets with cashtag detection and keyword sentiment.',
    features: ['Post sentiment', 'Cashtag detection', 'Four finance subreddits'],
    requiresKey: false,
    freeTierLabel: 'Public API — no key needed',
    keyUrl: 'https://www.reddit.com/wiki/api',
    priority: 1,
  },
  {
    id: 'stocktwits',
    name: 'StockTwits',
    category: 'social',
    market: 'equities',
    description: 'Symbol streams with trader-declared Bullish/Bearish sentiment — the equity-native social feed.',
    features: ['Declared sentiment', 'Per-symbol streams', 'Trending symbols'],
    requiresKey: false,
    freeTierLabel: 'Public API — no key needed',
    keyUrl: 'https://stocktwits.com',
    priority: 2,
  },

  // ── AI / LLM providers (category 'llm') ──
  // Keys entered here (or via env var) power the AI Agents. Provider ids match
  // the agent ProviderId union so the runner resolves keys with getProviderKey().
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    category: 'llm',
    description: 'Claude models — the default for every CAEP agent (App Assistant, Research, Data Scraper, Pump Report, and the equity agents).',
    features: ['Tool use', 'Long context', 'Strong reasoning'],
    requiresKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    freeTierLabel: 'Powers the default agents',
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    category: 'llm',
    description: 'GPT-4o / o-series models. Select per agent in the AI Agents tab once a key is set.',
    features: ['Tool use', 'Vision', 'Reasoning models'],
    requiresKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    category: 'llm',
    description: 'Gemini models via the OpenAI-compatible endpoint.',
    features: ['Long context', 'Multimodal'],
    requiresKey: true,
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'groq',
    name: 'Groq',
    category: 'llm',
    description: 'Ultra-fast inference for open models (LLaMA, Mixtral).',
    features: ['Very low latency', 'Open models'],
    requiresKey: true,
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    category: 'llm',
    description: 'Grok models via the OpenAI-compatible endpoint.',
    features: ['Tool use', 'Reasoning'],
    requiresKey: true,
    keyUrl: 'https://console.x.ai',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    category: 'llm',
    description: 'DeepSeek chat and reasoner models at low cost.',
    features: ['Low cost', 'Reasoning model'],
    requiresKey: true,
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    category: 'llm',
    description: 'Sonar models with built-in web search.',
    features: ['Built-in web search', 'Citations'],
    requiresKey: true,
    keyUrl: 'https://www.perplexity.ai/settings/api',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    category: 'llm',
    description: 'Mistral Large / Small and Codestral models.',
    features: ['Tool use', 'Code'],
    requiresKey: true,
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'together',
    name: 'Together AI',
    category: 'llm',
    description: 'Hosted open models (LLaMA, Qwen, Mixtral) via the OpenAI-compatible endpoint.',
    features: ['Open models', 'Large catalog'],
    requiresKey: true,
    keyUrl: 'https://api.together.xyz/settings/api-keys',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    category: 'llm',
    description: 'Command models via the compatibility endpoint.',
    features: ['Tool use', 'RAG-tuned'],
    requiresKey: true,
    keyUrl: 'https://dashboard.cohere.com/api-keys',
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
    fmp: 'FMP_API_KEY',
    finnhub: 'FINNHUB_API_KEY',
    'twelve-data': 'TWELVE_DATA_API_KEY',
    tiingo: 'TIINGO_API_KEY',
    'alpha-vantage': 'ALPHA_VANTAGE_API_KEY',
    // LLM providers (agent keys)
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
    groq: 'GROQ_API_KEY',
    xai: 'XAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    together: 'TOGETHER_API_KEY',
    cohere: 'COHERE_API_KEY',
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
    // Keyed providers default to enabled once a key exists (UI or env var);
    // an explicit toggle-off in config always wins.
    const enabled = cfg.enabled ?? (!def.requiresKey || apiKey != null)
    let status: ProviderStatus = 'unconfigured'
    if (!enabled) status = 'disabled'
    else if (cfg.lastStatus === 'error') status = 'error'
    else if (apiKey || !def.requiresKey) status = 'active'
    results.push({
      ...def,
      config: {
        enabled, apiKey,
        lastTested: cfg.lastTested, lastStatus: cfg.lastStatus, lastError: cfg.lastError,
        lastFetchAt: cfg.lastFetchAt, lastFetchCount: cfg.lastFetchCount, lastFetchError: cfg.lastFetchError,
      },
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
      config: {
        enabled, apiKey,
        lastTested: cfg.lastTested, lastStatus: cfg.lastStatus, lastError: cfg.lastError,
        lastFetchAt: cfg.lastFetchAt, lastFetchCount: cfg.lastFetchCount, lastFetchError: cfg.lastFetchError,
      },
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

const marketOf = (p: { market?: ProviderMarket }): ProviderMarket => p.market ?? 'crypto'

/** Enabled crypto price providers ordered by priority. */
export function getPriceProviders(): AnyActiveProvider[] {
  return getAllProviders()
    .filter((p) => p.category === 'price' && marketOf(p) === 'crypto' && p.status === 'active')
    .sort((a, b) => ((a as BuiltinProviderDef).priority ?? 99) - ((b as BuiltinProviderDef).priority ?? 99))
}

/** Enabled crypto news providers. */
export function getNewsProviders(): AnyActiveProvider[] {
  return getAllProviders().filter((p) => p.category === 'news' && marketOf(p) === 'crypto' && p.status === 'active')
}

/** Enabled crypto social providers. */
export function getSocialProviders(): AnyActiveProvider[] {
  return getAllProviders().filter((p) => p.category === 'social' && marketOf(p) === 'crypto' && p.status === 'active')
}

/**
 * Equity quote ladder: enabled equity price providers in try-order.
 * User-added custom quote feeds run FIRST (adding one is an explicit request
 * to use it), then built-ins by priority. fetchSecurityQuotes walks this list
 * and the first provider that returns quotes serves the request.
 */
export function getEquityQuoteProviders(): AnyActiveProvider[] {
  const equity = getEquityProviders('price')
  const customs = equity.filter((p) => p.isCustom && p.format === 'json-quote')
  const builtins = equity
    .filter((p) => !p.isCustom)
    .sort((a, b) => ((a as BuiltinProviderDef).priority ?? 99) - ((b as BuiltinProviderDef).priority ?? 99))
  return [...customs, ...builtins]
}

/**
 * Enabled video providers for one market, built-ins by priority then customs.
 *
 * Market-scoped like the news/social getters so the Videos page can honour the
 * user's bundle — crypto channels only when the Crypto module is on, finance
 * channels when Equities or Funds is.
 */
export function getVideoProviders(market: ProviderMarket): AnyActiveProvider[] {
  return getAllProviders()
    .filter((p) => p.category === 'video' && marketOf(p) === market && p.status === 'active')
    .sort((a, b) => ((a as BuiltinProviderDef).priority ?? 99) - ((b as BuiltinProviderDef).priority ?? 99))
}

/** All active equity providers for a category, built-ins sorted by priority, customs appended. */
export function getEquityProviders(category: ProviderCategory): AnyActiveProvider[] {
  return getAllProviders()
    .filter((p) => p.category === category && marketOf(p) === 'equities' && p.status === 'active')
    .sort((a, b) => ((a as BuiltinProviderDef).priority ?? 99) - ((b as BuiltinProviderDef).priority ?? 99))
}

/** OHLCV history ladder for TA/backtests: custom json-ohlcv feeds first, then Yahoo → Tiingo → FMP (when active). */
export function getEquityOhlcvProviders(): AnyActiveProvider[] {
  const price = getEquityProviders('price')
  const customs = price.filter((p) => p.isCustom && p.format === 'json-ohlcv')
  const order = ['yahoo-finance', 'tiingo', 'fmp']
  const builtins = order
    .map((id) => price.find((p) => !p.isCustom && p.id === id))
    .filter((p): p is AnyActiveProvider => !!p)
  return [...customs, ...builtins]
}

/** Save runtime config update for any provider (built-in or custom). */
export function saveProviderConfig(providerId: string, update: Partial<ProviderConfig>): void {
  const file = readConfigFile()
  file.configs[providerId] = { ...(file.configs[providerId] ?? {}), ...update }
  writeConfigFile(file)
}

/** Resolve the effective API key for a provider (saved config, else env var). */
export function getProviderKey(providerId: string): string | undefined {
  const file = readConfigFile()
  return file.configs[providerId]?.apiKey ?? envKey(providerId)
}

/**
 * Record the outcome of a real data fetch for a provider, so the Integrations
 * page can show whether a configured provider is actually serving data
 * (vs. silently failing or contributing nothing).
 */
export function recordProviderFetch(providerId: string, outcome: { count?: number; error?: string }): void {
  saveProviderConfig(providerId, {
    lastFetchAt: new Date().toISOString(),
    lastFetchCount: outcome.error ? undefined : (outcome.count ?? 0),
    lastFetchError: outcome.error,
  })
}
