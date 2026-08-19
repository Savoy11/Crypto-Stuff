import { clsx } from 'clsx'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { Signal } from '@/lib/utils/indicators'

/**
 * The composite technical signal, rendered as a badge.
 *
 * Lifted out of the crypto TA page on 2026-08-19 when the scanner moved to its
 * own route (short-list item 6/7) — both surfaces render the same signal, and a
 * second copy would drift the moment one of them changed a colour or a label.
 * Lives in components/charts because that is the shared home the module
 * boundary rules already allow every module's pages to import from.
 */
export const SIGNAL_META: Record<Signal, { label: string; color: string; icon: React.ReactNode }> = {
  strong_buy:  { label: 'Strong Buy',  color: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/30', icon: <TrendingUp size={13} /> },
  buy:         { label: 'Buy',         color: 'text-green-400 bg-green-400/10 border-green-500/30',       icon: <TrendingUp size={13} /> },
  neutral:     { label: 'Neutral',     color: 'text-slate-400 bg-slate-400/10 border-slate-500/30',       icon: <Minus size={13} /> },
  sell:        { label: 'Sell',        color: 'text-orange-400 bg-orange-400/10 border-orange-500/30',    icon: <TrendingDown size={13} /> },
  strong_sell: { label: 'Strong Sell', color: 'text-red-400 bg-red-400/10 border-red-500/30',             icon: <TrendingDown size={13} /> },
}

export function SignalBadge({ signal }: { signal: Signal }) {
  const meta = SIGNAL_META[signal]
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold', meta.color)}>
      {meta.icon}{meta.label}
    </span>
  )
}
