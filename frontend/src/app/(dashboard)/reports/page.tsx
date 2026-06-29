'use client'

import { useState, useEffect, useRef } from 'react'
import { FileBarChart, Download, Calendar, RefreshCw, AlertTriangle, Printer } from 'lucide-react'
import { MOCK_ASSETS } from '@/lib/api/mock/mockAssets'
import { LIVE_DATA } from '@/lib/constants'
import { RiskScoreBadge } from '@/components/assets/RiskScoreBadge'
import { formatCurrency, formatScore, formatDate, formatPercent, formatOrNA, NA_LABEL } from '@/lib/utils/format'
import { getRiskColor } from '@/lib/utils/risk'
import type { RiskScore } from '@/types/asset'

// Deterministic mock scores aligned with MOCK_ASSETS (catalog values are populated)
const MOCK_RISK_SCORES: (RiskScore & { assetId: string })[] = MOCK_ASSETS.map(a => {
  const riskScore = a.riskScore ?? 0
  return {
    id: `rs-${a.id}`,
    assetId: a.id,
    overallScore: riskScore,
    reserveScore: Math.min(100, riskScore * 0.95 + 3),
    pegScore: Math.min(100, riskScore + 1),
    networkScore: Math.min(100, riskScore * 0.97),
    securityScore: Math.min(100, riskScore * 1.01),
    riskBand: a.riskBand ?? 'moderate',
    confidence: 0.92,
    percentileRank: riskScore,
    scoreDate: new Date().toISOString(),
    previousScore: null,
    scoreDelta: null,
    scoreBreakdown: {
      reserveScore: Math.min(100, riskScore * 0.95 + 3),
      reserveWeight: 0.35,
      pegScore: Math.min(100, riskScore + 1),
      pegWeight: 0.30,
      networkScore: Math.min(100, riskScore * 0.97),
      networkWeight: 0.20,
      securityScore: Math.min(100, riskScore * 1.01),
      securityWeight: 0.15,
    },
  }
})

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

