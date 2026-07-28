import type { Metadata } from 'next'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { AssetRegistryClient } from './AssetRegistryClient'

export const metadata: Metadata = { title: 'Coins' }

export default function AssetsPage() {
  return (
    <ModuleGate module="crypto">
      <AssetRegistryClient />
    </ModuleGate>
  )
}
