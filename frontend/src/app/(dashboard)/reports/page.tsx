'use client'

import { useState, useEffect } from 'react'
import { FileBarChart, Download, Calendar, Filter, RefreshCw } from 'lucide-react'
import { MOCK_ASSETS } from '@/lib/api/mock/mockAssets'
import { RiskScoreBadge } from '@/components/assets/RiskScoreBadge'
import { formatCurrency, formatScore, formatDate, formatPercent } from '@/lib/utils/format'
import { getRiskColor } from '@/lib/utils/risk'
import type { RiskScore } from '@/types/asset'

// Deterministic mock scores aligned with MOCK_ASSETS
const MOCK_RISK_SCORES: (RiskScore & { assetId: string })[] = MOCK_ASSETS.map(a => ({
  id: `rs-${a.id}`,
  assetId: a.id,
  overallScore: a.riskScore,
  reserveScore: Math.min(100, a.riskScore * 0.95 + 3),
  pegScore: Math.min(100, a.riskScore + 1),
  networkScore: Math.min(100, a.riskScore * 0.97),
  securityScore: Math.min(100, a.riskScore * 1.01),
  riskBand: a.riskBand,
  confidence: 0.92,
  percentileRank: a.riskScore,
  scoreDate: new Date().toISOString(),
  previousScore: null,
  scoreDelta: null,
  scoreBreakdown: {
    reserveScore: Math.min(100, a.riskScore * 0.95 + 3),
    reserveWeight: 0.35,
    pegScore: Math.min(100, a.riskScore + 1),
    pegWeight: 0.30,
    networkScore: Math.min(100, a.riskScore * 0.97),
    networkWeight: 0.20,
    securityScore: Math.min(100, a.riskScore * 1.01),
    securityWeight: 0.15,
  },
}))

type ReportType = 'portfolio' | 'risk' | 'reserve' | 'compliance'

const REPORT_TYPES: { type: ReportType; label: string; description: string }[] = [
  {
    type: 'portfolio',
    label: 'Portfolio Summary',
    description: 'Aggregate exposure, market caps, and concentration metrics',
  },
  {
    type: 'risk',
    label: 'Risk Assessment Report',
    description: 'Full risk scoring breakdown with component detail',
  },
  {
    type: 'reserve',
    label: 'Reserve Transparency Report',
    description: 'Attestation status, composition, and collateralization ratios',
  },
  {
    type: 'compliance',
    label: 'Compliance Summary',
    description: 'Regulatory readiness indicators and audit trail summary',
  },
]

function generateCSV(assets: typeof MOCK_ASSETS, scores: typeof MOCK_RISK_SCORES): string {
  const header = 'Symbol,Name,Type,Risk Score,Risk Band,Market Cap,Peg Deviation,Reserve Ratio,Score Date'
  const rows = assets.map(a => {
    const score = scores.find(s => s.assetId === a.id)
    return [
      a.symbol, a.name, a.assetType,
      score ? formatScore(score.overallScore) : '',
      score?.riskBand ?? '',
      a.marketCap, a.pegDeviation, a.reserveRatio,
      score ? formatDate(score.scoreDate) : '',
    ].join(',')
  })
  return [header, ...rows].join('\n')
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const [selectedType, setSelectedType] = useState<ReportType>('risk')
  const [generating, setGenerating] = useState(false)
  const [reportDate, setReportDate] = useState<string | null>(null)

  useEffect(() => {
    setReportDate(formatDate(new Date().toISOString()))
  }, [])

  const handleDownload = () => {
    setGenerating(true)
    setTimeout(() => {
      const csv = generateCSV(MOCK_ASSETS, MOCK_RISK_SCORES)
      downloadCSV(csv, `caep-${selectedType}-report-${new Date().toISOString().split('T')[0]}.csv`)
      setGenerating(false)
    }, 800)
  }

  const totalAUM = MOCK_ASSETS.reduce((s, a) => s + a.marketCap, 0)
  const avgScore = MOCK_RISK_SCORES.reduce((s, r) => s + r.overallScore, 0) / MOCK_RISK_SCORES.length
  const highRiskCount = MOCK_RISK_SCORES.filter(r => ['high', 'critical'].includes(r.riskBand)).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileBarChart className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Institutional Reports</h1>
            <p className="text-sm text-slate-400">
              Generate and export compliance-grade analytics reports
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="h-4 w-4" />
          As of {reportDate ?? '—'}
        </div>
      </div>

      {/* Report type selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {REPORT_TYPES.map(({ type, label, description }) => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              selectedType === type
                ? 'border-blue-500/50 bg-blue-500/10'
                : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/40'
            }`}
          >
            <p className={`text-sm font-medium ${selectedType === type ? 'text-blue-300' : 'text-slate-200'}`}>
              {label}
            </p>
            <p className="mt-1 text-xs text-slate-500">{description}</p>
          </button>
        ))}
      </div>

      {/* Executive summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Assets Under Analysis', value: formatCurrency(totalAUM), sub: `${MOCK_ASSETS.length} assets monitored` },
          { label: 'Portfolio Avg Risk Score', value: formatScore(avgScore), sub: 'composite weighted score' },
          { label: 'High / Critical Risk Assets', value: String(highRiskCount), sub: 'require immediate review' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="mt-1 text-2xl font-mono font-bold text-slate-100 tabular-nums">{value}</p>
            <p className="text-xs text-slate-500">{sub}</p>
          </div>
        ))}
      </div>

      {/* Report preview table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-300">Report Preview</h2>
          <button
            onClick={handleDownload}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60 transition-colors"
          >
            {generating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs font-medium text-slate-500 uppercase">
                <th className="px-4 py-2 text-left">Asset</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-right">Risk Score</th>
                <th className="px-4 py-2 text-left">Band</th>
                <th className="px-4 py-2 text-right">Market Cap</th>
                <th className="px-4 py-2 text-right">Reserve Ratio</th>
                <th className="px-4 py-2 text-right">Peg Dev</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {MOCK_ASSETS.map(asset => {
                const score = MOCK_RISK_SCORES.find(s => s.assetId === asset.id)
                return (
                  <tr key={asset.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-100">{asset.symbol}</span>
                        <span className="text-xs text-slate-500">{asset.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="capitalize text-slate-400 text-xs">{asset.assetType}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-mono font-bold tabular-nums ${score ? getRiskColor(score.riskBand) : 'text-slate-500'}`}>
                        {score ? formatScore(score.overallScore) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {score ? <RiskScoreBadge band={score.riskBand} score={score.overallScore} /> : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-300 tabular-nums">
                      {formatCurrency(asset.marketCap)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                      <span className={asset.reserveRatio >= 1.0 ? 'text-emerald-400' : 'text-amber-400'}>
                        {formatPercent(asset.reserveRatio * 100, 1)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                      <span className={Math.abs(asset.pegDeviation) > 0.005 ? 'text-amber-400' : 'text-emerald-400'}>
                        {asset.pegDeviation > 0 ? '+' : ''}{formatPercent(asset.pegDeviation * 100, 3)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
