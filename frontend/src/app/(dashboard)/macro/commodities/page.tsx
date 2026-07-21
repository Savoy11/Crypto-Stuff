import { ModuleGate } from '@/components/layout/ModuleGate'
import { CommoditiesClient } from './CommoditiesClient'

export default function CommoditiesPage() {
  return (
    <ModuleGate module="macro">
      <CommoditiesClient />
    </ModuleGate>
  )
}
