import { NextResponse } from 'next/server'
import { ASSET_LIST_SORTED } from '@/lib/data/assetList'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ assets: ASSET_LIST_SORTED }, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
