import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// TRON balance via Tronscan's public API — keyless.
const TRONSCAN_API = 'https://apilist.tronscanapi.com/api/account'

/** TRX has 6 decimals; the API reports integer "sun". */
const SUN_PER_TRX = 1_000_000

// GET /live-data/wallet/tron?address=...
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim()
  if (!address) {
    return NextResponse.json({ ok: false, error: 'Missing address' }, { status: 400 })
  }

  // TRON base58 address: starts with 'T', 34 chars.
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
    return NextResponse.json({ ok: false, error: 'Invalid TRON address' }, { status: 400 })
  }

  try {
    const res = await fetch(`${TRONSCAN_API}?address=${encodeURIComponent(address)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; FinanceNow/1.0)' },
      next: { revalidate: 0 },
    })
    if (!res.ok) throw new Error(`Tronscan HTTP ${res.status}`)

    const data = await res.json()

    // An unused address returns 200 with no balance field rather than an error;
    // treat that as zero rather than surfacing a failure.
    const sun = Number(data?.balance ?? 0)
    if (!Number.isFinite(sun)) throw new Error('No balance returned')

    return NextResponse.json({
      ok: true,
      address,
      chain: 'tron',
      balance: sun / SUN_PER_TRX,
      symbol: 'TRX',
      decimals: 6,
      updatedAt: Date.now(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
