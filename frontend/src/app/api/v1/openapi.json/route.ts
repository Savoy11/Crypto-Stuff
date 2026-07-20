import { NextResponse } from 'next/server'
import { CORS, options } from '../../_cors'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

const SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'CAEP API',
    version: '1.0.0',
    description: 'Crypto Asset Evaluation Platform — programmatic access to transfer fee routing, staking opportunity analysis, live network fees, coin prices, and crypto news with sentiment. Designed for AI agents and automated workflows.',
    contact: { name: 'CAEP', url: 'http://localhost:3000' },
  },
  servers: [
    { url: 'http://localhost:3000/api/v1', description: 'Local development' },
  ],
  tags: [
    { name: 'prices',   description: 'Live coin prices from CoinGecko' },
    { name: 'transfer', description: 'Transfer fee routing between exchanges and wallets' },
    { name: 'staking',  description: 'Staking opportunities with APY and risk scoring' },
    { name: 'network',  description: 'Blockchain network gas fees' },
    { name: 'news',     description: 'Crypto news with sentiment and asset tagging' },
  ],
  paths: {
    '/prices': {
      get: {
        tags: ['prices'],
        summary: 'Get live coin prices',
        description: 'Returns USD prices for one or more coins. Fetched from CoinGecko with static fallbacks.',
        parameters: [
          { name: 'coins', in: 'query', description: 'Comma-separated coin ids (e.g. btc,eth,usdt). Omit for all 16 coins.', schema: { type: 'string', example: 'btc,eth,usdt' } },
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
        description: 'Returns gas/network fees for all 16 supported blockchains. BTC fees are fetched live from mempool.space. All fees are price-adjusted using live CoinGecko prices.',
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
  },
  components: {
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: { error: { type: 'string' } },
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
                recommended:      { type: 'boolean' },
                network:          { type: 'string', nullable: true },
                totalFeeUsd:      { type: 'number' },
                feePercent:       { type: 'number' },
                estimatedTimeMin: { type: 'number', nullable: true },
                hops: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type:            { type: 'string', enum: ['withdraw', 'deposit', 'network'] },
                      from:            { type: 'string' },
                      to:              { type: 'string' },
                      network:         { type: 'string', nullable: true },
                      feeCoin:         { type: 'string', nullable: true },
                      feeNative:       { type: 'number', nullable: true },
                      feeUsd:          { type: 'number' },
                      networkName:     { type: 'string', nullable: true },
                      confirmationMin: { type: 'number', nullable: true },
                    },
                  },
                },
                warnings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      level:   { type: 'string', enum: ['danger', 'warning', 'info'] },
                      message: { type: 'string' },
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
                aprSource:      { type: 'string', enum: ['live', 'estimate'] },
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
    },
  },
}

export async function GET() {
  return NextResponse.json(SPEC, { headers: CORS })
}
