import { notFound } from 'next/navigation'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { getCommodity } from '@/lib/data/commodityCatalog'
import { CommodityDetailClient } from './CommodityDetailClient'

export default function CommodityDetailPage({ params }: { params: { slug: string } }) {
  const entry = getCommodity(params.slug)
  if (!entry) notFound()

  return (
    <ModuleGate module="macro">
      <CommodityDetailClient slug={params.slug} />
    </ModuleGate>
  )
}
