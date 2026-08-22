import { NextResponse } from 'next/server'
import { CORS, options } from '../../_cors'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

const SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Finance Now API',
    version: '1.0.0',
    description: 'Finance Now — programmatic access to transfer fee routing, staking opportunity analysis, live network fees, coin prices, and crypto news with sentiment. Designed for AI agents and automated workflows.',
    contact: { name: 'Finance Now', url: 'http://localhost:3000' },
  },
  servers: [
    { url: 'http://localhost:3000/api/v1', description: 'Local development' },
  ],
  tags: [
    { name: 'prices',   description: 'Live coin prices from CoinGecko' },
    { name: 'transfer', description: 'Transfer fee routing between exchanges and wallets' },
    { name: 'staking',  description: 'Staking opportunities with APY and risk scoring' },
    { name: 'network',  description: 'Blockchain network gas fees' },
    { name: 'news',       description: 'Crypto news with sentiment and asset tagging' },
    { name: 'securities', description: 'Stock / ETF / mutual-fund / macro-instrument quotes and history' },
    { name: 'macro',      description: 'Treasury yield curve and official FX reference rates' },
    { name: 'options',    description: 'Options-trade risk scoring (computed, not fetched — no chain feed)' },
  ],
  paths: {
    '/prices': {
      get: {
        tags: ['prices'],
        summary: 'Get live coin prices',
        description: 'Returns USD prices for one or more coins. Fetched from CoinGecko with static fallbacks.',
        parameters: [
          { name: 'coins', in: 'query', description: 'Comma-separated coin ids (e.g. btc,eth,usdt). Omit for all supported coins — the list is in GET /api/v1/ (supported_coins).', schema: { type: 'string', example: 'btc,eth,usdt' } },
        ],
        responses: {
          '200': {
            description: 'Coin prices',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PricesResponse' } } },
          },
        },
      },
    },
    '/exchanges': {
      get: {
        tags: ['transfer'],
        summary: 'List all supported exchanges',
        description: 'Returns all exchanges supported by the Transfer Fee Calculator, with their supported coins and networks. Use exchange ids in /transfer/routes.',
        parameters: [
          { name: 'tier', in: 'query', description: '1 = major regulated exchanges (Binance, Coinbase, etc.), 2 = smaller regional exchanges', schema: { type: 'integer', enum: [1, 2] } },
        ],
        responses: {
          '200': {
            description: 'Exchange list',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ExchangesResponse' } } },
          },
        },
      },
    },
    '/network-fees': {
      get: {
        tags: ['network'],
        summary: 'Get current blockchain network fees',
        description: 'Returns gas/network fees for every supported blockchain — the list is in GET /api/v1/ (supported_networks). BTC fees are fetched live from mempool.space. All fees are price-adjusted using live CoinGecko prices.',
        responses: {
          '200': {
            description: 'Network fees',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/NetworkFeesResponse' } } },
          },
        },
      },
    },
    '/transfer/routes': {
      get: {
        tags: ['transfer'],
        summary: 'Find cheapest transfer routes between two exchanges',
        description: 'Calculates all possible routes (direct and multi-hop via personal wallet) to move a coin from one exchange to another. Returns routes sorted by total USD cost, with safety warnings for high-risk actions like EVM address collision.',
        parameters: [
          { name: 'from',   in: 'query', required: true,  description: 'Source exchange id (from /exchanges) or "wallet"', schema: { type: 'string', example: 'binance' } },
          { name: 'to',     in: 'query', required: true,  description: 'Destination exchange id or "wallet"',              schema: { type: 'string', example: 'coinbase' } },
          { name: 'coin',   in: 'query', required: true,  description: 'Coin id to transfer',                              schema: { type: 'string', example: 'usdt' } },
          { name: 'amount', in: 'query', required: false, description: 'Amount in coin units (uses coin default if omitted)', schema: { type: 'number', example: 1000 } },
        ],
        responses: {
          '200': {
            description: 'Transfer routes',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TransferRoutesResponse' } } },
          },
          '400': { description: 'Invalid from/to/coin parameter', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/staking/opportunities': {
      get: {
        tags: ['staking'],
        summary: 'Find staking opportunities for a coin',
        description: 'Returns staking options across CeFi exchanges, self-custody wallets, and liquid staking protocols. Each opportunity includes live APY (where available), lock-up period, custody model, and a composite score across 6 dimensions: custody, counterparty, smart contract, slashing, liquidity, and regulatory risk. SCORING: prefer safetyScore (0–100, HIGHER = SAFER) with its 5-level band and the min_safety filter. The legacy riskScore (1–10, HIGHER = RISKIER), riskLevel, and max_risk are deprecated but unchanged for existing consumers.',
        parameters: [
          { name: 'coin',          in: 'query', description: 'Filter by coin id (e.g. eth, sol, ada)',                                 schema: { type: 'string', example: 'eth' } },
          { name: 'category',      in: 'query', description: 'Filter by provider category',                                            schema: { type: 'string', enum: ['cefi', 'wallet', 'liquid'] } },
          { name: 'min_safety',    in: 'query', description: 'Minimum canonical safety score floor (0–100, HIGHER = SAFER). Only opportunities scoring at or above this are returned. Preferred over the deprecated max_risk.', schema: { type: 'number', example: 60 } },
          { name: 'max_risk',      in: 'query', description: 'DEPRECATED (use min_safety). Maximum legacy composite risk score (1–10, higher = riskier). Default 10 (all providers).', deprecated: true, schema: { type: 'number', example: 5 } },
          { name: 'include_defunct', in: 'query', description: 'Include defunct providers like Celsius as cautionary examples.',       schema: { type: 'boolean', default: false } },
          { name: 'yield_type',    in: 'query', description: 'Filter by how the yield is produced (staking vs lending vs governance-token rewards).', schema: { type: 'string' } },
          { name: 'include_adjacent', in: 'query', description: 'Include yield that is NOT protocol staking — lending and governance-token rewards. DEFAULTS TO FALSE, so the unfiltered response is narrower than the platform UI shows; set true to match it.', schema: { type: 'boolean', default: false } },
        ],
        responses: {
          '200': {
            description: 'Staking opportunities',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StakingOpportunitiesResponse' } } },
          },
        },
      },
    },
    '/news': {
      get: {
        tags: ['news'],
        summary: 'Get recent crypto news with sentiment',
        description: 'Returns news articles from multiple providers (CryptoPanic, Messari, NewsAPI, GNews — whichever are configured). Each article is tagged with sentiment (positive/negative/neutral), category, and the coins it relates to.',
        parameters: [
          { name: 'coin',      in: 'query', description: 'Filter articles to those relevant to this coin id (e.g. btc, eth)',         schema: { type: 'string', example: 'btc' } },
          { name: 'limit',     in: 'query', description: 'Max articles to return (1–50, default 20)',                                 schema: { type: 'integer', default: 20 } },
          { name: 'sentiment', in: 'query', description: 'Filter by sentiment',                                                       schema: { type: 'string', enum: ['positive', 'negative', 'neutral'] } },
        ],
        responses: {
          '200': {
            description: 'News articles',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/NewsResponse' } } },
          },
        },
      },
    },
    '/securities/quotes': {
      get: {
        tags: ['securities'],
        summary: 'Get quotes for securities and macro instruments',
        description: 'Quotes for anything the security ladder prices: stocks, ETFs, mutual funds, commodity/rate futures (GC=F, ZN=F), FX pairs (EURUSD=X), and yield indices (^TNX). Symbols use standard market ticker notation (BRK-B, GC=F, EURUSD=X, ^TNX). Served by the same registry-driven provider ladder the UI reads (FMP → Finnhub → Twelve Data → Tiingo → Alpha Vantage → catalog reference); EVERY live rung requires an API key, so an unkeyed instance returns catalog reference prices for stocks/funds and nothing for macro instruments. Reference-priced quotes carry `reference: true` and must not be treated as live.',
        parameters: [
          { name: 'symbols', in: 'query', required: true, description: 'Comma-separated tickers, max 25 (e.g. AAPL,VOO,GC=F,^TNX)', schema: { type: 'string', example: 'AAPL,VOO,GC=F' } },
        ],
        responses: {
          '200': { description: 'Quotes keyed by symbol', content: { 'application/json': { schema: { $ref: '#/components/schemas/SecurityQuotesResponse' } } } },
          '400': { description: 'Missing or invalid symbols parameter', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '502': { description: 'No provider could serve the batch', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/securities/history': {
      get: {
        tags: ['securities'],
        summary: 'Get daily close-price history',
        description: 'Daily close-only series for any symbol the price-history ladder covers (Tiingo, then FMP — both keyed), oldest first, with previous close and 52-week range. Tiingo covers US-listed equities, ETFs and mutual funds; futures, FX pairs and yield indices depend on FMP coverage.',
        parameters: [
          { name: 'symbol', in: 'query', required: true, description: 'Market ticker, e.g. AAPL or BRK-B', schema: { type: 'string', example: 'AAPL' } },
          { name: 'range',  in: 'query', description: 'Lookback window', schema: { type: 'string', enum: ['1mo', '3mo', '6mo', '1y', '5y', 'max'], default: '1y' } },
        ],
        responses: {
          '200': { description: 'Price history', content: { 'application/json': { schema: { $ref: '#/components/schemas/SecurityHistoryResponse' } } } },
          '400': { description: 'Missing symbol or invalid range', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '502': { description: 'No history available for the symbol', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/macro/yield-curve': {
      get: {
        tags: ['macro'],
        summary: 'Get the official US Treasury par yield curve',
        description: 'The treasury.gov daily par curve — 13 maturities from 1M to 30Y — with ~1-month and start-of-year lookback snapshots, the 2s10s and 3m10y spreads, and a shape classification (normal / flat / inverted). Published once per business day.',
        responses: {
          '200': { description: 'Yield curve with spreads', content: { 'application/json': { schema: { $ref: '#/components/schemas/YieldCurveResponse' } } } },
          '502': { description: 'treasury.gov unreachable or unparsable', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/macro/fx-rates': {
      get: {
        tags: ['macro'],
        summary: 'Get daily ECB reference FX rates',
        description: 'Official-tier daily reference rates (ECB via frankfurter.dev), USD base, ~30 currencies. The UI\'s community-sourced extended tier is deliberately not exposed here — this endpoint returns central-bank reference data or an error, never a blended source.',
        parameters: [
          { name: 'symbols', in: 'query', description: 'Comma-separated ISO codes to filter (e.g. EUR,JPY,GBP). 400s if a code is outside the ECB set.', schema: { type: 'string', example: 'EUR,JPY,GBP' } },
        ],
        responses: {
          '200': { description: 'Reference rates', content: { 'application/json': { schema: { $ref: '#/components/schemas/FxRatesResponse' } } } },
          '400': { description: 'A requested code is not in the ECB reference set', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '502': { description: 'Reference rates unavailable', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/options/score': {
      get: {
        tags: ['options'],
        summary: 'Describe the scoring request schema',
        description: 'Returns the POST body schema and a worked example, so the endpoint is discoverable without the spec.',
        responses: {
          '200': { description: 'Schema and example' },
        },
      },
      post: {
        tags: ['options'],
        summary: 'Score a described options position',
        description: 'Scores an options trade the CALLER describes on the canonical 0-100 safety scale (higher = safer), across liquidity, IV environment, assignment, time decay and defined risk, returning per-dimension scores with evidence plus confidence and coverage. Explains risk; does NOT recommend trades or predict profit. This endpoint does not fetch an options chain — no keyless chain source exists (see docs/assessments/P2-O1-options-data.md) — so every option-level figure must be supplied by the caller. Omitted optional fields lower `confidence`, never the score. maxLossUsd accepts the string "unbounded" for naked short exposure, which is a meaningful value rather than a missing one.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/OptionsScoreRequest' } } },
        },
        responses: {
          '200': { description: 'Composite risk with per-dimension detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/OptionsScoreResponse' } } } },
          '400': { description: 'Invalid trade description — `details` lists every problem found, not just the first', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          details: { type: 'array', items: { type: 'string' }, description: 'Present on validation failures — every problem found, so a caller can fix them in one pass' },
        },
      },
      OptionsLeg: {
        type: 'object',
        required: ['side', 'type', 'strike', 'bid', 'ask'],
        properties: {
          side: { type: 'string', enum: ['long', 'short'] },
          type: { type: 'string', enum: ['call', 'put'] },
          strike: { type: 'number', example: 190 },
          bid: { type: 'number', example: 3.1 },
          ask: { type: 'number', example: 3.25, description: 'Must be >= bid; a crossed market is rejected rather than scored as excellent liquidity' },
          openInterest: { type: 'number', example: 1450 },
          volume: { type: 'number' },
          delta: { type: 'number', example: -0.28, description: 'Signed, per contract' },
        },
      },
      OptionsScoreRequest: {
        type: 'object',
        required: ['underlyingPrice', 'daysToExpiry', 'legs'],
        properties: {
          underlyingPrice: { type: 'number', example: 200 },
          daysToExpiry: { type: 'number', example: 30 },
          legs: { type: 'array', items: { $ref: '#/components/schemas/OptionsLeg' }, minItems: 1, maxItems: 8 },
          ivRank: { type: 'number', minimum: 0, maximum: 100, example: 45, description: 'Where current IV sits in its 52-week range. No keyless source carries IV history — supply it or omit it.' },
          earningsInDays: { type: 'number' },
          exDividendInDays: { type: 'number' },
          maxLossUsd: { oneOf: [{ type: 'number' }, { type: 'string', enum: ['unbounded'] }], example: 19000 },
          maxProfitUsd: { type: 'number' },
        },
      },
      OptionsScoreResponse: {
        type: 'object',
        properties: {
          risk: {
            type: 'object',
            description: 'Composite on the canonical scale — 0-100 where HIGHER = SAFER, matching every other score in this API.',
            properties: {
              score: { type: 'number', example: 62.4 },
              band: { type: 'string', enum: ['low', 'moderate', 'elevated', 'high', 'critical'] },
              confidence: { type: 'number', description: '0-1. Omitted optional inputs lower this, never the score.' },
              coverage: { type: 'number', description: '0-1: share of profile weight actually scored.' },
              dimensions: { type: 'array', items: { type: 'object' }, description: 'Per-dimension score, weight, band and evidence.' },
              warnings: { type: 'array', items: { type: 'string' } },
            },
          },
          netShortPremium: { type: 'boolean', description: 'True when the position collects net premium (a credit trade).' },
          disclaimer: { type: 'string' },
          source: { type: 'string', example: 'finance-now-risk-engine' },
          profileVersion: { type: 'string', example: '1.0.0' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      PricesResponse: {
        type: 'object',
        properties: {
          prices:    { type: 'object', additionalProperties: { type: 'number' }, example: { btc: 95000, eth: 3200, usdt: 1.0 } },
          source:    { type: 'string', enum: ['live', 'fallback'] },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ExchangesResponse: {
        type: 'object',
        properties: {
          exchanges: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id:       { type: 'string', example: 'binance' },
                name:     { type: 'string', example: 'Binance' },
                tier:     { type: 'integer', enum: [1, 2] },
                coins:    { type: 'array', items: { type: 'string' } },
                networks: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          total: { type: 'integer' },
        },
      },
      NetworkFeesResponse: {
        type: 'object',
        properties: {
          fees: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                feeNative:   { type: 'number' },
                nativeToken: { type: 'string' },
                feeUsd:      { type: 'number' },
                source:      { type: 'string', enum: ['live', 'estimate'] },
              },
            },
          },
          btcSatPerVbyte: { type: 'number', nullable: true },
          priceSource:    { type: 'string', enum: ['live', 'fallback'] },
          updatedAt:      { type: 'string', format: 'date-time' },
        },
      },
      TransferRoutesResponse: {
        type: 'object',
        properties: {
          liveOverlay: {
            type: 'object',
            description: 'Which exchanges in this response carry live-fetched withdrawal fees.',
            properties: {
              liveExchanges:      { type: 'array', items: { type: 'string' } },
              candidateExchanges: { type: 'array', items: { type: 'string' } },
              rowsApplied:        { type: 'integer' },
              asOf:               { type: 'string', format: 'date-time', nullable: true },
            },
          },
          withdrawalAvailability: {
            type: 'object',
            description: 'CRITICAL CAVEAT. A route appearing in `routes` is NOT a confirmation that the withdrawal is currently open. Availability was live-checked only for the exchanges in `checkedFor`; for every other exchange the open/closed state is a stored value from `assumedOpenFrom`. Exchanges suspend withdrawals on a network without notice — do not tell a user a transfer will succeed on the strength of this response.',
            properties: {
              checkedForNetworks: { type: 'array', items: { type: 'string' }, description: 'Networks in THIS response whose withdrawal status was live-reported. Scoped per route, not per exchange: a source can report a fee while saying nothing about availability, and can cover some coin/network rows and not others.' },
              assumedOpenFrom: { type: 'string', format: 'date', description: 'Verification date of the stored table whose availability flags are assumed for every other exchange.' },
              note:            { type: 'string' },
            },
          },
          from:      { type: 'string' },
          to:        { type: 'string' },
          coin:      { type: 'string' },
          amount:    { type: 'number' },
          amountUsd: { type: 'number' },
          summary: {
            type: 'object',
            properties: {
              viableRoutes:       { type: 'integer' },
              blockedRoutes:      { type: 'integer' },
              cheapestFeeUsd:     { type: 'number', nullable: true },
              cheapestNetwork:    { type: 'string', nullable: true },
              cheapestFeePercent: { type: 'number', nullable: true },
            },
          },
          routes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                viable:           { type: 'boolean' },
                blockedReason:    { type: 'string', nullable: true, enum: ['below-minimum', 'withdrawals-suspended', null], description: "Why a non-viable route is blocked. 'withdrawals-suspended' is reported by the exchange's live API; 'below-minimum' is arithmetic on the requested amount. null when viable." },
                recommended:      { type: 'boolean' },
                network:          { type: 'string', nullable: true },
                totalFeeUsd:      { type: 'number' },
                feePercent:       { type: 'number' },
                estimatedTime:    { type: 'string', nullable: true, description: 'Human-readable, e.g. "~2–5 min" — not a number.' },
                hops: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      from:        { type: 'string' },
                      to:          { type: 'string' },
                      network:     { type: 'string', nullable: true },
                      exchangeFee: { type: 'number', description: 'Exchange withdrawal fee in USD.' },
                      feeLive:     { type: 'boolean', description: "True when this hop's withdrawal fee came from the exchange's live public API rather than the hand-maintained table. Do not present a stored fee with the confidence of a live one." },
                      availabilityLive: { type: 'boolean', description: "True when THIS route's withdrawal status was live-reported by the exchange. Coverage is per (exchange, coin, network) row, not per exchange — false means the open/closed state is the stored snapshot's assumption." },
                      networkFee:  { type: 'number', description: 'On-chain gas in USD.' },
                      totalFeeUsd: {
                        type: 'number',
                        description: 'Hop total in USD. NOT always exchangeFee + networkFee: when a CEX withdrawal fee already covers gas, only the exchange fee counts, so hop totals sum to the route total.',
                      },
                      nativeToken: { type: 'string', nullable: true },
                      networkName: { type: 'string', nullable: true },
                      note:        { type: 'string', nullable: true },
                    },
                  },
                },
                warnings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      severity: {
                        type: 'string',
                        enum: ['danger', 'warning', 'info'],
                        description: 'Read this field, not "level". "danger" carries the address-collision warnings for EVM networks — do not drop it.',
                      },
                      title:    { type: 'string' },
                      message:  { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      StakingOpportunitiesResponse: {
        type: 'object',
        properties: {
          opportunities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                provider:       { type: 'string', example: 'lido' },
                providerName:   { type: 'string', example: 'Lido Finance' },
                category:       { type: 'string', enum: ['cefi', 'wallet', 'liquid'] },
                defunct:        { type: 'boolean' },
                coin:           { type: 'string', example: 'ETH' },
                coinId:         { type: 'string', example: 'eth' },
                apr:            { type: 'number', example: 3.8, description: 'Annual percentage rate (%)' },
                aprSource:      { type: 'string', enum: ['live', 'derived', 'estimate'], description: 'live = provider-published feed; derived = our estimate anchored to the Lido feed; estimate = curated catalog' },
                lockupDays:     { type: 'integer', example: 0, description: '0 means no forced lock-up' },
                lockupNote:     { type: 'string', nullable: true },
                liquid:         { type: 'boolean', description: 'True if the staked position is itself liquid/tradeable' },
                receiptToken:   { type: 'string', nullable: true, example: 'stETH' },
                minStakeNative: { type: 'number', example: 0 },
                custodyModel:   { type: 'string', enum: ['custodial', 'non-custodial', 'smart-contract'] },
                safetyScore:    { type: 'number', example: 72.2, description: 'Canonical safety score 0–100 (HIGHER = SAFER). Preferred.' },
                band:           { type: 'string', enum: ['low', 'moderate', 'elevated', 'high', 'critical'], description: 'Canonical 5-level band for safetyScore (low = safest).' },
                riskScore:      { type: 'number', example: 3.5, deprecated: true, description: 'DEPRECATED (use safetyScore). Legacy composite risk score 1–10 (10 = highest risk).' },
                riskLevel:      { type: 'string', enum: ['low', 'medium', 'high', 'critical'], deprecated: true, description: 'DEPRECATED (use band). Legacy 4-level vocabulary for riskScore.' },
                riskBreakdown: {
                  type: 'object',
                  properties: {
                    custody:      { type: 'number' },
                    counterparty: { type: 'number' },
                    contract:     { type: 'number' },
                    slashing:     { type: 'number' },
                    liquidity:    { type: 'number' },
                    regulatory:   { type: 'number' },
                  },
                },
                features:    { type: 'array', items: { type: 'string' } },
                tvlBillions: { type: 'number', nullable: true },
                auditCount:  { type: 'integer', nullable: true },
              },
            },
          },
          total:     { type: 'integer' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      NewsResponse: {
        type: 'object',
        properties: {
          articles: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id:            { type: 'string' },
                title:         { type: 'string' },
                url:           { type: 'string', format: 'uri' },
                source:        { type: 'string', example: 'CoinDesk' },
                publishedAt:   { type: 'string', format: 'date-time' },
                sentiment:     { type: 'string', enum: ['positive', 'negative', 'neutral'] },
                category:      { type: 'string', enum: ['regulation', 'security', 'adoption', 'macro', 'protocol', 'global', 'general'] },
                relatedAssets: { type: 'array', items: { type: 'string' }, example: ['btc', 'eth'] },
                summary:       { type: 'string', nullable: true },
              },
            },
          },
          total:     { type: 'integer' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      SecurityQuotesResponse: {
        type: 'object',
        properties: {
          quotes: {
            type: 'object',
            description: 'Keyed by requested symbol.',
            additionalProperties: {
              type: 'object',
              properties: {
                symbol:        { type: 'string' },
                reference:     { type: 'boolean', description: 'True when this is a static catalog reference price, NOT a live reading.' },
                price:         { type: 'number' },
                change:        { type: 'number', nullable: true, description: 'Absolute change vs previous close.' },
                changePercent: { type: 'number', nullable: true },
                previousClose: { type: 'number', nullable: true },
                marketCap:     { type: 'number', nullable: true },
                volume:        { type: 'number', nullable: true },
              },
            },
          },
          source:    { type: 'string', description: "Provider id that served the batch, or 'reference' for catalog prices." },
          missing:   { type: 'array', items: { type: 'string' }, description: 'Symbols requested but not returned by any provider.' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      SecurityHistoryResponse: {
        type: 'object',
        properties: {
          symbol:   { type: 'string' },
          range:    { type: 'string', enum: ['1mo', '3mo', '6mo', '1y', '5y', 'max'] },
          currency: { type: 'string', example: 'USD' },
          points: {
            type: 'array',
            description: 'Daily closes, oldest first.',
            items: {
              type: 'object',
              properties: {
                date:  { type: 'string', format: 'date', example: '2026-07-01' },
                close: { type: 'number' },
              },
            },
          },
          previousClose:     { type: 'number', nullable: true },
          fiftyTwoWeekHigh:  { type: 'number', nullable: true },
          fiftyTwoWeekLow:   { type: 'number', nullable: true },
          updatedAt:         { type: 'string', format: 'date-time' },
        },
      },
      YieldCurveResponse: {
        type: 'object',
        properties: {
          latest:    { $ref: '#/components/schemas/CurveSnapshot' },
          monthAgo:  { $ref: '#/components/schemas/CurveSnapshot' },
          yearStart: { $ref: '#/components/schemas/CurveSnapshot' },
          spread2s10s: { type: 'number', nullable: true, description: '10Y minus 2Y, percentage points — the classic recession signal.' },
          spread3m10y: { type: 'number', nullable: true, description: "10Y minus 3M — the Fed's preferred version." },
          shape:     { type: 'string', enum: ['normal', 'flat', 'inverted'] },
          source:    { type: 'string', enum: ['treasury-gov'] },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CurveSnapshot: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' },
          points: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label:    { type: 'string', example: '10Y' },
                years:    { type: 'number', example: 10 },
                yieldPct: { type: 'number', example: 4.25 },
              },
            },
          },
        },
      },
      FxRatesResponse: {
        type: 'object',
        properties: {
          date:      { type: 'string', format: 'date', description: 'ECB publication date of the reference rates.' },
          base:      { type: 'string', enum: ['USD'] },
          rates:     { type: 'object', additionalProperties: { type: 'number' }, description: 'ISO code → units per 1 USD. USD included at 1.', example: { USD: 1, EUR: 0.92, JPY: 155.3 } },
          source:    { type: 'string', enum: ['frankfurter-ecb'] },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
}

export async function GET() {
  return NextResponse.json(SPEC, { headers: CORS })
}
