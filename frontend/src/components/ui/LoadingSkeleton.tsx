import { clsx } from 'clsx'

interface LoadingSkeletonProps {
  className?: string
  count?: number
}

export function LoadingSkeleton({ className, count = 1 }: LoadingSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={clsx(
            'rounded animate-shimmer bg-shimmer-gradient bg-[length:200%_100%]',
            className
          )}
          aria-hidden="true"
        />
      ))}
    </>
  )
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: cols }, (_, i) => (
        <td key={i} className="px-4 py-3">
          <LoadingSkeleton className={`h-4 ${i === 0 ? 'w-32' : 'w-20'}`} />
        </td>
      ))}
    </tr>
  )
}

export function CardSkeleton() {
  return (
    <div className="rounded-card border border-border bg-bg-card p-4 flex flex-col gap-3">
      <LoadingSkeleton className="h-4 w-1/3" />
      <LoadingSkeleton className="h-8 w-2/3" />
      <LoadingSkeleton className="h-4 w-1/2" />
    </div>
  )
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="rounded-card border border-border bg-bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <LoadingSkeleton className="h-5 w-40" />
        <LoadingSkeleton className="h-8 w-32 rounded" />
      </div>
      <div className={`w-full rounded animate-pulse bg-bg-elevated`} style={{ height }} />
    </div>
  )
}
