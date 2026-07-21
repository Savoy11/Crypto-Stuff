import { notFound } from 'next/navigation'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { getRatesEntry } from '@/lib/data/ratesCatalog'
import { RatesDetailClient } from './RatesDetailClient'

export default function RatesDetailPage({ params }: { params: { slug: string } }) {
  const entry = getRatesEntry(params.slug)
  if (!entry) notFound()

  return (
    <ModuleGate module="macro">
      <RatesDetailClient slug={params.slug} />
    </ModuleGate>
  )
}
