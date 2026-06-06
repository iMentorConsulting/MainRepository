import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-20" />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl"
          style={{background: 'rgba(0,212,255,0.03)'}} />
        <div className="absolute bottom-1/4 left-1/3 w-80 h-80 rounded-full blur-3xl"
          style={{background: 'rgba(139,92,246,0.03)'}} />
      </div>

      <Sidebar />
      <Header />
      <main className="pl-64 pt-16 min-h-screen">
        <div className="p-6 relative z-10">
          {children}
        </div>
      </main>
    </div>
  )
}
