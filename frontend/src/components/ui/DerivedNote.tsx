'use client'

import { clsx } from 'clsx'
import { Sigma } from 'lucide-react'

// Marks a number on screen as Finance Now's OWN computation rather than a
// provider's published figure.
//
// The house policy (docs/ROADMAP.md, "Label every data source on screen")
// requires this, and <SourceLine> handles it at page level — a derived surface
// reads "Computed by Finance Now from …". But a page-level line is not enough
// where a computed score sits in a TABLE beside provider-sourced values: the
// reader sees a Safety Score next to a live price and has no way to tell that
// one is measured and the other is our judgement.
//
// This exists as a component rather than as prose on each page because
// hand-written attribution drifts. The /macro overview carried a sentence
// naming Yahoo that nothing would have updated if the provider changed, and
// the Coins registry carried its own wording that no other scored surface
// matched. One component, one wording, one place to change it.

interface DerivedNoteProps {
  /** What was computed, e.g. "Safety Scores" or "Risk scores". Plural reads best. */
  what: string
  /** The scale, when the number has one, e.g. "0–100, higher = safer". */
  scale?: string
  /** Extra context — what the score is FOR, or what it deliberately isn't. */
  children?: React.ReactNode
  className?: string
}

export function DerivedNote({ what, scale, children, className }: DerivedNoteProps) {
  return (
    <p className={clsx('flex items-start gap-1.5 text-[11px] text-text-muted leading-relaxed', className)}>
      <Sigma size={11} className="mt-0.5 shrink-0 text-violet-400/80" aria-hidden />
      <span>
        <span className="text-violet-300/90 font-medium">{what} are Finance Now&rsquo;s own computation</span>
        {scale && <> ({scale})</>} — not a provider&rsquo;s figure, and not investment advice.
        {children && <> {children}</>}
      </span>
    </p>
  )
}
