'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { toast } from 'react-hot-toast'
import {
  Archive, ArchiveRestore, Check, Loader2, Pencil, Plus, Repeat, Tags, Trash2, Wand2, X, FileSpreadsheet,
} from 'lucide-react'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import type { RuleLike } from '@/lib/budget/categorize'
import type { WireCategory } from '@/lib/server/budgetPersistence'
import type { WireAccount } from '@/app/api/user/budget/accounts/route'
import type { WireImportProfile } from '@/app/api/user/budget/import-profiles/route'
import type { WireRecurring } from '@/app/api/user/budget/recurring/route'
import type { RecurringSuggestion } from '@/lib/budget/recurring'

// ─── Budget management (NT1) ──────────────────────────────────────────────────
//
// The Budget module's engine and persistence were production-grade while its
// management UI was the unfinished half: five of the six NEEDS-FIX rows in the
// P3 review were UI gaps over APIs that already existed and were already
// ownership-scoped. The headline one was categorization rules — both budget
// pages advertised "rule-based categorization", the engine genuinely ran on
// insert, and a user could not create, view, edit, prioritize, disable or
// delete a single rule from the app.
//
// This page closes all five. Two API gaps were filled to make it possible:
// import-profiles/[id] (the one budget table without full CRUD) and a stored
// dismissal for recurring suggestions (detection re-runs on every load, so
// "no thanks" had nowhere to live and the suggestion returned forever).

type Section = 'rules' | 'categories' | 'accounts' | 'recurring' | 'imports'

const SECTIONS: Array<{ id: Section; label: string; icon: typeof Wand2 }> = [
  { id: 'rules', label: 'Rules', icon: Wand2 },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'accounts', label: 'Accounts', icon: Archive },
  { id: 'recurring', label: 'Recurring', icon: Repeat },
  { id: 'imports', label: 'Import profiles', icon: FileSpreadsheet },
]

const MATCH_TYPES = ['contains', 'starts_with', 'regex', 'exact'] as const
const CADENCES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const
const KINDS = ['expense', 'income', 'transfer'] as const

async function api<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.ok === false) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json as T
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// ─── Rules ────────────────────────────────────────────────────────────────────

