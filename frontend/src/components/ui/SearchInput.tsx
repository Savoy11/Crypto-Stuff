'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useRouter } from 'next/navigation'
import { useAssetSearch } from '@/hooks/useAssets'
import type { Asset } from '@/types/asset'
import { formatCompact } from '@/lib/utils/format'
import { getRiskTailwindClasses } from '@/lib/utils/risk'

interface SearchInputProps {
  className?: string
  placeholder?: string
  onSelect?: (asset: Asset) => void
}

export function SearchInput({ className, placeholder = 'Search assets...', onSelect }: SearchInputProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { data: results, isFetching } = useAssetSearch(query)

  const handleSelect = useCallback(
    (asset: Asset) => {
      setQuery('')
      setIsOpen(false)
      if (onSelect) {
        onSelect(asset)
      } else {
        router.push(`/assets/${asset.id}`)
      }
    },
    [router, onSelect]
  )

  const handleClear = useCallback(() => {
    setQuery('')
    setIsOpen(false)
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setIsOpen(query.length >= 2 && !!(results?.length))
  }, [query, results])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={clsx('relative', className)}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-9 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue/60 focus:ring-1 focus:ring-accent-blue/30 transition-colors"
          aria-label="Search assets"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          role="combobox"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isFetching ? (
            <Loader2 size={14} className="text-text-muted animate-spin" aria-hidden />
          ) : query ? (
            <button onClick={handleClear} className="text-text-muted hover:text-text-secondary" aria-label="Clear search">
              <X size={14} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {isOpen && results && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded shadow-card-hover z-50 overflow-hidden animate-fade-in"
          role="listbox"
          aria-label="Search results"
        >
          {results.map((asset) => {
            const riskClasses = getRiskTailwindClasses(asset.riskBand)
            return (
              <button
                key={asset.id}
                role="option"
                aria-selected="false"
                onClick={() => handleSelect(asset)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-bg-elevated transition-colors text-left border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-sm text-text-primary w-14">{asset.symbol}</span>
                  <span className="text-xs text-text-secondary truncate max-w-32">{asset.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted font-mono">{formatCompact(asset.marketCap)}</span>
                  <span className={clsx('text-xs px-1.5 py-0.5 rounded font-mono', riskClasses.badge)}>
                    {asset.riskScore.toFixed(1)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
