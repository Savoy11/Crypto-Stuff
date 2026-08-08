#!/usr/bin/env node
/**
 * Finance Now MCP Server
 *
 * Exposes Finance Now's analytical capabilities as MCP tools for Claude and other
 * MCP-compatible AI agents. Requires Finance Now frontend to be running.
 *
 * Usage:
 *   1. Start Finance Now: cd ../frontend && npm run dev
 *   2. Build this server: npm run build
 *   3. Add to Claude Desktop config (see README or CLAUDE.md)
 *
 * Environment:
 *   FN_BASE_URL — base URL of the running Finance Now instance (legacy CAEP_BASE_URL honored) (default: http://localhost:3000)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const BASE_URL = (process.env.FN_BASE_URL ?? process.env.CAEP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const API = `${BASE_URL}/api/v1`

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Finance Now API error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

/**
 * POST a JSON body. Only `score_options_trade` needs this — a multi-leg trade
 * doesn't fit a query string.
 *
 * On a 400 it surfaces the API's `details` array verbatim rather than a bare
 * status, because that array names exactly which fields were missing or
 * invalid — which is what lets the caller ask the user for them instead of
 * guessing.
 */
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null) as
    | { error?: string; details?: string[] }
    | null
  if (!res.ok) {
    const detail = json?.details?.length
      ? `${json.error ?? 'Invalid request'}: ${json.details.join('; ')}`
      : json?.error ?? `HTTP ${res.status}`
    throw new Error(`Finance Now API error ${res.status}: ${detail}`)
  }
  return json as T
}

// ─── Server setup ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'finance-now',
  version: '1.0.0',
  description: 'Crypto Asset Evaluation Platform — transfer fees, staking analysis, network fees, prices, and news',
})

// ─── Tool: get_coin_prices ────────────────────────────────────────────────────

server.tool(
  'get_coin_prices',
  'Get live USD prices for one or more cryptocurrencies. Supported coins: btc, eth, usdt, usdc, bnb, sol, dai, xrp, ltc, trx, doge, matic, avax, ada, dot, atom.',
  {
    coins: z.string().optional().describe('Comma-separated coin ids, e.g. "btc,eth,usdt". Omit for all 16 coins.'),
  },
  async ({ coins }) => {
    const qs  = coins ? `?coins=${encodeURIComponent(coins)}` : ''
    const data = await get<{ prices: Record<string, number>; source: string; updatedAt: string }>(`/prices${qs}`)
    const lines = Object.entries(data.prices)
      .map(([coin, price]) => `${coin.toUpperCase()}: $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`)
      .join('\n')
    return {
      content: [{
        type: 'text',
        text: `**Coin Prices** (source: ${data.source}, updated: ${new Date(data.updatedAt).toLocaleTimeString()})\n\n${lines}`,
      }],
    }
  }
)

// ─── Tool: list_exchanges ─────────────────────────────────────────────────────

server.tool(
  'list_exchanges',
  'List all cryptocurrency exchanges supported by the Finance Now transfer fee calculator. Returns exchange ids (needed for find_transfer_routes), names, tiers, and supported coins.',
  {
    tier: z.enum(['1', '2']).optional().describe('Filter by tier: 1 = major regulated exchanges (Binance, Coinbase, Kraken…), 2 = smaller regional exchanges.'),
  },
  async ({ tier }) => {
    const qs   = tier ? `?tier=${tier}` : ''
    const data  = await get<{ exchanges: Array<{ id: string; name: string; tier: number; coins: string[] }>; total: number }>(`/exchanges${qs}`)
    const lines = data.exchanges.map(ex =>
      `• **${ex.name}** (id: \`${ex.id}\`, tier ${ex.tier}) — coins: ${ex.coins.join(', ')}`
    ).join('\n')
    return {
      content: [{
        type: 'text',
        text: `**Supported Exchanges** (${data.total} total)\n\nUse these \`id\` values in the \`find_transfer_routes\` tool.\n\n${lines}`,
      }],
    }
  }
)

// ─── Tool: find_transfer_routes ───────────────────────────────────────────────

