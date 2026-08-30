import type { Asset, AssetDetail, MarketData } from '@/types/asset'
import { ASSET_CATALOG } from '@/lib/data/assetCatalog'
import { coingeckoIdFor } from './coingeckoIds'
import type { LiveQuote } from './liveClient'

// Builds the live-mode asset views. Static metadata (name, symbol, chain,
// issuer, description, contract address, etc.) is retained from the catalog;
// numeric market fields are overlaid from the live quote. Reserve/peg metrics
// with no free live source stay null so the UI renders "N/A" instead of
// fabricated numbers.
//
// riskScore/riskBand are NO LONGER nulled here: a real live composite exists at
// /live-data/risk-scores, joined onto assets at the hook layer (see
// lib/api/live/riskScores.ts). The catalog already exports riskScore/riskBand as
// null (the fabricated literals were deleted in R2 Phase 1), so unscored assets
// remain null and honest until the composite is joined.

// Returns a copy of the catalog asset with all live market numerics nulled.
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
    fdv: quote.fdv ?? null,
    priceChange7d: quote.priceChange7d ?? null,
    priceChange30d: quote.priceChange30d ?? null,
    athChangePct: quote.athChangePct ?? null,
    circulatingSupply: quote.circulatingSupply ?? null,
    totalSupply: quote.totalSupply ?? null,
    maxSupply: quote.maxSupply ?? null,
    marketCapRank: quote.marketCapRank ?? null,
  }
}

export function buildLiveAssets(quotes: Record<string, LiveQuote>): Asset[] {
  return ASSET_CATALOG.map((meta) => overlayQuote(meta, quotes[meta.id]))
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
  const meta = ASSET_CATALOG.find((a) => a.id === assetId)
  // D-5 fix: an unknown id used to fall back to ASSET_CATALOG[0], so
  // /assets/<any-garbage> rendered the USDC detail page with a 200 — wrong data
  // with a confident face, and the page's real not-found state was unreachable.
  // Throwing here is what lets that state render.
  if (!meta) throw new Error(`Unknown asset id: ${assetId}`)
  const asset = overlayQuote(meta, quote)
  return {
    ...asset,
    latestMarketData: buildLiveMarketData(meta.id, quote),
    // Strict N/A — no free live source for these.
    latestReserve: null,
    analyticsBundle: null,
  }
}
