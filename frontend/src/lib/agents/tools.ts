import type Anthropic from '@anthropic-ai/sdk'
import { EQUITY_CATALOG, SECTOR_INFO } from '@/lib/data/equityCatalog'
import { FUND_CATALOG, FUND_CATEGORY_INFO } from '@/lib/data/fundCatalog'

// ─── Agent tool registry ──────────────────────────────────────────────────────
//
// Tools expose the platform's own live data to the App Assistant and Research
// agents. Each tool maps to an existing internal endpoint (/api/v1/* or
// /live-data/*), so the agents read exactly what the UI reads — one source of
// truth. The executor fetches against the app's own origin (passed in from the
// route handler), avoiding any external hop or duplicated data logic.

export type ToolMarket = 'crypto' | 'equities'
/** Which tool set an agent may call. 'all' exposes both markets (App Assistant). */
export type ToolSet = 'crypto' | 'equities' | 'all'

interface RegisteredTool {
  market: ToolMarket
  tool: Anthropic.Tool
}

const TOOL_REGISTRY: RegisteredTool[] = [
  // ── Crypto ──────────────────────────────────────────────────────────────────
  {
    market: 'crypto',
    tool: {
      name: 'get_prices',
      description: 'Get current USD prices for one or more coins. Use whenever the user asks about the price of a specific coin.',
      input_schema: {
        type: 'object',
        properties: {
          coins: { type: 'array', items: { type: 'string' }, description: 'Coin symbols, e.g. ["btc","eth","sol"]' },
        },
        required: ['coins'],
      },
    },
  },
  {
    market: 'crypto',
    tool: {
      name: 'get_market_overview',
      description: 'Get a broad crypto market snapshot: price, market cap, 24h volume, and 24h change for tracked coins. Use for "how is the crypto market doing" or ranking questions.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    market: 'crypto',
    tool: {
      name: 'list_exchanges',
      description: 'List supported crypto exchanges with the coins and networks each supports.',
      input_schema: {
        type: 'object',
        properties: { tier: { type: 'number', description: 'Optional: 1 for major/regulated, 2 for smaller exchanges' } },
      },
    },
  },
  {
    market: 'crypto',
    tool: {
      name: 'get_network_fees',
      description: 'Get current gas/network fees for all supported blockchains (e.g. Ethereum, Bitcoin, Solana, Polygon).',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    market: 'crypto',
    tool: {
      name: 'find_transfer_routes',
      description: 'Find the cheapest way to move a coin between two exchanges (or a wallet), including multi-hop routes.',
      input_schema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source exchange id (e.g. "binance") or "wallet"' },
          to: { type: 'string', description: 'Destination exchange id or "wallet"' },
          coin: { type: 'string', description: 'Coin symbol, e.g. "usdt"' },
          amount: { type: 'number', description: 'Amount to transfer in coin units' },
        },
        required: ['from', 'to', 'coin'],
      },
    },
  },
  {
    market: 'crypto',
    tool: {
      name: 'get_staking_opportunities',
      description: 'Get staking options for a coin with APY, lock-up terms, and risk scores. Filter by category or maximum risk.',
      input_schema: {
        type: 'object',
        properties: {
          coin: { type: 'string', description: 'Coin symbol, e.g. "eth"' },
          category: { type: 'string', enum: ['cefi', 'wallet', 'liquid'], description: 'Optional provider category' },
          max_risk: { type: 'number', description: 'Optional: only return options with overall risk <= this (1-10)' },
        },
        required: ['coin'],
      },
    },
  },
  {
    market: 'crypto',
    tool: {
      name: 'get_news',
      description: 'Get recent crypto news articles for a coin, with sentiment and source.',
      input_schema: {
        type: 'object',
        properties: {
          coin: { type: 'string', description: 'Coin symbol, e.g. "btc"' },
          limit: { type: 'number', description: 'Max articles (default 10)' },
          sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'], description: 'Optional sentiment filter' },
        },
        required: ['coin'],
      },
    },
  },
  {
    market: 'crypto',
    tool: {
      name: 'get_price_history',
      description: 'Get OHLC candle history for a coin over a range. Returns a compact summary (first, last, high, low, change).',
      input_schema: {
        type: 'object',
        properties: {
          coin: { type: 'string', description: 'Coin symbol, e.g. "btc"' },
          range: { type: 'string', enum: ['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'MAX'], description: 'Time range (default 1Y)' },
        },
        required: ['coin'],
      },
    },
  },

  // ── Equities ────────────────────────────────────────────────────────────────
  {
    market: 'equities',
    tool: {
      name: 'get_stock_quote',
      description: 'Get current price, day change, market cap, and volume for one or more stock/ETF/fund symbols. Use for any equity price question.',
      input_schema: {
        type: 'object',
        properties: {
          symbols: { type: 'array', items: { type: 'string' }, description: 'Ticker symbols, e.g. ["AAPL","MSFT","BRK-B"]' },
        },
        required: ['symbols'],
      },
    },
  },
  {
    market: 'equities',
    tool: {
      name: 'get_stock_financials',
      description: 'Get audited fundamentals and computed financial ratios for a stock from SEC filings: revenue, net income, margins, ROE/ROA, P/E, current ratio, debt, cash flow, and YoY growth. The primary tool for fundamental analysis.',
      input_schema: {
        type: 'object',
        properties: { symbol: { type: 'string', description: 'Ticker symbol, e.g. "AAPL"' } },
        required: ['symbol'],
      },
    },
  },
  {
    market: 'equities',
    tool: {
      name: 'get_stock_profile',
      description: "Get a company's registrant profile from SEC EDGAR: official SIC industry classification, headquarters, state of incorporation, fiscal year end, exchange, and a background summary.",
      input_schema: {
        type: 'object',
        properties: { symbol: { type: 'string', description: 'Ticker symbol, e.g. "AAPL"' } },
        required: ['symbol'],
      },
    },
  },
  {
    market: 'equities',
    tool: {
      name: 'get_stock_filings',
      description: "Get a company's recent SEC filings (10-K annual, 10-Q quarterly, 8-K material events) with dates, decoded event items, and document links.",
      input_schema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol, e.g. "AAPL"' },
          form: { type: 'string', description: 'Form filter: "8-K", "10-K", "10-Q", or "10-K,10-Q" (default "8-K")' },
          limit: { type: 'number', description: 'Max filings (default 8)' },
        },
        required: ['symbol'],
      },
    },
  },
  {
    market: 'equities',
    tool: {
      name: 'get_stock_news',
      description: 'Get recent market news headlines for a stock, with sentiment, category, and source.',
      input_schema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol, e.g. "AAPL"' },
          limit: { type: 'number', description: 'Max articles (default 10)' },
        },
        required: ['symbol'],
      },
    },
  },
  {
    market: 'equities',
    tool: {
      name: 'get_stock_social',
      description: 'Get recent social sentiment for a stock from Reddit finance subreddits and StockTwits, with a bullish/bearish summary.',
      input_schema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol, e.g. "AAPL"' },
          limit: { type: 'number', description: 'Max posts (default 20)' },
        },
        required: ['symbol'],
      },
    },
  },
  {
    market: 'equities',
    tool: {
      name: 'get_stock_price_history',
      description: 'Get OHLC candle history for a stock over a range. Returns a compact summary (first, last, high, low, change).',
      input_schema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol, e.g. "AAPL"' },
          range: { type: 'string', enum: ['1M', '3M', '6M', '1Y', '5Y', 'MAX'], description: 'Time range (default 1Y)' },
        },
        required: ['symbol'],
      },
    },
  },
  {
    market: 'equities',
    tool: {
      name: 'get_stock_outliers',
      description: 'Scan the WHOLE stock universe and return the statistical outliers, computed sector-relative (z-scores vs each stock\'s sector). Returns categories: cheap (low P/E vs sector), expensive (high P/E), highYield, highBeta, lowBeta. Use this FIRST for any "find outliers / screen the market / what stands out" request, then drill into flagged names with the other tools.',
      input_schema: {
        type: 'object',
        properties: {
          min_mcap: { type: 'number', description: 'Minimum market cap in $B to include (default 2 — filters out micro-caps)' },
        },
      },
    },
  },
  {
    market: 'equities',
    tool: {
      name: 'search_securities',
      description: 'Search the equities and funds catalogs (~70 US large-cap stocks, ~55 ETFs/mutual funds) by ticker, name, sector, or category. Use to find the right symbol, discover what stocks/funds the platform tracks, or get reference facts (sector, P/E, expense ratio, top holdings).',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Ticker or name substring, e.g. "NVDA" or "vanguard"' },
          type: { type: 'string', enum: ['stock', 'etf', 'mutual'], description: 'Optional: restrict to stocks, ETFs, or mutual funds' },
          sector: { type: 'string', description: 'Optional stock sector filter, e.g. "technology", "healthcare", "financials"' },
        },
      },
    },
  },
  {
    market: 'equities',
    tool: {
      name: 'get_market_news',
      description: 'Get general stock-market news headlines (no specific ticker) with sentiment and category tags. Use for "what is moving the market today" questions; for per-company news use get_stock_news.',
      input_schema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max articles (default 10, max 25)' },
        },
      },
    },
  },
  {
    market: 'equities',
    tool: {
      name: 'get_market_calendar',
      description: 'Get upcoming earnings dates and US economic events (CPI, Fed, jobs reports) for the next N days. Use for "when does X report earnings" or "what events are coming up" questions.',
      input_schema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Days ahead to look (default 14, max 30)' },
        },
      },
    },
  },
]

