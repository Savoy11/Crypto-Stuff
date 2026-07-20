'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, AlertTriangle, AlertOctagon, Info, CheckCircle2,
  Loader2, RefreshCw, Wallet, Shield, ChevronDown, ChevronUp,
  Clock, Zap, DollarSign, ArrowLeftRight, Plus, X,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataBadge } from '@/components/ui/DataBadge'
import { clsx } from 'clsx'
import {
  EXCHANGES, COIN_INFO, NETWORKS, PERSONAL_WALLET_ID,
  EVM_NETWORKS, findTransferPaths,
  TRANSFER_FEES_LAST_VERIFIED, transferFeesAreStale, transferFeesAgeDays,
  getTransferFeeProvenance,
  type CoinId, type TransferPath, type TransferWarning,
  type NetworkFeeMap, type CoinPriceMap,
} from '@/lib/data/transferFees'
import type { NetworkFeesResponse } from '@/app/live-data/network-fees/route'
import type { CoinListResponse, CoinListEntry } from '@/lib/types/coinList'
import { NETWORK_GAS, FALLBACK_PRICES } from '@/lib/data/networkFees'

// Static last-resort fee/price maps so the calculator still works (honestly
// labeled as estimates) when /live-data/network-fees is unreachable. Without
// these, an empty fee map made every route report "No compatible network
// found" while the status bar claimed static estimates were in use.
const STATIC_FEES: NetworkFeeMap = Object.fromEntries(
  Object.entries(NETWORK_GAS).map(([id, g]) => [id, {
    feeNative: g.native,
    feeUsd: parseFloat((g.native * (FALLBACK_PRICES[g.priceKey] ?? 1)).toFixed(4)),
    nativeToken: g.token,
    source: 'estimate' as const,
  }]),
) as NetworkFeeMap
const STATIC_PRICES: CoinPriceMap = { ...FALLBACK_PRICES }

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function fetchNetworkFees(): Promise<NetworkFeesResponse> {
  const res = await fetch('/live-data/network-fees')
  if (!res.ok) throw new Error('Failed to fetch network fees')
  return res.json()
}

async function fetchCoinList(): Promise<CoinListResponse> {
  const res = await fetch('/live-data/coin-list')
  if (!res.ok) throw new Error('Failed to fetch coin list')
  return res.json()
}

// Keys of COIN_INFO are lowercase ticker symbols
const SUPPORTED_SYMBOLS = new Set(
  Object.keys(COIN_INFO).map(k => k.toUpperCase())
)

// ─── Sub-components ────────────────────────────────────────────────────────────

function NetworkBadge({ networkId, size = 'sm' }: { networkId: string; size?: 'sm' | 'xs' }) {
  const network = NETWORKS[networkId as keyof typeof NETWORKS]
  if (!network) return null
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded font-mono font-semibold border',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]'
      )}
      style={{ color: network.color, borderColor: `${network.color}40`, background: `${network.color}15` }}
    >
      {network.shortName}
    </span>
  )
}

function WarningBanner({ warning }: { warning: TransferWarning }) {
  const styles = {
    danger:  { bg: 'bg-red-500/8 border-red-500/30',   icon: AlertOctagon,  color: 'text-red-400',   titleColor: 'text-red-300' },
    warning: { bg: 'bg-amber-500/8 border-amber-500/30',icon: AlertTriangle, color: 'text-amber-400', titleColor: 'text-amber-300' },
    info:    { bg: 'bg-blue-500/8 border-blue-500/30',  icon: Info,          color: 'text-blue-400',  titleColor: 'text-blue-300' },
  }
  const s = styles[warning.type]
  const Icon = s.icon
  return (
    <div className={clsx('rounded-lg border px-3 py-2.5 flex gap-2.5', s.bg)}>
      <Icon size={14} className={clsx('flex-shrink-0 mt-0.5', s.color)} />
      <div className="min-w-0">
        <p className={clsx('text-xs font-semibold', s.titleColor)}>{warning.title}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{warning.message}</p>
      </div>
    </div>
  )
}

