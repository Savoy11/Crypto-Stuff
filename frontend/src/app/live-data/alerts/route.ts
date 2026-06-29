import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertType = 'depeg' | 'reserve' | 'liquidity' | 'volume'

export interface LiveAlert {
  id: string
  type: AlertType
  severity: AlertSeverity
  asset: string
  symbol: string
  title: string
  message: string
  value: number       // current observed value (e.g. peg price)
  threshold: number   // threshold that was breached
  deviation: number   // % deviation from peg
  triggeredAt: string
  source: string
}

// Stablecoins to monitor with their CoinGecko IDs
const MONITORED_ASSETS = [
  { id: 'usd-coin',    symbol: 'USDC',  name: 'USD Coin',        pegTarget: 1.0 },
  { id: 'tether',      symbol: 'USDT',  name: 'Tether',          pegTarget: 1.0 },
  { id: 'dai',         symbol: 'DAI',   name: 'DAI',             pegTarget: 1.0 },
  { id: 'frax',        symbol: 'FRAX',  name: 'Frax',            pegTarget: 1.0 },
  { id: 'true-usd',   symbol: 'TUSD',  name: 'TrueUSD',         pegTarget: 1.0 },
  { id: 'paypal-usd', symbol: 'PYUSD', name: 'PayPal USD',      pegTarget: 1.0 },
  { id: 'pax-dollar', symbol: 'USDP',  name: 'Pax Dollar',      pegTarget: 1.0 },
  { id: 'gemini-dollar', symbol: 'GUSD', name: 'Gemini Dollar', pegTarget: 1.0 },
  { id: 'liquity-usd',  symbol: 'LUSD', name: 'Liquity USD',    pegTarget: 1.0 },
]

// Deviation thresholds → severity
function getSeverity(deviationPct: number): AlertSeverity | null {
  const abs = Math.abs(deviationPct)
  if (abs >= 1.0) return 'critical'
  if (abs >= 0.5) return 'warning'
  if (abs >= 0.15) return 'info'
  return null  // within normal range — no alert
}

function buildMessage(symbol: string, price: number, deviation: number, pegTarget: number): string {
  const dir = deviation > 0 ? 'above' : 'below'
  const absDev = Math.abs(deviation).toFixed(3)
  return `${symbol} is trading at $${price.toFixed(4)}, ${absDev}% ${dir} its $${pegTarget.toFixed(2)} peg target.`
}

export async function GET() {
  try {
    const ids = MONITORED_ASSETS.map((a) => a.id).join(',')
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&precision=6`

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },  // 1-minute server cache to stay within rate limits
    })

    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`)

    const prices: Record<string, { usd: number }> = await res.json()
    const now = new Date().toISOString()
    const alerts: LiveAlert[] = []

    for (const asset of MONITORED_ASSETS) {
      const priceData = prices[asset.id]
      if (!priceData) continue

      const price = priceData.usd
      const deviation = ((price - asset.pegTarget) / asset.pegTarget) * 100
      const severity = getSeverity(deviation)

      if (!severity) continue  // price within normal range

      const absDevPct = Math.abs(deviation)
      alerts.push({
        id: `depeg-${asset.symbol}-${Date.now()}`,
        type: 'depeg',
        severity,
        asset: asset.id,
        symbol: asset.symbol,
        title: `${asset.symbol} Peg ${severity === 'critical' ? 'Crisis' : severity === 'warning' ? 'Warning' : 'Monitor'}: ${absDevPct.toFixed(2)}% deviation`,
        message: buildMessage(asset.symbol, price, deviation, asset.pegTarget),
        value: price,
        threshold: asset.pegTarget,
        deviation,
        triggeredAt: now,
        source: 'CoinGecko',
      })
    }

    // Sort: critical first, then by deviation magnitude
    alerts.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 }
      const sd = severityOrder[a.severity] - severityOrder[b.severity]
      if (sd !== 0) return sd
      return Math.abs(b.deviation) - Math.abs(a.deviation)
    })

    return NextResponse.json({
      ok: true,
      alerts,
      checkedAt: now,
      assetsChecked: MONITORED_ASSETS.length,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, alerts: [], error: String(err), checkedAt: new Date().toISOString(), assetsChecked: 0 },
      { status: 200 }
    )
  }
}
