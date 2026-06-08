import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { FloatingChat } from '@/components/chat/floating-chat'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  let pendingApproval = false
  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    const accountant = await prisma.accountant.findUnique({ where: { id: session.user.accountantId }, select: { approved: true } })
    pendingApproval = !!accountant && !accountant.approved
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <Header />
      <main className="pl-64 pt-16 min-h-screen">
        {pendingApproval && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-6 py-3 flex items-center gap-2">
            <AlertTriangle size={16} className="flex-shrink-0" />
            <span>
              Ο λογαριασμός του γραφείου σας αναμένει έγκριση από την ομάδα της I-MENTOR. Έχετε πλήρη πρόσβαση στο portal,
              αλλά η αναζήτηση/εισαγωγή επιχειρήσεων μέσω ΑΑΔΕ θα ενεργοποιηθεί μόλις εγκριθεί ο λογαριασμός σας.
            </span>
          </div>
        )}
        <div className="p-6">{children}</div>
      </main>
      <FloatingChat />
    </div>
  )
}
