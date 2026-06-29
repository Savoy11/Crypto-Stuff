'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Bot, X, Send, Loader2, Sparkles, Wrench } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: { name: string; input: unknown }[]
  error?: boolean
}

const SUGGESTIONS = [
  'How is the market doing today?',
  'Cheapest way to send $1000 USDT from Binance to Coinbase?',
  'Best low-risk ETH staking options?',
  'Latest news on BTC',
]

export function AssistantWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          pageContext: { pathname },
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setMessages((m) => [...m, { role: 'assistant', content: data.error ?? 'Something went wrong.', error: true }])
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply, toolsUsed: data.toolsUsed }])
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: e instanceof Error ? e.message : 'Network error', error: true }])
    }
    setLoading(false)
  }, [messages, loading, pathname])

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-violet-600 text-white shadow-lg shadow-violet-900/40 hover:bg-violet-500 transition-colors"
          aria-label="Open assistant"
        >
          <Bot size={18} />
          <span className="text-sm font-medium">Assistant</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-3rem)] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800 bg-slate-900/95">
            <div className="size-8 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
              <Bot size={16} className="text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-100 leading-tight">App Assistant</p>
              <p className="text-[11px] text-slate-500 leading-tight">Live data · knows where you are</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 p-1" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="space-y-4">
                <div className="flex flex-col items-center text-center gap-2 pt-4">
                  <div className="size-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                    <Sparkles size={22} className="text-violet-400" />
                  </div>
                  <p className="text-sm text-slate-300 font-medium">How can I help?</p>
                  <p className="text-xs text-slate-500">Ask about prices, fees, staking, transfers, or news — I&apos;ll pull live data.</p>
                </div>
                <div className="space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="w-full text-left text-xs text-slate-300 px-3 py-2 rounded-lg border border-slate-800 bg-slate-800/40 hover:bg-slate-800 hover:border-slate-700 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-violet-600 text-white rounded-br-sm'
                      : m.error
                        ? 'bg-red-500/10 text-red-300 border border-red-500/20 rounded-bl-sm'
                        : 'bg-slate-800 text-slate-200 rounded-bl-sm'
                  }`}
                >
                  {m.content}
                  {m.toolsUsed && m.toolsUsed.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-700/60 flex flex-wrap gap-1">
                      {m.toolsUsed.map((t, j) => (
                        <span key={j} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-900/60 text-slate-400 border border-slate-700">
                          <Wrench size={9} /> {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 text-slate-400 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Thinking…
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-slate-800 p-3">
            <div className="flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 focus-within:border-violet-500/60">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
                }}
                rows={1}
                placeholder="Ask anything…"
                className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none max-h-32"
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                className="text-violet-400 hover:text-violet-300 disabled:opacity-30 disabled:hover:text-violet-400 p-1 flex-shrink-0"
                aria-label="Send"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
