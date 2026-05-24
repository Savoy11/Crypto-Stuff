import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {children}
      </div>
    </div>
  )
}
