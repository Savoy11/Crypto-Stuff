// Static news taxonomy — the fixed set of sentiment and category labels used by
// the live news feed and its filters. Reference data, not fabricated content.
// Live articles are fetched and classified in /live-data/news.

export type NewsSentiment = 'positive' | 'neutral' | 'negative'
export type NewsCategory = 'regulation' | 'market' | 'protocol' | 'security' | 'adoption' | 'macro' | 'global'

export interface NewsArticle {
  id: string
  headline: string
  summary: string
  source: string
  publishedAt: string
  url: string
  sentiment: NewsSentiment
  category: NewsCategory
  relatedAssets: string[]
  isBreaking?: boolean
}

export const NEWS_CATEGORIES: { value: NewsCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'regulation', label: 'Regulation' },
  { value: 'market', label: 'Market' },
  { value: 'protocol', label: 'Protocol' },
  { value: 'security', label: 'Security' },
  { value: 'adoption', label: 'Adoption' },
  { value: 'macro', label: 'Macro' },
  { value: 'global', label: 'Global' },
]
