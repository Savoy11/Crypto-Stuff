import { NextResponse } from 'next/server'
import { CORS, options } from '../_cors'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

export async function GET() {
  return NextResponse.json({
    name: 'CAEP API',
    version: '1.0.0',
    description: 'Crypto Asset Evaluation Platform — programmatic access to transfer fees, staking rates, network fees, news, and exchange data.',
    docs: '/api/v1/openapi.json',
    endpoints: [
      { method: 'GET', path: '/api/v1/prices',                   description: 'Live prices for one or more coins', params: ['coins (csv, default: all)'] },
      { method: 'GET', path: '/api/v1/exchanges',                description: 'List all supported exchanges with coins and networks', params: ['tier (1|2)'] },
      { method: 'GET', path: '/api/v1/network-fees',             description: 'Current gas/network fees for all 16 supported blockchains', params: [] },
      { method: 'GET', path: '/api/v1/transfer/routes',          description: 'Find cheapest transfer routes between two exchanges for a coin', params: ['from (required)', 'to (required)', 'coin (required)', 'amount (default: coin default)'] },
      { method: 'GET', path: '/api/v1/staking/opportunities',    description: 'Staking options for a coin with APY, lock-up, and a safetyScore (0–100, higher = safer)', params: ['coin', 'category (cefi|wallet|liquid)', 'min_safety (0-100 floor)', 'max_risk (1-10, deprecated)'] },
      { method: 'GET', path: '/api/v1/news',                     description: 'Recent news articles for a coin with sentiment analysis', params: ['coin', 'limit (default: 20)', 'sentiment (positive|negative|neutral)'] },
    ],
    supported_coins: ['btc','eth','usdt','usdc','bnb','sol','dai','xrp','ltc','trx','doge','matic','avax','ada','dot','atom'],
    supported_networks: ['erc20','trc20','bep20','solana','polygon','arbitrum','base','optimism','avalanche','bitcoin','xrpl','litecoin','dogecoin','cardano','polkadot','cosmos'],
  }, { headers: CORS })
}
