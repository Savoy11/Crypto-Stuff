import type Anthropic from '@anthropic-ai/sdk'
import { EQUITY_CATALOG, SECTOR_INFO } from '@/lib/data/equityCatalog'
import { FUND_CATALOG, FUND_CATEGORY_INFO } from '@/lib/data/fundCatalog'
import { COMMODITY_CATALOG, COMMODITY_CATEGORY_INFO } from '@/lib/data/commodityCatalog'
import { CURRENCY_CATALOG, CURRENCY_CATEGORY_INFO } from '@/lib/data/currencyCatalog'
import { RATES_CATALOG, RATES_CATEGORY_INFO } from '@/lib/data/ratesCatalog'

// ─── Agent tool registry ──────────────────────────────────────────────────────
//
// Tools expose the platform's own live data to the App Assistant and Research
// agents. Each tool maps to an existing internal endpoint (/api/v1/* or
// /live-data/*), so the agents read exactly what the UI reads — one source of
// truth. The executor fetches against the app's own origin (passed in from the
// route handler), avoiding any external hop or duplicated data logic.

export type ToolMarket = 'crypto' | 'equities' | 'macro'
/** Which tool set an agent may call. 'all' exposes every market (App Assistant). */
export type ToolSet = 'crypto' | 'equities' | 'macro' | 'all'

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

  {
    market: 'equities',
    tool: {
      name: 'score_options_trade',
      description:
        'Score the risk of an options position the USER describes, across liquidity, IV environment, ' +
        'assignment, time decay and defined risk. Returns a 0-100 safety score (HIGHER = SAFER) with ' +
        'per-dimension detail. Use when someone describes a specific options trade and asks how risky ' +
        'it is. IMPORTANT: this explains risk, it does NOT recommend trades or predict profit — say so. ' +
        'There is no options chain feed, so every option-level number must come from the user (their ' +
        'broker chain); never invent a bid, ask, open interest or IV rank to fill the call. Ask for what ' +
        'is missing instead. Optional fields left out lower the confidence figure rather than the score.',
      input_schema: {
        type: 'object',
        properties: {
          underlyingPrice: { type: 'number', description: 'Current price of the underlying' },
          daysToExpiry: { type: 'number', description: 'Calendar days until expiry' },
          legs: {
            type: 'array',
            description: 'The position, 1-4 legs. Every leg needs side, type, strike, bid and ask.',
            items: {
              type: 'object',
              properties: {
                side: { type: 'string', enum: ['long', 'short'] },
                type: { type: 'string', enum: ['call', 'put'] },
                strike: { type: 'number' },
                bid: { type: 'number' },
                ask: { type: 'number' },
                openInterest: { type: 'number', description: 'Optional: contracts of open interest' },
                volume: { type: 'number', description: 'Optional: contracts traded today' },
                delta: { type: 'number', description: 'Optional: signed delta per contract, e.g. -0.30 for an OTM short put' },
              },
              required: ['side', 'type', 'strike', 'bid', 'ask'],
            },
          },
          ivRank: { type: 'number', description: 'Optional 0-100: where current IV sits in its 52-week range. No free source carries this — only pass it if the user supplies it.' },
          earningsInDays: { type: 'number', description: 'Optional: days until the next earnings report, if inside the trade horizon' },
          exDividendInDays: { type: 'number', description: 'Optional: days until the ex-dividend date' },
          maxLossUsd: { description: 'Optional: worst-case loss in USD, or the string "unbounded" for naked short exposure. "unbounded" is a real answer — do not omit it to make a trade score better.' },
          maxProfitUsd: { type: 'number', description: 'Optional: best-case profit in USD' },
        },
        required: ['underlyingPrice', 'daysToExpiry', 'legs'],
      },
    },
  },

  // ── Macro (commodities, currencies, bonds/rates) ────────────────────────────
  {
    market: 'macro',
    tool: {
      name: 'search_macro_instruments',
      description: 'Search the macro catalogs — 19 commodity futures, 18 FX pairs + dollar index, and 8 treasury yield indices/bond futures — by name, symbol, or category. Returns the Yahoo symbol (usable with get_macro_quote / get_macro_price_history), quote convention, and ETF proxies. Use FIRST to find the right symbol.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Name or symbol substring, e.g. "gold", "EURUSD", "10-year"' },
          area: { type: 'string', enum: ['commodities', 'currencies', 'rates'], description: 'Optional: restrict to one area' },
        },
      },
    },
  },
  {
    market: 'macro',
    tool: {
      name: 'get_macro_quote',
      description: 'Get live prices for macro symbols: commodity futures (GC=F, CL=F), FX pairs (EURUSD=X, JPY=X), the dollar index (DX-Y.NYB), treasury yield indices (^TNX quotes the yield ×10), and bond futures (ZN=F). Mind each market\'s quote convention from search_macro_instruments (grains quote in cents).',
      input_schema: {
        type: 'object',
        properties: {
          symbols: { type: 'array', items: { type: 'string' }, description: 'Yahoo symbols, e.g. ["GC=F","EURUSD=X","^TNX"]' },
        },
        required: ['symbols'],
      },
    },
  },
  {
    market: 'macro',
    tool: {
      name: 'get_macro_price_history',
      description: 'Get OHLC history summary for a macro symbol (futures contract, FX pair, or yield index) over a range: first/last, high, low, and percent change.',
      input_schema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Yahoo symbol, e.g. "CL=F" or "EURUSD=X"' },
          range: { type: 'string', enum: ['1M', '3M', '6M', '1Y', '5Y', 'MAX'], description: 'Time range (default 1Y)' },
        },
        required: ['symbol'],
      },
    },
  },
  {
    market: 'macro',
    tool: {
      name: 'get_yield_curve',
      description: 'Get the official US Treasury par yield curve (13 maturities, treasury.gov daily data) with 2s10s and 3m10y spreads, curve shape (normal/flat/inverted), and month-ago / year-start snapshots for comparison. The authoritative rates tool — prefer it over quoting ^TNX for curve questions.',
      input_schema: { type: 'object', properties: {} },
    },
  },
  {
    market: 'macro',
    tool: {
      name: 'get_fx_rates',
      description: 'Get daily USD-based FX reference rates: 30 currencies from the ECB (official tier) and, when include_extended is true, 127 more community-sourced currencies (labeled non-official). For intraday pair quotes use get_macro_quote instead.',
      input_schema: {
        type: 'object',
        properties: {
          currencies: { type: 'array', items: { type: 'string' }, description: 'Optional ISO codes to filter, e.g. ["EUR","JPY","MXN"]' },
          include_extended: { type: 'boolean', description: 'Also fetch the extended community tier (default false)' },
        },
      },
    },
  },
  {
    market: 'macro',
    tool: {
      name: 'get_macro_news',
      description: 'Get recent macro-market news classified into pillars — commodities, currencies, bonds — with sentiment and detected instruments. Use for "what is moving oil/FX/rates" questions.',
      input_schema: {
        type: 'object',
        properties: {
          pillar: { type: 'string', enum: ['commodities', 'currencies', 'bonds'], description: 'Optional: one pillar only' },
          limit: { type: 'number', description: 'Max articles (default 10, max 25)' },
        },
      },
    },
  },
]

