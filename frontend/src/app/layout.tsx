import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.compiled.css'
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
