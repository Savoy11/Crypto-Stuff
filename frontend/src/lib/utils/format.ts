import { formatDistanceToNow, format, parseISO } from 'date-fns'

/**
 * Format a number as USD currency with specified decimal places.
 * Example: 1234567.89 → "$1,234,567.89"
 */
export function formatCurrency(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Format a number in compact notation with currency symbol.
 * Example: 1_200_000_000 → "$1.2B"
 */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1e12) {
    return `$${(value / 1e12).toFixed(2)}T`
  }
  if (Math.abs(value) >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`
  }
  if (Math.abs(value) >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`
  }
  if (Math.abs(value) >= 1e3) {
    return `$${(value / 1e3).toFixed(1)}K`
  }
  return formatCurrency(value)
}

/**
 * Format a number as compact without currency symbol.
 */
export function formatCompactNumber(value: number): string {
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(2)}T`
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return value.toLocaleString('en-US')
}

/**
 * Format a percentage value with sign.
 * Example: 0.023 → "+0.023%"
 */
export function formatPercent(value: number, decimals = 3): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

/**
 * Format basis points.
 * Example: 23.5 → "23.5bps"
 */
export function formatBps(value: number): string {
  const abs = Math.abs(value)
  const sign = value >= 0 ? '+' : '-'
  if (abs < 0.1) return `${sign}${(abs * 10).toFixed(1)}bps`
  return `${sign}${abs.toFixed(1)}bps`
}

/**
 * Format a risk score to 1 decimal.
 * Example: 87.345 → "87.3"
 */
export function formatScore(value: number): string {
  return Math.min(100, Math.max(0, value)).toFixed(1)
}

/**
 * Truncate an Ethereum address for display.
 * Example: "0x1234567890abcdef..." → "0x1234...cdef"
 */
export function formatAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

/**
 * Return a human-readable relative time string.
 * Example: new Date('2024-01-01') → "3 months ago"
 */
export function timeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return formatDistanceToNow(d, { addSuffix: true })
}

/**
 * Compact relative time for dense feed rows: "just now", "42m ago", "3h ago",
 * "5d ago", "2y ago".
 *
 * Eight pages had each written their own version of this (W4-C8) and they
 * disagreed in ways users could see. Most divided by 60000 and printed the
 * result directly, so a timestamp even slightly in the future rendered as
 * "-3m ago" — and feed timestamps *are* sometimes in the future, which is the
 * whole reason lib/server/pubDate.ts exists. Several also had no lower bound,
 * so a fresh item read "0m ago" rather than "just now".
 *
 * `now` is injectable for testing. Returns '—' for an unparseable date rather
 * than "NaNm ago".
 */
export function timeAgoCompact(date: string | Date, now: number = Date.now()): string {
  const t = typeof date === 'string' ? new Date(date).getTime() : date.getTime()
  if (!Number.isFinite(t)) return '—'

  // A future timestamp is clamped, not negated. Upstream feeds do emit these,
  // and "in 3 minutes" on a news row is noise the reader can do nothing with.
  const mins = Math.max(0, Math.floor((now - t) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 365) return `${days}d ago`

  return `${Math.floor(days / 365)}y ago`
}

/**
 * Format a date with optional format string.
 * Example: "2024-01-15T10:30:00Z" → "Jan 15, 2024"
 */
export function formatDate(
  date: string | Date,
  fmt = 'MMM dd, yyyy'
): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt)
}

/**
 * Format a datetime with time.
 */
export function formatDateTime(date: string | Date): string {
  return formatDate(date, 'MMM dd, yyyy HH:mm UTC')
}

/**
 * Format a number with thousand separators.
 */
export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Format a ratio as percentage.
 * Example: 1.05 → "105.0%"
 */
export function formatRatio(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Format an asset price adaptively — fewer decimals for large prices, more for small.
 * Example: 108250 → "$108,250" | 4180.5 → "$4,180.50" | 1.0001 → "$1.0001" | 0.88 → "$0.8800"
 */
export function formatAssetPrice(price: number): string {
  if (price >= 10000) return formatCurrency(price, 0)
  if (price >= 2) return formatCurrency(price, 2)
  return formatCurrency(price, 4)
}

/**
 * The label shown wherever a value has no live or verifiable source.
 * Derived metrics (risk, reserves, peg analytics) and unmapped coins use this
 * rather than fabricating a number.
 */
export const NA_LABEL = 'N/A'

/**
 * Apply a formatter to a value that may be null/undefined, returning the N/A
 * label instead of formatting a missing value.
 * Example: formatOrNA(null, formatCompact) → "N/A"
 */
export function formatOrNA<T>(
  value: T | null | undefined,
  fmt: (v: T) => string
): string {
  return value === null || value === undefined ? NA_LABEL : fmt(value)
}
