'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, Send, Bot, ChevronDown, ChevronUp,
  Activity, Loader2, ExternalLink, TrendingDown,
  RefreshCw, FileText, Shield, CheckCircle, Info,
  Search, Zap,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { PumpMetric } from '@/app/live-data/pump-report/metrics/route'
import type { ScanTarget } from '@/app/live-data/pump-report/scan/route'
import type { InvestigationReport, ReportFinding, EvidenceLink } from '@/app/live-data/pump-report/investigate/route'

// ─── Chat types ───────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ─── Risk helpers ─────────────────────────────────────────────────────────────

function riskColor(level: string) {
  if (level === 'critical') return 'text-red-400'
  if (level === 'flagged'  || level === 'high')    return 'text-orange-400'
  if (level === 'suspicious' || level === 'elevated') return 'text-amber-400'
  return 'text-emerald-400'
}

function riskBg(level: string) {
  if (level === 'critical')   return 'bg-red-500/15 border-red-500/30'
  if (level === 'flagged'   || level === 'high')    return 'bg-orange-500/15 border-orange-500/30'
  if (level === 'suspicious'|| level === 'elevated') return 'bg-amber-500/15 border-amber-500/30'
  if (level === 'moderate')   return 'bg-yellow-500/15 border-yellow-500/30'
  return 'bg-emerald-500/10 border-emerald-500/20'
}

function riskLabel(level: string) {
  const map: Record<string, string> = {
    critical: 'CRITICAL', flagged: 'FLAGGED', suspicious: 'SUSPICIOUS',
    high: 'HIGH', elevated: 'ELEVATED', moderate: 'MODERATE', low: 'LOW', clean: 'CLEAN',
  }
  return map[level] ?? level.toUpperCase()
}

function severityIcon(s: ReportFinding['severity']) {
  if (s === 'critical') return <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
  if (s === 'alert')    return <AlertTriangle size={14} className="text-orange-400 shrink-0 mt-0.5" />
  if (s === 'warning')  return <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
  return <CheckCircle size={14} className="text-emerald-400 shrink-0 mt-0.5" />
}

function severityBg(s: ReportFinding['severity']) {
  if (s === 'critical') return 'border-red-500/30 bg-red-500/10'
  if (s === 'alert')    return 'border-orange-500/30 bg-orange-500/10'
  if (s === 'warning')  return 'border-amber-500/30 bg-amber-500/10'
  return 'border-emerald-500/20 bg-emerald-500/5'
}

function scoreBarColor(score: number) {
  if (score >= 8) return 'bg-red-500'
  if (score >= 6) return 'bg-orange-500'
  if (score >= 4) return 'bg-amber-500'
  if (score >= 2) return 'bg-yellow-500'
  return 'bg-emerald-500'
}

// ─── Evidence source card ─────────────────────────────────────────────────────

function SourceCard({ s }: { s: EvidenceLink }) {
  const domain = (() => { try { return new URL(s.url).hostname.replace('www.', '') } catch { return s.source } })()
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border bg-bg-elevated hover:border-accent-blue/30 hover:bg-bg-card transition-colors group"
    >
      <ExternalLink size={12} className="text-text-muted group-hover:text-accent-blue mt-0.5 shrink-0 transition-colors" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-text-primary group-hover:text-accent-blue transition-colors leading-snug truncate">{s.title}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-accent-blue/70 font-mono">{domain}</span>
          {s.date && <span className="text-[10px] text-text-muted">{s.date}</span>}
        </div>
        {s.excerpt && (
          <p className="text-[11px] text-text-muted mt-1 leading-relaxed line-clamp-2">{s.excerpt}</p>
        )}
      </div>
    </a>
  )
}

// ─── Finding card ─────────────────────────────────────────────────────────────

