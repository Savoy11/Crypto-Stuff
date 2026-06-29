import { NextResponse } from 'next/server'

// Funding rates and open interest from OKX public API (no key required).
// Binance fapi is geo-restricted in many server environments; OKX is unrestricted.
//
// Response: { ok, rates: FundingRate[], updatedAt }

export const dynamic = 'force-dynamic'

export interface FundingRate {
  symbol: string        // e.g. "BTC"
  exchange: string
  fundingRate: number   // as decimal, e.g. 0.0001 = 0.01%
  annualized: number    // fundingRate * 3 * 365 * 100 (%)
  nextFundingTime: number | null  // unix ms
  openInterestUsd: number | null
  longShortRatio: number | null
}

const OKX_INSTRUMENTS = [
  { instId: 'BTC-USDT-SWAP', symbol: 'BTC' },
  { instId: 'ETH-USDT-SWAP', symbol: 'ETH' },
  { instId: 'SOL-USDT-SWAP', symbol: 'SOL' },
  { instId: 'BNB-USDT-SWAP', symbol: 'BNB' },
  { instId: 'XRP-USDT-SWAP', symbol: 'XRP' },
  { instId: 'ADA-USDT-SWAP', symbol: 'ADA' },
  { instId: 'DOGE-USDT-SWAP', symbol: 'DOGE' },
  { instId: 'AVAX-USDT-SWAP', symbol: 'AVAX' },
  { instId: 'DOT-USDT-SWAP', symbol: 'DOT' },
  { instId: 'MATIC-USDT-SWAP', symbol: 'MATIC' },
]

const OKX_BASE = 'https://www.okx.com/api/v5/public'

interface OkxFundingRate {
  instId: string
  fundingRate: string
  nextFundingTime: string
}

interface OkxOpenInterest {
  instId: string
  oiUsd: string
}

export async function GET(): Promise<NextResponse> {
  try {
    const results = await Promise.allSettled(
      OKX_INSTRUMENTS.map(async ({ instId, symbol }) => {
        const [frRes, oiRes] = await Promise.allSettled([
          fetch(`${OKX_BASE}/funding-rate?instId=${instId}`, {
            headers: { Accept: 'application/json' },
            next: { revalidate: 60 },
            signal: AbortSignal.timeout(6000),
          }),
          fetch(`${OKX_BASE}/open-interest?instType=SWAP&instId=${instId}`, {
            headers: { Accept: 'application/json' },
            next: { revalidate: 60 },
            signal: AbortSignal.timeout(6000),
          }),
        ])

        let fundingRate = 0
        let nextFundingTime: number | null = null
        if (frRes.status === 'fulfilled' && frRes.value.ok) {
          const d = await frRes.value.json() as { data: OkxFundingRate[] }
          const row = d.data?.[0]
          if (row) {
            fundingRate = parseFloat(row.fundingRate)
            nextFundingTime = row.nextFundingTime ? parseInt(row.nextFundingTime) : null
          }
        }

        let openInterestUsd: number | null = null
        if (oiRes.status === 'fulfilled' && oiRes.value.ok) {
          const d = await oiRes.value.json() as { data: OkxOpenInterest[] }
          const row = d.data?.[0]
          if (row?.oiUsd) openInterestUsd = parseFloat(row.oiUsd)
        }

        return {
          symbol,
          exchange: 'OKX',
          fundingRate,
          annualized: fundingRate * 3 * 365 * 100,
          nextFundingTime,
          openInterestUsd,
          longShortRatio: null,
        } satisfies FundingRate
      })
    )

    const rates: FundingRate[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') rates.push(r.value)
    }
    rates.sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))

    return NextResponse.json({ ok: true, rates, updatedAt: new Date().toISOString() })
  } catch {
    return NextResponse.json({ ok: false, rates: [], updatedAt: new Date().toISOString() })
  }
}