/** All tool definitions (both markets). */
export const AGENT_TOOLS: Anthropic.Tool[] = TOOL_REGISTRY.map((r) => r.tool)

/** Tool definitions exposed to an agent, filtered by its toolset. */
export function toolsForAgent(toolset: ToolSet = 'crypto'): Anthropic.Tool[] {
  if (toolset === 'all') return AGENT_TOOLS
  return TOOL_REGISTRY.filter((r) => r.market === toolset).map((r) => r.tool)
}

// ─── Executor ───────────────────────────────────────────────────────────────

async function getJson(origin: string, path: string): Promise<unknown> {
  const res = await fetch(origin + path, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`)
  return res.json()
}

type ToolInput = Record<string, unknown>

/** Execute a tool by name and return a JSON-serializable result for the model. */
/**
 * Watchlist terms forwarded from the client, OR-matched by the news routes.
 *
 * Agents run server-side and the watchlist lives in localStorage, so the server
 * cannot discover it — it has to be passed in. Without this, an agent asked
 * "what's in the news" would answer from a different, unbiased feed than the one
 * the user is looking at, which is more confusing than no biasing at all.
 */
export async function runTool(
  name: string,
  input: ToolInput,
  origin: string,
  watchlistTerms?: string[]
): Promise<unknown> {
  const watchlistParam = watchlistTerms?.length ? watchlistTerms.join(',') : null
  try {
    switch (name) {
      case 'get_prices': {
        const coins = (input.coins as string[] | undefined)?.join(',') ?? ''
        return await getJson(origin, `/api/v1/prices?coins=${encodeURIComponent(coins)}`)
      }
      case 'get_market_overview':
        return await getJson(origin, `/live-data/markets`)
      case 'list_exchanges': {
        const tier = input.tier ? `?tier=${input.tier}` : ''
        return await getJson(origin, `/api/v1/exchanges${tier}`)
      }
      case 'get_network_fees':
        return await getJson(origin, `/api/v1/network-fees`)
      case 'find_transfer_routes': {
        const p = new URLSearchParams({
          from: String(input.from ?? ''),
          to: String(input.to ?? ''),
          coin: String(input.coin ?? ''),
        })
        if (input.amount != null) p.set('amount', String(input.amount))
        return await getJson(origin, `/api/v1/transfer/routes?${p.toString()}`)
      }
      case 'get_staking_opportunities': {
        const p = new URLSearchParams({ coin: String(input.coin ?? '') })
        if (input.category) p.set('category', String(input.category))
        if (input.max_risk != null) p.set('max_risk', String(input.max_risk))
        return await getJson(origin, `/api/v1/staking/opportunities?${p.toString()}`)
      }
      case 'get_news': {
        const p = new URLSearchParams({ coin: String(input.coin ?? '') })
        p.set('limit', String(input.limit ?? 10))
        if (input.sentiment) p.set('sentiment', String(input.sentiment))
        // Only when the agent hasn't asked for a specific coin — an explicit
        // "news about SOL" must not be silently narrowed to the watchlist.
        if (watchlistParam && !input.coin) p.set('watchlist', watchlistParam)
        return await getJson(origin, `/api/v1/news?${p.toString()}`)
      }
      case 'get_price_history': {
        const coin = String(input.coin ?? '')
        const range = String(input.range ?? '1Y')
        const data = (await getJson(origin, `/live-data/ohlcv?id=${coin}&range=${range}`)) as {
          ok?: boolean; candles?: { time: number; open: number; high: number; low: number; close: number }[]; source?: string
        }
        const candles = data.candles ?? []
        if (!data.ok || candles.length === 0) return { error: 'no candle data available', coin, range }
        const first = candles[0], last = candles[candles.length - 1]
        const high = Math.max(...candles.map((c) => c.high))
        const low = Math.min(...candles.map((c) => c.low))
        const changePct = ((last.close - first.open) / first.open) * 100
        // Return a compact summary — never dump hundreds of candles into context.
        return {
          coin, range, source: data.source, candleCount: candles.length,
          firstClose: first.close, lastClose: last.close,
          periodHigh: high, periodLow: low,
          changePct: Number(changePct.toFixed(2)),
        }
      }
      case 'search_securities': {
        const query = String(input.query ?? '').trim().toLowerCase()
        const type = input.type ? String(input.type) : undefined
        const sector = input.sector ? String(input.sector).toLowerCase() : undefined

        const stocks = (type && type !== 'stock') ? [] : EQUITY_CATALOG
          .filter((e) => !sector || e.sector === sector)
          .filter((e) => !query || e.symbol.toLowerCase().includes(query) || e.name.toLowerCase().includes(query) || e.industry.toLowerCase().includes(query))
          .slice(0, 15)
          .map((e) => ({
            symbol: e.symbol, name: e.name, type: 'stock' as const,
            sector: SECTOR_INFO[e.sector].label, industry: e.industry,
            marketCapB: e.marketCapB, peRatio: e.peRatio,
            dividendYieldPct: e.dividendYieldPct, beta: e.beta,
          }))
        const funds = (type === 'stock') ? [] : FUND_CATALOG
          .filter((f) => !type || f.type === type)
          .filter((f) => !query ||
            f.symbol.toLowerCase().includes(query) ||
            f.name.toLowerCase().includes(query) ||
            f.issuer.toLowerCase().includes(query) ||
            (f.focusIndustry != null && (f.focusIndustry.toLowerCase().includes(query) || query.includes(f.focusIndustry.toLowerCase()))) ||
            (f.focusSector != null && SECTOR_INFO[f.focusSector].label.toLowerCase().includes(query)))
          .slice(0, 15)
          .map((f) => ({
            symbol: f.symbol, name: f.name, type: f.type, issuer: f.issuer,
            category: f.focusSector
              ? `${FUND_CATEGORY_INFO[f.category].label} · ${SECTOR_INFO[f.focusSector].label}${f.focusIndustry ? ` (${f.focusIndustry})` : ''}`
              : FUND_CATEGORY_INFO[f.category].label,
            expenseRatioPct: f.expenseRatioPct, aumB: f.aumB, yieldPct: f.yieldPct,
            indexTracked: f.indexTracked,
            topHoldings: f.topHoldings.slice(0, 5).map((h) => `${h.symbol} ${h.weightPct}%`),
          }))
        if (stocks.length === 0 && funds.length === 0) {
          return { stocks, funds, note: 'No catalog matches — the symbol may still be quotable via get_stock_quote.' }
        }
        return { stocks, funds }
      }

      // ── Equity tools ──────────────────────────────────────────────────────────
      case 'get_stock_quote': {
        const symbols = (input.symbols as string[] | undefined)?.map((s) => s.toUpperCase()).join(',') ?? ''
        const data = (await getJson(origin, `/live-data/security-quotes?symbols=${encodeURIComponent(symbols)}`)) as {
          source?: string; quotes?: Record<string, { price: number; changePercent: number | null; marketCap: number | null; volume: number | null; reference?: boolean }>
        }
        return { source: data.source, quotes: data.quotes ?? {} }
      }
      case 'get_stock_financials': {
        const symbol = String(input.symbol ?? '').toUpperCase()
        const data = (await getJson(origin, `/live-data/company-facts?symbol=${encodeURIComponent(symbol)}`)) as {
          ok?: boolean; error?: string; company?: string; fiscalYearEnd?: string; fundamentals?: unknown; ratios?: unknown
        }
        if (!data.ok) return { error: data.error ?? 'no fundamentals available', symbol }
        // Trim to the analytically useful fields — omit the annual history series.
        return { symbol, company: data.company, fiscalYearEnd: data.fiscalYearEnd, fundamentals: data.fundamentals, ratios: data.ratios }
      }
      case 'get_stock_profile': {
        const symbol = String(input.symbol ?? '').toUpperCase()
        const data = (await getJson(origin, `/live-data/company-profile?symbol=${encodeURIComponent(symbol)}`)) as {
          ok?: boolean; error?: string; profile?: unknown; wiki?: { extract?: string } | null
        }
        if (!data.ok) return { error: data.error ?? 'no profile available', symbol }
        return { symbol, profile: data.profile, background: data.wiki?.extract ?? null }
      }
      case 'get_stock_filings': {
        const symbol = String(input.symbol ?? '').toUpperCase()
        const form = String(input.form ?? '8-K')
        const limit = Number(input.limit ?? 8)
        const data = (await getJson(origin, `/live-data/sec-filings?symbol=${encodeURIComponent(symbol)}&form=${encodeURIComponent(form)}&limit=${limit}`)) as {
          ok?: boolean; error?: string; company?: string; filings?: Array<{ form: string; filedAt: string; reportDate: string | null; itemLabels: string[]; url: string }>
        }
        if (!data.ok) return { error: data.error ?? 'no filings available', symbol }
        return {
          symbol, company: data.company,
          filings: (data.filings ?? []).map((f) => ({ form: f.form, filedAt: f.filedAt, reportDate: f.reportDate, events: f.itemLabels, url: f.url })),
        }
      }
      case 'get_stock_news': {
        const symbol = String(input.symbol ?? '').toUpperCase()
        const limit = Number(input.limit ?? 10)
        const data = (await getJson(origin, `/live-data/market-news?symbol=${encodeURIComponent(symbol)}&limit=${limit}`)) as {
          ok?: boolean; articles?: Array<{ title: string; source: string; publishedAt: string; sentiment: string; category: string; url: string }>
        }
        const articles = (data.articles ?? []).map((a) => ({ title: a.title, source: a.source, publishedAt: a.publishedAt, sentiment: a.sentiment, category: a.category, url: a.url }))
        if (articles.length === 0) return { symbol, articles: [], note: 'no recent articles found' }
        return { symbol, articles }
      }
      case 'get_stock_social': {
        const symbol = String(input.symbol ?? '').toUpperCase()
        const limit = Number(input.limit ?? 20)
        const data = (await getJson(origin, `/live-data/stock-social?symbol=${encodeURIComponent(symbol)}&limit=${limit}`)) as {
          ok?: boolean; summaries?: unknown; providers?: Array<{ name: string }>
          signals?: Array<{ platform: string; title: string; sentiment: string; score: number; url: string }>
        }
        return {
          symbol,
          providers: (data.providers ?? []).map((p) => p.name),
          summary: data.summaries ?? [],
          topPosts: (data.signals ?? []).slice(0, 10).map((s) => ({ platform: s.platform, text: s.title, sentiment: s.sentiment, score: s.score, url: s.url })),
        }
      }
      case 'get_stock_price_history': {
        const symbol = String(input.symbol ?? '').toUpperCase()
        const range = String(input.range ?? '1Y')
        const data = (await getJson(origin, `/live-data/security-ohlcv?symbol=${encodeURIComponent(symbol)}&range=${range}`)) as {
          ok?: boolean; candles?: { time: number; open: number; high: number; low: number; close: number }[]; source?: string
        }
        const candles = data.candles ?? []
        if (!data.ok || candles.length === 0) return { error: 'no candle data available', symbol, range }
        const first = candles[0], last = candles[candles.length - 1]
        const high = Math.max(...candles.map((c) => c.high))
        const low = Math.min(...candles.map((c) => c.low))
        const changePct = ((last.close - first.open) / first.open) * 100
        // Compact summary — never dump hundreds of candles into context.
        return {
          symbol, range, source: data.source, candleCount: candles.length,
          firstClose: first.close, lastClose: last.close,
          periodHigh: high, periodLow: low,
          changePct: Number(changePct.toFixed(2)),
        }
      }
      case 'get_market_news': {
        const limit = Math.min(Number(input.limit ?? 10) || 10, 25)
        // Equity feeds are per-ticker RSS rather than text-searchable, so the
        // watchlist widens coverage by fetching each ticker's own feed. Only
        // the ticker-shaped terms apply here; crypto ids would match nothing.
        const wlSymbols = (watchlistTerms ?? [])
          .filter((t) => /^[A-Za-z.\-]{1,6}$/.test(t))
          .map((t) => t.toUpperCase())
        const p = new URLSearchParams({ limit: String(limit) })
        if (wlSymbols.length > 0) p.set('watchlist', wlSymbols.slice(0, 6).join(','))
        const data = (await getJson(origin, `/live-data/market-news?${p.toString()}`)) as {
          ok?: boolean
          articles?: { title: string; url: string; source: string; publishedAt: string; summary: string; sentiment: string; category: string; relatedSymbols: string[] }[]
        }
        const articles = (data.articles ?? []).slice(0, limit).map((a) => ({
          title: a.title, source: a.source, publishedAt: a.publishedAt,
          sentiment: a.sentiment, category: a.category, relatedSymbols: a.relatedSymbols,
          summary: a.summary.length > 200 ? `${a.summary.slice(0, 200)}…` : a.summary,
          url: a.url,
        }))
        return { count: articles.length, articles }
      }
      case 'get_market_calendar': {
        const days = Math.min(Number(input.days ?? 14) || 14, 30)
        const data = (await getJson(origin, `/live-data/market-calendar?days=${days}`)) as {
          ok?: boolean; configured?: boolean; earnings?: unknown[]; economic?: unknown[]; from?: string; to?: string
        }
        if (data.configured === false) {
          return { error: 'Market calendar requires an FMP API key (FMP_API_KEY) — not configured on this instance.' }
        }
        return {
          from: data.from, to: data.to,
          earnings: (data.earnings ?? []).slice(0, 40),
          economic: (data.economic ?? []).slice(0, 25),
        }
      }
      case 'get_stock_outliers': {
        const minMcap = input.min_mcap != null ? Number(input.min_mcap) : 2
        const data = (await getJson(origin, `/live-data/stock-outliers?min_mcap=${minMcap}`)) as {
          ok?: boolean; configured?: boolean; universeSize?: number; evaluated?: number
          sectorsEvaluated?: number; peCoverage?: number; note?: string; categories?: unknown
        }
        if (!data.ok) return { error: 'outlier scan failed' }
        return {
          universeSize: data.universeSize, evaluated: data.evaluated,
          sectorsEvaluated: data.sectorsEvaluated, peCoverage: data.peCoverage,
          coverageNote: data.note, categories: data.categories,
        }
      }
      default:
        return { error: `Unknown tool: ${name}` }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'tool execution failed' }
  }
}
