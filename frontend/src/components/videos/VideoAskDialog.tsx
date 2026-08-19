'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Loader2, Send, Sparkles, X } from 'lucide-react'
import type { VideoAnalyzeResponse } from '@/app/live-data/video-analyze/route'

/**
 * NT4 / review finding A1 — the trigger UI for `/live-data/video-analyze`.
 *
 * The route shipped complete and quota-guarded, and nothing ever called it,
 * while CLAUDE.md advertised "video search + AI analysis". The decision was to
 * make the existing claim true rather than retract it.
 *
 * Two things this deliberately does NOT do:
 *  - It does not pre-fetch or auto-run. Each call can process an hour of video
 *    and bills accordingly (the route caps at 6/min for that reason), so
 *    analysis happens only when the user asks a specific question.
 *  - It does not invent an answer when no provider is configured. The route
 *    distinguishes "nothing is set up" (501) from "the provider failed" (502),
 *    and this surfaces that difference, because the fixes are different.
 */

interface AnalyzerInfo {
  id: string
  label: string
  configured: boolean
  supported: boolean
}

/** Suggestions, not a fixed menu — the field accepts anything. */
const SUGGESTED_QUESTIONS = [
  'Summarize the main argument in five bullet points.',
  'What tickers or assets are discussed, and what is said about each?',
  'What claims does this make that a viewer should verify independently?',
]

export function useVideoAnalyzers() {
  return useQuery<{ ok: boolean; providers: AnalyzerInfo[] }>({
    queryKey: ['video-analyzers'],
    queryFn: () => fetch('/live-data/video-analyze').then((r) => r.json()),
    staleTime: 10 * 60 * 1000,
  })
}

/** True when at least one analyzer is both configured and usable. */
export function hasUsableAnalyzer(providers: AnalyzerInfo[] | undefined): boolean {
  return (providers ?? []).some((p) => p.configured && p.supported)
}

export function VideoAskDialog({
  videoUrl,
  videoTitle,
  onClose,
}: {
  videoUrl: string
  videoTitle: string
  onClose: () => void
}) {
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<VideoAnalyzeResponse | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function ask(q: string) {
    const trimmed = q.trim()
    if (!trimmed || pending) return
    setPending(true)
    setResult(null)
    try {
      const res = await fetch('/live-data/video-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, question: trimmed }),
      })
      const data = (await res.json()) as VideoAnalyzeResponse
      // A 403 comes from apiGuard, not the analyzer: this endpoint spends the
      // owner's API credits, so it is localhost-only unless FN_ADMIN_TOKEN is
      // set. Say that, rather than reporting it as an analysis failure.
      if (res.status === 403) {
        setResult({ ok: false, error: 'Video analysis is restricted to localhost on this deployment. Set FN_ADMIN_TOKEN to enable it from a remote host.' })
      } else {
        setResult(data)
      }
    } catch {
      setResult({ ok: false, error: 'Could not reach the analysis route.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Ask about ${videoTitle}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
              <Sparkles size={13} className="text-accent-blue" aria-hidden /> Ask about this video
            </h2>
            <p className="mt-0.5 truncate text-xs text-text-muted">{videoTitle}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-text-muted transition-colors hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => { setQuestion(q); ask(q) }}
                disabled={pending}
                className="rounded-full border border-border bg-bg-elevated px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent-blue/40 hover:text-text-primary disabled:opacity-50"
              >
                {q.length > 46 ? `${q.slice(0, 44)}…` : q}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(question) }
              }}
              rows={2}
              placeholder="Ask anything about this video…"
              className="flex-1 resize-none rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent-blue/50 focus:outline-none"
            />
            <button
              onClick={() => ask(question)}
              disabled={pending || !question.trim()}
              className="flex items-center gap-1.5 self-end rounded-lg bg-accent-blue px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
            >
              {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
              Ask
            </button>
          </div>

          {pending && (
            <p className="text-xs text-text-muted">
              Reading the video — this can take a while on a long one.
            </p>
          )}

          {result && !result.ok && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {result.error ?? 'Analysis failed.'}
            </div>
          )}

          {result?.ok && result.answer && (
            <div className="space-y-3">
              <div className="whitespace-pre-wrap rounded-lg border border-border bg-bg-elevated p-3 text-sm leading-relaxed text-text-secondary">
                {result.answer}
              </div>

              {result.moments && result.moments.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-medium text-text-secondary">Cited moments</h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {result.moments.map((m) => (
                      <li key={`${m.seconds}-${m.label}`}>
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block rounded border border-border bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-accent-blue transition-colors hover:border-accent-blue/40"
                        >
                          {m.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* House policy: a model's reading of a video is our own derived
                  output, and the surface that renders it says whose it is. */}
              <p className={clsx('text-[10px] leading-relaxed text-text-muted')}>
                Answered by {result.provider ?? 'an AI model'}
                {result.model ? ` (${result.model})` : ''} from the video itself — not a transcript
                the app holds, and not verified against one. Treat it as a reading, not a record.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
