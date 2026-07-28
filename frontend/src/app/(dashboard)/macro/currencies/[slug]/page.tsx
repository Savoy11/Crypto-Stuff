import { notFound } from 'next/navigation'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { getCurrency } from '@/lib/data/currencyCatalog'
import { CurrencyDetailClient } from './CurrencyDetailClient'

export default async function CurrencyDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  // Next 15: route params are a Promise. See the note in the Next 15 commit.
  const { slug } = await params
  const entry = getCurrency(slug)
  if (!entry) notFound()

  return (
    <ModuleGate module="macro">
      <CurrencyDetailClient slug={slug} />
    </ModuleGate>
  )
}
