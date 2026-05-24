'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Copy, CheckCircle } from 'lucide-react'
import { useState } from 'react'
import type { Asset } from '@/types/asset'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { RiskScoreBadge, RiskBandPill } from './RiskScoreBadge'
import { formatCompact, formatBps, formatPercent, formatScore, formatAddress } from '@/lib/utils/format'
import { getPegDeviationColorClass } from '@/lib/utils/risk'
import { useAssetStore } from '@/store/useAssetStore'
import { clsx } from 'clsx'
import { ASSET_TYPE_LABELS, BLOCKCHAIN_LABELS, PAGE_SIZE_OPTIONS } from '@/lib/constants'

interface AssetTableProps {
  assets: Asset[]
  loading?: boolean
  total?: number
}

function AddressCopy({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [address])
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs text-text-muted">{formatAddress(address)}</span>
      <button
        onClick={handleCopy}
        className="text-text-muted hover:text-text-secondary transition-colors"
        aria-label={`Copy address ${address}`}
      >
        {copied ? <CheckCircle size={11} className="text-emerald-400" /> : <Copy size={11} />}
      </button>
    </div>
  )
}

export function AssetTable({ assets, loading, total }: AssetTableProps) {
  const router = useRouter()
  const { sort, setSort, page, pageSize, setPage, setPageSize } = useAssetStore()
  const totalPages = total ? Math.ceil(total / pageSize) : 1

  const handleSort = useCallback(
    (key: string) => {
      setSort({
        key: key as keyof Asset,
        direction: sort.key === key && sort.direction === 'desc' ? 'asc' : 'desc',
      })
    },
    [sort, setSort]
  )

  const columns = useMemo(
    (): Column<Asset>[] => [
      {
        key: 'symbol',
        header: 'Asset',
        sortable: true,
        accessor: (row) => (
          <div className="flex items-center gap-2">
            <div>
              <div className="font-mono font-bold text-sm text-text-primary">{row.symbol}</div>
              <div className="text-xs text-text-muted truncate max-w-28">{row.name}</div>
            </div>
            {!row.isActive && (
              <span className="px-1 py-0.5 text-[9px] rounded bg-slate-500/10 text-slate-500 border border-slate-600/30 font-mono uppercase">
                Off
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'assetType',
        header: 'Type',
        sortable: true,
        accessor: (row) => (
          <span className="text-xs text-text-muted font-mono capitalize">
            {ASSET_TYPE_LABELS[row.assetType] ?? row.assetType}
          </span>
        ),
      },
      {
        key: 'blockchain',
        header: 'Chain',
        sortable: true,
        accessor: (row) => (
          <span className="text-xs text-text-muted font-mono capitalize">
            {BLOCKCHAIN_LABELS[row.blockchain] ?? row.blockchain}
          </span>
        ),
      },
      {
        key: 'riskScore',
        header: 'Risk Score',
        sortable: true,
        align: 'right',
        accessor: (row) => <RiskScoreBadge score={row.riskScore} band={row.riskBand} />,
      },
      {
        key: 'riskBand',
        header: 'Risk Band',
        sortable: true,
        accessor: (row) => <RiskBandPill band={row.riskBand} />,
      },
      {
        key: 'pegDeviationBps',
        header: 'Peg Dev',
        sortable: true,
        align: 'right',
        accessor: (row) => (
          <span className={clsx('font-mono text-xs', getPegDeviationColorClass(row.pegDeviationBps))}>
            {formatBps(row.pegDeviationBps)}
          </span>
        ),
      },
      {
        key: 'marketCap',
        header: 'Market Cap',
        sortable: true,
        align: 'right',
        accessor: (row) => (
          <span className="font-mono text-xs text-text-primary">{formatCompact(row.marketCap)}</span>
        ),
      },
      {
        key: 'volume24h',
        header: '24h Vol',
        sortable: true,
        align: 'right',
        accessor: (row) => (
          <span className="font-mono text-xs text-text-secondary">{formatCompact(row.volume24h)}</span>
        ),
      },
      {
        key: 'reserveRatio',
        header: 'Reserve',
        sortable: true,
        align: 'right',
        accessor: (row) => (
          <span
            className={clsx(
              'font-mono text-xs',
              row.reserveRatio >= 1 ? 'text-emerald-400' : 'text-red-400'
            )}
          >
            {(row.reserveRatio * 100).toFixed(1)}%
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        accessor: (row) => (
          <button
            onClick={(e) => {
              e.stopPropagation()
              router.push(`/assets/${row.id}`)
            }}
            className="p-1.5 rounded hover:bg-bg-elevated text-text-muted hover:text-accent-blue transition-colors"
            aria-label={`View details for ${row.symbol}`}
          >
            <ExternalLink size={13} aria-hidden />
          </button>
        ),
      },
    ],
    [router]
  )

  return (
    <div className="flex flex-col gap-0">
      <DataTable
        columns={columns}
        data={assets}
        loading={loading}
        onRowClick={(row) => router.push(`/assets/${row.id}`)}
        sortKey={sort.key}
        sortDir={sort.direction}
        onSort={handleSort}
        rowKey={(row) => row.id}
        emptyMessage="No assets match the current filters"
        skeletonRows={pageSize}
      />

      {/* Pagination */}
      {total !== undefined && total > pageSize && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-bg-secondary border border-border rounded px-2 py-1 text-xs text-text-secondary focus:outline-none focus:border-accent-blue/60"
              aria-label="Rows per page"
            >
              {PAGE_SIZE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted font-mono">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-2 py-1 rounded text-xs border border-border text-text-secondary hover:text-text-primary hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                Prev
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(page - 2, totalPages - 4)) + i
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={clsx(
                      'size-7 rounded text-xs font-mono transition-colors',
                      p === page
                        ? 'bg-accent-blue/10 text-accent-blue border border-accent-blue/30'
                        : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'
                    )}
                    aria-current={p === page ? 'page' : undefined}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="px-2 py-1 rounded text-xs border border-border text-text-secondary hover:text-text-primary hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
