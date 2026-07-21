import { ModuleGate } from '@/components/layout/ModuleGate'
import { MacroNewsClient } from './MacroNewsClient'

export default function MacroNewsPage() {
  return (
    <ModuleGate module="macro">
      <MacroNewsClient />
    </ModuleGate>
  )
}
