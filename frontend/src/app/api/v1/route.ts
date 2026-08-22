import { NextResponse } from 'next/server'
import { CORS, options } from '../_cors'
import { COIN_INFO, NETWORKS } from '@/lib/data/transferFees'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

// D-20 fix: the coin/network lists and every count in this discovery document
// are DERIVED from the catalogs, not hand-written. The hand-written versions
// said 16 coins / 16 networks while the API served 22/18, and omitted
// POST /options/score entirely — metadata drift on the surface whose whole job
// is telling consumers what exists.
const SUPPORTED_COINS = Object.keys(COIN_INFO)
const SUPPORTED_NETWORKS = Object.keys(NETWORKS)

export async function GET() {
  return NextResponse.json({
    name: 'Finance Now API',
    version: '1.0.0',
    description: 'Finance Now — programmatic access to transfer fees, staking rates, network fees, news, and exchange data.',
    docs: '/api/v1/openapi.json',
    endpoints: [
      { method: 'GET', path: '/api/v1/prices',                   description: 'Live prices for one or more coins', params: ['coins (csv, default: all)'] },
      { method: 'GET', path: '/api/v1/exchanges',                description: 'List all supported exchanges with coins and networks', params: ['tier (1|2)'] },
      { method: 'GET', path: '/api/v1/network-fees',             description: `Current gas/network fees for all ${SUPPORTED_NETWORKS.length} supported blockchains`, params: [] },
      // Listed, not hidden: a caller should learn this endpoint exists and is
      // deliberately withheld rather than guess it moved. It answers 503.
      { method: 'GET', path: '/api/v1/transfer/routes',          description: 'WITHHELD from this build (503) — the Transfer Fee Calculator is out of the initial rollout while its fee table completes verification.', params: [] },
      { method: 'GET', path: '/api/v1/staking/opportunities',    description: 'Staking options for a coin with APY, lock-up, and a safetyScore (0–100, higher = safer)', params: ['coin', 'category (cefi|wallet|liquid)', 'min_safety (0-100 floor)', 'max_risk (1-10, deprecated)', 'yield_type', 'include_adjacent (default false — excludes lending & governance-token yield)'] },
      { method: 'GET', path: '/api/v1/news',                     description: 'Recent news articles for a coin with sentiment analysis', params: ['coin', 'limit (default: 20)', 'sentiment (positive|negative|neutral)', 'watchlist (comma-separated terms to widen coverage)'] },
      { method: 'GET', path: '/api/v1/securities/quotes',        description: 'Quotes for stocks, ETFs, mutual funds, and macro instruments (futures, FX pairs, yield indices). Every provider is keyed — see /data-sources', params: ['symbols (csv, required, max 25 — e.g. AAPL,VOO,GC=F,^TNX)'] },
      { method: 'GET', path: '/api/v1/securities/history',       description: 'Daily close-price history for any quotable security or macro instrument', params: ['symbol (required)', 'range (1mo|3mo|6mo|1y|5y|max, default 1y)'] },
      { method: 'GET', path: '/api/v1/macro/yield-curve',        description: 'Official US Treasury daily par yield curve (13 maturities) with 2s10s / 3m10y spreads and shape', params: [] },
      { method: 'GET', path: '/api/v1/macro/fx-rates',           description: 'Daily ECB reference FX rates (USD base, ~30 currencies, official tier only)', params: ['symbols (csv filter, optional — e.g. EUR,JPY,GBP)'] },
      { method: 'POST', path: '/api/v1/options/score',           description: 'Score a described options position (0–100, higher = safer, per-dimension evidence). Computes from the request body only — there is no chain feed, so the caller supplies every option-level figure. GET the same path for the schema', params: [] },
    ],
    supported_coins: SUPPORTED_COINS,
    supported_networks: SUPPORTED_NETWORKS,
  }, { headers: CORS })
}