/** All tool definitions (every market). */
export const AGENT_TOOLS: Anthropic.Tool[] = TOOL_REGISTRY.map((r) => r.tool)

/** Tool definitions exposed to an agent, filtered by its toolset. */
export function toolsForAgent(toolset: ToolSet = 'crypto'): Anthropic.Tool[] {
  if (toolset === 'all') return AGENT_TOOLS
  return TOOL_REGISTRY.filter((r) => r.market === toolset).map((r) => r.tool)
}

// ─── Executor ───────────────────────────────────────────────────────────────

/**
 * Fetch an internal route as JSON.
 *
 * On a non-OK status this throws the ROUTE'S OWN error message when it has
 * one. It used to throw a bare `HTTP 404 for /live-data/company-facts?…`,
 * which discarded exactly the diagnosis the agent needed — the routes already
 * return things like "No SEC registrant found for ticker XOM", and every
 * `if (!data.ok) return { error: data.error }` branch downstream was
 * unreachable because this threw first.
 */
async function getJson(origin: string, path: string): Promise<unknown> {
  const res = await fetch(origin + path, { headers: { Accept: 'application/json' } })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `HTTP ${res.status}`
    throw new Error(`${detail} (${path})`)
  }
  return body
}

/**
 * Did an internal route report failure in its body?
 *
 * Several routes answer HTTP 200 with `ok: false` — a deliberate "reachable
 * but degraded" signal. Tools that read only the data array turn that into
 * "there is no news" / "no earnings scheduled", which the model then states as
 * fact. An upstream outage must never be indistinguishable from an empty
 * result, so tools call this and return an explicit error instead.
 */
