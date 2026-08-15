import { NextRequest, NextResponse } from 'next/server'
import { CORS, options } from '@/app/api/_cors'
import {
  EXCHANGES, COIN_INFO, NETWORKS, findTransferPaths, PERSONAL_WALLET_ID,
  type CoinId,
} from '@/lib/data/transferFees'
import { computeNetworkFees } from '@/lib/data/networkFees'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

// D-4 fix: this route used to carry its OWN gas table and price map, and both
// had drifted from the shared fee module — the local STATIC_GAS lacked
// ton_network/near_network (those routes silently vanished from responses), and
// the price map covered 16 of the 22 accepted coins, so LINK/TON/SHIB/UNI/NEAR/
// ARB fell through `?? 1` and were priced at $1 with no warning. It now reads
// lib/data/networkFees.ts — the same 18-network / 22-coin source the UI's
// /live-data/network-fees serves — so v1 and the Transfer Fee Calculator can't
// disagree again.

export type PriceSource = 'live' | 'fallback'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from   = searchParams.get('from')?.toLowerCase()
  const to     = searchParams.get('to')?.toLowerCase()
  const coin   = searchParams.get('coin')?.toLowerCase() as CoinId | null
  const amount = parseFloat(searchParams.get('amount') ?? '0')

  // Validate
  const validIds = [...EXCHANGES.map(e => e.id), PERSONAL_WALLET_ID]
  if (!from)  return NextResponse.json({ error: 'Missing required param: from. Use exchange id from /api/v1/exchanges, or "wallet".' }, { status: 400, headers: CORS })
  if (!to)    return NextResponse.json({ error: 'Missing required param: to. Use exchange id from /api/v1/exchanges, or "wallet".' }, { status: 400, headers: CORS })
  if (!coin)  return NextResponse.json({ error: 'Missing required param: coin. E.g. usdt, btc, eth, sol.' }, { status: 400, headers: CORS })
  if (!validIds.includes(from)) return NextResponse.json({ error: `Unknown source: "${from}". Valid options: ${validIds.join(', ')}` }, { status: 400, headers: CORS })
  if (!validIds.includes(to))   return NextResponse.json({ error: `Unknown destination: "${to}". Valid options: ${validIds.join(', ')}` }, { status: 400, headers: CORS })
  if (!Object.keys(COIN_INFO).includes(coin)) return NextResponse.json({ error: `Unknown coin: "${coin}". Supported: ${Object.keys(COIN_INFO).join(', ')}` }, { status: 400, headers: CORS })
  if (from === to) return NextResponse.json({ error: 'from and to must be different.' }, { status: 400, headers: CORS })

  const { fees: networkFees, prices: coinPrices, priceSource } = await computeNetworkFees()
  const coinInfo    = COIN_INFO[coin]
  const transferAmount = amount > 0 ? amount : coinInfo.defaultAmount

  const coinPrice = coinPrices[coin]
  if (coinPrice == null) {
    // Unreachable while FALLBACK_PRICES covers every CoinId — this exists so a
    // future coin added to COIN_INFO without a price entry fails loudly instead
    // of silently valuing the transfer at $1/coin (the D-4 failure mode).
    return NextResponse.json({ error: `No price available for ${coin}.` }, { status: 500, headers: CORS })
  }

  const paths = findTransferPaths(from, to, coin, transferAmount, networkFees, coinPrices)

  const routes = paths.map(p => ({
    viable:          p.isViable,
    recommended:     p.isRecommended ?? false,
    network:         p.networkId ?? null,
    totalFeeUsd:     p.totalFeeUsd,
    feePercent:      parseFloat(((p.totalFeeUsd / (transferAmount * coinPrice)) * 100).toFixed(3)),
    estimatedTime:   p.estimatedTime,
    hops: p.hops.map(h => ({
      from:          h.from,
      to:            h.to,
      network:       h.networkId ?? null,
      exchangeFee:   h.exchangeFeeUsd,
      networkFee:    h.networkFeeUsd,
      // A CEX withdrawal fee covers the on-chain gas, so summing both on such
      // a hop double-counts it; hop totals must add up to the route total.
      totalFeeUsd:   h.gasCoveredByFee ? h.exchangeFeeUsd : h.exchangeFeeUsd + h.networkFeeUsd,
      nativeToken:   h.nativeGasToken,
      networkName:   h.networkId ? (NETWORKS[h.networkId]?.name ?? h.networkId) : null,
      note:          h.note ?? null,
    })),
    warnings: p.warnings.map(w => ({
      severity: w.type,
      title:    w.title,
      message:  w.message,
    })),
  }))

  const viable   = routes.filter(r => r.viable)
  const blocked  = routes.filter(r => !r.viable)
  const best     = viable.find(r => r.recommended) ?? viable[0] ?? null

  return NextResponse.json({
    from,
    to,
    coin: coin.toUpperCase(),
    amount: transferAmount,
    amountUsd: parseFloat((transferAmount * coinPrice).toFixed(2)),
    summary: {
      viableRoutes: viable.length,
      blockedRoutes: blocked.length,
      cheapestFeeUsd: best?.totalFeeUsd ?? null,
      cheapestNetwork: best?.network ?? null,
      cheapestFeePercent: best?.feePercent ?? null,
    },
    routes,
    priceSource,
    // Every USD figure above is derived from `priceSource`. On 'fallback' the
    // coin prices are stale constants, so amountUsd/feeUsd/feePercent are
    // order-of-magnitude guidance only — say so rather than letting a consumer
    // (or an agent) present them as quotes.
    ...(priceSource === 'fallback'
      ? { warning: 'CoinGecko unavailable — USD amounts are derived from stale fallback prices, not live quotes. Native-token fee amounts are unaffected.' }
      : {}),
    updatedAt: new Date().toISOString(),
  }, { headers: CORS })
}
