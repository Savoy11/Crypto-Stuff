import { NextRequest, NextResponse } from 'next/server'
import { guardSensitiveRoute } from '@/lib/server/apiGuard'
import {
  listExchangeConnections,
  addExchangeConnection,
  removeExchangeConnection,
  type ExchangeConnectionMeta,
} from '@/lib/server/exchangeCredentials'

export const dynamic = 'force-dynamic'

export interface ExchangeConnectionsResponse {
  ok: boolean
  connections: ExchangeConnectionMeta[]
}

// GET — list connections (metadata only, never secrets)
export async function GET(req: NextRequest) {
  const denied = guardSensitiveRoute(req, 'exchange-connections', 60)
  if (denied) return denied
  return NextResponse.json({ ok: true, connections: listExchangeConnections() } satisfies ExchangeConnectionsResponse)
}

// POST — add a connection; secrets are stored server-side only
export async function POST(req: NextRequest) {
  const denied = guardSensitiveRoute(req, 'exchange-connections', 12)
  if (denied) return denied

  let body: { label?: string; exchange?: string; apiKey?: string; apiSecret?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const { label, exchange, apiKey, apiSecret } = body
  if (!exchange || !apiKey?.trim() || !apiSecret?.trim()) {
    return NextResponse.json({ ok: false, error: 'exchange, apiKey, apiSecret required' }, { status: 400 })
  }

  const connection = addExchangeConnection({
    label:     label?.trim() || exchange,
    exchange,
    apiKey:    apiKey.trim(),
    apiSecret: apiSecret.trim(),
  })
  return NextResponse.json({ ok: true, connection })
}

// DELETE /live-data/wallet/exchange-connections?id=<id>
export async function DELETE(req: NextRequest) {
  const denied = guardSensitiveRoute(req, 'exchange-connections', 30)
  if (denied) return denied

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  const removed = removeExchangeConnection(id)
  return NextResponse.json({ ok: removed, ...(removed ? {} : { error: 'Unknown connection id' }) })
}
