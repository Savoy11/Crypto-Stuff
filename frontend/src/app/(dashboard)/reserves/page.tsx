'use client'

import { useState } from 'react'
import { Vault, CheckCircle, AlertTriangle, XCircle, ExternalLink } from 'lucide-react'
import { ReserveComposition } from '@/components/analytics/ReserveComposition'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils/format'
import { MOCK_ASSETS } from '@/lib/api/mock/mockAssets'

function VerificationBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 border border-emerald-500/20">
        <CheckCircle className="h-3 w-3" /> Verified
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400 border border-amber-500/20">
      <AlertTriangle className="h-3 w-3" /> Unverified
    </span>
  )
}

function CollateralizationBar({ ratio }: { ratio: number }) {
  const pct = Math.min(ratio * 100, 200)
  const color = ratio >= 1.0 ? 'bg-emerald-500' : ratio >= 0.95 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`font-mono text-xs tabular-nums ${ratio >= 1.0 ? 'text-emerald-400' : ratio >= 0.95 ? 'text-amber-400' : 'text-red-400'}`}>
        {formatPercent(ratio * 100, 1)}
      </span>
    </div>
  )
}

const ATTESTERS: Record<string, string> = {
  usdc: 'Grant Thornton', usdt: 'BDO', dai: 'Chainlink Oracles',
  frax: 'Frax Protocol', tusd: 'Armanino', busd: 'Paxos Trust',
  pyusd: 'Ernst & Young', usdp: 'Withum', gusd: 'BPM', lusd: 'On-Chain',
}

const MOCK_RESERVES = MOCK_ASSETS.map((a, i) => ({
  assetId: a.id,
  symbol: a.symbol,
  name: a.name,
  attester: ATTESTERS[a.id] ?? 'Third Party Auditor',
  attestationDate: `2024-0${Math.min(9, i + 1)}-15`,
  totalReservesUsd: a.marketCap * 1.02,
  collateralizationRatio: a.reserveRatio,
  verified: a.reserveRatio > 0.99,
  reportUrl: '#',
  composition: {
    cash_and_equivalents: 0.20 + Math.random() * 0.15,
    us_treasury_bills: 0.40 + Math.random() * 0.20,
    commercial_paper: 0.05 + Math.random() * 0.10,
    other: 0.05 + Math.random() * 0.10,
  },
}))

export default function ReservesPage() {
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null)

  const selected = MOCK_RESERVES.find(r => r.assetId === selectedAsset)

  const totalCollateralized = MOCK_RESERVES.filter(r => r.collateralizationRatio >= 1.0).length
  const totalReserves = MOCK_RESERVES.reduce((s, r) => s + r.totalReservesUsd, 0)
  const verifiedCount = MOCK_RESERVES.filter(r => r.verified).length

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Vault className="h-6 w-6 text-blue-400" />
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Reserve Transparency Monitor</h1>
          <p className="text-sm text-slate-400">
            Attestation records, composition breakdowns, and collateralization health
          </p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Monitored Reserves', value: formatCurrency(totalReserves), sub: `${MOCK_RESERVES.length} assets` },
          { label: 'Fully Collateralized', value: `${totalCollateralized}/${MOCK_RESERVES.length}`, sub: 'assets ≥ 100%' },
          { label: 'Verified Attestations', value: `${verifiedCount}/${MOCK_RESERVES.length}`, sub: 'by third-party auditor' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="mt-1 text-2xl font-mono font-bold text-slate-100 tabular-nums">{value}</p>
            <p className="text-xs text-slate-500">{sub}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Reserve table */}
        <div className="flex-1 min-w-0 rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-medium text-slate-300">Attestation Records</h2>
          </div>
          <div className="divide-y divide-slate-800/60">
            <div className="grid grid-cols-6 gap-4 px-4 py-2 text-xs font-medium text-slate-500 uppercase">
              <span className="col-span-2">Asset</span>
              <span>Reserves</span>
              <span className="col-span-2">Collateralization</span>
              <span>Status</span>
            </div>
            {MOCK_RESERVES.map(reserve => (
              <div
                key={reserve.assetId}
                onClick={() => setSelectedAsset(selectedAsset === reserve.assetId ? null : reserve.assetId)}
                className={`grid grid-cols-6 gap-4 px-4 py-3 text-sm cursor-pointer transition-colors ${
                  selectedAsset === reserve.assetId ? 'bg-blue-500/5' : 'hover:bg-slate-800/30'
                }`}
              >
                <div className="col-span-2 flex flex-col">
                  <span className="font-medium text-slate-100">{reserve.symbol}</span>
                  <span className="text-xs text-slate-500">{reserve.attester}</span>
                </div>
                <span className="font-mono text-xs text-slate-300 tabular-nums self-center">
                  {formatCurrency(reserve.totalReservesUsd)}
                </span>
                <div className="col-span-2 self-center">
                  <CollateralizationBar ratio={reserve.collateralizationRatio} />
                </div>
                <div className="self-center">
                  <VerificationBadge verified={reserve.verified} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reserve detail panel */}
        {selected && (
          <div className="w-80 flex-shrink-0 flex flex-col gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-200">{selected.symbol} Composition</h3>
                {selected.reportUrl && (
                  <a href={selected.reportUrl} target="_blank" rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
              <ReserveComposition composition={selected.composition} ratio={selected.collateralizationRatio} />
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Attester</span>
                <span className="text-slate-200">{selected.attester}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date</span>
                <span className="text-slate-200">{formatDate(selected.attestationDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Verified</span>
                <VerificationBadge verified={selected.verified} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
