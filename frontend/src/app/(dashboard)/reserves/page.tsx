'use client'

import { ModuleGate } from '@/components/layout/ModuleGate'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { stablecoinMetaIsStale, stablecoinMetaAgeDays, META_STALE_AFTER_DAYS } from '@/lib/data/stablecoinMeta'
import { Vault, CheckCircle, AlertTriangle, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { ReserveComposition } from '@/components/analytics/ReserveComposition'
import { formatCurrency, formatCompact, formatDate, formatPercent } from '@/lib/utils/format'
import { LIVE_DATA } from '@/lib/constants'
import type { LiveReserveAsset } from '@/app/live-data/reserves/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function VerificationBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 border border-emerald-500/20">
      <CheckCircle className="h-3 w-3" /> Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400 border border-amber-500/20">
      <AlertTriangle className="h-3 w-3" /> Unverified
    </span>
  )
}

function CollateralizationBar({ ratio }: { ratio: number | null }) {
  if (ratio == null) {
    return <span className="text-xs text-slate-500 italic" title="Issuer does not disclose a collateralization ratio">not disclosed</span>
  }
  const pct = Math.min(ratio * 100, 200)
  const color = ratio >= 1.0 ? 'bg-emerald-500' : ratio >= 0.95 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = ratio >= 1.0 ? 'text-emerald-400' : ratio >= 0.95 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`font-mono text-xs tabular-nums ${textColor}`}>{formatPercent(ratio * 100, 1)}</span>
    </div>
  )
}

