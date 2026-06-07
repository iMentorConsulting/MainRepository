import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <Header />
      <main className="pl-64 pt-16 min-h-screen">
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
