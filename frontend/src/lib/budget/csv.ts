// CSV parsing + column mapping for bank statement imports (Budget module).
// Pure logic, no I/O — unit-tested in __tests__/csv.test.ts. The mapping shape
// is what import_profiles.mapping persists, so the second import from the same
// bank needs no mapping UI at all.

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

/** RFC-4180-ish line parser honoring double-quoted fields with commas/quotes. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

/**
 * Parse a whole CSV file. The first non-empty line is the header. Rows with a
 * different column count than the header are dropped (bank exports love
 * trailing junk lines like "Totals" — importing them as transactions is worse
 * than skipping them), and the count of dropped lines is reported so the UI
 * can disclose it instead of silently swallowing rows.
 */
export function parseCsv(text: string): ParsedCsv & { skipped: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return { headers: [], rows: [], skipped: 0 }
  const headers = parseCsvLine(lines[0]).map((h) => h.trim())
  const rows: string[][] = []
  let skipped = 0
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line)
    if (cols.length !== headers.length) { skipped++; continue }
    rows.push(cols.map((c) => c.trim()))
  }
  return { headers, rows, skipped }
}

/**
 * Stable fingerprint of a header row — lets an upload auto-select the saved
 * import profile that was created from the same bank's export format.
 * Order-sensitive on purpose: two banks can share column names but not order.
 */
export function headerSignature(headers: string[]): string {
  return headers.map((h) => h.trim().toLowerCase()).join('|')
}

// ─── Column mapping ──────────────────────────────────────────────────────────

export const DATE_FORMATS = ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY'] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

/**
 * How the amount column encodes direction:
 *  - 'signed'            one column, negative = money out (the app's own convention)
 *  - 'inverted'          one column, positive = money out (many card exports)
 *  - 'debit_credit'      two columns, both positive; debit = money out
 */
export type AmountConvention = 'signed' | 'inverted' | 'debit_credit'

export interface CsvMapping {
  /** Header name of each source column. */
  date: string
  description: string
  amount?: string           // for 'signed' / 'inverted'
  debit?: string            // for 'debit_credit'
  credit?: string           // for 'debit_credit'
  dateFormat: DateFormat
  amountConvention: AmountConvention
}

export interface MappedRow {
  /** ISO date (YYYY-MM-DD). */
  postedAt: string
  /** Signed: negative = money out. */
  amount: number
  description: string
}

/** Parse "1,234.56", "(45.00)" (accounting negative), "$12.30". NaN when unparseable. */
export function parseAmount(raw: string): number {
  let s = raw.trim()
  if (s === '') return NaN
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  s = s.replace(/[$€£,\s]/g, '')
  const n = parseFloat(s)
  if (!isFinite(n)) return NaN
  return negative ? -n : n
}

export function parseDate(raw: string, format: DateFormat): string | null {
  const s = raw.trim()
  let y: number, m: number, d: number
  const parts = s.split(/[/\-.]/).map((p) => parseInt(p, 10))
  if (parts.length !== 3 || parts.some((p) => !isFinite(p))) return null
  switch (format) {
    case 'YYYY-MM-DD': [y, m, d] = parts; break
    case 'MM/DD/YYYY':
    case 'MM-DD-YYYY': [m, d, y] = parts; break
    case 'DD/MM/YYYY':
    case 'DD.MM.YYYY': [d, m, y] = parts; break
  }
  if (y < 100) y += 2000 // two-digit years: bank exports mean this century
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null
  // Round-trip through Date to reject impossible dates (Feb 30).
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
}

export interface MappingResult {
  rows: MappedRow[]
  /** 1-based CSV line numbers (excluding header) that failed to map, with why. */
  errors: Array<{ line: number; reason: string }>
}

/**
 * Apply a column mapping to parsed CSV rows. Unmappable rows are reported,
 * never silently dropped and never imported half-parsed — a transaction with
 * a guessed date or amount is worse than a missing one.
 */
export function applyMapping(csv: ParsedCsv, mapping: CsvMapping): MappingResult {
  const col = (name: string | undefined): number =>
    name == null ? -1 : csv.headers.findIndex((h) => h.toLowerCase() === name.toLowerCase())

  const iDate = col(mapping.date)
  const iDesc = col(mapping.description)
  const iAmount = col(mapping.amount)
  const iDebit = col(mapping.debit)
  const iCredit = col(mapping.credit)

  const errors: MappingResult['errors'] = []
  if (iDate < 0) return { rows: [], errors: [{ line: 0, reason: `date column "${mapping.date}" not found` }] }
  if (iDesc < 0) return { rows: [], errors: [{ line: 0, reason: `description column "${mapping.description}" not found` }] }
  if (mapping.amountConvention === 'debit_credit') {
    if (iDebit < 0 || iCredit < 0) return { rows: [], errors: [{ line: 0, reason: 'debit/credit columns not found' }] }
  } else if (iAmount < 0) {
    return { rows: [], errors: [{ line: 0, reason: `amount column "${mapping.amount}" not found` }] }
  }

  const rows: MappedRow[] = []
  csv.rows.forEach((cols, idx) => {
    const line = idx + 1
    const postedAt = parseDate(cols[iDate] ?? '', mapping.dateFormat)
    if (!postedAt) { errors.push({ line, reason: `unparseable date "${cols[iDate]}"` }); return }

    let amount: number
    if (mapping.amountConvention === 'debit_credit') {
      const debit = parseAmount(cols[iDebit] ?? '')
      const credit = parseAmount(cols[iCredit] ?? '')
      if (isNaN(debit) && isNaN(credit)) { errors.push({ line, reason: 'neither debit nor credit parseable' }); return }
      amount = (isNaN(credit) ? 0 : Math.abs(credit)) - (isNaN(debit) ? 0 : Math.abs(debit))
    } else {
      const n = parseAmount(cols[iAmount] ?? '')
      if (isNaN(n)) { errors.push({ line, reason: `unparseable amount "${cols[iAmount]}"` }); return }
      amount = mapping.amountConvention === 'inverted' ? -n : n
    }

    const description = (cols[iDesc] ?? '').trim()
    if (!description) { errors.push({ line, reason: 'empty description' }); return }
    rows.push({ postedAt, amount: Math.round(amount * 100) / 100, description })
  })
  return { rows, errors }
}

/**
 * Guess a mapping from header names — best-effort defaults for the mapping UI,
 * never applied without the user seeing them.
 */
export function guessMapping(headers: string[]): Partial<CsvMapping> {
  const find = (...needles: string[]): string | undefined =>
    headers.find((h) => needles.some((n) => h.toLowerCase().includes(n)))
  const date = find('date', 'posted')
  const description = find('description', 'payee', 'merchant', 'memo', 'name', 'details')
  const debit = find('debit', 'withdrawal', 'money out')
  const credit = find('credit', 'deposit', 'money in')
  const amount = headers.find((h) => h.toLowerCase().includes('amount') && h !== debit && h !== credit)
  const guess: Partial<CsvMapping> = { dateFormat: 'MM/DD/YYYY' }
  if (date) guess.date = date
  if (description) guess.description = description
  if (debit && credit && !amount) { guess.debit = debit; guess.credit = credit; guess.amountConvention = 'debit_credit' }
  else if (amount) { guess.amount = amount; guess.amountConvention = 'signed' }
  return guess
}
