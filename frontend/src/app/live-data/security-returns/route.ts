import { NextRequest, NextResponse } from 'next/server'
import { ALL_FUND_SYMBOLS } from '@/lib/data/fundCatalog'
import { ALL_EQUITY_SYMBOLS } from '@/lib/data/equityCatalog'
import { computeReturns, type CloseSeries, type SecurityReturns } from '@/lib/utils/returns'

export type { SecurityReturns }

// Trailing returns for stocks/ETFs/mutual funds — one batched Yahoo spark call
// per ~20 symbols (range=1y daily closes), computed server-side.
//   GET /live-data/security-returns?universe=funds|equities
//   GET /live-data/security-returns?symbols=SPY,QQQ
//
// Response: { ok, updatedAt, source, returns: Record<SYMBOL, SecurityReturns> }
// Percentages; null when the series is too short (e.g. funds younger than the
// window). Returns {} with source 'none' when Yahoo is unreachable — the UI
// shows em-dashes rather than fabricated values.

export const dynamic = 'force-dynamic'

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
}

export interface SecurityReturnsResponse {
  ok: boolean
  updatedAt: string
  source: 'yahoo' | 'none'
  returns: Record<string, SecurityReturns>
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function parseSpark(payload: unknown): Record<string, CloseSeries> {
  const out: Record<string, CloseSeries> = {}
  if (!payload || typeof payload !== 'object') return out
  const root = payload as Record<string, unknown>

  const push = (symbol: string, closesRaw: Array<number | null>, tsRaw: number[]) => {
    // Drop null closes and their timestamps in lockstep so indexes stay aligned.
    const closes: number[] = []
    const timestamps: number[] = []
    closesRaw.forEach((c, i) => {
      if (c != null) { closes.push(c); timestamps.push(tsRaw[i] ?? 0) }
    })
    if (closes.length > 0) out[symbol.toUpperCase()] = { closes, timestamps }
  }

  const spark = root.spark as { result?: Array<Record<string, unknown>> } | undefined
  if (spark?.result) {
    for (const entry of spark.result) {
      const symbol = String(entry.symbol ?? '')
      const response = (entry.response as Array<Record<string, unknown>> | undefined)?.[0]
      if (!symbol || !response) continue
      const quote = ((response.indicators as Record<string, unknown> | undefined)
        ?.quote as Array<Record<string, unknown>> | undefined)?.[0]
      push(symbol, (quote?.close ?? []) as Array<number | null>, (response.timestamp ?? []) as number[])
    }
    return out
  }
  for (const [key, value] of Object.entries(root)) {
    if (!value || typeof value !== 'object') continue
    const entry = value as Record<string, unknown>
    push(String(entry.symbol ?? key), (entry.close ?? []) as Array<number | null>, (entry.timestamp ?? []) as number[])
  }
  return out
}

export async function GET(request: NextRequest) {
  const universe = request.nextUrl.searchParams.get('universe')
  const symbolsParam = request.nextUrl.searchParams.get('symbols')

  let symbols: string[]
  if (universe === 'funds') symbols = ALL_FUND_SYMBOLS
  else if (universe === 'equities') symbols = ALL_EQUITY_SYMBOLS
  else if (symbolsParam) symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 200)
  else return NextResponse.json({ ok: false, error: 'Pass ?universe=funds|equities or ?symbols=SPY,QQQ' }, { status: 400 })

  const nowYear = new Date().getUTCFullYear()
  const returns: Record<string, SecurityReturns> = {}

  const results = await Promise.allSettled(
    chunk(symbols, 20).map(async (group) => {
      const params = new URLSearchParams({
        symbols: group.join(','), range: '1y', interval: '1d', includeTimestamps: 'true',
      })
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/spark?${params}`, {
        headers: BROWSER_HEADERS, next: { revalidate: 900 },
      })
      if (!res.ok) throw new Error(`Yahoo spark ${res.status}`)
      return parseSpark(await res.json())
    })
  )
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const [symbol, series] of Object.entries(r.value)) {
      returns[symbol] = computeReturns(series, nowYear)
    }
  }

  return NextResponse.json({
    ok: true,
    updatedAt: new Date().toISOString(),
    source: Object.keys(returns).length > 0 ? 'yahoo' : 'none',
    returns,
  } satisfies SecurityReturnsResponse)
}
