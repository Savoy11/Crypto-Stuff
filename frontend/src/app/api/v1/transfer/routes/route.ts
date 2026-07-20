import { NextRequest, NextResponse } from 'next/server'
import { CORS, options } from '@/app/api/_cors'
import {
  EXCHANGES, COIN_INFO, NETWORKS, findTransferPaths, PERSONAL_WALLET_ID,
  type CoinId, type NetworkFeeMap, type CoinPriceMap,
} from '@/lib/data/transferFees'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

const FALLBACK_PRICES: CoinPriceMap = {
  btc: 95000, eth: 3200, usdt: 1.0, usdc: 1.0, bnb: 600, sol: 160,
  dai: 1.0, xrp: 2.20, ltc: 90, trx: 0.14, doge: 0.18, matic: 0.60,
  avax: 28, ada: 0.45, dot: 7.0, atom: 5.50,
}

const STATIC_GAS: Record<string, { native: number; token: keyof CoinPriceMap }> = {
  erc20:     { native: 0.002,    token: 'eth'  },
  arbitrum:  { native: 0.00005,  token: 'eth'  },
  base:      { native: 0.00003,  token: 'eth'  },
  optimism:  { native: 0.00005,  token: 'eth'  },
  bep20:     { native: 0.0005,   token: 'bnb'  },
  solana:    { native: 0.000025, token: 'sol'  },
  trc20:     { native: 1.0,      token: 'trx'  },
  polygon:   { native: 0.1,      token: 'matic'},
  avalanche: { native: 0.01,     token: 'avax' },
  bitcoin:   { native: 0.00015,  token: 'btc'  },
  xrpl:      { native: 0.000012, token: 'xrp'  },
  litecoin:  { native: 0.001,    token: 'ltc'  },
  dogecoin:  { native: 1.0,      token: 'doge' },
  cardano:   { native: 0.17,     token: 'ada'  },
  polkadot:  { native: 0.014,    token: 'dot'  },
  cosmos:    { native: 0.01,     token: 'atom' },
}

async function getLivePrices(): Promise<CoinPriceMap> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,usd-coin,binancecoin,solana,dai,tron,matic-network,avalanche-2,ripple,litecoin,dogecoin,cardano,polkadot,cosmos&vs_currencies=usd',
      { next: { revalidate: 120 } }
    )
    if (!res.ok) return FALLBACK_PRICES
    const data = await res.json() as Record<string, { usd: number }>
    return {
      btc:   data['bitcoin']?.usd        ?? FALLBACK_PRICES.btc,
      eth:   data['ethereum']?.usd       ?? FALLBACK_PRICES.eth,
      usdt:  data['tether']?.usd         ?? 1.0,
      usdc:  data['usd-coin']?.usd       ?? 1.0,
      bnb:   data['binancecoin']?.usd    ?? FALLBACK_PRICES.bnb,
      sol:   data['solana']?.usd         ?? FALLBACK_PRICES.sol,
      dai:   data['dai']?.usd            ?? 1.0,
      xrp:   data['ripple']?.usd         ?? FALLBACK_PRICES.xrp,
      ltc:   data['litecoin']?.usd       ?? FALLBACK_PRICES.ltc,
      trx:   data['tron']?.usd           ?? FALLBACK_PRICES.trx,
      doge:  data['dogecoin']?.usd       ?? FALLBACK_PRICES.doge,
      matic: data['matic-network']?.usd  ?? FALLBACK_PRICES.matic,
      avax:  data['avalanche-2']?.usd    ?? FALLBACK_PRICES.avax,
      ada:   data['cardano']?.usd        ?? FALLBACK_PRICES.ada,
      dot:   data['polkadot']?.usd       ?? FALLBACK_PRICES.dot,
      atom:  data['cosmos']?.usd         ?? FALLBACK_PRICES.atom,
    }
  } catch {
    return FALLBACK_PRICES
  }
}

function buildNetworkFees(coinPrices: CoinPriceMap): NetworkFeeMap {
  const fees: NetworkFeeMap = {}
  for (const [networkId, { native, token }] of Object.entries(STATIC_GAS)) {
    const price = coinPrices[token] ?? 1
    fees[networkId as keyof typeof fees] = {
      feeNative: native,
      feeUsd: parseFloat((native * price).toFixed(4)),
      nativeToken: token.toUpperCase(),
      source: 'estimate',
    }
  }
  return fees
}

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

  const coinPrices  = await getLivePrices()
  const networkFees = buildNetworkFees(coinPrices)
  const coinInfo    = COIN_INFO[coin]
  const transferAmount = amount > 0 ? amount : coinInfo.defaultAmount

  const paths = findTransferPaths(from, to, coin, transferAmount, networkFees, coinPrices)

  const routes = paths.map(p => ({
    viable:          p.isViable,
    recommended:     p.isRecommended ?? false,
    network:         p.networkId ?? null,
    totalFeeUsd:     p.totalFeeUsd,
    feePercent:      parseFloat(((p.totalFeeUsd / (transferAmount * (coinPrices[coin] ?? 1))) * 100).toFixed(3)),
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
    amountUsd: parseFloat((transferAmount * (coinPrices[coin] ?? 1)).toFixed(2)),
    summary: {
      viableRoutes: viable.length,
      blockedRoutes: blocked.length,
      cheapestFeeUsd: best?.totalFeeUsd ?? null,
      cheapestNetwork: best?.network ?? null,
      cheapestFeePercent: best?.feePercent ?? null,
    },
    routes,
    priceSource: 'live',
    updatedAt: new Date().toISOString(),
  }, { headers: CORS })
}
