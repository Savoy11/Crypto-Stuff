'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Eye, Wallet, Building2, Plus, Trash2, RefreshCw,
  AlertTriangle, CheckCircle2, XCircle, Loader2, Copy, TrendingDown,
} from 'lucide-react'
import { PumpReportTab } from '@/components/pump-report/PumpReportTab'
import type { ScanTarget } from '@/app/live-data/pump-report/scan/route'
import { clsx } from 'clsx'
import {
  useWalletStore,
  CHAIN_META, ALL_CHAINS, EXCHANGE_META,
  type ChainId, type ExchangeId,
  type WatchedWallet, type ConnectedWallet, type ExchangeConnection,
} from '@/store/useWalletStore'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function shortAddr(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}
function fmtBal(n: number) {
  if (n === 0) return '0'
  if (n < 0.000001) return '<0.000001'
  return n.toLocaleString('en-US', { maximumFractionDigits: 6, minimumFractionDigits: 0 })
}

// ─── Chain badge ────────────────────────────────────────────────────────────────

function ChainBadge({ chain }: { chain: ChainId }) {
  const m = CHAIN_META[chain]
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ background: m.color + '22', color: m.color }}>
      {m.label}
    </span>
  )
}

// ─── Tab bar ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'watch',       label: 'Watch Addresses', icon: Eye         },
  { id: 'connect',     label: 'Browser Wallets',  icon: Wallet      },
  { id: 'exchange',    label: 'Exchange APIs',    icon: Building2   },
  { id: 'pump-report', label: 'Pump Report',      icon: TrendingDown },
] as const
type TabId = typeof TABS[number]['id']

// ─── Tier 1: Watch ─────────────────────────────────────────────────────────────

