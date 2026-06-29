import type Anthropic from '@anthropic-ai/sdk'

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
      default:
        return { error: `Unknown tool: ${name}` }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'tool execution failed' }
  }
}
