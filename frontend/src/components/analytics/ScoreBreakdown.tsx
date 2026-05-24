import type { ScoreBreakdown as ScoreBreakdownType } from '@/types/asset'
import { formatScore } from '@/lib/utils/format'
import { getScoreColor } from '@/lib/utils/risk'
import { clsx } from 'clsx'

interface ScoreBreakdownProps {
  breakdown: ScoreBreakdownType
  className?: string
}

interface ScoreBarProps {
  label: string
  score: number
  weight: number
  description?: string
}

const COMPONENT_DESCRIPTIONS: Record<string, string> = {
  'Reserve': 'Quality, verifiability, and sufficiency of reserve assets',
  'Peg': 'Historical peg stability and maximum deviation events',
  'Network': 'On-chain activity, concentration, and velocity metrics',
  'Security': 'Smart contract audits, incident history, governance',
}

function ScoreBar({ label, score, weight, description }: ScoreBarProps) {
  const color = getScoreColor(score)
  const cappedScore = Math.min(100, Math.max(0, score))

  return (
    <div className="group" role="meter" aria-label={`${label} score: ${formatScore(score)} out of 100`} aria-valuenow={cappedScore} aria-valuemin={0} aria-valuemax={100}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{label}</span>
          <span className="text-[10px] text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded border border-border">
            {weight}% weight
          </span>
        </div>
        <span className="font-mono text-sm font-bold" style={{ color }}>
          {formatScore(score)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2.5 bg-bg-elevated rounded-full overflow-hidden mb-1">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${cappedScore}%`,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}40`,
          }}
          aria-hidden
        />
      </div>

      {description && (
        <p className="text-[10px] text-text-muted leading-relaxed">{description}</p>
      )}
    </div>
  )
}

export function ScoreBreakdown({ breakdown, className }: ScoreBreakdownProps) {
  const components = [
    { label: 'Reserve', score: breakdown.reserveScore, weight: breakdown.reserveWeight },
    { label: 'Peg', score: breakdown.pegScore, weight: breakdown.pegWeight },
    { label: 'Network', score: breakdown.networkScore, weight: breakdown.networkWeight },
    { label: 'Security', score: breakdown.securityScore, weight: breakdown.securityWeight },
  ]

  // Weighted composite
  const composite = components.reduce(
    (acc, c) => acc + c.score * (c.weight / 100),
    0
  )

  return (
    <div className={clsx('space-y-4', className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted uppercase tracking-wide font-semibold">
          Score Components
        </span>
        <span className="text-xs text-text-muted font-mono">
          Composite: <span style={{ color: getScoreColor(composite) }}>{formatScore(composite)}</span>
        </span>
      </div>
      {components.map((c) => (
        <ScoreBar
          key={c.label}
          label={c.label}
          score={c.score}
          weight={c.weight}
          description={COMPONENT_DESCRIPTIONS[c.label]}
        />
      ))}
    </div>
  )
}
