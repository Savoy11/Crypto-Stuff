import { NextResponse } from 'next/server'

// Alternative.me Fear & Greed Index — completely free, no API key ever needed.
// Also fetches historical values for sparkline display.
//
// Response: { ok, value, classification, previousClose, weekAgo, monthAgo, yearAgo, history, updatedAt }

export const dynamic = 'force-dynamic'

export interface FearGreedData {
  ok: boolean
  value: number                  // 0–100
  classification: string         // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
  previousClose: number | null
  weekAgo: number | null
  monthAgo: number | null
  yearAgo: number | null
  history: { timestamp: number; value: number; classification: string }[]
  updatedAt: string
}

function classify(v: number): string {
  if (v <= 24) return 'Extreme Fear'
  if (v <= 44) return 'Fear'
  if (v <= 55) return 'Neutral'
  if (v <= 75) return 'Greed'
  return 'Extreme Greed'
}

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=365&format=json', {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    })

    if (!res.ok) throw new Error(`upstream ${res.status}`)

    const json = await res.json() as {
      data: { value: string; value_classification: string; timestamp: string }[]
    }

    const items = json.data ?? []
    if (items.length === 0) throw new Error('empty response')

    const history = items.map((item) => ({
      timestamp: Number(item.timestamp) * 1000,
      value: Number(item.value),
      classification: item.value_classification,
    }))

    const current = history[0]
    const get = (daysAgo: number) => history[daysAgo]?.value ?? null

    return NextResponse.json({
      ok: true,
      value: current.value,
      classification: current.classification,
      previousClose: get(1),
      weekAgo: get(7),
      monthAgo: get(30),
      yearAgo: get(365),
      history: history.slice(0, 90),
      updatedAt: new Date().toISOString(),
    } satisfies FearGreedData)
  } catch (e) {
    return NextResponse.json({ ok: false, value: 50, classification: 'Neutral', previousClose: null, weekAgo: null, monthAgo: null, yearAgo: null, history: [], updatedAt: new Date().toISOString() })
  }
}