function RulesSection({ categories, accounts }: { categories: WireCategory[]; accounts: WireAccount[] }) {
  const [rules, setRules] = useState<RuleLike[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({
    pattern: '', categoryId: '', matchType: 'contains' as (typeof MATCH_TYPES)[number],
    accountId: '', minAmount: '', maxAmount: '', priority: '100', applyToExisting: true,
  })

  const load = useCallback(async () => {
    try {
      const d = await api<{ rules: RuleLike[] }>('/api/user/budget/rules')
      setRules(d.rules ?? [])
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const categoryName = useCallback(
    (id: string) => categories.find((c) => c.id === id)?.name ?? 'Unknown category',
    [categories],
  )

  async function create() {
    if (!draft.pattern.trim() || !draft.categoryId || busy) return
    // A bad regex is rejected server-side too; catching it here saves a round
    // trip and explains it where the user typed it.
    if (draft.matchType === 'regex') {
      try { new RegExp(draft.pattern) } catch { toast.error('That is not a valid regular expression'); return }
    }
    setBusy(true)
    try {
      const d = await api<{ recategorized?: number }>('/api/user/budget/rules', {
        method: 'POST',
        body: JSON.stringify({
          pattern: draft.pattern.trim(),
          categoryId: draft.categoryId,
          matchType: draft.matchType,
          accountId: draft.accountId || undefined,
          minAmount: draft.minAmount === '' ? undefined : Number(draft.minAmount),
          maxAmount: draft.maxAmount === '' ? undefined : Number(draft.maxAmount),
          priority: Number(draft.priority) || 100,
          applyToExisting: draft.applyToExisting,
        }),
      })
      setDraft((p) => ({ ...p, pattern: '', minAmount: '', maxAmount: '' }))
      await load()
      toast.success(
        d.recategorized
          ? `Rule saved — ${d.recategorized} existing transaction${d.recategorized === 1 ? '' : 's'} recategorized`
          : 'Rule saved',
      )
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/user/budget/rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      await load()
    } catch (e) { toast.error((e as Error).message) }
  }

  async function remove(id: string) {
    try {
      await api(`/api/user/budget/rules/${id}`, { method: 'DELETE' })
      await load()
      // Deleting a rule does NOT undo the categorizations it already made —
      // those are stored on the transactions. Say so rather than letting the
      // user assume a cleanup happened.
      toast.success('Rule deleted — transactions it already categorized keep their category')
    } catch (e) { toast.error((e as Error).message) }
  }

  const sorted = useMemo(
    () => [...rules].sort((a, b) => a.priority - b.priority || a.pattern.localeCompare(b.pattern)),
    [rules],
  )

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-text-muted">
        Rules run <strong>server-side on insert</strong>, first match wins, lowest priority number first.
        A transaction already carrying a category is never overwritten by a rule.
      </p>

      {/* New rule */}
      <div className="rounded-card border border-border bg-bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">New rule</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-text-muted">
            Match type
            <select
              value={draft.matchType}
              onChange={(e) => setDraft((p) => ({ ...p, matchType: e.target.value as typeof p.matchType }))}
              className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-accent-blue/50 focus:outline-none"
            >
              {MATCH_TYPES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label className="text-xs text-text-muted lg:col-span-2">
            Pattern
            <input
              value={draft.pattern}
              onChange={(e) => setDraft((p) => ({ ...p, pattern: e.target.value }))}
              placeholder="e.g. NETFLIX"
              className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-muted/60 focus:border-accent-blue/50 focus:outline-none"
            />
          </label>
          <label className="text-xs text-text-muted">
            Category
            <select
              value={draft.categoryId}
              onChange={(e) => setDraft((p) => ({ ...p, categoryId: e.target.value }))}
              className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-accent-blue/50 focus:outline-none"
            >
              <option value="">Select…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-text-muted">
            Account (optional)
            <select
              value={draft.accountId}
              onChange={(e) => setDraft((p) => ({ ...p, accountId: e.target.value }))}
              className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-accent-blue/50 focus:outline-none"
            >
              <option value="">Any account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-text-muted">
            Min amount
            <input
              type="number" step="0.01" value={draft.minAmount}
              onChange={(e) => setDraft((p) => ({ ...p, minAmount: e.target.value }))}
              placeholder="any"
              className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-muted/60 focus:border-accent-blue/50 focus:outline-none"
            />
          </label>
          <label className="text-xs text-text-muted">
            Max amount
            <input
              type="number" step="0.01" value={draft.maxAmount}
              onChange={(e) => setDraft((p) => ({ ...p, maxAmount: e.target.value }))}
              placeholder="any"
              className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-muted/60 focus:border-accent-blue/50 focus:outline-none"
            />
          </label>
          <label className="text-xs text-text-muted">
            Priority
            <input
              type="number" value={draft.priority}
              onChange={(e) => setDraft((p) => ({ ...p, priority: e.target.value }))}
              className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm font-mono text-text-primary focus:border-accent-blue/50 focus:outline-none"
            />
          </label>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={draft.applyToExisting}
              onChange={(e) => setDraft((p) => ({ ...p, applyToExisting: e.target.checked }))}
              className="rounded border-border"
            />
            Also apply to existing uncategorized transactions
          </label>
          <button
            onClick={() => void create()}
            disabled={busy || !draft.pattern.trim() || !draft.categoryId}
            className="flex items-center gap-1.5 rounded-lg bg-accent-blue px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}
            Add rule
          </button>
        </div>
      </div>

      {/* Existing rules */}
      {loading ? (
        <p className="text-sm text-text-muted">Loading rules…</p>
      ) : sorted.length === 0 ? (
        <p className="rounded-card border border-border bg-bg-card p-4 text-sm text-text-muted">
          No rules yet. Until one exists, every imported transaction arrives uncategorized.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Priority</th>
                <th className="px-3 py-2 text-left font-medium">Match</th>
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-left font-medium">Narrowing</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {sorted.map((r) => (
                <tr key={r.id} className={clsx('transition-colors hover:bg-bg-elevated/50', !r.enabled && 'opacity-50')}>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      defaultValue={r.priority}
                      onBlur={(e) => {
                        const v = Number(e.target.value)
                        if (Number.isInteger(v) && v !== r.priority) void patch(r.id, { priority: v })
                      }}
                      className="w-16 rounded border border-border bg-bg-elevated px-1.5 py-1 text-xs font-mono text-text-primary focus:border-accent-blue/50 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                      {r.matchType.replace('_', ' ')}
                    </span>
                    <span className="ml-2 font-mono text-xs text-text-primary">{r.pattern}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-text-secondary">{categoryName(r.categoryId)}</td>
                  <td className="px-3 py-2 text-[11px] text-text-muted">
                    {r.accountId ? (accounts.find((a) => a.id === r.accountId)?.name ?? 'one account') : 'any account'}
                    {(r.minAmount != null || r.maxAmount != null) && (
                      <> · {r.minAmount != null ? money(r.minAmount) : '–∞'} to {r.maxAmount != null ? money(r.maxAmount) : '∞'}</>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => void patch(r.id, { enabled: !r.enabled })}
                        title={r.enabled ? 'Disable' : 'Enable'}
                        className="rounded p-1 text-text-muted transition-colors hover:text-text-primary"
                      >
                        {r.enabled ? <X size={14} /> : <Check size={14} />}
                      </button>
                      <button
                        onClick={() => void remove(r.id)}
                        title="Delete"
                        className="rounded p-1 text-text-muted transition-colors hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Categories ───────────────────────────────────────────────────────────────

function CategoriesSection({ categories, reload }: { categories: WireCategory[]; reload: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<(typeof KINDS)[number]>('expense')
  const [parentId, setParentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const roots = categories.filter((c) => !c.parentId)
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id)

  async function create() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await api('/api/user/budget/categories', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), kind, parentId: parentId || undefined }),
      })
      setName('')
      await reload()
      toast.success('Category added')
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  async function rename(id: string) {
    if (!editName.trim()) { setEditing(null); return }
    try {
      await api(`/api/user/budget/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ name: editName.trim() }) })
      setEditing(null)
      await reload()
    } catch (e) { toast.error((e as Error).message) }
  }

  async function remove(id: string) {
    try {
      await api(`/api/user/budget/categories/${id}`, { method: 'DELETE' })
      await reload()
      toast.success('Category deleted — transactions in it are now uncategorized')
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-text-muted">
        Two levels: a parent and its sub-categories. Deleting a category does not delete its
        transactions — they become uncategorized, which the month view counts separately from $0.
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-card border border-border bg-bg-card p-4">
        <label className="text-xs text-text-muted">
          Name
          <input
            value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Utilities"
            className="mt-1 block rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent-blue/50 focus:outline-none"
          />
        </label>
        <label className="text-xs text-text-muted">
          Kind
          <select
            value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}
            className="mt-1 block rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-accent-blue/50 focus:outline-none"
          >
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="text-xs text-text-muted">
          Parent (optional)
          <select
            value={parentId} onChange={(e) => setParentId(e.target.value)}
            className="mt-1 block rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-accent-blue/50 focus:outline-none"
          >
            <option value="">Top level</option>
            {roots.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button
          onClick={() => void create()}
          disabled={busy || !name.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-accent-blue px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
        >
          <Plus size={14} aria-hidden /> Add
        </button>
      </div>

      <ul className="divide-y divide-border/40 rounded-card border border-border bg-bg-card">
        {roots.map((c) => (
          <li key={c.id} className="px-4 py-2">
            <CategoryRow
              cat={c}
              editing={editing === c.id}
              editName={editName}
              onEdit={() => { setEditing(c.id); setEditName(c.name) }}
              onEditName={setEditName}
              onSave={() => void rename(c.id)}
              onCancel={() => setEditing(null)}
              onDelete={() => void remove(c.id)}
            />
            {childrenOf(c.id).length > 0 && (
              <ul className="ml-5 mt-1 space-y-1 border-l border-border/60 pl-3">
                {childrenOf(c.id).map((sub) => (
                  <li key={sub.id}>
                    <CategoryRow
                      cat={sub}
                      editing={editing === sub.id}
                      editName={editName}
                      onEdit={() => { setEditing(sub.id); setEditName(sub.name) }}
                      onEditName={setEditName}
                      onSave={() => void rename(sub.id)}
                      onCancel={() => setEditing(null)}
                      onDelete={() => void remove(sub.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CategoryRow({ cat, editing, editName, onEdit, onEditName, onSave, onCancel, onDelete }: {
  cat: WireCategory
  editing: boolean
  editName: string
  onEdit: () => void
  onEditName: (v: string) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <>
          <input
            value={editName}
            onChange={(e) => onEditName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
            autoFocus
            className="flex-1 rounded border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary focus:border-accent-blue/50 focus:outline-none"
          />
          <button onClick={onSave} className="rounded p-1 text-emerald-400" title="Save"><Check size={14} /></button>
          <button onClick={onCancel} className="rounded p-1 text-text-muted" title="Cancel"><X size={14} /></button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm text-text-primary">{cat.name}</span>
          <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">{cat.kind}</span>
          <button onClick={onEdit} className="rounded p-1 text-text-muted hover:text-text-primary" title="Rename"><Pencil size={13} /></button>
          <button onClick={onDelete} className="rounded p-1 text-text-muted hover:text-red-400" title="Delete"><Trash2 size={13} /></button>
        </>
      )}
    </div>
  )
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

function AccountsSection({ accounts, reload }: { accounts: WireAccount[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', institution: '', openingBalance: '' })

  async function save(id: string) {
    try {
      await api(`/api/user/budget/accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name.trim(),
          institution: draft.institution.trim() || null,
          openingBalance: draft.openingBalance === '' ? undefined : Number(draft.openingBalance),
        }),
      })
      setEditing(null)
      await reload()
      toast.success('Account updated')
    } catch (e) { toast.error((e as Error).message) }
  }

  async function setArchived(id: string, archived: boolean) {
    try {
      await api(`/api/user/budget/accounts/${id}`, { method: 'PATCH', body: JSON.stringify({ archived }) })
      await reload()
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-text-muted">
        Archiving hides an account from the budget pages and keeps every transaction. Deleting one —
        available on the Transactions page — takes its transactions with it, which is why the schema
        has an archive flag at all. Editing the opening balance moves the anchor every balance is
        computed from, so the account&rsquo;s whole history shifts with it.
      </p>

      <ul className="divide-y divide-border/40 rounded-card border border-border bg-bg-card">
        {accounts.map((a) => (
          <li key={a.id} className={clsx('px-4 py-3', a.archived && 'opacity-60')}>
            {editing === a.id ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-text-muted">
                  Name
                  <input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                    className="mt-1 block rounded border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary focus:border-accent-blue/50 focus:outline-none" />
                </label>
                <label className="text-xs text-text-muted">
                  Institution
                  <input value={draft.institution} onChange={(e) => setDraft((p) => ({ ...p, institution: e.target.value }))}
                    className="mt-1 block rounded border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary focus:border-accent-blue/50 focus:outline-none" />
                </label>
                <label className="text-xs text-text-muted">
                  Opening balance
                  <input type="number" step="0.01" value={draft.openingBalance}
                    onChange={(e) => setDraft((p) => ({ ...p, openingBalance: e.target.value }))}
                    className="mt-1 block w-32 rounded border border-border bg-bg-elevated px-2 py-1 text-sm font-mono text-text-primary focus:border-accent-blue/50 focus:outline-none" />
                </label>
                <button onClick={() => void save(a.id)} className="rounded-lg bg-accent-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600">Save</button>
                <button onClick={() => setEditing(null)} className="px-2 py-1.5 text-sm text-text-muted hover:text-text-primary">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{a.name}</span>
                    {a.archived && <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">archived</span>}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {a.institution ?? 'No institution'} · {a.transactionCount} transaction{a.transactionCount === 1 ? '' : 's'} ·
                    {' '}balance {money(a.balance)} (opening {money(a.openingBalance)})
                  </div>
                </div>
                <button
                  onClick={() => { setEditing(a.id); setDraft({ name: a.name, institution: a.institution ?? '', openingBalance: String(a.openingBalance) }) }}
                  className="rounded p-1.5 text-text-muted hover:text-text-primary" title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => void setArchived(a.id, !a.archived)}
                  className="rounded p-1.5 text-text-muted hover:text-text-primary"
                  title={a.archived ? 'Restore' : 'Archive'}
                >
                  {a.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                </button>
              </div>
            )}
          </li>
        ))}
        {accounts.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-text-muted">
            No accounts yet — add one on the Transactions page.
          </li>
        )}
      </ul>
    </div>
  )
}

// ─── Recurring ────────────────────────────────────────────────────────────────

function RecurringSection() {
  const [confirmed, setConfirmed] = useState<WireRecurring[]>([])
  const [suggestions, setSuggestions] = useState<RecurringSuggestion[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const d = await api<{ confirmed: WireRecurring[]; suggestions: RecurringSuggestion[] }>('/api/user/budget/recurring')
      setConfirmed(d.confirmed ?? [])
      setSuggestions(d.suggestions ?? [])
    } catch (e) { toast.error((e as Error).message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function answer(s: RecurringSuggestion, dismiss: boolean) {
    try {
      await api('/api/user/budget/recurring', {
        method: 'POST',
        body: JSON.stringify({
          description: s.description, amount: s.amount, cadence: s.cadence,
          nextDueAt: s.nextDueAt ?? undefined, dismiss,
        }),
      })
      await load()
      toast.success(dismiss ? 'Suggestion dismissed' : 'Recurring item confirmed')
    } catch (e) { toast.error((e as Error).message) }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/user/budget/recurring/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      await load()
    } catch (e) { toast.error((e as Error).message) }
  }

  async function remove(id: string) {
    try {
      await api(`/api/user/budget/recurring/${id}`, { method: 'DELETE' })
      await load()
    } catch (e) { toast.error((e as Error).message) }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading recurring items…</p>

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Suggestions</h3>
        <p className="mb-2 text-xs leading-relaxed text-text-muted">
          Inferred from your transaction history, not stored until you answer. Dismissing one is
          remembered — before this page existed, a suggestion you did not want came back on every load.
        </p>
        {suggestions.length === 0 ? (
          <p className="rounded-card border border-border bg-bg-card p-3 text-sm text-text-muted">
            Nothing detected. Cadence inference needs a few repeats of the same merchant to be sure.
          </p>
        ) : (
          <ul className="divide-y divide-border/40 rounded-card border border-border bg-bg-card">
            {suggestions.map((s) => (
              <li key={s.key} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-text-primary">{s.description}</div>
                  <div className="text-[11px] text-text-muted">
                    {money(s.amount)} · {s.cadence} · seen {s.occurrences} times
                  </div>
                </div>
                <button onClick={() => void answer(s, false)}
                  className="rounded-lg bg-accent-blue px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-600">
                  Confirm
                </button>
                <button onClick={() => void answer(s, true)}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs text-text-muted hover:text-text-primary">
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Confirmed</h3>
        {confirmed.length === 0 ? (
          <p className="rounded-card border border-border bg-bg-card p-3 text-sm text-text-muted">None yet.</p>
        ) : (
          <ul className="divide-y divide-border/40 rounded-card border border-border bg-bg-card">
            {confirmed.map((r) => (
              <li key={r.id} className={clsx('flex items-center gap-3 px-4 py-2.5', !r.active && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-text-primary">{r.description}</div>
                  <div className="text-[11px] text-text-muted">
                    {money(r.amount)} · {r.cadence}{r.nextDueAt ? ` · next ${r.nextDueAt}` : ''}
                  </div>
                </div>
                <button onClick={() => void patch(r.id, { active: !r.active })}
                  className="rounded border border-border px-2 py-1 text-[11px] text-text-muted hover:text-text-primary">
                  {r.active ? 'Pause' : 'Resume'}
                </button>
                <button onClick={() => void remove(r.id)} className="rounded p-1 text-text-muted hover:text-red-400" title="Delete">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Import profiles ──────────────────────────────────────────────────────────

function ImportProfilesSection() {
  const [profiles, setProfiles] = useState<WireImportProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const load = useCallback(async () => {
    try {
      const d = await api<{ profiles: WireImportProfile[] }>('/api/user/budget/import-profiles')
      setProfiles(d.profiles ?? [])
    } catch (e) { toast.error((e as Error).message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function rename(id: string) {
    if (!editName.trim()) { setEditing(null); return }
    try {
      await api(`/api/user/budget/import-profiles/${id}`, { method: 'PATCH', body: JSON.stringify({ name: editName.trim() }) })
      setEditing(null)
      await load()
    } catch (e) { toast.error((e as Error).message) }
  }

  async function remove(id: string) {
    try {
      await api(`/api/user/budget/import-profiles/${id}`, { method: 'DELETE' })
      await load()
      toast.success('Profile deleted — imported transactions are unaffected')
    } catch (e) { toast.error((e as Error).message) }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading profiles…</p>

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-text-muted">
        A saved column mapping per bank, auto-matched on upload by the CSV&rsquo;s header row. Deleting
        one removes only the mapping — transactions already imported with it stay exactly as they are.
      </p>
      {profiles.length === 0 ? (
        <p className="rounded-card border border-border bg-bg-card p-4 text-sm text-text-muted">
          No saved profiles. One is offered when you map a CSV on the Transactions page.
        </p>
      ) : (
        <ul className="divide-y divide-border/40 rounded-card border border-border bg-bg-card">
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              {editing === p.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void rename(p.id); if (e.key === 'Escape') setEditing(null) }}
                    autoFocus
                    className="flex-1 rounded border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary focus:border-accent-blue/50 focus:outline-none"
                  />
                  <button onClick={() => void rename(p.id)} className="rounded p-1 text-emerald-400" title="Save"><Check size={14} /></button>
                  <button onClick={() => setEditing(null)} className="rounded p-1 text-text-muted" title="Cancel"><X size={14} /></button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-text-primary">{p.name}</div>
                    <div className="truncate text-[11px] font-mono text-text-muted">
                      date: {p.mapping.date} · amount: {p.mapping.amount} · description: {p.mapping.description}
                    </div>
                  </div>
                  <button onClick={() => { setEditing(p.id); setEditName(p.name) }} className="rounded p-1 text-text-muted hover:text-text-primary" title="Rename">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => void remove(p.id)} className="rounded p-1 text-text-muted hover:text-red-400" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function BudgetManageInner() {
  const [section, setSection] = useState<Section>('rules')
  const [categories, setCategories] = useState<WireCategory[]>([])
  const [accounts, setAccounts] = useState<WireAccount[]>([])

  const loadShared = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([
        api<{ categories: WireCategory[] }>('/api/user/budget/categories'),
        api<{ accounts: WireAccount[] }>('/api/user/budget/accounts'),
      ])
      setCategories(c.categories ?? [])
      setAccounts(a.accounts ?? [])
    } catch (e) {
      toast.error((e as Error).message)
    }
  }, [])
  useEffect(() => { void loadShared() }, [loadShared])

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader
        title="Budget Settings"
        subtitle="Rules, categories, accounts, recurring items and import profiles"
        description="The management half of the Budget module. Categorization rules run server-side the moment a transaction is inserted — this is where you create and order them."
        details={[
          { label: 'Rules', text: 'First match wins, lowest priority number first. A transaction that already has a category is never overwritten by a rule.' },
          { label: 'Deleting', text: 'Deleting a rule or a category never deletes transactions. A deleted category leaves its transactions uncategorized, which the month view counts separately from $0.' },
        ]}
      />

      <div className="flex flex-wrap gap-1 rounded-lg bg-bg-elevated p-1 w-fit">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={clsx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              section === id ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary')}
          >
            <Icon size={14} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {section === 'rules' && <RulesSection categories={categories} accounts={accounts} />}
      {section === 'categories' && <CategoriesSection categories={categories} reload={loadShared} />}
      {section === 'accounts' && <AccountsSection accounts={accounts} reload={loadShared} />}
      {section === 'recurring' && <RecurringSection />}
      {section === 'imports' && <ImportProfilesSection />}

      {/* No SourceLine: the Budget module has no external providers — every
          figure here is the user's own data. */}
    </div>
  )
}

export default function BudgetManagePage() {
  return (
    <ModuleGate module="budget">
      <BudgetManageInner />
    </ModuleGate>
  )
}
