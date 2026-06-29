'use client'

import { useState } from 'react'
import { Microscope, Loader2, Wrench, Sparkles, AlertCircle } from 'lucide-react'

const EXAMPLES = [
  'Compare ETH and SOL staking: APYs, risk profiles, and which suits a risk-averse holder.',
  'Analyze BTC price action over the last year and summarize the trend with key levels.',
  'What is the cheapest end-to-end route to move $10,000 USDC from Kraken to a wallet on Arbitrum?',
  'Summarize the latest news sentiment for the top L1s and flag anything material.',
]

interface ReportResult {
  report: string
  toolsUsed: { name: string; input: unknown }[]
}

export default function ResearchPage() {
  const [task, setTask] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/agents/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: trimmed }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setError(data.error ?? 'Research failed')
      else setResult({ report: data.report, toolsUsed: data.toolsUsed ?? [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <Microscope size={20} className="text-violet-400" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Research &amp; Analysis</h1>
          <p className="text-sm text-slate-400">
            Give the agent a research task. It gathers live data through the platform&apos;s tools and returns a structured report.
          </p>
        </div>
      </div>

      {/* Task input */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={4}
          placeholder="e.g. Compare the risk-adjusted staking yield of ETH vs SOL and recommend which fits a conservative holder."
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:border-violet-500/60 focus:outline-none resize-y leading-relaxed"
        />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-600">Reports can take 20–60s while the agent gathers data.</p>
          <button
            onClick={() => run(task)}
            disabled={loading || !task.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? 'Researching…' : 'Run research'}
          </button>
        </div>
      </div>

      {/* Examples */}
      {!result && !loading && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Try an example</p>
          {EXAMPLES.map((e) => (
            <button
              key={e}
              onClick={() => { setTask(e); run(e) }}
              className="w-full text-left text-sm text-slate-300 px-3.5 py-2.5 rounded-lg border border-slate-800 bg-slate-800/40 hover:bg-slate-800 hover:border-slate-700 transition-colors"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={15} className="animate-spin text-violet-400" />
            Gathering data and analyzing…
          </div>
          <div className="space-y-2 pt-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-3 rounded bg-slate-800 animate-pulse" style={{ width: `${90 - i * 8}%` }} />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 bg-red-500/10 text-red-300 border border-red-500/20">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Research failed</p>
            <p className="text-red-400/90 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Report */}
      {result && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
            <Microscope size={14} className="text-violet-400" />
            <span className="text-sm font-semibold text-slate-200">Report</span>
            {result.toolsUsed.length > 0 && (
              <div className="ml-auto flex flex-wrap gap-1 justify-end">
                {Array.from(new Set(result.toolsUsed.map((t) => t.name))).map((name) => (
                  <span key={name} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                    <Wrench size={9} /> {name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="px-5 py-4 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{result.report}</div>
        </div>
      )}
    </div>
  )
}