function HopRow({ hop, coinId, coinPrices }: {
  hop: TransferPath['hops'][number]
  coinId: string
  coinPrices: CoinPriceMap
}) {
  const network = NETWORKS[hop.networkId]
  const coinInfo = COIN_INFO[coinId as CoinId]
  return (
    <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="size-5 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-[10px] font-bold text-slate-300 flex-shrink-0">
          {hop.step}
        </span>
        <span className="text-xs font-medium text-slate-200">{hop.from}</span>
        <ArrowRight size={12} className="text-slate-500 flex-shrink-0" />
        <span className="text-xs font-medium text-slate-200">{hop.to}</span>
        <NetworkBadge networkId={hop.networkId} size="xs" />
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <p className="text-slate-500 mb-0.5">Exchange fee</p>
          {hop.exchangeFee === 0 ? (
            <p className="text-emerald-400 font-semibold">Free</p>
          ) : (
            <>
              <p className="text-slate-200 font-mono">{hop.exchangeFee} {coinInfo.symbol}</p>
              <p className="text-slate-500">${hop.exchangeFeeUsd.toFixed(2)}</p>
            </>
          )}
        </div>
        <div>
          <p className="text-slate-500 mb-0.5">Network gas</p>
          <p className="text-slate-200 font-mono">{hop.networkFee.toFixed(6)} {hop.nativeGasToken}</p>
          <p className="text-slate-500">
            ${hop.networkFeeUsd.toFixed(2)}
            {hop.gasCoveredByFee
              ? <span className="text-emerald-500/80"> · covered by fee</span>
              : <span className="text-amber-400/80"> · paid from wallet</span>}
          </p>
        </div>
        <div>
          <p className="text-slate-500 mb-0.5">Deposit fee</p>
          <p className="text-emerald-400 font-semibold">Free</p>
        </div>
      </div>
      {hop.note && (
        <p className="mt-2 text-[10px] text-blue-400 flex items-center gap-1">
          <Info size={10} /> {hop.note}
        </p>
      )}
      <div className="mt-2 pt-2 border-t border-slate-700/50 flex items-center gap-2 text-[10px] text-slate-500">
        <Clock size={10} />
        <span>Est. confirmation: {network.estimatedTime}</span>
        <span className="ml-auto font-mono text-slate-400">
          Address: <span style={{ color: network.color }}>{network.addressFormat === '0x' ? '0x…' : network.addressFormat === 'tron' ? 'T…' : network.addressFormat === 'base58_sol' ? 'base58' : 'bc1…'}</span>
        </span>
      </div>
    </div>
  )
}

