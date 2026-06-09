'use client'
import { useState } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { FloatingChat } from '@/components/chat/floating-chat'
import { AlertTriangle } from 'lucide-react'

interface DashboardShellProps {
  children: React.ReactNode
  pendingApproval: boolean
}

export function DashboardShell({ children, pendingApproval }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <main className="md:pl-64 pt-16 min-h-screen">
        {pendingApproval && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <span>
              Ο λογαριασμός του γραφείου σας αναμένει έγκριση από την ομάδα της I-MENTOR. Έχετε πλήρη πρόσβαση στο portal,
              αλλά η αναζήτηση/εισαγωγή επιχειρήσεων μέσω ΑΑΔΕ θα ενεργοποιηθεί μόλις εγκριθεί ο λογαριασμός σας.
            </span>
          </div>
        )}
        <div className="p-4 md:p-6">{children}</div>
      </main>
      <FloatingChat />
    </div>
  )
}
