'use client'

import { ModuleGate } from '@/components/layout/ModuleGate'
import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { AlertTriangle, ChevronDown, ChevronRight, Shield } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { formatCompact, formatCurrency, formatPercent } from '@/lib/utils/format'
import { STALE_TIME_LONG } from '@/lib/constants'
import type { RiskBand } from '@/lib/risk/types'
import type { RiskScoresResponse, ScoredAsset } from '@/app/live-data/risk-scores/route'

// Composite risk leaderboard — live-computed by /live-data/risk-scores from
// DefiLlama, one batched CoinGecko call, curated issuer disclosures, and the
// news pipeline. Two profiles: stablecoin (Reserve/Peg/Structure/Adoption/
// News + fatal-flaw override) and major-asset (Vol/Liquidity/Scale/Trend/News).

const BAND_STYLE: Record<RiskBand, { label: string; text: string; chip: string }> = {
  low:      { label: 'Low Risk',  text: 'text-emerald-400', chip: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  moderate: { label: 'Moderate',  text: 'text-blue-400',    chip: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  elevated: { label: 'Elevated',  text: 'text-amber-400',   chip: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  high:     { label: 'High Risk', text: 'text-orange-400',  chip: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  critical: { label: 'Critical',  text: 'text-red-400',     chip: 'text-red-400 bg-red-400/10 border-red-500/20' },
}
const BAND_ORDER: RiskBand[] = ['low', 'moderate', 'elevated', 'high', 'critical']

function scoreColor(score: number | null): string {
  if (score == null) return 'text-text-muted'
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-blue-400'
  if (score >= 40) return 'text-amber-400'
  if (score >= 20) return 'text-orange-400'
  return 'text-red-400'
}

function ScoreCell({ score }: { score: number | null }) {
  return (
    <span className={clsx('font-mono text-xs tabular-nums', scoreColor(score))} title={score == null ? 'No data — excluded from composite' : undefined}>
      {score == null ? '—' : Math.round(score)}
    </span>
  )
}

// ─── Leaderboard table (one per profile) ─────────────────────────────────────

function RiskTable({ title, note, assets, pillarKeys }: {
  title: string
  note: string
  assets: ScoredAsset[]
  pillarKeys: Array<{ key: string; label: string }>
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="rounded-card border border-border bg-bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-medium text-text-secondary">{title}</h2>
        <p className="mt-0.5 text-[11px] text-text-muted">{note}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-text-muted border-b border-border">
              <th className="py-2 pl-4 pr-2 font-medium w-8">#</th>
              <th className="py-2 pr-3 font-medium">Asset</th>
              <th className="py-2 pr-3 font-medium text-right">Composite</th>
              <th className="py-2 pr-3 font-medium">Band</th>
              {pillarKeys.map((p) => (
                <th key={p.key} className="py-2 pr-3 font-medium text-right">{p.label}</th>
              ))}
              <th className="py-2 pr-4 font-medium text-right">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset, i) => {
              const style = BAND_STYLE[asset.risk.band]
              const isOpen = expanded === asset.assetId
              const byKey = new Map(asset.risk.dimensions.map((d) => [d.key, d]))
              return (
                <Fragment key={asset.assetId}>
                  <tr
                    className="border-b border-border/40 last:border-0 hover:bg-bg-elevated/40 cursor-pointer transition-colors"
                    onClick={() => setExpanded(isOpen ? null : asset.assetId)}
                  >
                    <td className="py-2 pl-4 pr-2 font-mono text-xs text-text-muted">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {isOpen ? <ChevronDown size={12} className="text-text-muted flex-shrink-0" aria-hidden /> : <ChevronRight size={12} className="text-text-muted flex-shrink-0" aria-hidden />}
                        <span className="font-mono font-semibold text-text-primary">{asset.symbol}</span>
                        <span className="text-xs text-text-muted truncate">{asset.name}</span>
                        {asset.risk.slashed.length > 0 && (
                          <AlertTriangle size={12} className="text-red-400 flex-shrink-0" aria-label="Fatal-flaw override applied" />
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className={clsx('font-mono font-bold tabular-nums', style.text)}>{asset.risk.score.toFixed(0)}</span>
                      {asset.risk.slashed.length > 0 && (
                        <span className="ml-1 font-mono text-[10px] text-text-muted line-through">{asset.risk.baseScore.toFixed(0)}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap', style.chip)}>{style.label}</span>
                    </td>
                    {pillarKeys.map((p) => (
                      <td key={p.key} className="py-2 pr-3 text-right">
                        <ScoreCell score={byKey.get(p.key)?.score ?? null} />
                      </td>
                    ))}
                    <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums text-text-secondary">
                      {(asset.risk.confidence * 100).toFixed(0)}%
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="border-b border-border/40 bg-bg-elevated/20">
                      <td colSpan={6 + pillarKeys.length} className="px-6 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                          {asset.risk.dimensions.map((dim) => (
                            <div key={dim.key} className="rounded border border-border/60 bg-bg-card px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-text-secondary">{dim.label}</span>
                                <span className="text-[10px] text-text-muted font-mono">w {(dim.weight * 100).toFixed(0)}%</span>
                              </div>
                              <p className={clsx('mt-1 font-mono text-lg font-bold tabular-nums', scoreColor(dim.score))}>
                                {dim.score == null ? 'N/A' : dim.score.toFixed(0)}
                              </p>
                              <ul className="mt-1 space-y-0.5">
                                {dim.evidence.map((ev, j) => (
                                  <li key={j} className="text-[11px] text-text-muted leading-snug">
                                    <span className="text-text-secondary">{ev.metric}:</span>{' '}
                                    {ev.value == null ? '—' : String(ev.value)}
                                    {ev.note && <span className="text-text-muted/80"> · {ev.note}</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                        {(asset.risk.slashed.length > 0 || asset.risk.warnings.length > 0) && (
                          <ul className="mt-3 space-y-1">
                            {asset.risk.slashed.map((s, j) => (
                              <li key={`s${j}`} className="flex items-start gap-1.5 text-[11px] text-red-400">
                                <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" aria-hidden />
                                {s.reason} — composite slashed ×{s.multiplier}
                              </li>
                            ))}
                            {asset.risk.warnings.filter((w) => !w.startsWith('Fatal flaw')).map((w, j) => (
                              <li key={`w${j}`} className="text-[11px] text-text-muted">· {w}</li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-2 text-[10px] text-text-muted/80">
                          Coverage {(asset.risk.coverage * 100).toFixed(0)}% of profile weight scored ·
                          {' '}{asset.price != null && <>price {formatCurrency(asset.price)} · </>}
                          {asset.marketCap != null && <>market cap {formatCompact(asset.marketCap)} · </>}
                          {asset.change24h != null && <>24h {formatPercent(asset.change24h, 2)} · </>}
                          profile v{asset.risk.profileVersion}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {assets.length === 0 && (
              <tr><td colSpan={6 + pillarKeys.length} className="px-4 py-8 text-center text-sm text-text-muted">No assets could be scored — data sources unreachable.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function RiskScoresPageInner() {
  const { data, isLoading } = useQuery<RiskScoresResponse>({
    queryKey: ['risk-scores'],
    queryFn: () => fetch('/live-data/risk-scores').then((r) => r.json()),
    staleTime: STALE_TIME_LONG,
    refetchInterval: 1000 * 60 * 10,
  })

  const all = [...(data?.stablecoins ?? []), ...(data?.majors ?? [])]
  const bandCounts = BAND_ORDER.map((band) => ({ band, count: all.filter((a) => a.risk.band === band).length }))

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-accent-blue flex-shrink-0" aria-hidden />
        <PageHeader
          title="Safety Score Leaderboard"
          subtitle="Composite safety (0–100, higher = safer) computed live — weighted pillars, fatal-flaw overrides, full audit trail"
          description="Every score is composed from observable data: DefiLlama reserves and peg mechanisms, a batched CoinGecko market snapshot (7-day sparkline volatility, liquidity, scale), curated issuer disclosures, and Finance Now's news sentiment pipeline. Scores run 0–100 — higher is safer. Stablecoins additionally pass through a fatal-flaw override: when Reserve, Structure, or Peg falls below its critical threshold, the composite is slashed multiplicatively, because a collapsing reserve cannot be averaged away by good sentiment."
          details={[
            { label: 'Score bands', text: 'Low risk (80–100) · Moderate (60–79) · Elevated (40–59) · High (20–39) · Critical (0–19).' },
            { label: 'Data honesty', text: 'Pillars without data show N/A and are excluded — the composite reweights and Confidence/Coverage drop. Nothing is fabricated. Curated disclosure snapshots score at reduced confidence.' },
            { label: 'Not scored', text: 'Wallet-concentration / decentralization metrics need paid indexers, so no pillar approximates them. They join as a real dimension when a source lands.' },
          ]}
        />
      </div>

      {/* Data provenance */}
      <SourceLine id="risk-scores" />

      {data && !data.ok && (
        <div className="rounded border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
          <p className="text-xs text-text-muted">
            <span className="font-medium text-amber-400">Scoring unavailable</span> — {data.error}
          </p>
        </div>
      )}

      {/* Band summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {bandCounts.map(({ band, count }) => {
          const style = BAND_STYLE[band]
          return (
            <div key={band} className="rounded-card border border-border bg-bg-card px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">{style.label}</p>
              <p className={clsx('mt-0.5 font-mono text-2xl font-bold tabular-nums', style.text)}>
                {isLoading ? '—' : count}
              </p>
              <p className="text-[10px] text-text-muted">assets</p>
            </div>
          )
        })}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="h-64 animate-pulse rounded-card bg-bg-elevated/60" />
          <div className="h-64 animate-pulse rounded-card bg-bg-elevated/60" />
        </div>
      ) : (
        <>
          <RiskTable
            title="Stablecoins — 5-Pillar Composite"
            note="Reserve 30% · Peg 25% · Structure 20% · Adoption 15% · News 10% — with fatal-flaw slashing. Click a row for the full audit trail."
            assets={data?.stablecoins ?? []}
            pillarKeys={[
              { key: 'reserve', label: 'Reserve' },
              { key: 'peg', label: 'Peg' },
              { key: 'structure', label: 'Structure' },
              { key: 'adoption', label: 'Adoption' },
              { key: 'news', label: 'News' },
            ]}
          />
          <RiskTable
            title="Major Assets — Market Composite"
            note="Volatility 30% · Liquidity 25% · Scale 25% · 30d Trend 10% · News 10%. Click a row for the full audit trail."
            assets={data?.majors ?? []}
            pillarKeys={[
              { key: 'volatility', label: 'Vol' },
              { key: 'liquidity', label: 'Liquidity' },
              { key: 'scale', label: 'Scale' },
              { key: 'trend', label: 'Trend' },
              { key: 'news', label: 'News' },
            ]}
          />
        </>
      )}

      <p className="text-[11px] text-text-muted text-center">
        Sources: DefiLlama {data?.sources.defillama ? '✓' : '✗'} · CoinGecko {data?.sources.coingecko ? '✓' : '✗'} · News pipeline {data?.sources.news ? '✓' : '✗'}
        {' '}· curated issuer disclosures as of {data?.metaAsOf ?? '—'} · profiles v{data?.profileVersions.stablecoin ?? '—'} / v{data?.profileVersions.cryptoAsset ?? '—'}
        {' '}· safety scores are analytics, not investment advice
      </p>
    </div>
  )
}

// Entitlement gate. Wrapping here rather than inside RiskScoresPageInner's JSX is
// deliberate: a disabled module must not mount the component at all, so its
// queries and stores never run for a user who cannot see the results.
export default function RiskScoresPage() {
  return (
    <ModuleGate module="crypto">
      <RiskScoresPageInner />
    </ModuleGate>
  )
}
