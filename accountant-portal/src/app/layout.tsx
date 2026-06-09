import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin', 'greek'] })

export const metadata: Metadata = {
  title: 'I-MENTOR Portal',
  description: 'Accountant-Powered Business Opportunity Platform',
  icons: {
    icon: [
      { url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="%234f46e5"/><text y="24" x="4" font-size="22" font-family="Arial" font-weight="bold" fill="white">iM</text></svg>', type: 'image/svg+xml' },
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