function routeFailed(data: unknown): string | null {
  if (!data || typeof data !== 'object') return 'upstream returned no data'
  const d = data as { ok?: unknown; error?: unknown }
  if (d.ok === false) {
    return typeof d.error === 'string' ? d.error : 'upstream reported a failure'
  }
  return null
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
        const data = (await getJson(origin, `/live-data/ohlcv?id=${encodeURIComponent(coin)}&range=${encodeURIComponent(range)}`)) as {
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
        const failure = routeFailed(data)
        if (failure) return { error: `news feeds unavailable for ${symbol}: ${failure}`, symbol }
        const articles = (data.articles ?? []).map((a) => ({ title: a.title, source: a.source, publishedAt: a.publishedAt, sentiment: a.sentiment, category: a.category, url: a.url }))
        if (articles.length === 0) return { symbol, articles: [], note: 'feeds reachable, but no recent articles matched this symbol' }
        return { symbol, articles }
      }
      case 'score_options_trade': {
        // The only tool that POSTs — a multi-leg trade doesn't fit a query
        // string — so it can't use getJson(). The route validates and returns
        // its reasons in `details`; pass those through verbatim rather than
        // collapsing them, so the model can ask the user for exactly what is
        // missing instead of guessing at it.
        const res = await fetch(origin + '/api/v1/options/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(input),
        })
        const data = await res.json().catch(() => null) as
          | { error?: string; details?: string[]; risk?: unknown; netShortPremium?: boolean; disclaimer?: string }
          | null
        if (!res.ok || !data) {
          return {
            error: data?.error ?? `HTTP ${res.status}`,
            details: data?.details,
            hint: 'Ask the user for the missing or invalid values — do not substitute your own.',
          }
        }
        return {
          risk: data.risk,
          netShortPremium: data.netShortPremium,
          disclaimer: data.disclaimer,
          scale: '0-100, higher = safer. Report the band and the weakest dimensions, not just the number.',
        }
      }
      case 'get_stock_social': {
        const symbol = String(input.symbol ?? '').toUpperCase()
        const limit = Number(input.limit ?? 20)
        const data = (await getJson(origin, `/live-data/stock-social?symbol=${encodeURIComponent(symbol)}&limit=${limit}`)) as {
          ok?: boolean; summaries?: unknown; providers?: Array<{ name: string }>
          signals?: Array<{ platform: string; title: string; sentiment: string; score: number; url: string }>
        }
        const failure = routeFailed(data)
        if (failure) return { error: `social providers unavailable for ${symbol}: ${failure}`, symbol }
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
        const failure = routeFailed(data)
        if (failure) return { error: `market news feeds unavailable: ${failure}` }
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
        // Configured but both upstream legs failed: the route answers 200 with
        // ok:false and empty arrays. Returning those verbatim reads as "no
        // earnings scheduled", which is a confident wrong answer to "when does
        // NVDA report?".
        const failure = routeFailed(data)
        if (failure) return { error: `calendar upstream unavailable: ${failure}` }
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
      // ── Macro tools ───────────────────────────────────────────────────────────
      case 'search_macro_instruments': {
        const query = String(input.query ?? '').trim().toLowerCase()
        const area = input.area ? String(input.area) : undefined
        const match = (...hay: string[]) => !query || hay.some((h) => h.toLowerCase().includes(query))
        const commodities = (area && area !== 'commodities') ? [] : COMMODITY_CATALOG
          .filter((c) => match(c.name, c.symbol, c.category))
          .map((c) => ({
            symbol: c.symbol, name: c.name, area: 'commodities' as const,
            category: COMMODITY_CATEGORY_INFO[c.category].label, exchange: c.exchange,
            quotesIn: c.quoteBasis === 'cents' ? `US cents per ${c.unit}` : `USD per ${c.unit}`,
            etfProxies: c.etfProxies,
          }))
        const currencies = (area && area !== 'currencies') ? [] : CURRENCY_CATALOG
          .filter((c) => match(c.name, c.symbol, c.base, c.quote))
          .map((c) => ({
            symbol: c.symbol, name: c.name, area: 'currencies' as const,
            category: CURRENCY_CATEGORY_INFO[c.category].label,
            pair: `1 ${c.base} = X ${c.quote}`,
            etfProxies: c.etfProxies,
          }))
        const rates = (area && area !== 'rates') ? [] : RATES_CATALOG
          .filter((r) => match(r.name, r.symbol))
          .map((r) => ({
            symbol: r.symbol, name: r.name, area: 'rates' as const,
            category: RATES_CATEGORY_INFO[r.category].label,
            quotesIn: r.quoteBasis === 'pct' ? 'yield in percent (^TNX shows yield ×10)' : 'points of par',
            etfProxies: r.etfProxies,
          }))
        if (commodities.length + currencies.length + rates.length === 0) {
          return { commodities, currencies, rates, note: 'No catalog matches — the symbol may still be quotable via get_macro_quote.' }
        }
        // Capped like search_securities: an empty query would otherwise dump
        // all 46 catalog entries with their etfProxies arrays into context.
        return {
          commodities: commodities.slice(0, 15),
          currencies: currencies.slice(0, 15),
          rates: rates.slice(0, 15),
          ...(commodities.length + currencies.length + rates.length > 45
            ? { note: 'Results capped at 15 per area — narrow the query for more specific matches.' }
            : {}),
        }
      }
      case 'get_macro_quote': {
        const symbols = (input.symbols as string[] | undefined)?.map((s) => s.toUpperCase()).join(',') ?? ''
        const data = (await getJson(origin, `/live-data/security-quotes?symbols=${encodeURIComponent(symbols)}`)) as {
          source?: string; quotes?: Record<string, { price: number; changePercent: number | null; volume: number | null; reference?: boolean }>
        }
        return { source: data.source, quotes: data.quotes ?? {} }
      }
      case 'get_macro_price_history': {
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
      case 'get_yield_curve': {
        const data = (await getJson(origin, `/live-data/treasury-yield-curve`)) as {
          ok?: boolean; error?: string; latest?: unknown; monthAgo?: unknown; yearStart?: unknown
          spread2s10s?: number; spread3m10y?: number; shape?: string
        }
        if (!data.ok) return { error: data.error ?? 'yield curve unavailable' }
        return {
          latest: data.latest, monthAgo: data.monthAgo, yearStart: data.yearStart,
          spread2s10s: data.spread2s10s, spread3m10y: data.spread3m10y, shape: data.shape,
          source: 'treasury.gov official daily par curve',
        }
      }
      case 'get_fx_rates': {
        const wanted = (input.currencies as string[] | undefined)?.map((c) => c.toUpperCase())
        const pick = (rates: Record<string, number>) =>
          wanted?.length ? Object.fromEntries(Object.entries(rates).filter(([k]) => wanted.includes(k))) : rates
        const official = (await getJson(origin, `/live-data/fx-rates`)) as {
          ok?: boolean; error?: string; date?: string; rates?: Record<string, number>
        }
        const out: Record<string, unknown> = official.ok
          ? { officialDate: official.date, officialSource: 'ECB reference rates', officialRates: pick(official.rates ?? {}) }
          : { officialError: official.error ?? 'official rates unavailable' }
        if (input.include_extended === true) {
          const ext = (await getJson(origin, `/live-data/fx-rates-extended`)) as {
            ok?: boolean; error?: string; date?: string; rates?: Record<string, number>
          }
          if (ext.ok) {
            out.extendedDate = ext.date
            out.extendedSource = 'community currency-api — NOT official; always attribute as community-sourced'
            out.extendedRates = pick(ext.rates ?? {})
          } else {
            out.extendedError = ext.error ?? 'extended rates unavailable'
          }
        }
        out.base = 'USD'
        return out
      }
      case 'get_macro_news': {
        const limit = Math.min(Number(input.limit ?? 10) || 10, 25)
        const p = new URLSearchParams({ limit: String(limit) })
        if (input.pillar) p.set('pillar', String(input.pillar))
        const data = (await getJson(origin, `/live-data/macro-news?${p.toString()}`)) as {
          ok?: boolean
          articles?: { title: string; url: string; source: string; publishedAt: string; summary: string; sentiment: string; pillar: string; related: { label: string }[] }[]
        }
        const failure = routeFailed(data)
        if (failure) return { error: `macro news feeds unavailable: ${failure}` }
        const articles = (data.articles ?? []).slice(0, limit).map((a) => ({
          title: a.title, source: a.source, publishedAt: a.publishedAt,
          sentiment: a.sentiment, pillar: a.pillar,
          relatedInstruments: a.related.map((r) => r.label),
          summary: a.summary.length > 200 ? `${a.summary.slice(0, 200)}…` : a.summary,
          url: a.url,
        }))
        return { count: articles.length, articles }
      }
      default:
        return { error: `Unknown tool: ${name}` }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'tool execution failed' }
  }
}
