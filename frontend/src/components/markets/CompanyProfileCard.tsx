'use client'

import { useQuery } from '@tanstack/react-query'
import { Building2, ExternalLink } from 'lucide-react'
import { STALE_TIME_LONG } from '@/lib/constants'
import type { CompanyProfileResponse } from '@/app/live-data/company-profile/route'

// Registrant facts from SEC EDGAR (official SIC industry classification, HQ,
// incorporation, fiscal year end, listing) plus a Wikipedia background blurb.

export function CompanyProfileCard({ symbol, name }: { symbol: string; name: string }) {
  const { data, isLoading } = useQuery<CompanyProfileResponse>({
    queryKey: ['company-profile', symbol],
    queryFn: async () => {
      const params = new URLSearchParams({ symbol, name })
      const r = await fetch(`/live-data/company-profile?${params.toString()}`)
      const j: CompanyProfileResponse = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      return j
    },
    staleTime: STALE_TIME_LONG * 6,
    retry: 1,
  })

  const p = data?.profile
  if (!isLoading && !p) return null // profile unavailable — skip the card rather than showing an empty shell

  const rows: Array<{ label: string; value: string }> = p ? [
    { label: 'Industry (SIC)', value: p.sicDescription ?? '—' },
    { label: 'Headquarters', value: p.headquarters ?? '—' },
    { label: 'Incorporated', value: p.stateOfIncorporation ?? '—' },
    { label: 'Fiscal Year End', value: p.fiscalYearEnd ?? '—' },
    { label: 'Exchange', value: p.exchanges.length > 0 ? p.exchanges.join(', ') : '—' },
    ...(p.filerCategory ? [{ label: 'SEC Filer Category', value: p.filerCategory }] : []),
  ] : []

  return (
    <div className="rounded-card border border-border bg-bg-card p-4">
      <h2 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
        <Building2 size={14} className="text-text-muted" aria-hidden />
        Company Profile
      </h2>

      {isLoading && (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-5 rounded bg-bg-elevated animate-pulse" />
          ))}
        </div>
      )}

      {p && (
        <>
          <dl className="space-y-2.5">
            {rows.map(({ label, value }) => (
              <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="text-text-muted text-xs whitespace-nowrap">{label}</dt>
                <dd className="text-text-primary text-right text-xs">{value}</dd>
              </div>
            ))}
          </dl>

          {p.formerNames.length > 0 && (
            <p className="mt-3 text-[11px] text-text-muted">
              Formerly: {p.formerNames.map(f => `${f.name}${f.to ? ` (until ${f.to.slice(0, 4)})` : ''}`).join(' · ')}
            </p>
          )}

          {data?.wiki && (
            <div className="mt-3 pt-3 border-t border-border/60">
              <p className="text-xs text-text-secondary leading-relaxed">{data.wiki.extract}</p>
              {data.wiki.url && (
                <a
                  href={data.wiki.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-accent-blue/80 hover:text-accent-blue"
                >
                  Wikipedia <ExternalLink size={10} aria-hidden />
                </a>
              )}
            </div>
          )}

          <p className="mt-3 text-[11px] text-text-muted">Registrant data from SEC EDGAR</p>
        </>
      )}
    </div>
  )
}
