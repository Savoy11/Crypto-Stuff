import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Blockstream public API — no key required
const BLOCKSTREAM = 'https://blockstream.info/api'

// GET /live-data/wallet/btc?address=bc1...
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim()
  if (!address) {
    return NextResponse.json({ ok: false, error: 'Missing address' }, { status: 400 })
  }

  // Basic BTC address validation (legacy, P2SH, bech32)
  if (!/^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address)) {
    return NextResponse.json({ ok: false, error: 'Invalid Bitcoin address' }, { status: 400 })
  }

  try {
    const res  = await fetch(`${BLOCKSTREAM}/address/${address}`, { next: { revalidate: 0 } })
    if (!res.ok) throw new Error(`Blockstream ${res.status}`)
    const data = await res.json()

    // chain_stats = confirmed; mempool_stats = unconfirmed
    const confirmed   = data.chain_stats.funded_txo_sum  - data.chain_stats.spent_txo_sum
    const unconfirmed = data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum
    const balanceSat  = confirmed + unconfirmed
    const balanceBtc  = balanceSat / 1e8

    return NextResponse.json({
      ok:           true,
      address,
      chain:        'bitcoin',
      balance:      balanceBtc,
      balanceSat,
      symbol:       'BTC',
      decimals:     8,
      txCount:      data.chain_stats.tx_count,
      updatedAt:    Date.now(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
