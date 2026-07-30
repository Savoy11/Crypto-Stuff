'use client'

import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Landmark, Plus, ReceiptText, Trash2, Upload, Wand2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { formatCurrency } from '@/lib/utils/format'
import {
  applyMapping, guessMapping, headerSignature, parseCsv,
  DATE_FORMATS, type CsvMapping, type DateFormat, type ParsedCsv,
} from '@/lib/budget/csv'
// Type-only import — pulling the schema's value exports into a client bundle
// would drag drizzle-orm/pg-core into the browser.
import type { AccountType } from '@/lib/db/schema/budget'
import type { AccountsResponse, WireAccount } from '@/app/api/user/budget/accounts/route'
import type { CategoriesResponse } from '@/app/api/user/budget/categories/route'
import type { TransactionsResponse } from '@/app/api/user/budget/transactions/route'
import type { ImportProfilesResponse } from '@/app/api/user/budget/import-profiles/route'

// Accounts, transactions, and CSV import (docs/ROADMAP.md Phase 2). CSV
// parsing + column mapping is the tested pure logic in lib/budget/csv; this
// page only wires it to file input and the bulk-import endpoint, whose
// import-hash dedupe makes re-importing an overlapping file a no-op.

export default function TransactionsPage() {
  return (
    <ModuleGate module="budget">
      <TransactionsInner />
    </ModuleGate>
  )
}

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Checking', savings: 'Savings', credit_card: 'Credit card',
  cash: 'Cash', loan: 'Loan', investment: 'Investment',
}
const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]

