import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SOL_RPC = 'https://api.mainnet-beta.solana.com'

async function solRpc(method: string, params: unknown[]) {
  const res = await fetch(SOL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    next: { revalidate: 0 },
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.result
}

// GET /live-data/wallet/sol?address=...
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim()
  if (!address) {
    return NextResponse.json({ ok: false, error: 'Missing address' }, { status: 400 })
  }

  // Base58 Solana pubkey: 32–44 chars, no 0/O/I/l
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return NextResponse.json({ ok: false, error: 'Invalid Solana address' }, { status: 400 })
  }

  try {
    const result = await solRpc('getBalance', [address, { commitment: 'confirmed' }])
    const lamports   = result.value ?? result
    const balanceSol = lamports / 1e9

    return NextResponse.json({
      ok:        true,
      address,
      chain:     'solana',
      balance:   balanceSol,
      symbol:    'SOL',
      decimals:  9,
      updatedAt: Date.now(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
