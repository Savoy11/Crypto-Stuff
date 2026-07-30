import { notFound } from 'next/navigation'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { getRatesEntry } from '@/lib/data/ratesCatalog'
import { RatesDetailClient } from './RatesDetailClient'

export default async function RatesDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  // Next 15: route params are a Promise. See the note in the Next 15 commit.
  const { slug } = await params
  const entry = getRatesEntry(slug)
  if (!entry) notFound()

  return (
    <ModuleGate module="macro">
      <RatesDetailClient slug={slug} />
    </ModuleGate>
  )
}