function TransactionsInner() {
  const qc = useQueryClient()
  const [accountFilter, setAccountFilter] = useState<string>('all')
  const [month, setMonth] = useState<string>('') // '' = latest regardless of month

  const { data: acctData } = useQuery<AccountsResponse>({
    queryKey: ['budget-accounts'],
    queryFn: () => fetch('/api/user/budget/accounts').then((r) => r.json()),
  })
  const { data: catData } = useQuery<CategoriesResponse>({
    queryKey: ['budget-categories'],
    queryFn: () => fetch('/api/user/budget/categories').then((r) => r.json()),
  })
  const txKey = ['budget-transactions', accountFilter, month]
  const { data: txData, isLoading: txLoading } = useQuery<TransactionsResponse>({
    queryKey: txKey,
    queryFn: () => {
      const params = new URLSearchParams()
      if (accountFilter !== 'all') params.set('accountId', accountFilter)
      if (month) params.set('month', month)
      return fetch(`/api/user/budget/transactions?${params}`).then((r) => r.json())
    },
  })

  const accounts = useMemo(() => (acctData?.accounts ?? []).filter((a) => !a.archived), [acctData])
  const categories = useMemo(() => catData?.categories ?? [], [catData])
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const dbDown = acctData && !acctData.ok

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['budget-accounts'] })
    qc.invalidateQueries({ queryKey: ['budget-transactions'] })
    qc.invalidateQueries({ queryKey: ['budget-budgets'] })
    qc.invalidateQueries({ queryKey: ['budget-recurring'] })
  }

  const patchTx = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const res = await fetch(`/api/user/budget/transactions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Update failed')
    },
    onSuccess: invalidateAll,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const deleteTx = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/user/budget/transactions/${id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Delete failed')
    },
    onSuccess: invalidateAll,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <ReceiptText className="h-6 w-6 text-accent-blue" aria-hidden />
        <PageHeader
          title="Accounts & Transactions"
          subtitle="Manual entry and CSV import, with rule-based categorization"
          description="Add accounts, record transactions by hand, or import a bank CSV. Imports are idempotent — re-importing an overlapping file skips rows it has already seen — and categorization rules run automatically on new rows."
          details={[
            { label: 'Balances', text: 'An account balance is its opening balance plus recorded transactions, so importing an old statement cannot double-count.' },
            { label: 'Amounts', text: 'Negative = money out, positive = money in. Import mappings handle banks that use the opposite convention or split debit/credit columns.' },
          ]}
        />
      </div>

      {dbDown && (
        <div className="rounded-card border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-400">
          {acctData?.error ?? 'Database unavailable'}
        </div>
      )}

      <AccountsPanel accounts={accounts} onChanged={invalidateAll} />

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6 items-start">
        {/* Transaction list */}
        <div className="rounded-card border border-border bg-bg-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary mr-auto">Transactions</h3>
            <input
              type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary focus:border-accent-blue focus:outline-none"
              aria-label="Filter by month"
            />
            <select
              value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
              className="rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary focus:border-accent-blue focus:outline-none"
              aria-label="Filter by account"
            >
              <option value="all">All accounts</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {txLoading && <p className="px-4 py-8 text-center text-sm text-text-muted">Loading…</p>}
          {!txLoading && (txData?.transactions ?? []).length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-text-muted">No transactions{month ? ' this month' : ''} — add one or import a CSV.</p>
          )}
          {(txData?.transactions ?? []).map((tx) => (
            <div key={tx.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)_9rem_6rem_2rem] gap-2 items-center px-4 py-2 border-b border-border/50 last:border-0">
              <span className="font-mono text-[11px] text-text-muted">{tx.postedAt}</span>
              <span className="truncate text-sm text-text-primary" title={tx.rawDescription ?? tx.description}>{tx.description}</span>
              <select
                value={tx.categoryId ?? ''}
                onChange={(e) => patchTx.mutate({ id: tx.id, patch: { categoryId: e.target.value || null } })}
                className={clsx('rounded border border-border bg-bg-elevated px-1.5 py-1 text-[11px] focus:border-accent-blue focus:outline-none', tx.categoryId ? 'text-text-secondary' : 'text-amber-400')}
                aria-label="Category"
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span className={clsx('text-right font-mono text-sm', tx.amount < 0 ? 'text-text-primary' : 'text-emerald-400')}>{formatCurrency(tx.amount)}</span>
              <button onClick={() => deleteTx.mutate(tx.id)} className="p-1 text-text-muted hover:text-red-400" aria-label="Delete transaction"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <AddTransactionCard accounts={accounts} categories={categories} onAdded={invalidateAll} />
          <CsvImportCard accounts={accounts} onImported={invalidateAll} />
        </div>
      </div>
    </div>
  )
}

// ─── Accounts ────────────────────────────────────────────────────────────────

function AccountsPanel({ accounts, onChanged }: { accounts: WireAccount[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('checking')
  const [opening, setOpening] = useState('')

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/user/budget/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, openingBalance: opening === '' ? 0 : parseFloat(opening) }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Create failed')
    },
    onSuccess: () => { setAdding(false); setName(''); setOpening(''); onChanged() },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Create failed'),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/user/budget/accounts/${id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Delete failed')
    },
    onSuccess: onChanged,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  return (
    <div className="flex flex-wrap gap-3">
      {accounts.map((a) => (
        <div key={a.id} className="group flex items-center gap-3 rounded-card border border-border bg-bg-card px-4 py-3">
          <Landmark size={16} className="text-text-muted" aria-hidden />
          <div>
            <p className="text-sm font-medium text-text-primary">{a.name} <span className="ml-1 text-[10px] text-text-muted">{ACCOUNT_TYPE_LABELS[a.type]}</span></p>
            <p className={clsx('font-mono text-sm', a.balance >= 0 ? 'text-emerald-400' : 'text-red-400')}>{formatCurrency(a.balance)}<span className="ml-2 text-[10px] text-text-muted">{a.transactionCount} tx</span></p>
          </div>
          <button
            onClick={() => { if (confirm(`Delete "${a.name}" and its ${a.transactionCount} transactions?`)) remove.mutate(a.id) }}
            className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-red-400 transition-opacity" aria-label={`Delete ${a.name}`}
          ><Trash2 size={13} /></button>
        </div>
      ))}

      {adding ? (
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate() }}
          className="flex items-center gap-2 rounded-card border border-accent-blue/40 bg-bg-card px-4 py-3"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name" autoFocus
            className="w-36 rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none" />
          <select value={type} onChange={(e) => setType(e.target.value as AccountType)}
            className="rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary focus:outline-none">
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
          </select>
          <input value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Opening $" inputMode="decimal"
            className="w-24 rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none" />
          <button type="submit" className="rounded bg-accent-blue px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500">Add</button>
          <button type="button" onClick={() => setAdding(false)} className="text-xs text-text-muted hover:text-text-primary">Cancel</button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded-card border border-dashed border-border px-4 py-3 text-sm text-text-muted hover:text-text-primary hover:border-border-hover">
          <Plus size={14} aria-hidden />Add account
        </button>
      )}
    </div>
  )
}

// ─── Manual entry ────────────────────────────────────────────────────────────

function AddTransactionCard({ accounts, categories, onAdded }: {
  accounts: WireAccount[]
  categories: NonNullable<CategoriesResponse['categories']>
  onAdded: () => void
}) {
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [isExpense, setIsExpense] = useState(true)
  const [description, setDescription] = useState('')
  const [postedAt, setPostedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState('')

  const add = useMutation({
    mutationFn: async () => {
      const n = parseFloat(amount)
      if (!isFinite(n) || n <= 0) throw new Error('Amount must be a positive number — direction comes from the toggle')
      const res = await fetch('/api/user/budget/transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId || accounts[0]?.id,
          amount: isExpense ? -n : n,
          description, postedAt,
          categoryId: categoryId || undefined,
        }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Add failed')
    },
    onSuccess: () => { setAmount(''); setDescription(''); onAdded() },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Add failed'),
  })

  if (accounts.length === 0) return null
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (description.trim() && amount) add.mutate() }}
      className="rounded-card border border-border bg-bg-card p-4 space-y-2.5"
    >
      <h3 className="text-sm font-semibold text-text-primary">Add transaction</h3>
      <div className="flex gap-2">
        <select value={accountId || accounts[0]?.id} onChange={(e) => setAccountId(e.target.value)}
          className="flex-1 rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary focus:outline-none" aria-label="Account">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" value={postedAt} onChange={(e) => setPostedAt(e.target.value)}
          className="rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary focus:outline-none" aria-label="Date" />
      </div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description"
        className="w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none" />
      <div className="flex gap-2">
        <div className="flex rounded border border-border overflow-hidden text-xs">
          <button type="button" onClick={() => setIsExpense(true)} className={clsx('px-2.5 py-1.5', isExpense ? 'bg-red-500/15 text-red-400' : 'bg-bg-elevated text-text-muted')}>Out</button>
          <button type="button" onClick={() => setIsExpense(false)} className={clsx('px-2.5 py-1.5', !isExpense ? 'bg-emerald-500/15 text-emerald-400' : 'bg-bg-elevated text-text-muted')}>In</button>
        </div>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" inputMode="decimal"
          className="flex-1 rounded border border-border bg-bg-elevated px-2 py-1.5 text-right font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none" />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
          className="flex-1 rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary focus:outline-none" aria-label="Category">
          <option value="">Auto (rules)</option>
          {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <button type="submit" className="w-full rounded bg-accent-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500">Add</button>
    </form>
  )
}

// ─── CSV import ──────────────────────────────────────────────────────────────

type ImportStage =
  | { step: 'idle' }
  | { step: 'map'; csv: ParsedCsv; skipped: number; fileName: string; mapping: Partial<CsvMapping>; profileName: string }

function CsvImportCard({ accounts, onImported }: { accounts: WireAccount[]; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<ImportStage>({ step: 'idle' })
  const [accountId, setAccountId] = useState('')

  const { data: profileData } = useQuery<ImportProfilesResponse>({
    queryKey: ['budget-import-profiles'],
    queryFn: () => fetch('/api/user/budget/import-profiles').then((r) => r.json()),
  })

  const onFile = async (file: File) => {
    const text = await file.text()
    const { headers, rows, skipped } = parseCsv(text)
    if (headers.length === 0 || rows.length === 0) { toast.error('Could not read any rows from that file'); return }
    // Auto-select a saved profile whose header signature matches this file.
    const sig = headerSignature(headers)
    const saved = (profileData?.profiles ?? []).find((p) => p.headerSignature === sig)
    setStage({
      step: 'map', csv: { headers, rows }, skipped, fileName: file.name,
      mapping: saved ? saved.mapping : guessMapping(headers),
      profileName: saved?.name ?? file.name.replace(/\.csv$/i, ''),
    })
    if (saved) toast.success(`Matched saved profile "${saved.name}"`)
  }

  const doImport = useMutation({
    mutationFn: async () => {
      if (stage.step !== 'map') throw new Error('No file loaded')
      const mapping = stage.mapping as CsvMapping
      const { rows, errors } = applyMapping(stage.csv, mapping)
      if (rows.length === 0) throw new Error(errors[0] ? `Mapping failed: ${errors[0].reason}` : 'No rows mapped')
      const res = await fetch('/api/user/budget/transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: accountId || accounts[0]?.id, imported: rows }),
      })
      const j: TransactionsResponse = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Import failed')
      // Persist the mapping as a profile keyed by header signature for next time.
      await fetch('/api/user/budget/import-profiles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: stage.profileName, mapping, headerSignature: headerSignature(stage.csv.headers) }),
      })
      return { ...j, mapErrors: errors.length }
    },
    onSuccess: (r) => {
      toast.success(`Imported ${r.inserted} rows (${r.duplicates} already seen, ${r.autoCategorized} auto-categorized${r.mapErrors ? `, ${r.mapErrors} unmappable` : ''})`)
      setStage({ step: 'idle' })
      onImported()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Import failed'),
  })

  const mappingReady = stage.step === 'map' && stage.mapping.date && stage.mapping.description &&
    (stage.mapping.amountConvention === 'debit_credit' ? stage.mapping.debit && stage.mapping.credit : stage.mapping.amount)

  const preview = useMemo(() => {
    if (stage.step !== 'map' || !mappingReady) return null
    return applyMapping(stage.csv, stage.mapping as CsvMapping)
  }, [stage, mappingReady])

  if (accounts.length === 0) {
    return <p className="rounded-card border border-border bg-bg-card p-4 text-xs text-text-muted">Add an account to enable CSV import.</p>
  }

  return (
    <div className="rounded-card border border-border bg-bg-card p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary"><Upload size={14} className="text-accent-blue" aria-hidden />CSV import</h3>

      {stage.step === 'idle' && (
        <>
          <input
            ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
          />
          <button onClick={() => fileRef.current?.click()} className="w-full rounded border border-dashed border-border px-3 py-6 text-xs text-text-muted hover:text-text-primary hover:border-border-hover">
            Choose a bank CSV… (a saved profile is auto-matched by its header row)
          </button>
        </>
      )}

      {stage.step === 'map' && (
        <div className="space-y-2.5 text-xs">
          <p className="text-text-secondary">{stage.fileName} — {stage.csv.rows.length} rows{stage.skipped > 0 && <span className="text-amber-400"> ({stage.skipped} malformed lines skipped)</span>}</p>

          <div className="grid grid-cols-2 gap-2">
            <MapSelect label="Date column" value={stage.mapping.date ?? ''} headers={stage.csv.headers}
              onChange={(v) => setStage({ ...stage, mapping: { ...stage.mapping, date: v } })} />
            <select value={stage.mapping.dateFormat ?? 'MM/DD/YYYY'}
              onChange={(e) => setStage({ ...stage, mapping: { ...stage.mapping, dateFormat: e.target.value as DateFormat } })}
              className="self-end rounded border border-border bg-bg-elevated px-2 py-1.5 text-text-primary focus:outline-none" aria-label="Date format">
              {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <MapSelect label="Description column" value={stage.mapping.description ?? ''} headers={stage.csv.headers}
              onChange={(v) => setStage({ ...stage, mapping: { ...stage.mapping, description: v } })} />
            <select value={stage.mapping.amountConvention ?? 'signed'}
              onChange={(e) => setStage({ ...stage, mapping: { ...stage.mapping, amountConvention: e.target.value as CsvMapping['amountConvention'] } })}
              className="self-end rounded border border-border bg-bg-elevated px-2 py-1.5 text-text-primary focus:outline-none" aria-label="Amount convention">
              <option value="signed">Signed (negative = out)</option>
              <option value="inverted">Inverted (positive = out)</option>
              <option value="debit_credit">Debit / credit columns</option>
            </select>
            {stage.mapping.amountConvention === 'debit_credit' ? (
              <>
                <MapSelect label="Debit column" value={stage.mapping.debit ?? ''} headers={stage.csv.headers}
                  onChange={(v) => setStage({ ...stage, mapping: { ...stage.mapping, debit: v } })} />
                <MapSelect label="Credit column" value={stage.mapping.credit ?? ''} headers={stage.csv.headers}
                  onChange={(v) => setStage({ ...stage, mapping: { ...stage.mapping, credit: v } })} />
              </>
            ) : (
              <MapSelect label="Amount column" value={stage.mapping.amount ?? ''} headers={stage.csv.headers}
                onChange={(v) => setStage({ ...stage, mapping: { ...stage.mapping, amount: v } })} />
            )}
          </div>

          {preview && (
            <div className="rounded border border-border/60 bg-bg-elevated/50 p-2 space-y-1">
              <p className="text-text-muted">{preview.rows.length} rows will import{preview.errors.length > 0 && <span className="text-amber-400">, {preview.errors.length} can’t be mapped (reported, not guessed)</span>}:</p>
              {preview.rows.slice(0, 4).map((r, i) => (
                <p key={i} className="font-mono text-[10px] text-text-secondary truncate">{r.postedAt} · {formatCurrency(r.amount)} · {r.description}</p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <select value={accountId || accounts[0]?.id} onChange={(e) => setAccountId(e.target.value)}
              className="flex-1 rounded border border-border bg-bg-elevated px-2 py-1.5 text-text-primary focus:outline-none" aria-label="Import into account">
              {accounts.map((a) => <option key={a.id} value={a.id}>into {a.name}</option>)}
            </select>
            <input value={stage.profileName} onChange={(e) => setStage({ ...stage, profileName: e.target.value })}
              className="w-32 rounded border border-border bg-bg-elevated px-2 py-1.5 text-text-primary focus:outline-none" aria-label="Profile name" title="Saved as an import profile for this bank" />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => doImport.mutate()} disabled={!mappingReady || doImport.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 rounded bg-accent-blue px-3 py-1.5 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            ><Wand2 size={12} aria-hidden />{doImport.isPending ? 'Importing…' : 'Import'}</button>
            <button onClick={() => setStage({ step: 'idle' })} className="rounded border border-border px-3 py-1.5 text-text-muted hover:text-text-primary">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function MapSelect({ label, value, headers, onChange }: { label: string; value: string; headers: string[]; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-text-primary focus:border-accent-blue focus:outline-none">
        <option value="">— pick —</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  )
}
