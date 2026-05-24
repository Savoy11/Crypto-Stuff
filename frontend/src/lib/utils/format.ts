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
