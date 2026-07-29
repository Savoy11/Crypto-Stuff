import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { AssetRegistryClient } from './AssetRegistryClient'

export const metadata: Metadata = { title: 'Coins' }

export default function AssetsPage() {
  return (
    <ModuleGate module="crypto">
      {/* AssetRegistryClient reads `?tab=reserves` via useSearchParams so the
          retired /reserves URL can redirect straight to the Reserve Monitor
          tab. That opts the subtree into client-side rendering, which Next
          requires a Suspense boundary for — without one `next build` fails
          prerendering this route outright. */}
      <Suspense fallback={<div className="p-6 text-sm text-text-muted">Loading coins…</div>}>
        <AssetRegistryClient />
      </Suspense>
    </ModuleGate>
  )
}
