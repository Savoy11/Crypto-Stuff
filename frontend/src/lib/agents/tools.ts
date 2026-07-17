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

export type ToolName =
  | 'get_prices'
  | 'get_market_overview'
  | 'list_exchanges'
  | 'get_network_fees'
  | 'find_transfer_routes'
  | 'get_staking_opportunities'
  | 'get_news'
  | 'get_price_history'
  | 'search_securities'
  | 'get_security_quotes'
  | 'get_security_history'
  | 'get_market_news'
  | 'get_stock_social'
  | 'get_market_calendar'

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
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
  {
    name: 'get_market_overview',
    description: 'Get a broad market snapshot: price, market cap, 24h volume, and 24h change for the tracked assets. Use for "how is the market doing" or ranking questions.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_exchanges',
    description: 'List supported exchanges with the coins and networks each supports. Use for questions about which exchanges support a coin/network.',
    input_schema: {
      type: 'object',
      properties: { tier: { type: 'number', description: 'Optional: 1 for major/regulated, 2 for smaller exchanges' } },
    },
  },
  {
    name: 'get_network_fees',
    description: 'Get current gas/network fees for all supported blockchains (e.g. Ethereum, Bitcoin, Solana, Polygon).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'find_transfer_routes',
    description: 'Find the cheapest way to move a coin between two exchanges (or a wallet), including multi-hop routes. Use for "cheapest way to send X from A to B" questions.',
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
  {
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
  {
    name: 'get_news',
    description: 'Get recent news articles for a coin, with sentiment and source. Use for "what is the latest news on X" questions.',
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
  {
    name: 'get_price_history',
    description: 'Get OHLC candle history for a coin over a range. Use for trend/technical questions. Returns a compact summary (first, last, high, low, change).',
    input_schema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin symbol, e.g. "btc"' },
        range: { type: 'string', enum: ['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'MAX'], description: 'Time range (default 1Y)' },
      },
      required: ['coin'],
    },
  },
  {
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
  {
    name: 'get_security_quotes',
    description: 'Get current price quotes for stocks, ETFs, or mutual funds by ticker symbol. Use whenever the user asks about a stock or fund price. Quotes flagged "reference: true" are static fallback values, not live.',
    input_schema: {
      type: 'object',
      properties: {
        symbols: { type: 'array', items: { type: 'string' }, description: 'Ticker symbols, e.g. ["AAPL","SPY","VTSAX"]' },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'get_security_history',
    description: 'Get OHLC price history for a stock, ETF, or mutual fund over a range. Use for trend/performance questions. Returns a compact summary (first, last, high, low, change).',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol, e.g. "AAPL"' },
        range: { type: 'string', enum: ['1M', '3M', '6M', '1Y', '5Y', 'MAX'], description: 'Time range (default 1Y)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_market_news',
    description: 'Get recent stock-market news headlines with sentiment and category tags. Pass a ticker for per-company news, or omit it for general market headlines. Use for "what is the news on <stock>" or "what is moving the market" questions.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Optional ticker, e.g. "AAPL" — omit for general market news' },
        limit: { type: 'number', description: 'Max articles (default 10, max 25)' },
      },
    },
  },
  {
    name: 'get_stock_social',
    description: 'Get social sentiment for stocks from Reddit finance subs and StockTwits: per-symbol sentiment scores plus top posts. Pass a ticker for one symbol, or omit for general finance chatter.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Optional ticker, e.g. "TSLA" — omit for general chatter' },
      },
    },
  },
  {
    name: 'get_market_calendar',
    description: 'Get upcoming earnings dates and US economic events (CPI, Fed, jobs reports) for the next N days. Use for "when does X report earnings" or "what events are coming up" questions.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Days ahead to look (default 14, max 30)' },
      },
    },
  },
]

// ─── Executor ───────────────────────────────────────────────────────────────

async function getJson(origin: string, path: string): Promise<unknown> {
  const res = await fetch(origin + path, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`)
  return res.json()
}

type ToolInput = Record<string, unknown>

/** Execute a tool by name and return a JSON-serializable result for the model. */
export async function runTool(name: string, input: ToolInput, origin: string): Promise<unknown> {
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
          .filter((f) => !query || f.symbol.toLowerCase().includes(query) || f.name.toLowerCase().includes(query) || f.issuer.toLowerCase().includes(query))
          .slice(0, 15)
          .map((f) => ({
            symbol: f.symbol, name: f.name, type: f.type, issuer: f.issuer,
            category: FUND_CATEGORY_INFO[f.category].label,
            expenseRatioPct: f.expenseRatioPct, aumB: f.aumB, yieldPct: f.yieldPct,
            indexTracked: f.indexTracked,
            topHoldings: f.topHoldings.slice(0, 5).map((h) => `${h.symbol} ${h.weightPct}%`),
          }))
        if (stocks.length === 0 && funds.length === 0) {
          return { stocks, funds, note: 'No catalog matches — the symbol may still be quotable via get_security_quotes.' }
        }
        return { stocks, funds }
      }
      case 'get_security_quotes': {
        const symbols = (input.symbols as string[] | undefined)?.join(',') ?? ''
        const data = (await getJson(origin, `/live-data/security-quotes?symbols=${encodeURIComponent(symbols)}`)) as {
          ok?: boolean; source?: string; quotes?: Record<string, unknown>
        }
        return { source: data.source, quotes: data.quotes ?? {} }
      }
      case 'get_security_history': {
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
        const symbol = input.symbol ? String(input.symbol).toUpperCase() : undefined
        const p = new URLSearchParams({ limit: String(limit) })
        if (symbol) p.set('symbol', symbol)
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
        return { symbol: symbol ?? 'general', count: articles.length, articles }
      }
      case 'get_stock_social': {
        const symbol = input.symbol ? String(input.symbol).toUpperCase() : undefined
        const p = new URLSearchParams({ limit: '20' })
        if (symbol) p.set('symbol', symbol)
        const data = (await getJson(origin, `/live-data/stock-social?${p.toString()}`)) as {
          ok?: boolean
          summaries?: unknown[]
          signals?: { platform: string; title: string; sentiment: string; score: number; symbols: string[]; subreddit?: string; publishedAt: string }[]
        }
        const posts = (data.signals ?? []).slice(0, 12).map((s) => ({
          platform: s.platform, subreddit: s.subreddit,
          title: s.title.length > 140 ? `${s.title.slice(0, 140)}…` : s.title,
          sentiment: s.sentiment, score: s.score, symbols: s.symbols, publishedAt: s.publishedAt,
        }))
        return { symbol: symbol ?? 'general', summaries: data.summaries ?? [], posts }
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
      default:
        return { error: `Unknown tool: ${name}` }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'tool execution failed' }
  }
}
