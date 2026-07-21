import { ModuleGate } from '@/components/layout/ModuleGate'
import { RatesClient } from './RatesClient'

export default function RatesPage() {
  return (
    <ModuleGate module="macro">
      <RatesClient />
    </ModuleGate>
  )
}
