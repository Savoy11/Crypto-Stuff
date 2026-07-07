import { ModuleGate } from '@/components/layout/ModuleGate'
import { FundsClient } from './FundsClient'

export default function FundsPage() {
  return (
    <ModuleGate module="funds">
      <FundsClient />
    </ModuleGate>
  )
}
