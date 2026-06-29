import type { Asset, AssetDetail, MarketData } from '@/types/asset'
import { MOCK_ASSETS } from '@/lib/api/mock/mockAssets'
import { coingeckoIdFor } from './coingeckoIds'
import type { LiveQuote } from './liveClient'

// Builds the live-mode asset views. Static metadata (name, symbol, chain,
// issuer, description, contract address, etc.) is retained from the catalog;
// numeric market fields are overlaid from the live quote, and everything that
// has no free live source — derived risk/reserve/peg metrics — is nulled out so
// the UI renders "N/A" instead of fabricated numbers.

// Returns a copy of the catalog asset with all live + derived numerics nulled.
// This is the base for both the "no live data" case and the overlay case.
function nulledAsset(meta: Asset): Asset {
  return {
    ...meta,
    coingeckoId: coingeckoIdFor(meta.id),
    marketCap: null,
    price: null,
    volume24h: null,
    priceChange24h: null,
    priceChangePercent24h: null,
    pegDeviation: null,
    pegDeviationBps: null,
    riskScore: null,
    riskBand: null,
    reserveRatio: null,
  }
}

function overlayQuote(meta: Asset, quote: LiveQuote | undefined): Asset {
  const base = nulledAsset(meta)
  if (!quote) return base
  return {
    ...base,
    price: quote.price,
    marketCap: quote.marketCap,
    volume24h: quote.volume24h,
    priceChange24h: quote.priceChange24h,
    priceChangePercent24h: quote.priceChange24h,
  }
}

export function buildLiveAssets(quotes: Record<string, LiveQuote>): Asset[] {
  return MOCK_ASSETS.map((meta) => overlayQuote(meta, quotes[meta.id]))
}

export function buildLiveMarketData(assetId: string, quote: LiveQuote | undefined): MarketData {
  return {
    id: `md-${assetId}-live`,
    assetId,
    price: quote?.price ?? null,
    marketCap: quote?.marketCap ?? null,
    volume24h: quote?.volume24h ?? null,
    pegDeviation: null,
    priceChange24h: quote?.priceChange24h ?? null,
    priceChangePercent24h: quote?.priceChange24h ?? null,
    high24h: null,
    low24h: null,
    circulatingSupply: quote?.circulatingSupply ?? null,
    totalSupply: null,
    timestamp: new Date().toISOString(),
  }
}

export function buildLiveAssetDetail(assetId: string, quote: LiveQuote | undefined): AssetDetail {
  const meta = MOCK_ASSETS.find((a) => a.id === assetId) ?? MOCK_ASSETS[0]
  const asset = overlayQuote(meta, quote)
  return {
    ...asset,
    latestMarketData: buildLiveMarketData(meta.id, quote),
    // Strict N/A — no free live source for these.
    latestRiskScore: null,
    latestReserve: null,
    analyticsBundle: null,
  }
}
