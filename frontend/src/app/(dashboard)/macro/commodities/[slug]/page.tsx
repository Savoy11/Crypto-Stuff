import { notFound } from 'next/navigation'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { getCommodity } from '@/lib/data/commodityCatalog'
import { CommodityDetailClient } from './CommodityDetailClient'

export default async function CommodityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  // Next 15: route params are a Promise. See the note in the Next 15 commit.
  const { slug } = await params
  const entry = getCommodity(slug)
  if (!entry) notFound()

  return (
    <ModuleGate module="macro">
      <CommodityDetailClient slug={slug} />
    </ModuleGate>
  )
}