function FindingCard({ f }: { f: ReportFinding }) {
  const [expanded, setExpanded] = useState(f.severity !== 'info')

  return (
    <div className={clsx('rounded-xl border overflow-hidden', severityBg(f.severity))}>
      <button
        className="w-full flex items-start gap-3 p-3 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        {severityIcon(f.severity)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{f.category}</span>
            {f.sources.length > 0 && (
              <span className="text-[10px] text-text-muted">{f.sources.length} source{f.sources.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <p className="text-xs font-semibold text-text-primary mt-0.5">{f.headline}</p>
          {!expanded && f.detail && (
            <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{f.detail}</p>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-text-muted shrink-0 mt-0.5" /> : <ChevronDown size={14} className="text-text-muted shrink-0 mt-0.5" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border/50 pt-2.5">
          {f.detail && <p className="text-xs text-text-secondary leading-relaxed">{f.detail}</p>}
          {f.sources.length > 0 && (
            <div className="space-y-1.5">
              {f.sources.map((s, i) => <SourceCard key={i} s={s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Structured report ────────────────────────────────────────────────────────

function ReportDocument({ report, onAsk }: { report: InvestigationReport; onAsk: (q: string) => void }) {
  const score = report.riskScore ?? 0
  const pct   = (score / 10) * 100

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={clsx('rounded-xl border p-4', riskBg(report.overallRisk))}>
        <div className="flex items-start gap-3">
          <FileText size={18} className={clsx('shrink-0 mt-0.5', riskColor(report.overallRisk))} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-text-primary">{report.target}</span>
              <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full border', riskBg(report.overallRisk), riskColor(report.overallRisk))}>
                {riskLabel(report.overallRisk)}
              </span>
              <span className="text-[10px] text-text-muted ml-auto">
                Generated {new Date(report.generatedAt).toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{report.executiveSummary}</p>

            {/* Score bar */}
            <div className="mt-2.5 flex items-center gap-2">
              <span className="text-[10px] text-text-muted w-20 shrink-0">Fraud Risk</span>
              <div className="flex-1 h-2 rounded-full bg-bg-elevated overflow-hidden">
                <div className={clsx('h-full rounded-full transition-all', scoreBarColor(score))} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] font-mono text-text-muted w-10 text-right shrink-0">{score.toFixed(1)}/10</span>
            </div>
          </div>
        </div>
      </div>

      {/* Red flags */}
      {report.redFlags?.length > 0 && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/8 p-3">
          <p className="text-[11px] font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertTriangle size={12} /> Red Flags ({report.redFlags.length})
          </p>
          <ul className="space-y-1">
            {report.redFlags.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-red-300/90">
                <span className="mt-1.5 size-1 rounded-full bg-red-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mitigating factors */}
      {report.mitigatingFactors?.length > 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Shield size={12} /> Mitigating Factors
          </p>
          <ul className="space-y-1">
            {report.mitigatingFactors.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-emerald-300/80">
                <CheckCircle size={11} className="mt-0.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Findings */}
      <div>
        <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">
          Investigation Findings — {report.findings?.length ?? 0} categories searched
        </p>
        <div className="space-y-2">
          {(report.findings ?? []).map((f, i) => <FindingCard key={i} f={f} />)}
        </div>
      </div>

      {/* Searches run */}
      {report.searchesRun?.length > 0 && (
        <details className="text-[10px] text-text-muted">
          <summary className="cursor-pointer hover:text-text-secondary transition-colors select-none">
            {report.searchesRun.length} web searches conducted
          </summary>
          <ul className="mt-1.5 pl-3 space-y-0.5">
            {report.searchesRun.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <Search size={9} className="mt-0.5 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Conclusion */}
      <div className="rounded-xl border border-border bg-bg-card p-3">
        <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <Info size={12} /> Conclusion
        </p>
        <p className="text-xs text-text-secondary leading-relaxed">{report.conclusion}</p>
        <button
          onClick={() => onAsk(`Based on this investigation report for ${report.target}, what additional angles should I investigate and what are the biggest concerns I should monitor?`)}
          className="mt-2.5 text-[11px] px-2.5 py-1 rounded-lg bg-accent-blue/10 border border-accent-blue/20 text-accent-blue hover:bg-accent-blue/20 transition-colors"
        >
          Ask AI to dig deeper →
        </button>
      </div>
    </div>
  )
}

// ─── Live investigation log ───────────────────────────────────────────────────

function InvestigationLog({ log }: { log: string }) {
  const lines = log.split('\n').filter(Boolean)
  return (
    <div className="rounded-xl border border-border bg-bg-card p-3 font-mono text-[11px] space-y-1 max-h-64 overflow-y-auto">
      {lines.map((line, i) => {
        const isSearch  = line.startsWith('🔍')
        const isFound   = line.startsWith('📋')
        const isSection = line.startsWith('#') || line.startsWith('##')
        return (
          <div key={i} className={clsx(
            'leading-relaxed',
            isSearch  ? 'text-accent-blue' :
            isFound   ? 'text-emerald-400' :
            isSection ? 'text-text-primary font-bold' :
            'text-text-muted'
          )}>
            {line}
          </div>
        )
      })}
      <div className="flex items-center gap-1.5 text-accent-blue">
        <Loader2 size={10} className="animate-spin" />
        <span>Investigating…</span>
      </div>
    </div>
  )
}

// ─── Agent chat ───────────────────────────────────────────────────────────────

function AgentChat({
  pendingQuestion,
  onQuestionConsumed,
  reportContext,
  initialPrompt,
}: {
  pendingQuestion: string | null
  onQuestionConsumed: () => void
  reportContext: string
  initialPrompt?: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: initialPrompt ?? "Investigation complete. Ask me to dig deeper on any finding, search for additional evidence, or explain specific red flags." },
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return
    const userMsg: ChatMessage = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setStreaming(true)
    const history = [...messages, userMsg]
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/live-data/pump-report/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content })),
          context: reportContext,
        }),
      })
      if (!res.body) throw new Error()
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'assistant', content: copy[copy.length - 1].content + chunk }
          return copy
        })
      }
    } catch {
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: '[Connection error — please retry]' }
        return copy
      })
    } finally { setStreaming(false) }
  }, [messages, streaming, reportContext])

  useEffect(() => {
    if (pendingQuestion) { send(pendingQuestion); onQuestionConsumed() }
  }, [pendingQuestion]) // eslint-disable-line

  return (
    <div className="rounded-xl border border-border bg-bg-card flex flex-col" style={{ minHeight: 280, maxHeight: 420 }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <div className="size-6 rounded-lg bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center">
          <Bot size={13} className="text-accent-blue" />
        </div>
        <span className="text-xs font-semibold text-text-primary">AI Agent</span>
        <span className="text-[10px] text-text-muted">· web search enabled</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={clsx('size-1.5 rounded-full', streaming ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400')} />
          <span className="text-[10px] text-text-muted">{streaming ? 'Searching…' : 'Ready'}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {messages.map((m, i) => (
          <div key={i} className={clsx('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'assistant' && (
              <div className="size-5 rounded-full bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={10} className="text-accent-blue" />
              </div>
            )}
            <div className={clsx(
              'max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed',
              m.role === 'user'
                ? 'bg-accent-blue/20 border border-accent-blue/30 text-text-primary'
                : 'bg-bg-elevated border border-border text-text-secondary'
            )}>
              {m.content === '' && streaming
                ? <span className="flex items-center gap-1 text-text-muted"><Loader2 size={10} className="animate-spin" /> Searching…</span>
                : <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
              }
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-3 pb-2.5 pt-2 border-t border-border">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder="Ask for deeper investigation, specific evidence, or follow-up searches…"
            rows={2}
            disabled={streaming}
            className="flex-1 bg-bg-elevated border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent-blue/50 disabled:opacity-50"
          />
          <button
            onClick={() => send(input)}
            disabled={streaming || !input.trim()}
            className="size-8 rounded-lg bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 flex items-center justify-center shrink-0 transition-colors"
          >
            <Send size={13} className="text-white" />
          </button>
        </div>
        <p className="text-[10px] text-text-muted mt-1">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  )
}

// ─── Heuristic metric row ─────────────────────────────────────────────────────

function MetricRow({ m, onAsk }: { m: PumpMetric; onAsk: (q: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const pct = (m.signalScore / 10) * 100

  return (
    <div className={clsx('rounded-lg border p-3', riskBg(m.collapseRisk))}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-text-primary">Live Heuristic Signal</span>
            <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded border', riskBg(m.collapseRisk), riskColor(m.collapseRisk))}>
              {riskLabel(m.collapseRisk)}
            </span>
            {m.priceChange24h !== null && (
              <span className={clsx('text-xs font-mono', m.priceChange24h >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {m.priceChange24h >= 0 ? '+' : ''}{m.priceChange24h.toFixed(2)}% 24h
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
              <div className={clsx('h-full rounded-full', scoreBarColor(m.signalScore))} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] font-mono text-text-muted w-14 text-right shrink-0">Score {m.signalScore.toFixed(1)}/10</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => onAsk(`Explain the heuristic pump signals detected for ${m.symbol} and what they mean`)} className="text-[10px] px-2 py-1 rounded bg-accent-blue/10 border border-accent-blue/20 text-accent-blue hover:bg-accent-blue/20 transition-colors">Ask AI</button>
          {m.signals.length > 0 && (
            <button onClick={() => setExpanded(e => !e)} className="text-text-muted hover:text-text-secondary p-1">
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>
      {expanded && m.signals.length > 0 && (
        <div className="mt-2 space-y-1 pl-1">
          {m.signals.map((s, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertTriangle size={11} className="text-amber-400 mt-0.5 shrink-0" />
              <span className="text-[11px] text-text-secondary">{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export interface PumpReportTabProps {
  targets: ScanTarget[]
  coinId?: string
  symbol?: string
  agentIntro?: string
}

export function PumpReportTab({ targets, coinId, symbol, agentIntro }: PumpReportTabProps) {
  const primaryTarget = targets[0]

  // Investigation state
  const [phase, setPhase] = useState<'idle' | 'investigating' | 'done' | 'error'>('idle')
  const [log, setLog] = useState('')
  const [report, setReport] = useState<InvestigationReport | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const hasAutoStarted = useRef(false)

  // Heuristic metrics (coin only)
  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['pump-metrics-coin', coinId],
    queryFn: () => fetch('/live-data/pump-report/metrics').then(r => r.json()),
    refetchInterval: 120_000,
    enabled: !!coinId,
  })
  const coinMetric: PumpMetric | undefined = coinId
    ? metricsData?.metrics?.find((m: PumpMetric) => m.coinId === coinId)
    : undefined

  // Build report context string for the agent chat
  const reportContext = report
    ? JSON.stringify({ target: report.target, overallRisk: report.overallRisk, riskScore: report.riskScore, executiveSummary: report.executiveSummary, redFlags: report.redFlags, conclusion: report.conclusion, findingSummaries: report.findings?.map(f => ({ category: f.category, severity: f.severity, headline: f.headline })) })
    : ''

  const runInvestigation = useCallback(async () => {
    if (!primaryTarget || phase === 'investigating') return
    setPhase('investigating')
    setLog('')
    setReport(null)

    try {
      const res = await fetch('/live-data/pump-report/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: primaryTarget.label, targetType: primaryTarget.type }),
      })
      if (!res.body) throw new Error('No stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        fullText += chunk

        // Stream the log portion (before <REPORT>)
        const reportStart = fullText.indexOf('<REPORT>')
        if (reportStart === -1) {
          setLog(fullText)
        } else {
          setLog(fullText.slice(0, reportStart).trim())
        }
      }

      // Parse the report block
      const match = fullText.match(/<REPORT>([\s\S]*?)<\/REPORT>/)
      if (match) {
        try {
          const parsed: InvestigationReport = JSON.parse(match[1].trim())
          parsed.generatedAt = parsed.generatedAt || new Date().toISOString()
          setReport(parsed)
          setPhase('done')
        } catch {
          setPhase('error')
        }
      } else if (fullText.includes('<ERROR>')) {
        setPhase('error')
      } else {
        // No report block — treat full text as log, set error
        setPhase('error')
      }
    } catch {
      setPhase('error')
    }
  }, [primaryTarget, phase])

  // Auto-start on mount
  useEffect(() => {
    if (!hasAutoStarted.current && primaryTarget) {
      hasAutoStarted.current = true
      runInvestigation()
    }
  }, []) // eslint-disable-line

  return (
    <div className="space-y-5">
      {/* ── Heuristic signal (coin only) ── */}
      {coinId && (
        <div>
          <p className="text-xs font-medium text-text-secondary flex items-center gap-1.5 mb-2">
            <TrendingDown size={13} className="text-red-400" />
            Live Price & Volume Signals
            <span className="ml-auto text-[10px] text-text-muted font-normal">Auto-refreshes every 2 min</span>
          </p>
          {metricsLoading
            ? <div className="h-14 rounded-lg bg-bg-elevated border border-border animate-pulse" />
            : coinMetric
              ? <MetricRow m={coinMetric} onAsk={q => setPendingQuestion(q)} />
              : <p className="text-xs text-text-muted italic">No heuristic data available.</p>
          }
        </div>
      )}

      {/* ── Investigation panel ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
            <Search size={13} className="text-accent-blue" />
            Autonomous Investigation
            {phase === 'investigating' && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400">
                <Zap size={10} className="animate-pulse" /> Running 8 search angles…
              </span>
            )}
            {phase === 'done' && report && (
              <span className="text-[10px] text-emerald-400">
                · {report.findings?.length ?? 0} categories · {report.findings?.reduce((n, f) => n + f.sources.length, 0) ?? 0} sources
              </span>
            )}
          </p>
          {(phase === 'done' || phase === 'error') && (
            <button
              onClick={() => { hasAutoStarted.current = false; runInvestigation() }}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors"
            >
              <RefreshCw size={11} /> Re-run
            </button>
          )}
        </div>

        {/* Live log */}
        {phase === 'investigating' && log && <InvestigationLog log={log} />}

        {/* Idle */}
        {phase === 'idle' && (
          <div className="flex items-center justify-center py-8 rounded-xl border border-border bg-bg-card">
            <Loader2 size={16} className="animate-spin text-text-muted" />
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
            <p className="text-xs text-red-400 mb-2">Investigation failed. Check that ANTHROPIC_API_KEY is set.</p>
            <button onClick={runInvestigation} className="text-[11px] px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 transition-colors">
              Retry
            </button>
          </div>
        )}

        {/* Full report */}
        {phase === 'done' && report && (
          <ReportDocument report={report} onAsk={q => setPendingQuestion(q)} />
        )}

        {/* Still streaming but report hasn't appeared yet */}
        {phase === 'investigating' && !log && (
          <div className="flex items-center gap-2 py-6 justify-center text-xs text-text-muted">
            <Loader2 size={14} className="animate-spin" />
            Starting investigation…
          </div>
        )}
      </div>

      {/* ── AI Agent chat ── */}
      <div>
        <p className="text-xs font-medium text-text-secondary flex items-center gap-1.5 mb-2">
          <Bot size={13} className="text-accent-blue" />
          AI Agent — Ask for deeper investigation
        </p>
        <AgentChat
          pendingQuestion={pendingQuestion}
          onQuestionConsumed={() => setPendingQuestion(null)}
          reportContext={reportContext}
          initialPrompt={
            phase === 'done'
              ? `Investigation of ${primaryTarget?.label} is complete. I found ${report?.findings?.length ?? 0} categories of results with ${report?.findings?.reduce((n, f) => n + f.sources.length, 0) ?? 0} supporting sources. Ask me to dig deeper on any finding, search for additional evidence, or investigate specific wallets and addresses.`
              : agentIntro ?? `I'm your Pump Report AI Agent. The autonomous investigation is running — I'll have a full report with sources shortly. You can ask me follow-up questions in the meantime.`
          }
        />
      </div>
    </div>
  )
}
