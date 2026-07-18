import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { guardSensitiveRoute } from '@/lib/server/apiGuard'
import { getExchangeConnection } from '@/lib/server/exchangeCredentials'

export const dynamic = 'force-dynamic'

// ── Binance ────────────────────────────────────────────────────────────────────

async function fetchBinanceBalances(apiKey: string, apiSecret: string) {
  const ts        = Date.now()
  const query     = `timestamp=${ts}&omitZeroBalances=true`
  const signature = crypto.createHmac('sha256', apiSecret).update(query).digest('hex')
  const url       = `https://api.binance.us/api/v3/account?${query}&signature=${signature}`

  const res = await fetch(url, {
    headers: { 'X-MBX-APIKEY': apiKey },
    next: { revalidate: 0 },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ msg: res.statusText }))
    throw new Error(err.msg ?? `Binance ${res.status}`)
  }
  const data = await res.json()
  return (data.balances as { asset: string; free: string; locked: string }[])
    .map(b => ({
      asset:  b.asset,
      free:   parseFloat(b.free),
      locked: parseFloat(b.locked),
      total:  parseFloat(b.free) + parseFloat(b.locked),
    }))
    .filter(b => b.total > 0)
}

// ── Coinbase Advanced Trade ────────────────────────────────────────────────────

async function fetchCoinbaseBalances(apiKey: string, apiSecret: string) {
  const path      = '/api/v3/brokerage/accounts'
  const ts        = Math.floor(Date.now() / 1000).toString()
  const msg       = ts + 'GET' + path + ''
  const signature = crypto.createHmac('sha256', apiSecret).update(msg).digest('hex')

  const res = await fetch(`https://api.coinbase.com${path}`, {
    headers: {
      'CB-ACCESS-KEY':       apiKey,
      'CB-ACCESS-SIGN':      signature,
      'CB-ACCESS-TIMESTAMP': ts,
    },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Coinbase ${res.status}`)
  const data = await res.json()

  return (data.accounts as { currency: string; available_balance: { value: string }; hold: { value: string } }[])
    .map(a => ({
      asset:  a.currency,
      free:   parseFloat(a.available_balance.value),
      locked: parseFloat(a.hold.value),
      total:  parseFloat(a.available_balance.value) + parseFloat(a.hold.value),
    }))
    .filter(b => b.total > 0)
}

// ── Kraken ─────────────────────────────────────────────────────────────────────

async function fetchKrakenBalances(apiKey: string, apiSecret: string) {
  const path  = '/0/private/Balance'
  const nonce = Date.now().toString()
  const body  = `nonce=${nonce}`

  const secretBuf = Buffer.from(apiSecret, 'base64')
  const sha256    = crypto.createHash('sha256').update(nonce + body).digest()
  const hmac      = crypto.createHmac('sha512', secretBuf)
    .update(Buffer.concat([Buffer.from(path), sha256]))
    .digest('base64')

  const res = await fetch(`https://api.kraken.com${path}`, {
    method: 'POST',
    headers: {
      'API-Key':  apiKey,
      'API-Sign': hmac,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    next: { revalidate: 0 },
  })
  const data = await res.json()
  if (data.error?.length) throw new Error(data.error[0])

  return Object.entries(data.result as Record<string, string>).map(([asset, bal]) => ({
    asset:  asset.replace(/^X?X(BT|ETH)$/, (_, sym) => (sym === 'BT' ? 'BTC' : sym)).replace(/^Z(USD|EUR|GBP)$/, '$1'),
    free:   parseFloat(bal),
    locked: 0,
    total:  parseFloat(bal),
  })).filter(b => b.total > 0)
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const denied = guardSensitiveRoute(req, 'exchange-balances', 30)
  if (denied) return denied

  let body: { connectionId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.connectionId) {
    return NextResponse.json({ ok: false, error: 'connectionId required' }, { status: 400 })
  }
  const conn = getExchangeConnection(body.connectionId)
  if (!conn) {
    return NextResponse.json({ ok: false, error: 'Unknown connection — re-link this exchange in the Wallets page' }, { status: 404 })
  }
  const { exchange, apiKey, apiSecret } = conn

  try {
    let balances
    if      (exchange === 'binance')  balances = await fetchBinanceBalances(apiKey, apiSecret)
    else if (exchange === 'coinbase') balances = await fetchCoinbaseBalances(apiKey, apiSecret)
    else if (exchange === 'kraken')   balances = await fetchKrakenBalances(apiKey, apiSecret)
    else return NextResponse.json({ ok: false, error: `Unsupported exchange: ${exchange}` }, { status: 400 })

    return NextResponse.json({ ok: true, exchange, balances, updatedAt: Date.now() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
