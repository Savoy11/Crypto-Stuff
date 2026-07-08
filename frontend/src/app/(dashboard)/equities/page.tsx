import { ModuleGate } from '@/components/layout/ModuleGate'
import { EquitiesClient } from './EquitiesClient'

export default function EquitiesPage() {
  return (
    <ModuleGate module="equities">
      <EquitiesClient />
    </ModuleGate>
  )
}
