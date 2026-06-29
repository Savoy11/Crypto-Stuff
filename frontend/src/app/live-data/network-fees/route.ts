import { NextResponse } from 'next/server'
import type { NetworkFeeMap, CoinPriceMap } from '@/lib/data/transferFees'

export const dynamic = 'force-dynamic'

export interface NetworkFeesResponse {
  ok: boolean
  networkFees: NetworkFeeMap
  coinPrices: CoinPriceMap
  btcFeeSource: 'live' | 'estimate'
  updatedAt: string
}

// Static fallback gas amounts per network (in native token units)
// These represent a typical token transfer, not just a native send.
const GAS_AMOUNTS = {
  erc20:        0.002,     // ~100k gas @ ~20 gwei
  arbitrum:     0.00005,   // L2, very cheap
  base:         0.00003,
  optimism:     0.00005,
  bep20:        0.0005,    // BNB gas is cheap
  solana:       0.000025,  // ~5000 lamports
  trc20:        1.0,       // TRC-20 token transfer ~1 TRX bandwidth/energy
  polygon:      0.1,       // MATIC
  avalanche:    0.01,      // AVAX
  bitcoin:      0.00015,   // ~250 vBytes @ ~60 sat/vByte
  xrpl:         0.000012,  // 12 drops = 0.000012 XRP (fixed, very cheap)
  litecoin:     0.001,     // ~1000 sat typical tx
  dogecoin:     1.0,       // ~1 DOGE typical fee
  cardano:      0.17,      // minimum protocol fee for simple tx
  polkadot:     0.014,     // typical extrinsic fee
  cosmos:       0.01,      // typical IBC transfer fee in ATOM
  ton_network:  0.0055,    // ~0.0055 TON typical token transfer
  near_network: 0.0003,    // ~0.0003 NEAR typical transfer fee
}

