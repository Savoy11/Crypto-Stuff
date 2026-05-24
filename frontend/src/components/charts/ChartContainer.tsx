import { type ReactNode } from 'react'
import { clsx } from 'clsx'
import { ChartSkeleton } from '@/components/ui/LoadingSkeleton'
import { QueryError } from '@/components/ui/ErrorBoundary'

interface ChartContainerProps {
  title: string
  subtitle?: string
  controls?: ReactNode
  children: ReactNode
  loading?: boolean
  error?: boolean
  errorMessage?: string
  onRetry?: () => void
  className?: string
  height?: number
  footer?: ReactNode
}

export function ChartContainer({
  title,
  subtitle,
  controls,
  children,
  loading,
  error,
  errorMessage,
  onRetry,
  className,
  height = 240,
  footer,
}: ChartContainerProps) {
  if (loading) return <ChartSkeleton height={height} />

  return (
    <div className={clsx('rounded-card border border-border bg-bg-card', className)}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/50">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {controls && <div className="flex items-center gap-2">{controls}</div>}
      </div>

      <div className="p-4">
        {error ? (
          <QueryError message={errorMessage ?? 'Failed to load chart data'} onRetry={onRetry} />
        ) : (
          children
        )}
      </div>

      {footer && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3">{footer}</div>
      )}
    </div>
  )
}
