'use client'

interface SparklineProps {
  assetId: string
  width?: number
  height?: number
  color?: string
  pegTarget?: number
}

// There is no free per-asset live trend source at list scale, so a neutral
// "n/a" placeholder is shown rather than a fabricated trend line.
// See DATA-AVAILABILITY.md.
export function Sparkline({ width = 80, height = 32 }: SparklineProps) {
  return (
    <div
      className="flex items-center justify-center text-[10px] text-slate-600 font-mono"
      style={{ width, height }}
      title="Per-row trend not available with live data"
    >
      n/a
    </div>
  )
}
