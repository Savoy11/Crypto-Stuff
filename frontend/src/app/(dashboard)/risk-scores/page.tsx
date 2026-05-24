'use client'

import { Shield, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { riskScoresApi } from '@/lib/api/risk-scores'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'
import { RiskScoreBadge } from '@/components/assets/RiskScoreBadge'
import { formatScore, formatDate } from '@/lib/utils/format'
import { getRiskColor } from '@/lib/utils/risk'
import type { RiskBand } from '@/types/asset'

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
    acc[band] = scores.filter((s: any) => s.riskBand === band).length
    return acc
  }, {} as Record<RiskBand, number>)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-blue-400" />
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Risk Score Leaderboard</h1>
          <p className="text-sm text-slate-400">
            Composite risk assessment across all monitored assets
          </p>
        </div>
      </div>

      {/* Band summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
          <div className="overflow-x-auto">
          <div className="min-w-[640px] divide-y divide-slate-800/60">
            <div className="grid grid-cols-8 gap-4 px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
              <span className="col-span-1">#</span>
              <span className="col-span-2">Asset</span>
              <span>Score</span>
              <span>Band</span>
              <span>Reserve</span>
              <span>Peg</span>
              <span>Updated</span>
            </div>

            {scores.length === 0 ? (
              <div className="p-8 text-center text-slate-400">No risk scores available.</div>
            ) : (
              scores.map((score: any, index: number) => (
                <div
                  key={score.id}
                  className="grid grid-cols-8 gap-4 px-4 py-3 text-sm hover:bg-slate-800/30 transition-colors"
                >
                  <span className="col-span-1 font-mono text-slate-500">{index + 1}</span>
                  <div className="col-span-2 flex flex-col">
                    <span className="font-medium text-slate-100">{score.symbol ?? '—'}</span>
                    <span className="text-xs text-slate-500">{score.assetName ?? '—'}</span>
                  </div>
                  <span
                    className={`font-mono font-bold tabular-nums ${getRiskColor(score.riskBand)}`}
                  >
                    {formatScore(score.overallScore)}
                  </span>
                  <RiskScoreBadge band={score.riskBand} score={score.overallScore ?? 0} />
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
          </div>
        )}
      </div>
    </div>
  )
}
