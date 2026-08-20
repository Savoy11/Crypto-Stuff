import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
// Import the Tailwind SOURCE, not a pre-compiled snapshot. Next's postcss
// pipeline (postcss.config.js) compiles it on every build, so new utility
// classes always ship. The old globals.compiled.css import froze the CSS at
// whenever `npm run css:build` last ran — the market-calendar grid rendered
// single-column because grid-cols-7 postdated the snapshot.
import './globals.css'
import { Providers } from './providers'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Finance Now — Multi-Asset Financial Analytics',
    template: '%s | Finance Now',
  },
  description:
    'Institutional-grade multi-asset analytics: crypto, equities, funds, and macro — risk scores, reserve transparency, and real-time alerts.',
  robots: 'noindex, nofollow',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <body className="bg-bg-primary text-text-primary font-sans antialiased min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