function PegMechBadge({ mech }: { mech: string }) {
  // DefiLlama emits hyphens ('fiat-backed'), and so does the rest of this
  // codebase. Keying on underscores meant every fiat- and crypto-backed row
  // — 8 of the 9 monitored coins — missed its colour and printed the raw
  // string; only 'algorithmic' happened to match. Normalised so either
  // separator resolves.
  const key = mech.replace(/_/g, '-').toLowerCase()
  const styles: Record<string, string> = {
    'fiat-backed':    'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
    'crypto-backed':  'text-blue-400 bg-blue-400/10 border-blue-500/20',
    'algorithmic':    'text-red-400 bg-red-400/10 border-red-500/20',
    'hybrid':         'text-violet-400 bg-violet-400/10 border-violet-500/20',
  }
  const label: Record<string, string> = {
    'fiat-backed': 'Fiat-backed', 'crypto-backed': 'Crypto-backed',
    'algorithmic': 'Algorithmic', 'hybrid': 'Hybrid',
  }
  const style = styles[key] ?? 'text-slate-400 bg-slate-400/10 border-slate-500/20'
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${style}`}>
      {label[key] ?? mech}
    </span>
  )
}

// ─── Live fetch ───────────────────────────────────────────────────────────────

async function fetchLiveReserves(): Promise<{ assets: LiveReserveAsset[]; updatedAt: string; metaAsOf: string }> {
  const res = await fetch('/live-data/reserves')
  if (!res.ok) throw new Error('Failed to fetch reserve data')
  return res.json()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ReservesPageInner() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: liveData, isLoading, isError, refetch } = useQuery({
    queryKey: ['live-reserves'],
    queryFn: fetchLiveReserves,
    enabled: LIVE_DATA,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  })

  // Normalise live assets into the shape the table expects
  const liveAssets = (liveData?.assets ?? []).map((a) => ({
    assetId: a.id,
    symbol: a.symbol,
    name: a.name,
    attester: a.attester,
    attestationDate: a.lastAttestedDate,
    attestationUrl: a.attestationUrl,
    totalReservesUsd: a.circulatingUsd,
    collateralizationRatio: a.collateralizationRatio,
    verified: a.collateralizationRatio !== null,
    chains: a.chains,
    composition: a.composition.length > 0
      ? a.composition.map((c) => ({ ...c, description: '' }))
      : [{ category: 'Undisclosed', amount: a.circulatingUsd, percentage: 100, description: 'Composition not publicly available' }],
    pegMechanism: a.pegMechanism,
  }))

  const reserves = liveAssets
  const selected = reserves.find((r) => r.assetId === selectedId)

  const totalReserves = reserves.reduce((s, r) => s + r.totalReservesUsd, 0)
  const fullyCollateralized = reserves.filter((r) => (r.collateralizationRatio ?? 0) >= 1.0).length
  const verifiedCount = reserves.filter((r) => r.verified).length

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Vault className="h-6 w-6 text-blue-400" />
          <div>
            {/* Escalating staleness banner (transferFees pattern) — the
                previous snapshot silently aged to 20 months (audit H2). */}
            {stablecoinMetaIsStale() && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  The curated attestation snapshot is {stablecoinMetaAgeDays()} days old
                  (stale after {META_STALE_AFTER_DAYS}) — attester names, dates, and
                  composition splits below may lag current issuer filings. Refresh
                  <code className="mx-1">src/lib/data/stablecoinMeta.ts</code> from issuer disclosures.
                </span>
              </div>
            )}
            <PageHeader
              title="Reserve Transparency Monitor"
              // Only SUPPLY is live here. Attester, attestation date and
              // collateralization ratio all come from a curated snapshot
              // (metaAsOf), and the old subtitle claimed the whole lot was
              // "Live … attestation data via DefiLlama" under a fresh
              // timestamp — the single most misleading string on the page.
              subtitle={LIVE_DATA && liveData
                ? `Live supply via DefiLlama (updated ${new Date(liveData.updatedAt).toLocaleTimeString()}) · attestation & collateral figures from a curated snapshot dated ${liveData.metaAsOf}`
                : 'Attestation records, composition breakdowns, and collateralization health'}
              description="The Reserve Transparency Monitor compares circulating supply and collateralization ratios across all tracked stablecoins side-by-side. In live mode it pulls real-time data from DefiLlama, including chain distribution, peg mechanism, and attestation frequency."
              details={[
                { label: 'Collateralization', text: 'A ratio above 100% means reserves exceed circulating supply — the asset is over-collateralized. Below 100% is a red flag for fiat-backed stablecoins.' },
                { label: 'Attestation', text: 'Third-party attestations (Grant Thornton, BDO, etc.) verify that published reserve figures are accurate. Frequency matters — monthly is standard, quarterly is weaker.' },
                { label: 'Live data', text: 'Supply data comes from DefiLlama\'s stablecoins API and updates on each page load. Composition breakdowns are derived from on-chain distribution across chains.' },
              ]}
            />
          </div>
        </div>
        {LIVE_DATA && (
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        )}
      </div>

      {/* Data provenance */}
      <SourceLine id="reserves" asOf={liveData?.updatedAt} />

      {/* Loading */}
      {LIVE_DATA && isLoading && (
        <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Fetching reserve data from DefiLlama…</span>
        </div>
      )}

      {/* Error state */}
      {LIVE_DATA && isError && !isLoading && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-red-400/70" />
          <p className="mt-2 text-sm font-medium text-slate-200">Could not reach DefiLlama</p>
          <p className="mt-1 text-xs text-slate-400">Reserve data is temporarily unavailable. Check your connection.</p>
          <button onClick={() => refetch()} className="mt-3 text-xs text-blue-400 hover:text-blue-300 underline">Retry</button>
        </div>
      )}

      {/* Content */}
      {(!isLoading && !isError) && reserves.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Monitored Supply', value: formatCompact(totalReserves), sub: `${reserves.length} assets via DefiLlama` },
              { label: 'Fully Collateralized', value: `${fullyCollateralized}/${reserves.length}`, sub: 'assets ≥ 100% (as disclosed)' },
              // `verified` means "we hold a disclosed ratio for this asset",
              // NOT that anything was independently verified — every monitored
              // symbol has one, so labelling it "Verified Attestations" made a
              // KPI that could only ever read N/N and implied third-party
              // assurance the app never performed.
              { label: 'Attestation on File', value: `${verifiedCount}/${reserves.length}`, sub: 'issuer-disclosed, not independently verified' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 min-w-0">
                <p className="text-xs text-slate-400 uppercase tracking-wider truncate">{label}</p>
                <p className="mt-1 text-xl font-mono font-bold text-slate-100 tabular-nums break-all leading-tight">{value}</p>
                <p className="text-xs text-slate-500 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          {/* Table + detail */}
          <div className="flex gap-6">
            <div className="flex-1 min-w-0 rounded-xl border border-slate-800 bg-slate-900/50">
              <div className="border-b border-slate-800 px-4 py-3">
                <h2 className="text-sm font-medium text-slate-300">Attestation Records</h2>
              </div>
              <div className="divide-y divide-slate-800/60">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-slate-500 uppercase">
                  <span className="col-span-3">Asset</span>
                  <span className="col-span-2">Supply</span>
                  <span className="col-span-2">Mechanism</span>
                  <span className="col-span-3">Collateralization</span>
                  <span className="col-span-2">Status</span>
                </div>
                {reserves.map((r) => (
                  <div
                    key={r.assetId}
                    onClick={() => setSelectedId(selectedId === r.assetId ? null : r.assetId)}
                    className={`grid grid-cols-12 gap-2 px-4 py-3 text-sm cursor-pointer transition-colors ${
                      selectedId === r.assetId ? 'bg-blue-500/5' : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="col-span-3 flex flex-col">
                      <span className="font-medium text-slate-100">{r.symbol}</span>
                      <span className="text-xs text-slate-500">{r.attester}</span>
                    </div>
                    <span className="col-span-2 font-mono text-xs text-slate-300 tabular-nums self-center">
                      {formatCurrency(r.totalReservesUsd)}
                    </span>
                    <div className="col-span-2 self-center">
                      {'pegMechanism' in r && r.pegMechanism
                        ? <PegMechBadge mech={r.pegMechanism as string} />
                        : <span className="text-xs text-slate-500">—</span>}
                    </div>
                    <div className="col-span-3 self-center">
                      <CollateralizationBar ratio={r.collateralizationRatio} />
                    </div>
                    <div className="col-span-2 self-center">
                      <VerificationBadge verified={r.verified} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Detail panel */}
            {selected && (
              <div className="w-80 flex-shrink-0 flex flex-col gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-slate-200">{selected.symbol} Composition</h3>
                    {'attestationUrl' in selected && selected.attestationUrl && selected.attestationUrl !== '#' && (
                      <a href={selected.attestationUrl as string} target="_blank" rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                  <ReserveComposition
                    composition={selected.composition}
                    collateralizationRatio={selected.collateralizationRatio ?? undefined}
                  />
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Attester</span>
                    <span className="text-slate-200 text-right text-xs max-w-[160px]">{selected.attester}</span>
                  </div>
                  {selected.attestationDate && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Last attested</span>
                      <span className="text-slate-200">{formatDate(selected.attestationDate)}</span>
                    </div>
                  )}
                  {'chains' in selected && selected.chains && selected.chains.length > 0 && (
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-slate-400 flex-shrink-0">Chains</span>
                      <span className="text-slate-300 text-xs text-right">{selected.chains.slice(0, 5).join(', ')}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Verified</span>
                    <VerificationBadge verified={selected.verified} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Source note */}
          {LIVE_DATA && (
            <p className="text-[11px] text-slate-500 text-center">
              Circulating supply via{' '}
              <a href="https://stablecoins.llama.fi" target="_blank" rel="noopener noreferrer" className="text-blue-400/70 hover:text-blue-400">
                DefiLlama Stablecoins API
              </a>{' '}
              · Attestation metadata from issuer disclosures · Composition breakdowns are approximate
            </p>
          )}
        </>
      )}
    </div>
  )
}

// Entitlement gate. Wrapping here rather than inside ReservesPageInner's JSX is
// deliberate: a disabled module must not mount the component at all, so its
// queries and stores never run for a user who cannot see the results.
export default function ReservesPage() {
  return (
    <ModuleGate module="crypto">
      <ReservesPageInner />
    </ModuleGate>
  )
}