server.tool(
  'find_transfer_routes',
  'Find the cheapest routes to transfer a cryptocurrency between two exchanges or wallets. Returns all viable routes sorted by cost, with per-hop fee breakdown and safety warnings. Use "wallet" as from/to for a personal self-custody wallet.',
  {
    from:   z.string().describe('Source exchange id (from list_exchanges) or "wallet". E.g. "binance"'),
    to:     z.string().describe('Destination exchange id or "wallet". E.g. "coinbase"'),
    coin:   z.string().describe('Coin to transfer. E.g. "usdt", "btc", "eth", "sol"'),
    amount: z.number().optional().describe('Amount in coin units. Uses a sensible default if omitted.'),
  },
  async ({ from, to, coin, amount }) => {
    const params = new URLSearchParams({ from, to, coin })
    if (amount) params.set('amount', String(amount))
    const data = await get<{
      from: string; to: string; coin: string; amount: number; amountUsd: number
      summary: { viableRoutes: number; blockedRoutes: number; cheapestFeeUsd: number | null; cheapestNetwork: string | null; cheapestFeePercent: number | null }
      routes: Array<{
        viable: boolean; recommended: boolean; network: string | null
        totalFeeUsd: number; feePercent: number; estimatedTimeMin: number | null
        hops: Array<{ type: string; from: string; to: string; network: string | null; feeUsd: number; networkName: string | null; confirmationMin: number | null }>
        warnings: Array<{ level: string; message: string }>
      }>
    }>(`/transfer/routes?${params}`)

    const { summary, routes } = data
    const viable  = routes.filter(r => r.viable)
    const blocked = routes.filter(r => !r.viable)

    let text = `**Transfer Routes: ${data.from} → ${data.to} | ${data.amount} ${data.coin} (~$${data.amountUsd.toLocaleString()})**\n\n`
    text += `${summary.viableRoutes} viable route${summary.viableRoutes !== 1 ? 's' : ''}, ${summary.blockedRoutes} blocked\n`
    if (summary.cheapestFeeUsd != null) {
      text += `Best: **$${summary.cheapestFeeUsd.toFixed(4)}** via ${summary.cheapestNetwork} (${summary.cheapestFeePercent?.toFixed(3)}% of transfer)\n`
    }

    if (viable.length > 0) {
      text += '\n**Viable Routes:**\n'
      for (const route of viable) {
        text += `\n${route.recommended ? '⭐ ' : ''}**${route.network ?? 'multi-hop'}** — $${route.totalFeeUsd.toFixed(4)} (${route.feePercent.toFixed(3)}%)`
        if (route.estimatedTimeMin) text += ` | ~${route.estimatedTimeMin} min`
        text += '\n'
        for (const hop of route.hops) {
          text += `  ${hop.type}: ${hop.from} → ${hop.to}`
          if (hop.networkName) text += ` via ${hop.networkName}`
          text += ` | fee $${hop.feeUsd.toFixed(4)}`
          if (hop.confirmationMin) text += ` | ~${hop.confirmationMin} min`
          text += '\n'
        }
        if (route.warnings.length > 0) {
          for (const w of route.warnings) {
            const icon = w.level === 'danger' ? '🚨' : w.level === 'warning' ? '⚠️' : 'ℹ️'
            text += `  ${icon} ${w.message}\n`
          }
        }
      }
    }

    if (blocked.length > 0) {
      text += `\n**Blocked Routes (${blocked.length}):**\n`
      for (const route of blocked) {
        text += `• ${route.network ?? 'multi-hop'}: ${route.warnings.map(w => w.message).join('; ')}\n`
      }
    }

    return { content: [{ type: 'text', text }] }
  }
)

// ─── Tool: get_network_fees ───────────────────────────────────────────────────

server.tool(
  'get_network_fees',
  'Get current blockchain network gas fees for all 16 supported networks (Ethereum, Solana, Bitcoin, BNB Chain, Polygon, Arbitrum, Base, Optimism, Avalanche, XRPL, Litecoin, Dogecoin, Cardano, Polkadot, Cosmos, TRON). BTC fees are fetched live from mempool.space.',
  {},
  async () => {
    const data = await get<{
      fees: Record<string, { feeNative: number; nativeToken: string; feeUsd: number; source: string }>
      btcSatPerVbyte: number | null; priceSource: string; updatedAt: string
    }>('/network-fees')

    const sorted = Object.entries(data.fees).sort(([, a], [, b]) => a.feeUsd - b.feeUsd)
    const lines  = sorted.map(([network, fee]) =>
      `• **${network}**: $${fee.feeUsd.toFixed(4)} (${fee.feeNative} ${fee.nativeToken}) [${fee.source}]`
    ).join('\n')

    let text = `**Network Fees** — sorted cheapest to most expensive\n(prices: ${data.priceSource}, updated: ${new Date(data.updatedAt).toLocaleTimeString()})\n`
    if (data.btcSatPerVbyte) text += `BTC: ${data.btcSatPerVbyte} sat/vByte (live from mempool.space)\n`
    text += `\n${lines}`

    return { content: [{ type: 'text', text }] }
  }
)

// ─── Tool: get_staking_opportunities ─────────────────────────────────────────