function PathCard({ path, coinId, amount, coinPrices }: {
  path: TransferPath
  coinId: string
  amount: number
  coinPrices: CoinPriceMap
}) {
  const [expanded, setExpanded] = useState(path.isRecommended)
  const coinInfo = COIN_INFO[coinId as CoinId]
  const coinPriceUsd = coinPrices[coinId] ?? 1
  const amountUsd = amount * coinPriceUsd

  if (path.type === 'no-path') {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        {path.warnings.map((w, i) => <WarningBanner key={i} warning={w} />)}
      </div>
    )
  }

  const borderColor = !path.isViable
    ? 'border-slate-700/50'
    : path.isRecommended
      ? 'border-emerald-500/30'
      : 'border-slate-600/50'

  const headerBg = !path.isViable
    ? 'bg-slate-800/30'
    : path.isRecommended
      ? 'bg-emerald-500/5'
      : 'bg-slate-800/40'

  return (
    <div className={clsx('rounded-xl border overflow-hidden', borderColor, !path.isViable && 'opacity-75')}>
      {/* Card header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={clsx('w-full text-left px-4 py-3 flex items-center gap-3', headerBg)}
      >
        {/* Recommended / viable / not-viable badge */}
        <div className="flex-shrink-0">
          {path.isRecommended && path.isViable ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
              <CheckCircle2 size={10} /> Best
            </span>
          ) : path.isViable ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/20 text-[10px] font-bold text-blue-400 uppercase tracking-wide">
              Alternative
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-700 border border-slate-600 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
              Not viable
            </span>
          )}
        </div>

        {/* Network + hop count */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {path.networkId && <NetworkBadge networkId={path.networkId} />}
          {path.type === 'multi-hop' && (
            <span className="text-[10px] text-amber-400 font-medium">2-hop route</span>
          )}
        </div>

        {/* Fee summary */}
        <div className="text-right flex-shrink-0">
          {path.isViable ? (
            <>
              <p className={clsx('font-mono text-sm font-bold', path.isRecommended ? 'text-emerald-400' : 'text-slate-200')}>
                ${path.totalFeeUsd.toFixed(2)}
              </p>
              <p className="text-[10px] text-slate-500">
                {path.feePercent < 0.01 ? '<0.01' : path.feePercent.toFixed(2)}% of ${amountUsd.toFixed(0)}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">See warnings</p>
          )}
        </div>

        <div className="flex-shrink-0 text-slate-500">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 space-y-3 border-t border-slate-700/40">
          {/* Hop steps */}
          <div className="space-y-2">
            {path.hops.map(hop => (
              <HopRow key={hop.step} hop={hop} coinId={coinId} coinPrices={coinPrices} />
            ))}
          </div>

          {/* Fee breakdown summary */}
          {path.isViable && (
            <div className="rounded-lg bg-slate-900/60 border border-slate-700/40 p-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] text-slate-500 mb-0.5">Exchange fee</p>
                <p className="text-xs font-mono font-bold text-slate-200">
                  {path.exchangeFeeCoin > 0 ? `${path.exchangeFeeCoin} ${coinInfo.symbol}` : 'Free'}
                </p>
                <p className="text-[10px] text-slate-500">${path.exchangeFeeUsd.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-0.5">Network gas</p>
                <p className="text-xs font-mono font-bold text-slate-200">${path.networkFeeUsd.toFixed(2)}</p>
                <p className="text-[10px] text-slate-500">
                  {path.hops.every(h => h.gasCoveredByFee) ? 'included in withdrawal fee' : 'paid from your wallet'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-0.5">Total cost</p>
                <p className={clsx('text-xs font-mono font-bold', path.isRecommended ? 'text-emerald-400' : 'text-slate-200')}>
                  ${path.totalFeeUsd.toFixed(2)}
                </p>
                <p className="text-[10px] text-slate-500">
                  {path.feePercent < 0.01 ? '<0.01' : path.feePercent.toFixed(2)}% of amount
                </p>
              </div>
            </div>
          )}

          {/* Estimated time */}
          {path.isViable && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Clock size={11} />
              <span>Estimated confirmation time: <span className="text-slate-300 font-medium">{path.estimatedTime}</span></span>
            </div>
          )}

          {/* Warnings */}
          {path.warnings.length > 0 && (
            <div className="space-y-2">
              {path.warnings.map((w, i) => <WarningBanner key={i} warning={w} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Safety sidebar panel ─────────────────────────────────────────────────────

function SafetyPanel() {
  const rules = [
    {
      icon: '🧪',
      title: 'Always send a test transaction first',
      desc: 'Send a small amount (e.g. $5) and confirm it arrives before sending the full amount.',
    },
    {
      icon: '🔁',
      title: 'Verify the network on BOTH sides',
      desc: 'The network you select on the sending exchange must match the network the receiving exchange expects. They do not auto-detect.',
    },
    {
      icon: '⚠️',
      title: 'EVM addresses look identical across chains',
      desc: 'ERC-20, BEP-20, Polygon, Arbitrum, Base, and Avalanche all use 0x… addresses. A wrong-network send may be permanently lost.',
    },
    {
      icon: '📏',
      title: 'Check the minimum withdrawal',
      desc: 'Each exchange sets a minimum per network. Sending below the minimum is usually blocked, but the exchange may hold your funds.',
    },
    {
      icon: '💸',
      title: 'You need gas token in your wallet',
      desc: 'For personal-wallet hops, you must hold the native gas token (ETH, BNB, SOL, etc.) to pay on-chain fees.',
    },
    {
      icon: '📋',
      title: 'Copy-paste addresses — never type them',
      desc: 'One wrong character sends funds to an unreachable address. Clipboard-hijacking malware can silently replace addresses.',
    },
  ]

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Shield size={14} className="text-amber-400" />
        <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wide">Safety checklist</h3>
      </div>
      <div className="space-y-3">
        {rules.map((r, i) => (
          <div key={i} className="flex gap-2.5">
            <span className="text-sm flex-shrink-0 leading-tight">{r.icon}</span>
            <div>
              <p className="text-[11px] font-semibold text-slate-200">{r.title}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{r.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Wrong-network explainer ───────────────────────────────────────────────────

function WrongNetworkExplainer() {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertOctagon size={14} className="text-red-400" />
        <h3 className="text-xs font-bold text-red-300 uppercase tracking-wide">Wrong network = lost funds</h3>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        The most common and devastating crypto transfer mistake. USDT alone exists on
        10+ networks — all potentially sharing the same address format. Sending USDT-ERC20
        to a TRC-20 deposit address typically results in <span className="text-red-400 font-semibold">permanent, unrecoverable loss</span>.
      </p>
      <div className="space-y-1.5">
        {[
          { net: 'ERC-20', addr: '0x742d…f44e', color: '#627EEA' },
          { net: 'BEP-20', addr: '0x742d…f44e', color: '#F0B90B', danger: true },
          { net: 'TRC-20', addr: 'TDkf…4s8',   color: '#FF0013' },
          { net: 'Solana', addr: '7xKX…AsU',   color: '#9945FF' },
        ].map(({ net, addr, color, danger }) => (
          <div key={net} className="flex items-center justify-between text-[10px] font-mono bg-slate-800/60 rounded px-2 py-1">
            <span style={{ color }}>{net}</span>
            <span className={clsx('text-slate-400', danger && 'text-amber-400')}>{addr} {danger && '← same 0x format!'}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-500">
        Recovery is only possible if the receiving address is a self-custody wallet you control,
        and the network is EVM-compatible (same private key). Exchange addresses are almost never recoverable.
      </p>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function TransferFeesPage() {
  const [coinId, setCoinId] = useState<string>('usdt')
  const [amount, setAmount] = useState<string>('1000')
  const [stops, setStops]   = useState<string[]>(['binance', 'coinbase'])

  function addStop(afterIdx: number) {
    setStops(s => {
      const used = new Set(s)
      const next = EXCHANGES.find(e => !used.has(e.id))?.id ?? PERSONAL_WALLET_ID
      const n = [...s]
      n.splice(afterIdx + 1, 0, next)
      return n
    })
  }
  function updateStop(idx: number, value: string) {
    setStops(s => s.map((x, i) => i === idx ? value : x))
  }
  function removeStop(idx: number) {
    setStops(s => s.filter((_, i) => i !== idx))
  }

  // Derived endpoints (used by downstream display logic)
  const fromId = stops[0]
  const toId   = stops[stops.length - 1]

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['network-fees'],
    queryFn: fetchNetworkFees,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  })

  const [coinListData, setCoinListData] = useState<CoinListResponse | null>(null)
  const [coinListLoading, setCoinListLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    fetchCoinList()
      .then(d => { if (!cancelled) setCoinListData(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCoinListLoading(false) })
    return () => { cancelled = true }
  }, [])

  const networkFees = useMemo<NetworkFeeMap>(() => data?.networkFees ?? STATIC_FEES, [data])
  const coinPrices  = useMemo<CoinPriceMap>(() => data?.coinPrices  ?? STATIC_PRICES, [data])

  // Determine if selected coin has fee data in our database
  const isSupportedCoin = SUPPORTED_SYMBOLS.has(coinId.toUpperCase())
  const coinInfo = isSupportedCoin ? COIN_INFO[coinId as CoinId] : null

  // Find the live coin entry for the selected coin (for price + display when not in COIN_INFO)
  const liveCoin: CoinListEntry | undefined = coinListData?.coins.find(
    c => c.symbol.toUpperCase() === coinId.toUpperCase()
  )

  const numAmount = parseFloat(amount) || 0

  // Compute paths for each leg of the route
  const segmentPaths = useMemo(() => {
    if (!isSupportedCoin || numAmount <= 0) return []
    return stops.slice(0, -1).map((from, i) => {
      const to = stops[i + 1]
      if (from === to) return []
      return findTransferPaths(from, to, coinId as CoinId, numAmount, networkFees, coinPrices)
    })
  }, [isSupportedCoin, stops, coinId, numAmount, networkFees, coinPrices])

  // Cumulative cost: best viable path from each leg. Legs with no viable path
  // contribute nothing — count them so the total isn't presented as complete.
  const cumulativeBestFee = segmentPaths.reduce((acc, segPaths) => {
    const best = segPaths.find(p => p.isViable && p.type !== 'no-path')
    return acc + (best?.totalFeeUsd ?? 0)
  }, 0)
  const legsWithoutViablePath = segmentPaths.filter(
    segPaths => !segPaths.some(p => p.isViable && p.type !== 'no-path')
  ).length

  const hasAdjacentDuplicate = stops.some((s, i) => i > 0 && s === stops[i - 1])

  // Price: live route price first, then live coin quote, then 1 as a last
  // resort. (Never coinInfo.defaultAmount — that's a transfer quantity.)
  const coinPriceUsd = coinPrices[coinId] ?? liveCoin?.price ?? 1
  const amountUsd = numAmount * coinPriceUsd

  // Build dynamic coin groups for dropdown
  const dynamicCoins = coinListData?.coins ?? []
  const supportedCoins  = dynamicCoins.filter(c => SUPPORTED_SYMBOLS.has(c.symbol))
  const otherCoins      = dynamicCoins.filter(c => !SUPPORTED_SYMBOLS.has(c.symbol))

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="h-6 w-6 text-blue-400" />
          <div>
            <PageHeader
              title="Transfer Fee Calculator"
              subtitle="Find the cheapest route to move crypto between exchanges and wallets"
              description="The Transfer Fee Calculator compares withdrawal costs across 30 exchanges and 18 networks. It accounts for network gas fees, exchange withdrawal minimums, and multi-hop routes (e.g. sending to an intermediate wallet to avoid unsupported direct transfers)."
              details={[
                { label: 'Live gas prices', text: 'BTC fees use live mempool data. EVM gas is estimated from current CoinGecko ETH price × typical gas units. Other networks use static estimates.' },
                { label: 'Multi-hop routes', text: 'When a direct exchange-to-exchange path is unavailable, the calculator finds the best two-leg route via your personal wallet.' },
                { label: 'EVM address collision', text: 'Transferring between EVM networks (ETH, Polygon, Arbitrum, etc.) uses the same address — verify the destination network before sending.' },
              ]}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <Loader2 size={14} className="animate-spin text-slate-500" />}
          {!isLoading && (
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <RefreshCw size={12} />
              Refresh fees
            </button>
          )}
          <DataBadge status="estimate" source="BTC live (mempool.space) · other gas estimated" />
          {dataUpdatedAt && (
            <span className="text-[10px] text-slate-500">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Provenance / freshness notice for hand-maintained withdrawal fees */}
      {(() => {
        const prov = getTransferFeeProvenance()
        const confMeta = {
          high:   { label: 'High confidence',   chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
          medium: { label: 'Medium confidence', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
          low:    { label: 'Low confidence',     chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
        }[prov.confidence]
        return (
          <div
            className={clsx(
              'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-xs',
              prov.stale
                ? 'border-amber-500/30 bg-amber-500/5 text-amber-300/90'
                : 'border-slate-700/60 bg-slate-800/30 text-slate-400'
            )}
          >
            <span className="font-medium">
              {prov.stale ? '⚠ Withdrawal fees may be out of date' : 'Exchange withdrawal fees'}
            </span>
            <span className={clsx('px-1.5 py-0.5 rounded border text-[10px] font-semibold', confMeta.chip)}>
              {confMeta.label}
            </span>
            <span className="opacity-80">
              — {prov.source.toLowerCase()}, verified {new Date(TRANSFER_FEES_LAST_VERIFIED).toLocaleDateString()} ({transferFeesAgeDays()} days ago).
              Network gas is live; withdrawal fees are static estimates — always confirm on the exchange before sending.
            </span>
          </div>
        )
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left column: calculator */}
        <div className="space-y-5">
          {/* Coin selector */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 block">
              Coin
              {coinListData && (
                <span className="ml-2 text-slate-600 font-normal">
                  {coinListData.coins.length} coins from CoinGecko
                </span>
              )}
            </label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                {/* Color dot — from COIN_INFO or generic */}
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-2.5 rounded-full pointer-events-none z-10"
                  style={{ background: coinInfo?.color ?? '#6b7280' }}
                />
                <select
                  value={coinId}
                  onChange={e => {
                    const sym = e.target.value.toLowerCase()
                    setCoinId(sym)
                    // Set a sensible default amount
                    const info = COIN_INFO[sym as CoinId]
                    if (info) setAmount(String(info.defaultAmount))
                    else setAmount('100')
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 appearance-none"
                >
                  {coinListLoading && (
                    <option disabled>Loading coin list…</option>
                  )}
                  {/* Supported coins with fee data */}
                  {supportedCoins.length > 0 && (
                    <optgroup label="✓ Supported — fee data available">
                      {supportedCoins.map(c => (
                        <option key={c.id} value={c.symbol.toLowerCase()}>
                          {c.symbol} — {c.name} {c.rank ? `(#${c.rank})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {/* All other coins */}
                  {otherCoins.length > 0 && (
                    <optgroup label="Other coins (no withdrawal fee data)">
                      {otherCoins.map(c => (
                        <option key={c.id} value={c.symbol.toLowerCase()}>
                          {c.symbol} — {c.name} {c.rank ? `(#${c.rank})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {/* Fallback: no live data yet, show COIN_INFO coins */}
                  {!coinListLoading && dynamicCoins.length === 0 && (
                    <optgroup label="Supported coins">
                      {(Object.keys(COIN_INFO) as CoinId[]).map(id => {
                        const info = COIN_INFO[id]
                        return (
                          <option key={id} value={id}>
                            {info.symbol} — {info.name}
                          </option>
                        )
                      })}
                    </optgroup>
                  )}
                </select>
              </div>
              <span
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border"
                style={{
                  background: `${coinInfo?.color ?? '#6b7280'}18`,
                  borderColor: `${coinInfo?.color ?? '#6b7280'}40`,
                  color: coinInfo?.color ?? '#9ca3af',
                }}
              >
                {coinId.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 block">Amount</label>
            <div className="flex gap-3 items-center">
              <div className="relative flex-1 max-w-xs">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm font-mono focus:outline-none focus:border-blue-500/50 pr-16"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">
                  {coinId.toUpperCase()}
                </span>
              </div>
              {amountUsd > 0 && coinPriceUsd > 0 && (
                <span className="text-sm text-slate-400">
                  ≈ <span className="text-slate-300 font-medium">${amountUsd.toFixed(2)}</span>
                </span>
              )}
            </div>
          </div>

          {/* Route builder — multi-stop chain */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 block">Route</label>
            <div className="space-y-1">
              {stops.map((stopId, i) => {
                const isFirst = i === 0
                const isLast  = i === stops.length - 1
                const isVia   = !isFirst && !isLast
                return (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-slate-500 mb-1 block">
                          {isFirst ? 'From' : isLast ? 'To' : 'Via'}
                        </label>
                        <select
                          value={stopId}
                          onChange={e => updateStop(i, e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                        >
                          <option value={PERSONAL_WALLET_ID}>🔐 Personal Wallet</option>
                          {EXCHANGES.map(ex => (
                            <option key={ex.id} value={ex.id}>{ex.name}</option>
                          ))}
                        </select>
                      </div>
                      {isVia && (
                        <button
                          onClick={() => removeStop(i)}
                          className="mt-5 p-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-500 hover:text-red-400 hover:border-red-500/30 transition-colors flex-shrink-0"
                          title="Remove this stop"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    {/* Add stop connector */}
                    {!isLast && (
                      <div className="flex items-center gap-2 my-1 pl-1">
                        <div className="w-px h-3 bg-slate-700 ml-3 flex-shrink-0" />
                        <button
                          onClick={() => addStop(i)}
                          className="text-[10px] text-slate-600 hover:text-blue-400 flex items-center gap-1 transition-colors py-0.5"
                        >
                          <Plus size={9} /> Add destination
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Live fee status bar */}
          {data && (
            <div className="flex items-center gap-3 text-[10px] text-slate-500 bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className={clsx('size-1.5 rounded-full', data.btcFeeSource === 'live' ? 'bg-emerald-400' : 'bg-amber-400')} />
                <span>BTC: {data.btcFeeSource === 'live' ? 'live (mempool.space)' : 'estimated'}</span>
              </div>
              <span className="text-slate-600">·</span>
              <span>Other networks: estimated (price-adjusted)</span>
              {isError && <span className="text-red-400 ml-auto">Fee data unavailable — using static estimates</span>}
            </div>
          )}

          {/* No fee data for this coin */}
          {!isSupportedCoin && coinId && (
            <div className="rounded-xl border border-slate-600/50 bg-slate-800/30 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Info size={14} className="text-blue-400 flex-shrink-0" />
                <p className="text-sm font-semibold text-slate-200">
                  No exchange withdrawal data for {coinId.toUpperCase()}
                  {liveCoin && ` (${liveCoin.name})`}
                </p>
              </div>
              {liveCoin && (
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>Rank: <span className="text-slate-200 font-medium">#{liveCoin.rank}</span></span>
                  <span>Price: <span className="text-slate-200 font-medium">${liveCoin.price.toLocaleString(undefined, { maximumSignificantDigits: 6 })}</span></span>
                  <span>Market cap: <span className="text-slate-200 font-medium">${(liveCoin.marketCap / 1e6).toFixed(1)}M</span></span>
                </div>
              )}
              <p className="text-xs text-slate-500 leading-relaxed">
                Withdrawal fee data is only available for the {Object.keys(COIN_INFO).length} coins our exchange database tracks.
                For {coinId.toUpperCase()}, check the fee schedule directly on your exchange.
              </p>
              <div className="text-[11px] text-slate-600">
                Supported coins: {(Object.keys(COIN_INFO) as CoinId[]).map(id => COIN_INFO[id].symbol).join(', ')}
              </div>
            </div>
          )}

          {/* Results */}
          {isSupportedCoin && hasAdjacentDuplicate ? (
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 text-center">
              <p className="text-sm text-slate-500">Two consecutive stops cannot be the same exchange.</p>
            </div>
          ) : isSupportedCoin && numAmount <= 0 ? (
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 text-center">
              <p className="text-sm text-slate-500">Enter an amount to see transfer options.</p>
            </div>
          ) : isSupportedCoin && isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-500">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Fetching live fee data…</span>
            </div>
          ) : isSupportedCoin && segmentPaths.length === 0 ? (
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 text-center">
              <p className="text-sm text-slate-500">Select a source and destination to see routes.</p>
            </div>
          ) : isSupportedCoin ? (
            <div className="space-y-5">
              {/* When the withdrawal-fee table is stale, degrade the "cheapest route"
                  claim rather than presenting the ranking as authoritative. */}
              {transferFeesAreStale() && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/90">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>
                    Withdrawal fees were last verified {transferFeesAgeDays()} days ago. The
                    &ldquo;Best&rdquo; ranking below is indicative only — confirm the actual withdrawal
                    fee on each exchange before relying on the cheapest-route result.
                  </span>
                </div>
              )}

              {/* Multi-leg cumulative summary */}
              {stops.length > 2 && (
                <div className="flex items-center justify-between rounded-lg bg-blue-500/8 border border-blue-500/20 px-3 py-2.5">
                  <span className="text-xs text-blue-300 font-medium flex items-center gap-1.5">
                    <Zap size={11} />
                    {stops.length - 1}-leg route · cumulative best cost
                    {legsWithoutViablePath > 0 && (
                      <span className="text-amber-400 font-normal">
                        · incomplete — {legsWithoutViablePath} leg{legsWithoutViablePath > 1 ? 's have' : ' has'} no viable route
                      </span>
                    )}
                  </span>
                  <span className={clsx('font-mono text-sm font-bold', legsWithoutViablePath > 0 ? 'text-amber-400' : 'text-blue-400')}>
                    {legsWithoutViablePath > 0 ? `≥ $${cumulativeBestFee.toFixed(2)}` : `$${cumulativeBestFee.toFixed(2)}`}
                  </span>
                </div>
              )}

              {/* Per-leg results */}
              {segmentPaths.map((segPaths, i) => {
                const from = stops[i]
                const to   = stops[i + 1]
                const fromName = from === PERSONAL_WALLET_ID ? 'Personal Wallet' : EXCHANGES.find(e => e.id === from)?.name ?? from
                const toName   = to   === PERSONAL_WALLET_ID ? 'Personal Wallet' : EXCHANGES.find(e => e.id === to)?.name   ?? to
                const viable    = segPaths.filter(p => p.isViable && p.type !== 'no-path')
                const nonViable = segPaths.filter(p => !p.isViable && p.type !== 'no-path')
                const noPath    = segPaths.filter(p => p.type === 'no-path')

                return (
                  <div key={`${from}-${to}-${i}`} className="space-y-3">
                    {/* Leg header (multi-stop only) */}
                    {stops.length > 2 && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Leg {i + 1}</span>
                        <span className="text-xs text-slate-400">{fromName}</span>
                        <ArrowRight size={10} className="text-slate-600 flex-shrink-0" />
                        <span className="text-xs text-slate-400">{toName}</span>
                      </div>
                    )}

                    {/* Results header */}
                    {stops.length === 2 && (
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-slate-200">
                          Transfer routes
                          <span className="ml-2 text-slate-500 font-normal text-xs">
                            {viable.length} viable · {nonViable.length} blocked
                          </span>
                        </h2>
                        {viable.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                            <Zap size={11} />
                            <span>Best: ${viable[0]?.totalFeeUsd.toFixed(2)} via {viable[0]?.networkId && NETWORKS[viable[0].networkId]?.shortName}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {noPath.map((p, j) => <PathCard key={j} path={p} coinId={coinId} amount={numAmount} coinPrices={coinPrices} />)}

                    {viable.length > 0 && (
                      <div className="space-y-2">
                        {viable.map(p => <PathCard key={p.id} path={p} coinId={coinId} amount={numAmount} coinPrices={coinPrices} />)}
                      </div>
                    )}

                    {nonViable.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Blocked routes (amount too low)</p>
                        {nonViable.map(p => <PathCard key={p.id} path={p} coinId={coinId} amount={numAmount} coinPrices={coinPrices} />)}
                      </div>
                    )}

                    {stops.length > 2 && i < segmentPaths.length - 1 && (
                      <div className="border-b border-slate-700/40 pt-1" />
                    )}
                  </div>
                )
              })}

              <p className="text-[10px] text-slate-600 leading-relaxed">
                Exchange withdrawal fees are approximate and may differ from current rates.
                Always verify on the exchange fee schedule before initiating a transfer.
                Network gas fees are estimates based on typical token-transfer transactions.
              </p>
            </div>
          ) : null}
        </div>

        {/* Right column: safety + explainer */}
        <div className="space-y-4">
          <SafetyPanel />
          <WrongNetworkExplainer />

          {/* Quick fee reference table */}
          {data && (
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign size={13} className="text-slate-400" />
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Current network gas</h3>
              </div>
              <div className="space-y-1.5">
                {(Object.entries(data.networkFees) as [string, { feeUsd: number; nativeToken: string; source: string }][])
                  .sort(([, a], [, b]) => a.feeUsd - b.feeUsd)
                  .map(([netId, fee]) => {
                    const net = NETWORKS[netId as keyof typeof NETWORKS]
                    if (!net) return null
                    return (
                      <div key={netId} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="size-1.5 rounded-full" style={{ background: net.color }} />
                          <span className="text-slate-400">{net.shortName}</span>
                          {net.isL2 && <span className="text-[9px] text-blue-400 border border-blue-400/30 rounded px-1">L2</span>}
                        </div>
                        <span className="font-mono text-slate-300">~${fee.feeUsd.toFixed(3)}</span>
                      </div>
                    )
                  })}
              </div>
              <p className="mt-2 text-[9px] text-slate-600">Gas for a typical token transfer. Prices update every 10 min.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
