'use client'

import { Shield, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { riskScoresApi } from '@/lib/api/risk-scores'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'
import { formatScore, formatDate } from '@/lib/utils/format'
import type { RiskBand } from '@/types/asset'
import type { RiskLeaderboardEntry } from '@/types/risk'
import { LIVE_DATA } from '@/lib/constants'
import { LiveUnavailable } from '@/components/ui/LiveUnavailable'
import { PageHeader } from '@/components/ui/PageHeader'

const BAND_STATS = [
  { band: 'low' as RiskBand, label: 'Low Risk', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  { band: 'moderate' as RiskBand, label: 'Moderate', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  { band: 'elevated' as RiskBand, label: 'Elevated', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  { band: 'high' as RiskBand, label: 'High Risk', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  { band: 'critical' as RiskBand, label: 'Critical', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
]

export default function RiskScoresPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['risk-scores-leaderboard'],
    queryFn: () => riskScoresApi.getLeaderboard({ page: 1, pageSize: 50 }),
    staleTime: 60_000,
  })

  const scores = data?.data ?? []

  const bandCounts = BAND_STATS.reduce((acc, { band }) => {
    acc[band] = scores.filter((s: RiskLeaderboardEntry) => s.riskBand === band).length
    return acc
  }, {} as Record<RiskBand, number>)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-blue-400" />
        <div>
          <PageHeader
            title="Risk Score Leaderboard"
            subtitle="Composite risk assessment across all monitored assets"
            description="The Risk Score Leaderboard ranks every tracked asset by its composite CAEP risk score — a weighted combination of reserve quality, peg stability, network security, and counterparty exposure. Scores run 0–100 — higher scores indicate safer assets."
            details={[
              { label: 'Score bands', text: 'Low risk (80–100) · Moderate (60–79) · Elevated (40–59) · High (20–39) · Critical (0–19). Bands are shown as color-coded pills on each row.' },
              { label: 'Live mode', text: 'Composite risk scoring requires the CAEP backend. In live mode without a backend connection, scores are shown as N/A to avoid displaying fabricated values.' },
              { label: 'Sub-scores', text: 'Click any asset to see its breakdown: reserve, peg, network, and security sub-scores.' },
            ]}
          />
        </div>
      </div>

      {LIVE_DATA && (
        <LiveUnavailable message="Composite risk scoring (reserve, peg, network, and security sub-scores) is a derived analytic with no free real-time data source. Scores are shown as not available in live mode rather than displaying fabricated values." />
      )}

      {/* Band summary */}
      <div className="grid grid-cols-5 gap-3">
        {BAND_STATS.map(({ band, label, color, bg }) => (
          <div key={band} className={`rounded-lg border p-4 ${bg}`}>
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`text-2xl font-mono font-bold tabular-nums ${color}`}>
              {isLoading ? '—' : bandCounts[band] ?? 0}
            </p>
            <p className="text-xs text-slate-500">assets</p>
          </div>
        ))}
      </div>

      {/* Score table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-300">All Assets — Risk Rankings</h2>
        </div>

        {isLoading ? (
          <div className="p-6">
            <LoadingSkeleton count={10} />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-slate-400">
            Failed to load risk scores. Please try again.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            <div className="grid grid-cols-6 gap-4 px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
              <span className="col-span-1">#</span>
              <span className="col-span-2">Asset</span>
              <span>Reserve</span>
              <span>Peg</span>
              <span>Updated</span>
            </div>

            {scores.length === 0 ? (
              <div className="p-8 text-center text-slate-400">No risk scores available.</div>
            ) : (
              scores.map((score: RiskLeaderboardEntry, index: number) => (
                <div
                  key={score.assetId}
                  className="grid grid-cols-6 gap-4 px-4 py-3 text-sm hover:bg-slate-800/30 transition-colors"
                >
                  <span className="col-span-1 font-mono text-slate-500">{index + 1}</span>
                  <div className="col-span-2 flex flex-col">
                    <span className="font-medium text-slate-100">{score.symbol ?? '—'}</span>
                    <span className="text-xs text-slate-500">{score.assetName ?? '—'}</span>
                  </div>
                  <span className="font-mono text-slate-300 tabular-nums">
                    {formatScore(score.reserveScore)}
                  </span>
                  <span className="font-mono text-slate-300 tabular-nums">
                    {formatScore(score.pegScore)}
                  </span>
                  <span className="text-slate-500">
                    {score.scoreDate ? formatDate(score.scoreDate) : '—'}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
