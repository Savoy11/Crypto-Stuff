import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// XRP Ledger balance. Keyless public JSON-RPC — no account or key required.
const XRPL_RPC = 'https://s1.ripple.com:51234/'

/** XRP has 6 decimals; the ledger reports integer "drops". */
const DROPS_PER_XRP = 1_000_000

// GET /live-data/wallet/xrp?address=...
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim()
  if (!address) {
    return NextResponse.json({ ok: false, error: 'Missing address' }, { status: 400 })
  }

  // Classic XRPL address: base58, starts with 'r', 25–35 chars.
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)) {
    return NextResponse.json({ ok: false, error: 'Invalid XRP address' }, { status: 400 })
  }

  try {
    const res = await fetch(XRPL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_info',
        params: [{ account: address, ledger_index: 'validated' }],
      }),
      next: { revalidate: 0 },
    })
    if (!res.ok) throw new Error(`XRPL HTTP ${res.status}`)

    const data = await res.json()
    const result = data?.result

    // The ledger returns HTTP 200 with an error payload for unfunded accounts —
    // that is a real answer (zero balance), not a failure.
    if (result?.error === 'actNotFound') {
      return NextResponse.json({
        ok: true, address, chain: 'xrp', balance: 0, symbol: 'XRP',
        decimals: 6, updatedAt: Date.now(),
        note: 'Account not found on the ledger — unfunded or never activated.',
      })
    }
    if (result?.error) throw new Error(result.error_message ?? result.error)

    const drops = Number(result?.account_data?.Balance)
    if (!Number.isFinite(drops)) throw new Error('No balance returned')

    return NextResponse.json({
      ok: true,
      address,
      chain: 'xrp',
      balance: drops / DROPS_PER_XRP,
      symbol: 'XRP',
      decimals: 6,
      updatedAt: Date.now(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
