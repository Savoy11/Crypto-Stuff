import { ModuleGate } from '@/components/layout/ModuleGate'
import { CurrenciesClient } from './CurrenciesClient'

export default function CurrenciesPage() {
  return (
    <ModuleGate module="macro">
      <CurrenciesClient />
    </ModuleGate>
  )
}
