'use client'

import { Tooltip } from '@/components/ui/Tooltip'

/**
 * A stat label that explains itself on hover: dotted underline + help cursor,
 * with a wrapped tooltip describing what the metric is and why it matters.
 * Used across Key Statistics, Financial Ratios, and Fund Facts.
 */
export function ExplainedLabel({ label, explain }: { label: string; explain: string }) {
  return (
    <Tooltip
      position="right"
      content={<span className="block w-64 whitespace-normal text-left leading-relaxed">{explain}</span>}
    >
      <span className="border-b border-dotted border-text-muted/50 cursor-help">{label}</span>
    </Tooltip>
  )
}
