'use client'

import { type TimeRange } from '@/types/api'
import { TIME_RANGE_OPTIONS } from '@/lib/constants'
import { clsx } from 'clsx'

interface DateRangePickerProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
  options?: typeof TIME_RANGE_OPTIONS
  className?: string
}

export function DateRangePicker({ value, onChange, options = TIME_RANGE_OPTIONS, className }: DateRangePickerProps) {
  return (
    <div
      className={clsx('flex items-center gap-0.5 bg-bg-secondary rounded border border-border p-0.5', className)}
      role="group"
      aria-label="Select time range"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value as TimeRange)}
          className={clsx(
            'px-2.5 py-1 text-xs font-mono rounded transition-colors',
            value === opt.value
              ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
              : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
          )}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