export async function GET() {
  // Seed with static estimates — updated below if live data succeeds
  const networkFees: NetworkFeeMap = {}
  const coinPrices: CoinPriceMap = {
    btc: 95000, eth: 3200,  usdt: 1.0,  usdc: 1.0,
    bnb: 600,   sol: 160,   dai: 1.0,   trx: 0.14,
    matic: 0.60, avax: 28,  xrp: 2.20,  ltc: 90,
    doge: 0.18,  ada: 0.45, dot: 7.0,   atom: 5.50,
    link: 14.0,  ton: 3.0,  shib: 0.000012, uni: 7.0,
    near: 3.0,   arb: 0.50,
  }
  let btcFeeSource: 'live' | 'estimate' = 'estimate'

  try {
    const [btcRes, cgRes] = await Promise.allSettled([
      fetch('https://mempool.space/api/v1/fees/recommended', {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 },
      }),
      fetch(
        'https://api.coingecko.com/api/v3/simple/price' +
        '?ids=bitcoin,ethereum,tether,usd-coin,binancecoin,solana,dai,tron,matic-network,avalanche-2' +
        ',ripple,litecoin,dogecoin,cardano,polkadot,cosmos,chainlink,the-open-network,shiba-inu,uniswap,near,arbitrum' +
        '&vs_currencies=usd&precision=4',
        { headers: { Accept: 'application/json' }, next: { revalidate: 300 } }
      ),
    ])

    // Update coin prices from CoinGecko
    if (cgRes.status === 'fulfilled' && cgRes.value.ok) {
      const prices = await cgRes.value.json() as Record<string, { usd: number }>
      const map: [string, string][] = [
        ['bitcoin', 'btc'], ['ethereum', 'eth'], ['tether', 'usdt'],
        ['usd-coin', 'usdc'], ['binancecoin', 'bnb'], ['solana', 'sol'],
        ['dai', 'dai'], ['tron', 'trx'], ['matic-network', 'matic'], ['avalanche-2', 'avax'],
        ['ripple', 'xrp'], ['litecoin', 'ltc'], ['dogecoin', 'doge'],
        ['cardano', 'ada'], ['polkadot', 'dot'], ['cosmos', 'atom'],
        ['chainlink', 'link'], ['the-open-network', 'ton'], ['shiba-inu', 'shib'],
        ['uniswap', 'uni'], ['near', 'near'], ['arbitrum', 'arb'],
      ]
      for (const [cgId, appId] of map) {
        if (prices[cgId]?.usd) coinPrices[appId] = prices[cgId].usd
      }
    }

    // Compute live BTC fee from mempool.space
    if (btcRes.status === 'fulfilled' && btcRes.value.ok) {
      const btcData = await btcRes.value.json() as { fastestFee?: number; halfHourFee?: number; hourFee?: number }
      const satPerVbyte = btcData.halfHourFee ?? btcData.fastestFee ?? 60
      const btcFeeNative = (satPerVbyte * 250) / 1e8 // typical tx ~250 vBytes
      coinPrices['btcSatPerVbyte'] = satPerVbyte
      networkFees.bitcoin = {
        feeNative: btcFeeNative,
        feeUsd: btcFeeNative * (coinPrices.btc ?? 95000),
        nativeToken: 'BTC',
        source: 'live',
      }
      btcFeeSource = 'live'
    }
  } catch {
    // fall through to static estimates
  }

  // Build all network fees using (now-updated) coin prices
  const eth  = coinPrices.eth  ?? 3200
  const bnb  = coinPrices.bnb  ?? 600
  const sol  = coinPrices.sol  ?? 160
  const trx  = coinPrices.trx  ?? 0.14
  const matic= coinPrices.matic?? 0.60
  const avax = coinPrices.avax ?? 28
  const btc  = coinPrices.btc  ?? 95000
  const xrp  = coinPrices.xrp  ?? 2.20
  const ltc  = coinPrices.ltc  ?? 90
  const doge = coinPrices.doge ?? 0.18
  const ada  = coinPrices.ada  ?? 0.45
  const dot  = coinPrices.dot  ?? 7.0
  const atom = coinPrices.atom ?? 5.50
  const ton  = coinPrices.ton  ?? 3.0
  const near = coinPrices.near ?? 3.0

  if (!networkFees.bitcoin) {
    networkFees.bitcoin = { feeNative: GAS_AMOUNTS.bitcoin, feeUsd: GAS_AMOUNTS.bitcoin * btc,  nativeToken: 'BTC',  source: 'estimate' }
  }
  networkFees.erc20    = { feeNative: GAS_AMOUNTS.erc20,    feeUsd: GAS_AMOUNTS.erc20    * eth,  nativeToken: 'ETH',  source: 'estimate' }
  networkFees.arbitrum = { feeNative: GAS_AMOUNTS.arbitrum, feeUsd: GAS_AMOUNTS.arbitrum * eth,  nativeToken: 'ETH',  source: 'estimate' }
  networkFees.base     = { feeNative: GAS_AMOUNTS.base,     feeUsd: GAS_AMOUNTS.base     * eth,  nativeToken: 'ETH',  source: 'estimate' }
  networkFees.optimism = { feeNative: GAS_AMOUNTS.optimism, feeUsd: GAS_AMOUNTS.optimism * eth,  nativeToken: 'ETH',  source: 'estimate' }
  networkFees.bep20    = { feeNative: GAS_AMOUNTS.bep20,    feeUsd: GAS_AMOUNTS.bep20    * bnb,  nativeToken: 'BNB',  source: 'estimate' }
  networkFees.solana   = { feeNative: GAS_AMOUNTS.solana,   feeUsd: GAS_AMOUNTS.solana   * sol,  nativeToken: 'SOL',  source: 'estimate' }
  networkFees.trc20    = { feeNative: GAS_AMOUNTS.trc20,    feeUsd: GAS_AMOUNTS.trc20    * trx,  nativeToken: 'TRX',  source: 'estimate' }
  networkFees.polygon  = { feeNative: GAS_AMOUNTS.polygon,  feeUsd: GAS_AMOUNTS.polygon  * matic,nativeToken: 'POL',  source: 'estimate' }
  networkFees.avalanche= { feeNative: GAS_AMOUNTS.avalanche,feeUsd: GAS_AMOUNTS.avalanche* avax, nativeToken: 'AVAX', source: 'estimate' }
  networkFees.xrpl     = { feeNative: GAS_AMOUNTS.xrpl,     feeUsd: GAS_AMOUNTS.xrpl     * xrp,  nativeToken: 'XRP',  source: 'estimate' }
  networkFees.litecoin = { feeNative: GAS_AMOUNTS.litecoin, feeUsd: GAS_AMOUNTS.litecoin * ltc,  nativeToken: 'LTC',  source: 'estimate' }
  networkFees.dogecoin = { feeNative: GAS_AMOUNTS.dogecoin, feeUsd: GAS_AMOUNTS.dogecoin * doge, nativeToken: 'DOGE', source: 'estimate' }
  networkFees.cardano  = { feeNative: GAS_AMOUNTS.cardano,  feeUsd: GAS_AMOUNTS.cardano  * ada,  nativeToken: 'ADA',  source: 'estimate' }
  networkFees.polkadot = { feeNative: GAS_AMOUNTS.polkadot, feeUsd: GAS_AMOUNTS.polkadot * dot,  nativeToken: 'DOT',  source: 'estimate' }
  networkFees.cosmos      = { feeNative: GAS_AMOUNTS.cosmos,      feeUsd: GAS_AMOUNTS.cosmos      * atom, nativeToken: 'ATOM', source: 'estimate' }
  networkFees.ton_network = { feeNative: GAS_AMOUNTS.ton_network, feeUsd: GAS_AMOUNTS.ton_network * ton,  nativeToken: 'TON',  source: 'estimate' }
  networkFees.near_network= { feeNative: GAS_AMOUNTS.near_network,feeUsd: GAS_AMOUNTS.near_network* near, nativeToken: 'NEAR', source: 'estimate' }

  return NextResponse.json({
    ok: true,
    networkFees,
    coinPrices,
    btcFeeSource,
    updatedAt: new Date().toISOString(),
  } satisfies NetworkFeesResponse)
}
