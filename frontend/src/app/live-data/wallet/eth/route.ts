import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Public keyless JSON-RPC endpoints per EVM chain. Every chain the wallet
// watcher offers must be listed here — falling back to Ethereum would show
// the wrong chain's balance under a confident chain label.
const EVM_RPCS: Record<string, { rpc: string; symbol: string }> = {
  ethereum:  { rpc: 'https://cloudflare-eth.com',            symbol: 'ETH' },
  polygon:   { rpc: 'https://polygon-rpc.com',               symbol: 'POL' },
  bsc:       { rpc: 'https://bsc-dataseed.binance.org',      symbol: 'BNB' },
  avalanche: { rpc: 'https://api.avax.network/ext/bc/C/rpc', symbol: 'AVAX' },
  arbitrum:  { rpc: 'https://arb1.arbitrum.io/rpc',          symbol: 'ETH' },
  base:      { rpc: 'https://mainnet.base.org',              symbol: 'ETH' },
  optimism:  { rpc: 'https://mainnet.optimism.io',           symbol: 'ETH' },
}

async function evmRpc(rpcUrl: string, method: string, params: unknown[]) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    next: { revalidate: 0 },
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.result
}

// GET /live-data/wallet/eth?address=0x...&chain=polygon
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim()
  const chain = req.nextUrl.searchParams.get('chain')?.trim() || 'ethereum'

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ ok: false, error: 'Invalid EVM address' }, { status: 400 })
  }
  const chainConfig = EVM_RPCS[chain]
  if (!chainConfig) {
    return NextResponse.json(
      { ok: false, error: `Unsupported EVM chain: ${chain}. Supported: ${Object.keys(EVM_RPCS).join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const [balanceHex, txCountHex] = await Promise.all([
      evmRpc(chainConfig.rpc, 'eth_getBalance',          [address, 'latest']),
      evmRpc(chainConfig.rpc, 'eth_getTransactionCount', [address, 'latest']),
    ])

    const balanceWei = BigInt(balanceHex)
    const balance    = Number(balanceWei) / 1e18
    const txCount    = parseInt(txCountHex, 16)

    return NextResponse.json({
      ok:       true,
      address,
      chain,
      balance,
      symbol:   chainConfig.symbol,
      decimals: 18,
      txCount,
      updatedAt: Date.now(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
