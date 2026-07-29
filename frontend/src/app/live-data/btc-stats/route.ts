import { NextResponse } from 'next/server'
import { normaliseHashrate } from '@/lib/server/btcHashrate'

// Bitcoin network statistics from multiple free sources:
// - Blockchain.info: hashrate (GH/s — see lib/server/btcHashrate.ts), difficulty,
//   mempool, block count
// - Mempool.space: fee estimates, mempool size, block times
// - Binance: BTC dominance approximation via market cap
//
// Response: { ok, hashrate, difficulty, blockHeight, mempoolTxCount, mempoolSizeMb,
//             avgBlockTime, nextHalvingBlock, blocksUntilHalving, estimatedHalvingDate,
//             fees, updatedAt }

export const dynamic = 'force-dynamic'

export interface BtcStatsData {
  ok: boolean
  hashrateTHs: number | null          // TH/s
  difficulty: number | null
  blockHeight: number | null
  mempoolTxCount: number | null
  mempoolSizeMb: number | null
  avgBlockTimeSec: number | null
  nextHalvingBlock: number
  blocksUntilHalving: number | null
  estimatedHalvingDate: string | null
  fees: {
    fastestSatVb: number | null
    halfHourSatVb: number | null
    hourSatVb: number | null
    economySatVb: number | null
  }
  updatedAt: string
}

const HALVING_INTERVAL = 210_000

function nextHalvingBlock(currentHeight: number): number {
  return Math.ceil((currentHeight + 1) / HALVING_INTERVAL) * HALVING_INTERVAL
}

export async function GET(): Promise<NextResponse> {
  const [statsRes, mempoolFeesRes, mempoolInfoRes, blockHeightRes] = await Promise.allSettled([
    fetch('https://blockchain.info/stats?format=json', { next: { revalidate: 300 } }),
    fetch('https://mempool.space/api/v1/fees/recommended', { next: { revalidate: 60 } }),
    fetch('https://mempool.space/api/mempool', { next: { revalidate: 60 } }),
    fetch('https://blockchain.info/q/getblockcount', { next: { revalidate: 60 } }),
  ])

  let hashrateTHs: number | null = null
  let difficulty: number | null = null
  let blockHeight: number | null = null
  let mempoolTxCount: number | null = null
  let mempoolSizeMb: number | null = null
  let avgBlockTimeSec: number | null = null
  const fees = { fastestSatVb: null as number | null, halfHourSatVb: null as number | null, hourSatVb: null as number | null, economySatVb: null as number | null }

  if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
    const s = await statsRes.value.json() as {
      hash_rate: number; difficulty: number; n_blocks_total: number;
      minutes_between_blocks: number; n_tx: number
    }
    // NOT `/1e12`. blockchain.info sends GH/s, so that read a gigahash figure
    // as hashes and under-reported by 10^9 — the audit saw `0 EH/s` twice while
    // block height advanced normally. normaliseHashrate() infers the unit from
    // magnitude and returns null rather than a number it cannot justify.
    hashrateTHs = normaliseHashrate(s.hash_rate).hashrateTHs
    difficulty = s.difficulty
    if (!blockHeight) blockHeight = s.n_blocks_total
    avgBlockTimeSec = s.minutes_between_blocks ? s.minutes_between_blocks * 60 : null
  }

  if (blockHeightRes.status === 'fulfilled' && blockHeightRes.value.ok) {
    const text = await blockHeightRes.value.text()
    const parsed = parseInt(text.trim(), 10)
    if (!isNaN(parsed)) blockHeight = parsed
  }

  if (mempoolFeesRes.status === 'fulfilled' && mempoolFeesRes.value.ok) {
    const f = await mempoolFeesRes.value.json() as {
      fastestFee: number; halfHourFee: number; hourFee: number; economyFee: number
    }
    fees.fastestSatVb = f.fastestFee
    fees.halfHourSatVb = f.halfHourFee
    fees.hourSatVb = f.hourFee
    fees.economySatVb = f.economyFee
  }

  if (mempoolInfoRes.status === 'fulfilled' && mempoolInfoRes.value.ok) {
    const m = await mempoolInfoRes.value.json() as { count: number; vsize: number }
    mempoolTxCount = m.count
    mempoolSizeMb = m.vsize / 1e6
  }

  const halvingBlock = blockHeight !== null ? nextHalvingBlock(blockHeight) : 1_050_000
  const blocksUntilHalving = blockHeight !== null ? halvingBlock - blockHeight : null

  // Estimate halving date: ~10 min per block
  const estimatedHalvingDate = blocksUntilHalving !== null
    ? new Date(Date.now() + blocksUntilHalving * 10 * 60 * 1000).toISOString().slice(0, 10)
    : null

  return NextResponse.json({
    ok: hashrateTHs !== null || blockHeight !== null,
    hashrateTHs,
    difficulty,
    blockHeight,
    mempoolTxCount,
    mempoolSizeMb,
    avgBlockTimeSec,
    nextHalvingBlock: halvingBlock,
    blocksUntilHalving,
    estimatedHalvingDate,
    fees,
    updatedAt: new Date().toISOString(),
  } satisfies BtcStatsData)
}
