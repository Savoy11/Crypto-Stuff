import { notFound } from 'next/navigation'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { getCurrency } from '@/lib/data/currencyCatalog'
import { CurrencyDetailClient } from './CurrencyDetailClient'

export default function CurrencyDetailPage({ params }: { params: { slug: string } }) {
  const entry = getCurrency(params.slug)
  if (!entry) notFound()

  return (
    <ModuleGate module="macro">
      <CurrencyDetailClient slug={params.slug} />
    </ModuleGate>
  )
}