server.tool(
  'get_staking_opportunities',
  'Find staking opportunities for a cryptocurrency across CeFi exchanges (Coinbase, Kraken, Binance…), self-custody wallets (Ledger, MetaMask, Phantom…), and liquid staking protocols (Lido, Rocket Pool, Marinade, Jito…). Each result includes APR/APY (live where available, otherwise estimates), lock-up period, custody model, and a risk score (1–10 composite across custody, counterparty, smart contract, slashing, liquidity, and regulatory dimensions).',
  {
    coin:     z.string().optional().describe('Coin id to filter by. E.g. "eth", "sol", "ada", "dot", "atom". Omit for all stakeable coins.'),
    category: z.enum(['cefi', 'wallet', 'liquid']).optional().describe('cefi = exchange staking (custodial), wallet = self-custody wallet delegation, liquid = liquid staking protocols (stETH, mSOL, etc.)'),
    max_risk: z.number().min(1).max(10).optional().describe('Maximum acceptable risk score (1–10). E.g. 4 = only low-risk options. Default: 10 (all).'),
  },
  async ({ coin, category, max_risk }) => {
    const params = new URLSearchParams()
    if (coin)     params.set('coin', coin)
    if (category) params.set('category', category)
    if (max_risk) params.set('max_risk', String(max_risk))

    const data = await get<{
      opportunities: Array<{
        provider: string; providerName: string; category: string; defunct: boolean
        coin: string; coinId: string; apr: number; aprSource: string
        lockupDays: number; lockupNote: string | null; liquid: boolean
        receiptToken: string | null; minStakeNative: number
        custodyModel: string; riskScore: number; riskLevel: string
        riskBreakdown: Record<string, number>; features: string[]
        tvlBillions: number | null; auditCount: number | null
      }>
      total: number; updatedAt: string
    }>(`/staking/opportunities?${params}`)

    if (data.total === 0) {
      return { content: [{ type: 'text', text: `No staking opportunities found for the given filters.` }] }
    }

    const riskIcon = (level: string) => ({ low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' }[level] ?? '⚪')
    const custodyIcon = (model: string) => ({ custodial: '🏦', 'non-custodial': '🔑', 'smart-contract': '📜' }[model] ?? '')

    let text = `**Staking Opportunities** (${data.total} results, updated: ${new Date(data.updatedAt).toLocaleTimeString()})\n\n`

    // Group by coin for readability
    const byCoin: Record<string, typeof data.opportunities> = {}
    for (const opp of data.opportunities) {
      ;(byCoin[opp.coin] ??= []).push(opp)
    }

    for (const [coinSymbol, opps] of Object.entries(byCoin)) {
      text += `### ${coinSymbol}\n`
      for (const opp of opps) {
        text += `\n${riskIcon(opp.riskLevel)} **${opp.providerName}** (${opp.category}) ${custodyIcon(opp.custodyModel)}\n`
        text += `  APY: **${opp.apr.toFixed(2)}%**${opp.aprSource === 'live' ? ' 🔴 live' : ' (estimate)'}`
        if (opp.receiptToken) text += ` → ${opp.receiptToken}${opp.liquid ? ' (liquid)' : ''}`
        text += '\n'
        text += `  Lock-up: ${opp.lockupDays === 0 ? 'None' : `${opp.lockupDays} days`}`
        if (opp.minStakeNative > 0) text += ` | Min: ${opp.minStakeNative} ${opp.coinId.toUpperCase()}`
        text += '\n'
        text += `  Risk: ${opp.riskScore.toFixed(1)}/10 (${opp.riskLevel})`
        if (opp.tvlBillions) text += ` | TVL: $${opp.tvlBillions}B`
        if (opp.auditCount)  text += ` | Audits: ${opp.auditCount}`
        text += '\n'
      }
      text += '\n'
    }

    text += `---\n🏦 custodial (exchange holds keys)  🔑 non-custodial (you hold keys)  📜 smart-contract (on-chain code)\n`
    text += `Risk score: 🟢 low (≤3)  🟡 medium (>3–5.5)  🟠 high (>5.5–7.5)  🔴 critical (>7.5)`

    return { content: [{ type: 'text', text }] }
  }
)

// ─── Tool: get_crypto_news ────────────────────────────────────────────────────

server.tool(
  'get_crypto_news',
  'Get recent crypto news articles with sentiment analysis and coin tagging. Articles are aggregated from the configured providers (CryptoPanic, Messari, NewsAPI, GNews). Each article is tagged with sentiment (positive/negative/neutral), a category (regulation/security/adoption/macro/protocol/global/general), and the coins it relates to.',
  {
    coin:      z.string().optional().describe('Filter to articles relevant to this coin. E.g. "btc", "eth", "sol"'),
    limit:     z.number().min(1).max(50).optional().describe('Number of articles to return (1–50, default 10)'),
    sentiment: z.enum(['positive', 'negative', 'neutral']).optional().describe('Filter by sentiment'),
  },
  async ({ coin, limit = 20, sentiment }) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (coin)      params.set('coin', coin)
    if (sentiment) params.set('sentiment', sentiment)

    const data = await get<{
      articles: Array<{
        title: string; url: string; source: string; publishedAt: string
        sentiment: string; category: string; relatedAssets: string[]
      }>
      total: number; updatedAt: string
    }>(`/news?${params}`)

    if (data.total === 0) {
      return { content: [{ type: 'text', text: 'No news articles found for the given filters.' }] }
    }

    const sentimentIcon = (s: string) => ({ positive: '📈', negative: '📉', neutral: '📰' }[s] ?? '📰')

    const lines = data.articles.map(a => {
      const age   = Math.round((Date.now() - new Date(a.publishedAt).getTime()) / 60000)
      const ageStr = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`
      return `${sentimentIcon(a.sentiment)} **${a.title}**\n   ${a.source} · ${ageStr} · ${a.category}${a.relatedAssets.length ? ` · [${a.relatedAssets.join(', ')}]` : ''}\n   ${a.url}`
    }).join('\n\n')

    const filters = [coin && `coin: ${coin}`, sentiment && `sentiment: ${sentiment}`].filter(Boolean).join(', ')
    return {
      content: [{
        type: 'text',
        text: `**Crypto News** (${data.total} articles${filters ? ` | ${filters}` : ''}, updated: ${new Date(data.updatedAt).toLocaleTimeString()})\n\n${lines}`,
      }],
    }
  }
)

// ─── Tool: compare_staking_risk ───────────────────────────────────────────────

server.tool(
  'compare_staking_risk',
  'Compare the risk profiles of two or more staking providers side by side. Useful for explaining the difference between custodial exchange staking (e.g. Celsius/Coinbase), self-custody wallet staking (e.g. Ledger), and liquid staking protocols (e.g. Lido, Rocket Pool).',
  {
    providers: z.string().describe('Comma-separated provider ids. E.g. "coinbase,lido,rocketpool,ledger-live". Use list_exchanges or get_staking_opportunities to find valid ids.'),
    coin:      z.string().optional().describe('Coin to compare for (affects asset-level risk overrides). E.g. "eth"'),
  },
  async ({ providers, coin }) => {
    const ids = providers.split(',').map(p => p.trim().toLowerCase())
    const params = new URLSearchParams()
    if (coin) params.set('coin', coin)
    params.set('include_defunct', 'true')

    const data = await get<{
      opportunities: Array<{
        provider: string; providerName: string; category: string; defunct: boolean
        coin: string; apr: number; aprSource: string; lockupDays: number
        custodyModel: string; riskScore: number; riskLevel: string
        riskBreakdown: Record<string, number>; liquid: boolean
        receiptToken: string | null
      }>
    }>(`/staking/opportunities?${params}`)

    // Deduplicate: one entry per requested provider (prefer matching coin, else first available)
    const found: typeof data.opportunities = []
    for (const id of ids) {
      const matches = data.opportunities.filter(o => o.provider === id)
      if (matches.length === 0) { found.push({ provider: id, providerName: id, category: '?', defunct: false, coin: '?', apr: 0, aprSource: 'estimate', lockupDays: 0, custodyModel: '?', riskScore: 0, riskLevel: 'unknown', riskBreakdown: {}, liquid: false, receiptToken: null }); continue }
      const coinMatch = coin ? matches.find(m => m.coin.toLowerCase() === coin.toLowerCase()) : null
      found.push(coinMatch ?? matches[0])
    }

    const DIMS = ['custody', 'counterparty', 'contract', 'slashing', 'liquidity', 'regulatory'] as const
    const padR = (s: string, n: number) => s.padEnd(n)
    const padL = (s: string, n: number) => s.padStart(n)

    let text = `**Risk Comparison${coin ? ` — ${coin.toUpperCase()}` : ''}**\n\n`

    // Header row
    const nameWidth = 18
    text += padR('', nameWidth)
    for (const p of found) text += padL(p.providerName.slice(0, 12), 14)
    text += '\n' + '─'.repeat(nameWidth + found.length * 14) + '\n'

    // APY row
    text += padR('APY', nameWidth)
    for (const p of found) text += padL(p.apr > 0 ? `${p.apr.toFixed(2)}%` : 'N/A', 14)
    text += '\n'

    // Lock-up
    text += padR('Lock-up', nameWidth)
    for (const p of found) text += padL(p.lockupDays === 0 ? 'None' : `${p.lockupDays}d`, 14)
    text += '\n'

    // Custody model
    text += padR('Custody', nameWidth)
    for (const p of found) text += padL(p.custodyModel.replace('smart-contract', 'on-chain'), 14)
    text += '\n'

    // Liquid
    text += padR('Liquid token', nameWidth)
    for (const p of found) text += padL(p.liquid ? (p.receiptToken ?? 'yes') : 'no', 14)
    text += '\n'

    text += '─'.repeat(nameWidth + found.length * 14) + '\n'

    // Risk score
    text += padR('RISK SCORE', nameWidth)
    for (const p of found) text += padL(`${p.riskScore.toFixed(1)}/10`, 14)
    text += '\n'

    // Risk dimensions
    for (const dim of DIMS) {
      text += padR(`  ${dim}`, nameWidth)
      for (const p of found) text += padL(String(p.riskBreakdown[dim] ?? '?'), 14)
      text += '\n'
    }

    text += '\n*Risk scores: 1 = lowest risk, 10 = highest risk*\n'

    if (found.some(p => p.defunct)) {
      text += '\n⚠️ **Note:** Defunct providers (e.g. Celsius) are shown for educational comparison only. Do not use them — customer funds remain frozen or partially recovered through bankruptcy.'
    }

    return { content: [{ type: 'text', text }] }
  }
)

// ─── Tool: get_security_quotes ────────────────────────────────────────────────

server.tool(
  'get_security_quotes',
  'Get quotes for stocks, ETFs, mutual funds, and macro instruments (commodity/rate futures like GC=F or ZN=F, FX pairs like EURUSD=X, yield indices like ^TNX). Symbols use the dash form for class shares (BRK-B, not BRK.B). Quotes marked reference are static catalog prices, not live readings. NOTE: every live quote provider requires an API key on the Finance Now instance, and macro-instrument coverage is partial — an unpriced symbol comes back absent or reference-flagged, and must be reported as such rather than estimated.',
  {
    symbols: z.string().describe('Comma-separated tickers, max 25. E.g. "AAPL,VOO,GC=F,^TNX".'),
  },
  async ({ symbols }) => {
    const data = await get<{
      quotes: Record<string, { symbol: string; reference?: boolean; price: number; change: number | null; changePercent: number | null; marketCap: number | null; volume: number | null }>
      source: string
      missing: string[]
      updatedAt: string
    }>(`/securities/quotes?symbols=${encodeURIComponent(symbols)}`)

    const lines = Object.values(data.quotes).map(q => {
      const chg = q.changePercent != null ? ` (${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%)` : ''
      const ref = q.reference ? ' — ⚠ reference price, not live' : ''
      return `• **${q.symbol}**: $${q.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}${chg}${ref}`
    }).join('\n')
    const missing = data.missing.length > 0 ? `\n\nNo quote available for: ${data.missing.join(', ')}` : ''
    return {
      content: [{
        type: 'text',
        text: `**Security Quotes** (source: ${data.source}, updated: ${new Date(data.updatedAt).toLocaleTimeString()})\n\n${lines}${missing}`,
      }],
    }
  }
)

// ─── Tool: get_security_history ───────────────────────────────────────────────

server.tool(
  'get_security_history',
  'Get daily close-price history for any quotable security or macro instrument (stocks, ETFs, mutual funds, futures, FX pairs, yield indices). Returns the series summary plus recent closes and the 52-week range.',
  {
    symbol: z.string().describe('Ticker, e.g. "AAPL", "VOO", "GC=F".'),
    range: z.enum(['1mo', '3mo', '6mo', '1y', '5y', 'max']).optional().describe('Lookback window (default 1y).'),
  },
  async ({ symbol, range }) => {
    const qs = `?symbol=${encodeURIComponent(symbol)}${range ? `&range=${range}` : ''}`
    const data = await get<{
      symbol: string; range: string; currency: string
      points: Array<{ date: string; close: number }>
      previousClose: number | null; fiftyTwoWeekHigh: number | null; fiftyTwoWeekLow: number | null
    }>(`/securities/history${qs}`)

    const pts = data.points
    if (pts.length === 0) {
      return { content: [{ type: 'text', text: `No price history available for ${data.symbol}.` }] }
    }
    const first = pts[0], last = pts[pts.length - 1]
    const totalPct = first.close > 0 ? ((last.close - first.close) / first.close) * 100 : 0
    const recent = pts.slice(-10).map(p => `${p.date}: ${p.close.toLocaleString('en-US', { maximumFractionDigits: 4 })}`).join('\n')
    const range52 = data.fiftyTwoWeekLow != null && data.fiftyTwoWeekHigh != null
      ? `\n52-week range: ${data.fiftyTwoWeekLow.toLocaleString()} – ${data.fiftyTwoWeekHigh.toLocaleString()}`
      : ''
    return {
      content: [{
        type: 'text',
        text: `**${data.symbol} — ${data.range} history** (${data.currency}, ${pts.length} daily closes)\n\n`
          + `${first.date} → ${last.date}: ${first.close.toLocaleString()} → ${last.close.toLocaleString()} (${totalPct >= 0 ? '+' : ''}${totalPct.toFixed(2)}%)${range52}\n\n`
          + `Last 10 closes:\n${recent}`,
      }],
    }
  }
)

// ─── Tool: get_yield_curve ────────────────────────────────────────────────────

server.tool(
  'get_yield_curve',
  'Get the official US Treasury daily par yield curve (13 maturities, 1M–30Y, from treasury.gov) with the 2s10s and 3m10y spreads and a shape classification (normal/flat/inverted). The authoritative curve, published once per business day.',
  {},
  async () => {
    const data = await get<{
      latest: { date: string; points: Array<{ label: string; yieldPct: number }> }
      spread2s10s?: number; spread3m10y?: number; shape?: string
    }>(`/macro/yield-curve`)

    const points = data.latest.points.map(p => `${p.label.padStart(3)}: ${p.yieldPct.toFixed(2)}%`).join('\n')
    const spreads = [
      data.spread2s10s != null ? `2s10s: ${data.spread2s10s >= 0 ? '+' : ''}${data.spread2s10s.toFixed(2)}pp` : null,
      data.spread3m10y != null ? `3m10y: ${data.spread3m10y >= 0 ? '+' : ''}${data.spread3m10y.toFixed(2)}pp` : null,
      data.shape ? `shape: ${data.shape}` : null,
    ].filter(Boolean).join(' · ')
    return {
      content: [{
        type: 'text',
        text: `**US Treasury Par Yield Curve** (${data.latest.date}, source: treasury.gov)\n\n${points}\n\n${spreads}`,
      }],
    }
  }
)

// ─── Tool: get_fx_rates ───────────────────────────────────────────────────────

server.tool(
  'get_fx_rates',
  'Get daily ECB reference FX rates (USD base, ~30 currencies, official central-bank tier). Rates are units per 1 USD, published once per business day. Errors on codes outside the ECB set rather than falling back to community data.',
  {
    symbols: z.string().optional().describe('Comma-separated ISO codes to filter, e.g. "EUR,JPY,GBP". Omit for the full ECB set.'),
  },
  async ({ symbols }) => {
    const qs = symbols ? `?symbols=${encodeURIComponent(symbols)}` : ''
    const data = await get<{ date: string; base: string; rates: Record<string, number> }>(`/macro/fx-rates${qs}`)
    const lines = Object.entries(data.rates)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, rate]) => `${code}: ${rate.toLocaleString('en-US', { maximumFractionDigits: 6 })}`)
      .join('\n')
    return {
      content: [{
        type: 'text',
        text: `**ECB Reference FX Rates** (${data.date}, base ${data.base} — units per 1 USD)\n\n${lines}`,
      }],
    }
  }
)

// ─── Tool: run_audit ─────────────────────────────────────────────────────────

import { execFile } from 'child_process'
import { promisify } from 'util'
import { readdir, readFile } from 'fs/promises'
import { join, resolve } from 'path'

const execFileAsync = promisify(execFile)

// On Windows, import.meta.url gives file:///C:/... — strip the leading slash from pathname
const _metaPath = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const FRONTEND_DIR = resolve(_metaPath, '../../frontend')

// All live-data routes to probe, with expected response field checks
const LIVE_DATA_ROUTES: Array<{
  path: string
  label: string
  checks: Array<{ field: string; type: 'string' | 'number' | 'boolean' | 'array' | 'object' }>
}> = [
  {
    path: '/live-data/markets',
    label: 'Markets (prices)',
    checks: [
      { field: 'ok', type: 'boolean' },
      { field: 'quotes', type: 'object' },
    ],
  },
  {
    path: '/live-data/fear-greed',
    label: 'Fear & Greed Index',
    checks: [
      { field: 'ok', type: 'boolean' },
      { field: 'value', type: 'number' },
      { field: 'classification', type: 'string' },
    ],
  },
  {
    path: '/live-data/btc-stats',
    label: 'BTC Network Stats',
    checks: [
      { field: 'ok', type: 'boolean' },
      { field: 'blockHeight', type: 'number' },
      { field: 'fees', type: 'object' },
    ],
  },
  {
    path: '/live-data/defi-tvl',
    label: 'DeFi TVL (DefiLlama)',
    checks: [
      { field: 'ok', type: 'boolean' },
      { field: 'totalTvl', type: 'number' },
      { field: 'chains', type: 'array' },
    ],
  },
  {
    path: '/live-data/funding-rates',
    label: 'Funding Rates (OKX)',
    checks: [
      { field: 'ok', type: 'boolean' },
      { field: 'rates', type: 'array' },
    ],
  },
  {
    path: '/live-data/network-fees',
    label: 'Network Gas Fees',
    checks: [
      { field: 'ok', type: 'boolean' },
      { field: 'networkFees', type: 'object' },
    ],
  },
  {
    path: '/live-data/staking-rates',
    label: 'Staking Rates',
    checks: [
      { field: 'ok', type: 'boolean' },
      { field: 'rates', type: 'object' },
    ],
  },
  {
    path: '/live-data/news',
    label: 'News Feed',
    checks: [
      { field: 'articles', type: 'array' },
    ],
  },
]

function checkType(value: unknown, type: string): boolean {
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value)
  return typeof value === type
}

async function runTsc(): Promise<{ passed: boolean; errorCount: number; output: string }> {
  try {
    await execFileAsync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
      cwd: FRONTEND_DIR,
      shell: true,
      timeout: 60_000,
    })
    return { passed: true, errorCount: 0, output: 'No type errors' }
  } catch (err: unknown) {
    const out = (err as { stdout?: string; stderr?: string }).stdout ?? ''
    const errorCount = (out.match(/error TS/g) ?? []).length
    const lines = out.split('\n').filter((l: string) => l.includes('error TS')).slice(0, 20)
    return { passed: false, errorCount, output: lines.join('\n') || out.slice(0, 1000) }
  }
}

async function probeRoutes(): Promise<Array<{
  label: string
  path: string
  status: 'pass' | 'fail' | 'error'
  httpStatus?: number
  latencyMs?: number
  issues: string[]
}>> {
  return Promise.all(
    LIVE_DATA_ROUTES.map(async ({ path, label, checks }) => {
      const url = `${BASE_URL}${path}`
      const t0 = Date.now()
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
        const latencyMs = Date.now() - t0
        const issues: string[] = []

        if (!res.ok) {
          return { label, path, status: 'fail' as const, httpStatus: res.status, latencyMs, issues: [`HTTP ${res.status}`] }
        }

        let body: Record<string, unknown>
        try {
          body = await res.json() as Record<string, unknown>
        } catch {
          return { label, path, status: 'fail' as const, httpStatus: res.status, latencyMs, issues: ['Invalid JSON response'] }
        }

        for (const { field, type } of checks) {
          if (!(field in body)) {
            issues.push(`Missing field: ${field}`)
          } else if (!checkType(body[field], type)) {
            issues.push(`Field "${field}" expected ${type}, got ${typeof body[field]}`)
          } else if (type === 'array' && (body[field] as unknown[]).length === 0) {
            issues.push(`Field "${field}" is an empty array`)
          }
        }

        // Check for ok:false
        if ('ok' in body && body.ok === false) {
          issues.push('Response has ok:false — upstream fetch may have failed')
        }

        return {
          label,
          path,
          status: issues.length === 0 ? 'pass' as const : 'fail' as const,
          httpStatus: res.status,
          latencyMs,
          issues,
        }
      } catch (err: unknown) {
        return {
          label,
          path,
          status: 'error' as const,
          latencyMs: Date.now() - t0,
          issues: [(err as Error).message ?? 'Unknown error'],
        }
      }
    })
  )
}

async function scanCodeQuality(): Promise<{
  anyCount: number
  consoleLogs: number
  missingErrorBoundaries: number
  findings: string[]
}> {
  const findings: string[] = []
  let anyCount = 0
  let consoleLogs = 0
  let missingErrorBoundaries = 0

  async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === 'dist') continue
      const full = join(dir, e.name)
      if (e.isDirectory()) files.push(...await walk(full))
      else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) files.push(full)
    }
    return files
  }

  const files = await walk(join(FRONTEND_DIR, 'src'))

  for (const file of files) {
    const src = await readFile(file, 'utf-8')
    const rel = file.replace(FRONTEND_DIR, '').replace(/\\/g, '/')

    // Count : any (type-level)
    const anyMatches = src.match(/: any\b/g) ?? []
    if (anyMatches.length > 0) {
      anyCount += anyMatches.length
      findings.push(`${rel}: ${anyMatches.length} use(s) of \`: any\``)
    }

    // console.log/warn/error left in non-route files (exclude ErrorBoundary — intentional)
    if (!rel.includes('/live-data/') && !rel.includes('/api/') && !rel.includes('ErrorBoundary')) {
      const logs = src.match(/console\.(log|warn|error)\(/g) ?? []
      if (logs.length > 0) {
        consoleLogs += logs.length
        findings.push(`${rel}: ${logs.length} console.${logs.map(m => m.slice(8, -1)).join('/')} call(s)`)
      }
    }

    // Dashboard layout must have ErrorBoundary wrapping children
    if (rel.endsWith('/(dashboard)/layout.tsx')) {
      if (!src.includes('ErrorBoundary')) {
        missingErrorBoundaries++
        findings.push(`${rel}: dashboard layout missing ErrorBoundary around children`)
      }
    }
  }

  return { anyCount, consoleLogs, missingErrorBoundaries, findings }
}

server.tool(
  'run_audit',
  'Run a full health audit of the Finance Now application. Checks: TypeScript type errors, live-data route health (HTTP status + response shape), and code quality (any types, console.logs, missing error boundaries). Returns a structured pass/fail report.',
  {
    checks: z.array(z.enum(['tsc', 'routes', 'quality'])).optional()
      .describe('Which checks to run. Omit or pass all three to run everything. Options: "tsc" (TypeScript), "routes" (API health), "quality" (code scan).'),
  },
  async ({ checks }) => {
    const run = (c: string) => !checks || checks.includes(c as 'tsc' | 'routes' | 'quality')

    const [tscResult, routeResults, qualityResult] = await Promise.all([
      run('tsc') ? runTsc() : null,
      run('routes') ? probeRoutes() : null,
      run('quality') ? scanCodeQuality() : null,
    ])

    const lines: string[] = []
    const PASS = '✅'
    const FAIL = '❌'
    const WARN = '⚠️'

    lines.push('# Finance Now Audit Report')
    lines.push(`*${new Date().toLocaleString()}*\n`)

    // ── TypeScript ──
    if (tscResult) {
      lines.push('## TypeScript (`tsc --noEmit`)')
      if (tscResult.passed) {
        lines.push(`${PASS} No type errors\n`)
      } else {
        lines.push(`${FAIL} **${tscResult.errorCount} error(s)**\n`)
        lines.push('```')
        lines.push(tscResult.output)
        lines.push('```\n')
      }
    }

    // ── Routes ──
    if (routeResults) {
      const passed = routeResults.filter(r => r.status === 'pass').length
      const failed = routeResults.filter(r => r.status !== 'pass').length
      lines.push(`## Live-Data Routes (${passed}/${routeResults.length} healthy)`)

      for (const r of routeResults) {
        const icon = r.status === 'pass' ? PASS : r.status === 'error' ? '🔴' : FAIL
        const latency = r.latencyMs !== undefined ? ` ${r.latencyMs}ms` : ''
        const http = r.httpStatus ? ` HTTP ${r.httpStatus}` : ''
        lines.push(`${icon} **${r.label}** (\`${r.path}\`)${http}${latency}`)
        for (const issue of r.issues) lines.push(`   — ${issue}`)
      }
      lines.push('')

      if (failed > 0) {
        lines.push(`${WARN} ${failed} route(s) have issues — check upstream API availability.\n`)
      }
    }

    // ── Code Quality ──
    if (qualityResult) {
      const totalIssues = qualityResult.anyCount + qualityResult.consoleLogs + qualityResult.missingErrorBoundaries
      lines.push(`## Code Quality (${totalIssues === 0 ? 'clean' : `${totalIssues} issue(s)`})`)
      lines.push(`- \`: any\` usages: **${qualityResult.anyCount}**`)
      lines.push(`- \`console.log\` calls in UI: **${qualityResult.consoleLogs}**`)
      lines.push(`- Pages missing ErrorBoundary: **${qualityResult.missingErrorBoundaries}**`)

      if (qualityResult.findings.length > 0) {
        lines.push('\n**Findings:**')
        for (const f of qualityResult.findings.slice(0, 30)) lines.push(`- ${f}`)
        if (qualityResult.findings.length > 30) {
          lines.push(`- … and ${qualityResult.findings.length - 30} more`)
        }
      } else {
        lines.push(`\n${PASS} No quality issues found`)
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  }
)

// ─── Tool: score_options_trade ────────────────────────────────────────────────

const optionLegSchema = z.object({
  side: z.enum(['long', 'short']),
  type: z.enum(['call', 'put']),
  strike: z.number().positive(),
  bid: z.number().min(0),
  ask: z.number().min(0),
  openInterest: z.number().min(0).optional(),
  volume: z.number().min(0).optional(),
  delta: z.number().optional().describe('Signed delta per contract, e.g. -0.30 for an OTM short put'),
})

server.tool(
  'score_options_trade',
  'Score the risk of an options position the USER describes — liquidity, IV environment, assignment, ' +
  'time decay and defined risk — returning a 0-100 safety score (HIGHER = SAFER) with per-dimension ' +
  'detail. Explains risk; does NOT recommend trades or predict profit. Finance Now has no options ' +
  'chain feed, so every option-level number must come from the user (their broker chain) — ask for ' +
  'anything missing rather than inventing a bid, ask, open interest or IV rank. Omitted optional ' +
  'fields lower the confidence figure, never the score.',
  {
    underlyingPrice: z.number().positive().describe('Current price of the underlying'),
    daysToExpiry: z.number().min(0).describe('Calendar days until expiry'),
    legs: z.array(optionLegSchema).min(1).max(8).describe('The position, one entry per leg'),
    ivRank: z.number().min(0).max(100).optional()
      .describe('Where current IV sits in its 52-week range. No keyless source carries IV history — only pass what the user supplies.'),
    earningsInDays: z.number().optional(),
    exDividendInDays: z.number().optional(),
    maxLossUsd: z.union([z.number().min(0), z.literal('unbounded')]).optional()
      .describe('"unbounded" is a real value for naked short exposure — do not omit it to make a trade score better'),
    maxProfitUsd: z.number().optional(),
  },
  async (args) => {
    const data = await post<{
      risk: {
        score: number; band: string; confidence: number; coverage: number
        dimensions: Array<{ label: string; score: number | null; weight: number; evidence: Array<{ metric: string; value: unknown; note?: string }> }>
        warnings: string[]
      }
      netShortPremium: boolean
      disclaimer: string
    }>('/options/score', args)

    const { risk } = data
    const lines = [
      `**Options trade risk: ${risk.score.toFixed(0)}/100 (${risk.band})** — higher is safer`,
      `${data.netShortPremium ? 'Net short premium (credit trade)' : 'Net long premium (debit trade)'} · ` +
      `confidence ${(risk.confidence * 100).toFixed(0)}% · coverage ${(risk.coverage * 100).toFixed(0)}%`,
      '',
      '**By dimension:**',
    ]
    for (const d of risk.dimensions) {
      const score = d.score == null ? 'not scored' : d.score.toFixed(0)
      lines.push(`- ${d.label} (weight ${(d.weight * 100).toFixed(0)}%): ${score}`)
      for (const ev of d.evidence) {
        lines.push(`    ${ev.metric}: ${ev.value ?? '—'}${ev.note ? ` — ${ev.note}` : ''}`)
      }
    }
    if (risk.warnings.length > 0) {
      lines.push('', '**Notes:**')
      for (const w of risk.warnings) lines.push(`- ${w}`)
    }
    lines.push('', `_${data.disclaimer}_`)

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  }
)

// ─── Start server ─────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
