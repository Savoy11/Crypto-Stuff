import { type ReactNode } from 'react'
import { clsx } from 'clsx'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { LoadingSkeleton } from './LoadingSkeleton'

interface MetricCardProps {
  title: string
  value: string | ReactNode
  subtitle?: string
  trend?: number
  trendLabel?: string
  icon?: ReactNode
  accentColor?: string
  loading?: boolean
  className?: string
  footer?: ReactNode
}

export function MetricCard({
  title,
  value,
  subtitle,
  trend,
  trendLabel,
  icon,
  accentColor = '#3b82f6',
  loading = false,
  className,
  footer,
}: MetricCardProps) {
  const trendPositive = trend !== undefined && trend > 0
  const trendNegative = trend !== undefined && trend < 0
  const trendNeutral = trend !== undefined && trend === 0

  return (
    <div
      className={clsx(
        'rounded-card border border-border bg-bg-card p-4 flex flex-col gap-3 shadow-card hover:shadow-card-hover transition-shadow',
        className
      )}
      style={{ borderTopColor: accentColor, borderTopWidth: '2px' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">{title}</span>
        {icon && (
          <span className="text-text-muted flex-shrink-0" style={{ color: accentColor }}>
            {icon}
          </span>
        )}
      </div>

      {loading ? (
        <>
          <LoadingSkeleton className="h-8 w-3/4" />
          <LoadingSkeleton className="h-4 w-1/2" />
        </>
      ) : (
        <>
          <div className="font-mono text-2xl font-semibold text-text-primary tabular-nums">
            {value}
          </div>

          <div className="flex items-center justify-between gap-2">
            {subtitle && (
              <span className="text-xs text-text-muted">{subtitle}</span>
            )}
            {trend !== undefined && (
              <div
                className={clsx(
                  'flex items-center gap-1 text-xs font-mono font-medium',
                  trendPositive && 'text-accent-green',
                  trendNegative && 'text-accent-red',
                  trendNeutral && 'text-text-muted'
                )}
              >
                {trendPositive && <TrendingUp size={12} aria-hidden />}
                {trendNegative && <TrendingDown size={12} aria-hidden />}
                {trendNeutral && <Minus size={12} aria-hidden />}
                <span>
                  {trendPositive ? '+' : ''}{trend.toFixed(2)}%
                  {trendLabel && <span className="text-text-muted ml-1">{trendLabel}</span>}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {footer && <div className="border-t border-border pt-2 mt-1">{footer}</div>}
    </div>
  )
}
