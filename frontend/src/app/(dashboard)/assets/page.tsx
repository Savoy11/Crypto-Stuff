import type { Metadata } from 'next'
import { AssetRegistryClient } from './AssetRegistryClient'

export const metadata: Metadata = { title: 'Asset Registry' }

export default function AssetsPage() {
  return <AssetRegistryClient />
}
