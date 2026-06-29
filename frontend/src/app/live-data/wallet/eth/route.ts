import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Cloudflare's public Ethereum JSON-RPC (no key needed)
const ETH_RPC = 'https://cloudflare-eth.com'

async function ethRpc(method: string, params: unknown[]) {
  const res = await fetch(ETH_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    next: { revalidate: 0 },
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.result
}

// GET /live-data/wallet/eth?address=0x...
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim()
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ ok: false, error: 'Invalid Ethereum address' }, { status: 400 })
  }

  try {
    const [balanceHex, txCountHex] = await Promise.all([
      ethRpc('eth_getBalance',      [address, 'latest']),
      ethRpc('eth_getTransactionCount', [address, 'latest']),
    ])

    const balanceWei  = BigInt(balanceHex)
    const balanceEth  = Number(balanceWei) / 1e18
    const txCount     = parseInt(txCountHex, 16)

    return NextResponse.json({
      ok:       true,
      address,
      chain:    'ethereum',
      balance:  balanceEth,
      symbol:   'ETH',
      decimals: 18,
      txCount,
      updatedAt: Date.now(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