function useBalance(wallet: WatchedWallet) {
  const [bal,  setBal]  = useState<number | null>(null)
  const [sym,  setSym]  = useState(CHAIN_META[wallet.chain].symbol)
  const [err,  setErr]  = useState<string | undefined>()
  const [busy, setBusy] = useState(true)

  const load = useCallback(async () => {
    setBusy(true); setErr(undefined)
    const t = CHAIN_META[wallet.chain].type
    const url = t === 'evm' ? `/live-data/wallet/eth?address=${wallet.address}&chain=${wallet.chain}`
              : t === 'sol' ? `/live-data/wallet/sol?address=${wallet.address}`
              :               `/live-data/wallet/btc?address=${wallet.address}`
    try {
      const r = await fetch(url); const d = await r.json()
      if (!d.ok) throw new Error(d.error)
      setBal(d.balance); setSym(d.symbol)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error') }
    finally { setBusy(false) }
  }, [wallet])

  useEffect(() => { load() }, [load])
  return { bal, sym, err, busy, refresh: load }
}

function WatchRow({ w }: { w: WatchedWallet }) {
  const { removeWatched } = useWalletStore()
  const { bal, sym, err, busy, refresh } = useBalance(w)
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0 group hover:bg-bg-elevated/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-text-primary truncate">{w.label || shortAddr(w.address)}</span>
          <ChainBadge chain={w.chain} />
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono text-text-muted">
          <span>{shortAddr(w.address)}</span>
          <button onClick={() => navigator.clipboard.writeText(w.address)}
            className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-text-primary">
            <Copy size={11} />
          </button>
        </div>
      </div>
      <div className="text-right min-w-[110px]">
        {busy ? <Loader2 size={14} className="animate-spin text-text-muted ml-auto" />
          : err ? <span className="text-xs text-red-400 flex items-center gap-1 justify-end"><XCircle size={12} /> Error</span>
          : <span className="text-sm font-mono text-text-primary">{fmtBal(bal ?? 0)} {sym}</span>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={refresh} title="Refresh"
          className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary">
          <RefreshCw size={13} />
        </button>
        <button onClick={() => removeWatched(w.id)} title="Remove"
          className="p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function AddWatchForm() {
  const { addWatched } = useWalletStore()
  const [open, setOpen]       = useState(false)
  const [address, setAddress] = useState('')
  const [label, setLabel]     = useState('')
  const [chain, setChain]     = useState<ChainId>('ethereum')

  function submit() {
    if (!address.trim()) return
    addWatched({ address: address.trim(), label: label.trim() || shortAddr(address.trim()), chain })
    setAddress(''); setLabel(''); setOpen(false)
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-text-muted hover:text-text-primary transition-colors border-t border-border/60">
      <Plus size={14} /> Add address
    </button>
  )

  return (
    <div className="p-4 border-t border-border/60 space-y-3">
      <input
        className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/60"
        placeholder="Wallet address (0x… / bc1… / Solana pubkey)"
        value={address} onChange={e => setAddress(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className="bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/60"
          placeholder="Label (optional)"
          value={label} onChange={e => setLabel(e.target.value)}
        />
        <select
          className="bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue/60"
          value={chain} onChange={e => setChain(e.target.value as ChainId)}
        >
          {ALL_CHAINS.map(c => <option key={c} value={c}>{CHAIN_META[c].label}</option>)}
        </select>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors">Cancel</button>
        <button onClick={submit} disabled={!address.trim()}
          className="px-3 py-1.5 text-sm bg-accent-blue text-white rounded-lg hover:bg-accent-blue/90 transition-colors disabled:opacity-40">
          Add Wallet
        </button>
      </div>
    </div>
  )
}

function WatchTab() {
  const { watched } = useWalletStore()
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Enter any public wallet address to track its on-chain balance. Read-only — no private key required.
      </p>
      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        {watched.length === 0
          ? <div className="px-4 py-10 text-center text-sm text-text-muted">No addresses added yet.</div>
          : watched.map(w => <WatchRow key={w.id} w={w} />)}
        <AddWatchForm />
      </div>
    </div>
  )
}

// ─── Tier 2: Browser Wallets ───────────────────────────────────────────────────

type ProviderDef = {
  id:      ConnectedWallet['provider']
  label:   string
  chain:   'ethereum' | 'solana'
  detect:  () => boolean
  connect: () => Promise<string>
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'metamask', label: 'MetaMask', chain: 'ethereum',
    detect:  () => typeof window !== 'undefined' && !!(window as any).ethereum?.isMetaMask,
    connect: async () => {
      const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' })
      return accounts[0]
    },
  },
  {
    id: 'coinbase-wallet', label: 'Coinbase Wallet', chain: 'ethereum',
    detect:  () => typeof window !== 'undefined' && !!(window as any).ethereum?.isCoinbaseWallet,
    connect: async () => {
      const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' })
      return accounts[0]
    },
  },
  {
    id: 'phantom', label: 'Phantom', chain: 'solana',
    detect:  () => typeof window !== 'undefined' && !!(window as any).solana?.isPhantom,
    connect: async () => {
      const resp = await (window as any).solana.connect()
      return resp.publicKey.toString()
    },
  },
]

function ConnectedRow({ w }: { w: ConnectedWallet }) {
  const { removeConnected } = useWalletStore()
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0 group">
      <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-text-primary">{w.label}</span>
          <span className="text-[10px] text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded">{w.provider}</span>
        </div>
        <span className="text-xs font-mono text-text-muted">{shortAddr(w.address)}</span>
      </div>
      <button onClick={() => removeConnected(w.id)}
        className="p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function ConnectTab() {
  const { connected, addConnected } = useWalletStore()
  const [connecting, setConnecting] = useState<string | null>(null)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  async function handleConnect(p: ProviderDef) {
    setConnecting(p.id); setErrors(e => ({ ...e, [p.id]: '' }))
    try {
      const address = await p.connect()
      addConnected({ address, label: p.label, chain: p.chain, provider: p.id })
    } catch (e) {
      setErrors(er => ({ ...er, [p.id]: e instanceof Error ? e.message : 'Failed' }))
    } finally { setConnecting(null) }
  }

  const done = (id: string) => connected.some(c => c.provider === id)

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Connect a browser extension wallet. The app reads your address only — it will never initiate transactions.
      </p>

      {connected.length > 0 && (
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          {connected.map(w => <ConnectedRow key={w.id} w={w} />)}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {PROVIDERS.map(p => {
          const detected = p.detect()
          const loading  = connecting === p.id
          const isDone   = done(p.id)
          return (
            <button key={p.id}
              onClick={() => handleConnect(p)}
              disabled={isDone || loading || !detected}
              className={clsx(
                'flex flex-col items-center gap-2 p-5 rounded-xl border text-sm transition-all',
                isDone
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                  : detected
                    ? 'border-border bg-bg-card hover:border-accent-blue/40 hover:bg-accent-blue/5 text-text-primary cursor-pointer'
                    : 'border-border/30 bg-bg-elevated/20 text-text-muted opacity-50 cursor-not-allowed',
              )}
            >
              {loading ? <Loader2 size={22} className="animate-spin" />
                : isDone ? <CheckCircle2 size={22} />
                : <Wallet size={22} />}
              <span className="font-medium">{p.label}</span>
              <span className="text-[11px] text-text-muted">
                {isDone ? 'Connected' : detected ? 'Click to connect' : 'Not detected'}
              </span>
              {errors[p.id] && <span className="text-[10px] text-red-400 text-center">{errors[p.id]}</span>}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-text-muted bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 flex gap-2">
        <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
        Only <code className="font-mono">eth_requestAccounts</code> is called. No transaction signing or approvals.
      </p>
    </div>
  )
}

// ─── Tier 3: Exchange APIs ─────────────────────────────────────────────────────

interface ExchangeBalance { asset: string; total: number }

function ExchangeCard({ conn }: { conn: ExchangeConnection }) {
  const { removeExchange } = useWalletStore()
  const [balances, setBalances] = useState<ExchangeBalance[] | null>(null)
  const [err, setErr]           = useState<string | undefined>()
  const [busy, setBusy]         = useState(true)
  const meta = EXCHANGE_META[conn.exchange]

  const load = useCallback(async () => {
    setBusy(true); setErr(undefined)
    try {
      const res  = await fetch('/live-data/wallet/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ exchange: conn.exchange, apiKey: conn.apiKey, apiSecret: conn.apiSecret }),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setBalances(d.balances)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error') }
    finally { setBusy(false) }
  }, [conn])

  useEffect(() => { load() }, [load])

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
        <div className="size-8 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: meta.color + '22', color: meta.color }}>
          {meta.label[0]}
        </div>
        <div className="flex-1">
          <span className="text-sm font-medium text-text-primary">{conn.label || meta.label}</span>
          <span className="ml-2 text-[10px] font-mono text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded">{conn.apiKey.slice(0, 8)}…</span>
        </div>
        <button onClick={load} title="Refresh"
          className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary">
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
        </button>
        <button onClick={() => removeExchange(conn.id)} title="Remove"
          className="p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400">
          <Trash2 size={13} />
        </button>
      </div>
      <div className="p-2 max-h-64 overflow-y-auto">
        {busy && <div className="flex items-center gap-2 px-2 py-3 text-sm text-text-muted"><Loader2 size={14} className="animate-spin" /> Loading…</div>}
        {err  && <div className="flex items-center gap-2 px-2 py-2 text-sm text-red-400"><XCircle size={14} /> {err}</div>}
        {balances?.map(b => (
          <div key={b.asset} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-bg-elevated/50 transition-colors">
            <span className="text-sm font-mono text-text-primary">{b.asset}</span>
            <span className="text-sm font-mono text-text-secondary">{fmtBal(b.total)}</span>
          </div>
        ))}
        {balances?.length === 0 && <div className="px-2 py-4 text-sm text-text-muted text-center">No balances found</div>}
      </div>
    </div>
  )
}

// OKX/Bybit remain in ExchangeId for stored connections but have no server-side
// balance implementation yet — offering them would always error.
const EXCHANGE_IDS: ExchangeId[] = ['binance', 'coinbase', 'kraken']

function AddExchangeForm() {
  const { addExchange } = useWalletStore()
  const [open,      setOpen]      = useState(false)
  const [exchange,  setExchange]  = useState<ExchangeId>('binance')
  const [apiKey,    setApiKey]    = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [label,     setLabel]     = useState('')

  function submit() {
    if (!apiKey.trim() || !apiSecret.trim()) return
    addExchange({ exchange, apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), label: label.trim() || EXCHANGE_META[exchange].label })
    setApiKey(''); setApiSecret(''); setLabel(''); setOpen(false)
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="flex items-center gap-2 px-4 py-2 text-sm bg-accent-blue text-white rounded-lg hover:bg-accent-blue/90 transition-colors">
      <Plus size={14} /> Add Exchange
    </button>
  )

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">Add Exchange API</h3>
      <p className="text-xs text-text-muted bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 flex gap-2">
        <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
        Use read-only API keys with no withdrawal permissions. Keys are stored in your browser and sent only to this app&apos;s signing proxy.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-text-muted mb-1 block">Exchange</label>
          <select className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue/60"
            value={exchange} onChange={e => setExchange(e.target.value as ExchangeId)}>
            {EXCHANGE_IDS.map(id => <option key={id} value={id}>{EXCHANGE_META[id].label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-text-muted mb-1 block">Label (optional)</label>
          <input className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/60"
            placeholder="Main account" value={label} onChange={e => setLabel(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-text-muted mb-1 block">API Key</label>
          <input className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/60"
            placeholder="API key" value={apiKey} onChange={e => setApiKey(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-text-muted mb-1 block">API Secret</label>
          <input type="password"
            className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/60"
            placeholder="API secret" value={apiSecret} onChange={e => setApiSecret(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors">Cancel</button>
        <button onClick={submit} disabled={!apiKey.trim() || !apiSecret.trim()}
          className="px-4 py-1.5 text-sm bg-accent-blue text-white rounded-lg hover:bg-accent-blue/90 transition-colors disabled:opacity-40">
          Connect Exchange
        </button>
      </div>
    </div>
  )
}

function ExchangeTab() {
  const { exchanges } = useWalletStore()
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Link exchange accounts via read-only API keys. Balances are fetched through this app&apos;s signing proxy — keys are never exposed to third parties.
      </p>
      {exchanges.map(e => <ExchangeCard key={e.id} conn={e} />)}
      <AddExchangeForm />
      <div className="text-xs text-text-muted border-t border-border/40 pt-3 space-y-0.5">
        <p className="font-medium text-text-secondary">Read-only key setup tips:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Binance: enable &quot;Read Info&quot; only, no withdrawals or trading</li>
          <li>Coinbase: Advanced Trade key with &quot;View&quot; scope only</li>
          <li>Kraken: &quot;Query Funds&quot; permission only</li>
        </ul>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function WalletsPage() {
  const [tab, setTab] = useState<TabId>('watch')
  const { watched, connected, exchanges } = useWalletStore()

  const counts: Record<TabId, number> = {
    watch:        watched.length,
    connect:      connected.length,
    exchange:     exchanges.length,
    'pump-report': 0,
  }

  // Build scan targets from all linked wallets
  const walletTargets: ScanTarget[] = [
    ...watched.map(w => ({ type: 'wallet' as const, id: w.address, label: w.label || w.address })),
    ...connected.map(w => ({ type: 'wallet' as const, id: w.address, label: `${w.provider} ${w.address.slice(0, 8)}…` })),
    ...exchanges.map(e => ({ type: 'site' as const, id: e.exchange, label: e.exchange.charAt(0).toUpperCase() + e.exchange.slice(1) })),
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Wallets</h1>
        <p className="text-sm text-text-muted mt-1">
          Track balances across addresses, browser wallets, and exchanges.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-bg-elevated rounded-xl p-1 border border-border/40">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.id
                ? 'bg-bg-card shadow-sm text-text-primary border border-border/60'
                : 'text-text-muted hover:text-text-secondary',
            )}
          >
            <t.icon size={15} />
            {t.label}
            {counts[t.id] > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-accent-blue/15 text-accent-blue">
                {counts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'watch'       && <WatchTab />}
      {tab === 'connect'     && <ConnectTab />}
      {tab === 'exchange'    && <ExchangeTab />}
      {tab === 'pump-report' && (
        <PumpReportTab
          targets={walletTargets.length > 0 ? walletTargets : [{ type: 'wallet', id: 'example', label: 'Add a wallet above to scan' }]}
          agentIntro="I'm your Pump Report AI Agent. I can search the web for fraud intelligence on your linked wallets and exchanges — rug pulls, flagged addresses, scam sites. Add wallets in the other tabs then scan them here."
        />
      )}
    </div>
  )
}
