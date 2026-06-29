import { clsx } from 'clsx'
import type { RiskBand } from '@/types/asset'
import { getRiskTailwindClasses, getRiskLabel } from '@/lib/utils/risk'
import { formatScore, NA_LABEL } from '@/lib/utils/format'

interface RiskScoreBadgeProps {
  score: number | null
  band: RiskBand | null
  showLabel?: boolean
  showScore?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASSES = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
}

const NA_BADGE = 'bg-slate-500/10 text-slate-400 border-slate-500/30'

export function RiskScoreBadge({
  score,
  band,
  showLabel = false,
  showScore = true,
  size = 'sm',
  className,
}: RiskScoreBadgeProps) {
  // No risk band/score available — render a neutral N/A badge rather than
  // implying a "low" rating from a missing value.
  if (band === null || score === null) {
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-1.5 rounded border font-mono font-semibold',
          NA_BADGE,
          SIZE_CLASSES[size],
          className
        )}
        aria-label="Risk: not available"
        title="Risk score not available"
      >
        {NA_LABEL}
      </span>
    )
  }

  const classes = getRiskTailwindClasses(band)
  const label = getRiskLabel(band)

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded border font-mono font-semibold',
        classes.badge,
        SIZE_CLASSES[size],
        className
      )}
      aria-label={`Risk: ${label}, score ${formatScore(score)}`}
    >
      {showScore && <span>{formatScore(score)}</span>}
      {showLabel && <span className="font-normal opacity-80">/ {label}</span>}
    </span>
  )
}

interface RiskBandPillProps {
  band: RiskBand | null
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

export function RiskBandPill({ band, size = 'sm', className }: RiskBandPillProps) {
  if (band === null) {
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-1 rounded-full border font-medium',
          NA_BADGE,
          size === 'xs' && 'px-1.5 py-0.5 text-[10px]',
          size === 'sm' && 'px-2 py-0.5 text-xs',
          size === 'md' && 'px-2.5 py-1 text-xs',
          className
        )}
        title="Risk band not available"
      >
        {NA_LABEL}
      </span>
    )
  }
  const classes = getRiskTailwindClasses(band)
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border font-medium capitalize',
        classes.badge,
        size === 'xs' && 'px-1.5 py-0.5 text-[10px]',
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-2.5 py-1 text-xs',
        className
      )}
    >
      <span className={clsx('size-1.5 rounded-full', classes.bg.replace('/10', ''))}
        style={{ backgroundColor: 'currentColor' }}
      />
      {getRiskLabel(band)}
    </span>
  )
}
