import { NextResponse } from 'next/server'
import { CORS, options } from '../../_cors'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

const GAS_AMOUNTS: Record<string, { native: number; token: string }> = {
  erc20:     { native: 0.002,      token: 'ETH'  },
  arbitrum:  { native: 0.00005,    token: 'ETH'  },
  base:      { native: 0.00003,    token: 'ETH'  },
  optimism:  { native: 0.00005,    token: 'ETH'  },
  bep20:     { native: 0.0005,     token: 'BNB'  },
  solana:    { native: 0.000025,   token: 'SOL'  },
  trc20:     { native: 1.0,        token: 'TRX'  },
  polygon:   { native: 0.1,        token: 'POL'  },
  avalanche: { native: 0.01,       token: 'AVAX' },
  bitcoin:   { native: 0.00015,    token: 'BTC'  },
  xrpl:      { native: 0.000012,   token: 'XRP'  },
  litecoin:  { native: 0.001,      token: 'LTC'  },
  dogecoin:  { native: 1.0,        token: 'DOGE' },
  cardano:   { native: 0.17,       token: 'ADA'  },
  polkadot:  { native: 0.014,      token: 'DOT'  },
  cosmos:    { native: 0.01,       token: 'ATOM' },
}

const FALLBACK_PRICES: Record<string, number> = {
  ETH: 3200, BNB: 600, SOL: 160, TRX: 0.14, POL: 0.60,
  AVAX: 28, BTC: 95000, XRP: 2.20, LTC: 90, DOGE: 0.18,
  ADA: 0.45, DOT: 7.0, ATOM: 5.50,
}

export async function GET() {
  const prices = { ...FALLBACK_PRICES }
  let btcSatPerVbyte: number | null = null
  let btcSource: 'live' | 'estimate' = 'estimate'
  let priceSource: 'live' | 'fallback' = 'fallback'

  const [btcRes, cgRes] = await Promise.allSettled([
    fetch('https://mempool.space/api/v1/fees/recommended', { next: { revalidate: 300 } }),
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,solana,tron,matic-network,avalanche-2,bitcoin,ripple,litecoin,dogecoin,cardano,polkadot,cosmos&vs_currencies=usd', { next: { revalidate: 300 } }),
  ])

  if (cgRes.status === 'fulfilled' && cgRes.value.ok) {
    const data = await cgRes.value.json() as Record<string, { usd: number }>
    const map: [string, string][] = [
      ['ethereum','ETH'],['binancecoin','BNB'],['solana','SOL'],['tron','TRX'],
      ['matic-network','POL'],['avalanche-2','AVAX'],['bitcoin','BTC'],
      ['ripple','XRP'],['litecoin','LTC'],['dogecoin','DOGE'],
      ['cardano','ADA'],['polkadot','DOT'],['cosmos','ATOM'],
    ]
    for (const [cgId, sym] of map) if (data[cgId]?.usd) prices[sym] = data[cgId].usd
    priceSource = 'live'
  }

  if (btcRes.status === 'fulfilled' && btcRes.value.ok) {
    const d = await btcRes.value.json() as { halfHourFee?: number; fastestFee?: number }
    btcSatPerVbyte = d.halfHourFee ?? d.fastestFee ?? null
    if (btcSatPerVbyte) {
      GAS_AMOUNTS.bitcoin.native = (btcSatPerVbyte * 250) / 1e8
      btcSource = 'live'
    }
  }

  const fees = Object.fromEntries(
    Object.entries(GAS_AMOUNTS).map(([network, { native, token }]) => [
      network,
      {
        feeNative: native,
        nativeToken: token,
        feeUsd: parseFloat((native * (prices[token] ?? 1)).toFixed(4)),
        source: network === 'bitcoin' ? btcSource : priceSource === 'live' ? 'live' : 'estimate',
      },
    ])
  )

  return NextResponse.json({
    fees,
    btcSatPerVbyte,
    priceSource,
    updatedAt: new Date().toISOString(),
    note: 'feeNative = typical token transfer cost in the network\'s gas token. feeUsd = USD equivalent at current price.',
  }, { headers: CORS })
}