function generatePDF(reportType: ReportType, assets: typeof MOCK_ASSETS, scores: typeof MOCK_RISK_SCORES, date: string) {
  const rows = assets.map((a) => {
    const score = scores.find((s) => s.assetId === a.id)
    const scoreVal = score ? formatScore(score.overallScore) : '—'
    const band = score?.riskBand ?? '—'
    const bandColor = band === 'low' ? '#10b981' : band === 'moderate' ? '#f59e0b' : band === 'elevated' ? '#f97316' : band === 'high' || band === 'critical' ? '#ef4444' : '#64748b'
    return `
      <tr>
        <td><strong>${a.symbol}</strong><br/><small>${a.name}</small></td>
        <td>${a.assetType}</td>
        <td style="font-family:monospace;font-weight:bold;color:${bandColor}">${scoreVal}</td>
        <td><span style="color:${bandColor};text-transform:capitalize">${band}</span></td>
        <td style="font-family:monospace">${a.marketCap ? '$' + (a.marketCap / 1e9).toFixed(2) + 'B' : '—'}</td>
        <td style="font-family:monospace">${a.reserveRatio != null ? (a.reserveRatio * 100).toFixed(1) + '%' : '—'}</td>
        <td style="font-family:monospace">${a.pegDeviation != null ? (a.pegDeviation > 0 ? '+' : '') + (a.pegDeviation * 100).toFixed(3) + '%' : '—'}</td>
      </tr>`
  }).join('')

  const labelMap: Record<ReportType, string> = {
    portfolio: 'Portfolio Summary',
    risk: 'Risk Assessment Report',
    reserve: 'Reserve Transparency Report',
    compliance: 'Compliance Summary',
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>CAEP ${labelMap[reportType]} — ${date}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #1e293b; padding: 32px; }
    header { border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
    header h1 { font-size: 20px; font-weight: 700; color: #0f172a; }
    header p { font-size: 11px; color: #64748b; margin-top: 4px; }
    .meta { font-size: 11px; color: #64748b; text-align: right; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .kpi-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .kpi-value { font-size: 22px; font-weight: 700; font-family: monospace; color: #0f172a; margin: 4px 0 2px; }
    .kpi-sub { font-size: 10px; color: #94a3b8; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead { background: #f8fafc; }
    th { text-align: left; padding: 8px 10px; font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; line-height: 1.4; }
    td small { color: #94a3b8; font-size: 10px; }
    tr:last-child td { border-bottom: none; }
    footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 16px; }
      @page { margin: 1.5cm; size: A4 landscape; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>CAEP — ${labelMap[reportType]}</h1>
      <p>Crypto Asset Evaluation Platform · Institutional Analytics</p>
    </div>
    <div class="meta">
      <div>Generated: ${date}</div>
      <div>${assets.length} assets · CAEP v1.0</div>
    </div>
  </header>
  <div class="kpis">
    <div class="kpi">
      <div class="kpi-label">Total Assets Under Analysis</div>
      <div class="kpi-value">$${(assets.reduce((s, a) => s + (a.marketCap ?? 0), 0) / 1e9).toFixed(1)}B</div>
      <div class="kpi-sub">${assets.length} assets monitored</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Portfolio Avg Risk Score</div>
      <div class="kpi-value">${(scores.reduce((s, r) => s + r.overallScore, 0) / scores.length).toFixed(1)}</div>
      <div class="kpi-sub">composite weighted score</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">High / Critical Risk Assets</div>
      <div class="kpi-value">${scores.filter((r) => ['high', 'critical'].includes(r.riskBand)).length}</div>
      <div class="kpi-sub">require immediate review</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Asset</th><th>Type</th><th>Risk Score</th><th>Band</th>
        <th>Market Cap</th><th>Reserve Ratio</th><th>Peg Dev</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <footer>
    <span>CAEP Institutional Analytics — Confidential</span>
    <span>Scores are simulated in demo mode. Do not distribute without verification.</span>
  </footer>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 400)
}

export default function ReportsPage() {
  const [selectedType, setSelectedType] = useState<ReportType>('risk')
  const [generating, setGenerating] = useState(false)
  const [printingPdf, setPrintingPdf] = useState(false)
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

  const handlePDF = () => {
    setPrintingPdf(true)
    setTimeout(() => {
      generatePDF(selectedType, MOCK_ASSETS, MOCK_RISK_SCORES, reportDate ?? new Date().toLocaleDateString())
      setPrintingPdf(false)
    }, 200)
  }

  const totalAUM = MOCK_ASSETS.reduce((s, a) => s + (a.marketCap ?? 0), 0)
  const avgScore = MOCK_RISK_SCORES.reduce((s, r) => s + r.overallScore, 0) / MOCK_RISK_SCORES.length
  const highRiskCount = MOCK_RISK_SCORES.filter(r => ['high', 'critical'].includes(r.riskBand)).length

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
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

      {LIVE_DATA && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-400/70" />
          <p className="mt-3 text-sm font-medium text-slate-200">Reports are not available in live mode</p>
          <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
            Institutional reports depend on derived risk scores, reserve attestations,
            and compliance metrics that have no free real-time data source. They are
            hidden rather than exported with unverified figures.
          </p>
        </div>
      )}

      {!LIVE_DATA && <>
      {/* Report type selector */}
      <div className="grid grid-cols-4 gap-3">
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
      <div className="grid grid-cols-3 gap-4">
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
          <div className="flex items-center gap-2">
            <button
              onClick={handlePDF}
              disabled={printingPdf}
              className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-60 transition-colors"
            >
              {printingPdf ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              Export PDF
            </button>
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
                      {formatOrNA(asset.marketCap, (v) => formatCurrency(v))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                      {asset.reserveRatio === null ? (
                        <span className="text-slate-500">{NA_LABEL}</span>
                      ) : (
                        <span className={asset.reserveRatio >= 1.0 ? 'text-emerald-400' : 'text-amber-400'}>
                          {formatPercent(asset.reserveRatio * 100, 1)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                      {asset.pegDeviation === null ? (
                        <span className="text-slate-500">{NA_LABEL}</span>
                      ) : (
                        <span className={Math.abs(asset.pegDeviation) > 0.005 ? 'text-amber-400' : 'text-emerald-400'}>
                          {asset.pegDeviation > 0 ? '+' : ''}{formatPercent(asset.pegDeviation * 100, 3)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      </>}
    </div>
  )
}
