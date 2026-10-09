import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Party Rooms',
  description: 'Watch and listen together with friends'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
