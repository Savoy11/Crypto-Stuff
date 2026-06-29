import { NextRequest, NextResponse } from 'next/server'
import { CORS, options } from '../../_cors'
import { EXCHANGES } from '@/lib/data/transferFees'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

export async function GET(req: NextRequest) {
  const tierParam = req.nextUrl.searchParams.get('tier')
  const tierFilter = tierParam ? parseInt(tierParam) : null

  const exchanges = EXCHANGES
    .filter(ex => tierFilter == null || ex.tier === tierFilter)
    .map(ex => ({
      id: ex.id,
      name: ex.name,
      tier: ex.tier,
      coins: Object.keys(ex.coins),
      networks: [...new Set(
        Object.values(ex.coins).flatMap(c => c.networks.map(n => n.networkId))
      )],
    }))

  return NextResponse.json({
    exchanges,
    total: exchanges.length,
    note: 'tier 1 = major regulated exchanges, tier 2 = smaller/regional exchanges. Use exchange id values in /api/v1/transfer/routes.',
  }, { headers: CORS })
}
