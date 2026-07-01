import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export type AlertSeverity = 'info' | 'warning' | 'critical'
// Only types we actually generate. (Previously declared reserve/liquidity/volume
// were never implemented — removed so the contract is honest.)
export type AlertType = 'depeg' | 'price_move'

export interface LiveAlert {
  id: string
  type: AlertType
  severity: AlertSeverity
  asset: string
  symbol: string
  title: string
  message: string
  value: number       // current observed value (peg price, or spot price for price_move)
  threshold: number   // breached threshold (peg target for depeg; 0 for price_move)
  deviation: number   // % move that triggered the alert (peg deviation, or 24h change)
  triggeredAt: string
  source: string
}

// ── Stablecoins monitored for peg deviation (CoinGecko IDs) ─────────────────────
const STABLECOINS = [
  { id: 'usd-coin',         symbol: 'USDC',  pegTarget: 1.0 },
  { id: 'tether',           symbol: 'USDT',  pegTarget: 1.0 },
  { id: 'dai',              symbol: 'DAI',   pegTarget: 1.0 },
  { id: 'ethena-usde',      symbol: 'USDe',  pegTarget: 1.0 },
  { id: 'usds',             symbol: 'USDS',  pegTarget: 1.0 },
  { id: 'first-digital-usd',symbol: 'FDUSD', pegTarget: 1.0 },
  { id: 'frax',             symbol: 'FRAX',  pegTarget: 1.0 },
  { id: 'paypal-usd',       symbol: 'PYUSD', pegTarget: 1.0 },
  { id: 'crvusd',           symbol: 'crvUSD',pegTarget: 1.0 },
  { id: 'gho',              symbol: 'GHO',   pegTarget: 1.0 },
  { id: 'true-usd',         symbol: 'TUSD',  pegTarget: 1.0 },
  { id: 'pax-dollar',       symbol: 'USDP',  pegTarget: 1.0 },
  { id: 'gemini-dollar',    symbol: 'GUSD',  pegTarget: 1.0 },
  { id: 'liquity-usd',      symbol: 'LUSD',  pegTarget: 1.0 },
]

// ── Major non-stablecoin assets monitored for 24h price moves ───────────────────
const MAJORS = [
  { id: 'bitcoin',          symbol: 'BTC'  },
  { id: 'ethereum',         symbol: 'ETH'  },
  { id: 'solana',           symbol: 'SOL'  },
  { id: 'binancecoin',      symbol: 'BNB'  },
  { id: 'ripple',           symbol: 'XRP'  },
  { id: 'cardano',          symbol: 'ADA'  },
  { id: 'avalanche-2',      symbol: 'AVAX' },
  { id: 'polkadot',         symbol: 'DOT'  },
  { id: 'chainlink',        symbol: 'LINK' },
  { id: 'dogecoin',         symbol: 'DOGE' },
  { id: 'tron',             symbol: 'TRX'  },
  { id: 'litecoin',         symbol: 'LTC'  },
  { id: 'cosmos',           symbol: 'ATOM' },
  { id: 'the-open-network', symbol: 'TON'  },
  { id: 'uniswap',          symbol: 'UNI'  },
  { id: 'near',             symbol: 'NEAR' },
]

// Peg deviation (%) → severity
function getPegSeverity(deviationPct: number): AlertSeverity | null {
  const abs = Math.abs(deviationPct)
  if (abs >= 1.0) return 'critical'
  if (abs >= 0.5) return 'warning'
  if (abs >= 0.15) return 'info'
  return null  // within normal range — no alert
}

// 24h price move (%) → severity. Majors are far more volatile than pegs,
// so the bands are an order of magnitude wider.
function getPriceMoveSeverity(changePct: number): AlertSeverity | null {
  const abs = Math.abs(changePct)
  if (abs >= 10) return 'critical'
  if (abs >= 5)  return 'warning'
  if (abs >= 3)  return 'info'
  return null
}

function fmtPrice(p: number): string {
  return p < 1 ? `$${p.toFixed(4)}` : `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export async function GET() {
  try {
    const all = [...STABLECOINS, ...MAJORS]
    const ids = all.map((a) => a.id).join(',')
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&precision=6`

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },  // 1-minute server cache to stay within rate limits
    })

    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`)

    const prices: Record<string, { usd: number; usd_24h_change?: number }> = await res.json()
    const now = new Date().toISOString()
    const alerts: LiveAlert[] = []

    // Stablecoin peg deviations
    for (const asset of STABLECOINS) {
      const priceData = prices[asset.id]
      if (!priceData) continue

      const price = priceData.usd
      const deviation = ((price - asset.pegTarget) / asset.pegTarget) * 100
      const severity = getPegSeverity(deviation)
      if (!severity) continue

      const dir = deviation > 0 ? 'above' : 'below'
      const absDev = Math.abs(deviation)
      alerts.push({
        id: `depeg-${asset.symbol}-${Date.now()}`,
        type: 'depeg',
        severity,
        asset: asset.id,
        symbol: asset.symbol,
        title: `${asset.symbol} Peg ${severity === 'critical' ? 'Crisis' : severity === 'warning' ? 'Warning' : 'Monitor'}: ${absDev.toFixed(2)}% deviation`,
        message: `${asset.symbol} is trading at ${fmtPrice(price)}, ${absDev.toFixed(3)}% ${dir} its $${asset.pegTarget.toFixed(2)} peg target.`,
        value: price,
        threshold: asset.pegTarget,
        deviation,
        triggeredAt: now,
        source: 'CoinGecko',
      })
    }

    // Major-asset 24h price moves
    for (const asset of MAJORS) {
      const priceData = prices[asset.id]
      if (!priceData || typeof priceData.usd_24h_change !== 'number') continue

      const change = priceData.usd_24h_change
      const severity = getPriceMoveSeverity(change)
      if (!severity) continue

      const dir = change > 0 ? 'up' : 'down'
      const absChg = Math.abs(change)
      alerts.push({
        id: `move-${asset.symbol}-${Date.now()}`,
        type: 'price_move',
        severity,
        asset: asset.id,
        symbol: asset.symbol,
        title: `${asset.symbol} ${dir} ${absChg.toFixed(1)}% in 24h`,
        message: `${asset.symbol} is ${dir} ${absChg.toFixed(2)}% over the last 24h, trading at ${fmtPrice(priceData.usd)}.`,
        value: priceData.usd,
        threshold: 0,
        deviation: change,
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
      assetsChecked: all.length,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, alerts: [], error: String(err), checkedAt: new Date().toISOString(), assetsChecked: 0 },
      { status: 200 }
    )
  }
}
