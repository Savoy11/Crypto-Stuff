'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, X, ShieldAlert } from 'lucide-react'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import { PumpReportTab } from '@/components/pump-report/PumpReportTab'
import { useWalletStore, hydrateWallets } from '@/store/useWalletStore'
import type { ScanTarget } from '@/app/live-data/pump-report/scan/route'

// ─── Why this page exists ─────────────────────────────────────────────────────
//
// The Pump Report was a TAB on /wallets. When Wallets was held out of the
// initial rollout (2026-08-22) the report went dark with it — not because
// anyone decided to withhold the report, but because it had no route of its
// own. This is that route.
//
// It does NOT depend on the Wallets page being reachable. Saved addresses are
// still read from the wallet store (they are DB-backed and survive the hide),
// but the page carries its own address entry so it stands alone for someone who
// has never had a wallets page to add anything on. That independence is the
// whole point: a surface that only works when a hidden page is visible is the
// coupling that caused this.

/** Loose shape check — a hint, not a gate. */
function looksLikeAddress(v: string): boolean {
  const s = v.trim()
  return (
    /^0x[a-fA-F0-9]{40}$/.test(s) ||          // EVM
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) || // Solana / base58
    /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(s) || // Bitcoin
    /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s) ||  // Tron
    /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(s)  // XRP
  )
}

function PumpReportPageInner() {
  const { watched, connected, hydrated, syncError } = useWalletStore()
  const [manual, setManual] = useState<{ address: string; label: string }[]>([])
  const [draft, setDraft] = useState('')

  // Saved wallets are DB-backed, so they are still there even though the page
  // that manages them is out of the rollout.
  useEffect(() => { void hydrateWallets() }, [])

  const savedTargets: ScanTarget[] = useMemo(() => [
    ...watched.map(w => ({ type: 'wallet' as const, id: w.address, label: w.label || w.address })),
    ...connected.map(w => ({ type: 'wallet' as const, id: w.address, label: `${w.provider} ${w.address.slice(0, 8)}…` })),
  ], [watched, connected])

  const manualTargets: ScanTarget[] = useMemo(
    () => manual.map(m => ({ type: 'wallet' as const, id: m.address, label: m.label })),
    [manual],
  )

  // De-duplicated by address: adding an address that is already a saved wallet
  // must not scan it twice and bill two web searches for one answer.
  const targets: ScanTarget[] = useMemo(() => {
    const byId = new Map<string, ScanTarget>()
    for (const t of [...savedTargets, ...manualTargets]) byId.set(t.id, t)
    return Array.from(byId.values())
  }, [savedTargets, manualTargets])

  const addDraft = () => {
    const address = draft.trim()
    if (!address) return
    if (manual.some(m => m.address === address) || savedTargets.some(t => t.id === address)) {
      setDraft('')
      return
    }
    setManual(m => [...m, { address, label: address }])
    setDraft('')
  }

  const draftWarn = draft.trim().length > 0 && !looksLikeAddress(draft)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Pump Report"
        description="Search public fraud intelligence for an address — rug pulls, flagged wallets, scam sites. Read-only, and no private key is ever involved."
        icon={<ShieldAlert size={20} />}
      />

      {/* Address entry. The page's own, so it does not depend on /wallets. */}
      <div className="space-y-3 rounded-card border border-border bg-bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addDraft() }}
            placeholder="Paste a public wallet address…"
            aria-label="Wallet address to scan"
            className="min-w-64 flex-1 rounded-lg border border-border bg-bg-elevated px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
          />
          <button
            onClick={addDraft}
            disabled={!draft.trim()}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent-blue/40 hover:text-accent-blue disabled:opacity-40"
          >
            <Plus size={13} /> Add
          </button>
        </div>

        {/* A HINT, not a gate. The scan is a public-web search on the string, so
            an address shape we do not recognise is still worth searching — and
            refusing it would block chains this check has never heard of. */}
        {draftWarn && (
          <p className="text-[11px] text-amber-400">
            That doesn’t match a wallet-address shape we recognise. You can still add it — the scan
            searches public sources for the text either way.
          </p>
        )}

        {manual.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {manual.map(m => (
              <span key={m.address} className="flex items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-2.5 py-1 font-mono text-[11px] text-text-secondary">
                {m.address.slice(0, 10)}…{m.address.slice(-6)}
                <button
                  onClick={() => setManual(list => list.filter(x => x.address !== m.address))}
                  aria-label={`Remove ${m.address}`}
                  className="text-text-muted transition-colors hover:text-red-400"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Where the other addresses came from. Without this line, saved wallets
            appearing in a list the reader cannot edit anywhere is unexplained. */}
        {savedTargets.length > 0 && (
          <p className="text-[11px] text-text-muted">
            Also scanning <strong className="text-text-secondary">{savedTargets.length}</strong> saved{' '}
            {savedTargets.length === 1 ? 'wallet' : 'wallets'} from your account.
          </p>
        )}
        {syncError && (
          <p className="text-[11px] text-amber-400">Saved wallets unavailable: {syncError}</p>
        )}
        {!hydrated && !syncError && (
          <p className="text-[11px] text-text-muted">Loading saved wallets…</p>
        )}
      </div>

      {targets.length === 0 ? (
        <div className="rounded-card border border-border bg-bg-card px-4 py-10 text-center text-sm text-text-muted">
          Add an address above to run a scan.
        </div>
      ) : (
        <PumpReportTab
          targets={targets}
          agentIntro="I'm your Pump Report AI Agent. I can search the web for fraud intelligence on the addresses you've added — rug pulls, flagged addresses, scam sites."
        />
      )}
    </div>
  )
}

// Entitlement gate at the component boundary, not inside the JSX: a disabled
// module must not mount the inner component at all, so its queries never fire.
export default function PumpReportPage() {
  return (
    <ModuleGate module="crypto">
      <PumpReportPageInner />
    </ModuleGate>
  )
}
