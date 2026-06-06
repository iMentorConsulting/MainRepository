'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Building2,
  Target,
  Zap,
  Megaphone,
  MessageSquare,
  CreditCard,
  Percent,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { useState } from 'react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { href: '/accountants', label: 'Λογιστές', icon: Users, adminOnly: true },
  { href: '/businesses', label: 'Επιχειρήσεις', icon: Building2, adminOnly: false },
  { href: '/programs', label: 'Προγράμματα', icon: Target, adminOnly: false },
  { href: '/matches', label: 'Matches', icon: Zap, adminOnly: false },
  { href: '/campaigns', label: 'Καμπάνιες', icon: Megaphone, adminOnly: false },
  { href: '/requests', label: 'Αιτήματα', icon: MessageSquare, adminOnly: false },
  { href: '/payments', label: 'Πληρωμές', icon: CreditCard, adminOnly: false },
  { href: '/commissions', label: 'Προμήθειες', icon: Percent, adminOnly: false },
  { href: '/reports', label: 'Αναφορές', icon: BarChart3, adminOnly: false },
  { href: '/settings', label: 'Ρυθμίσεις', icon: Settings, adminOnly: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [collapsed, setCollapsed] = useState(false)
  const isAdmin = session?.user?.role === 'ADMIN'

  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin)

  return (
    <aside className={cn(
      'flex flex-col h-full bg-blue-900 text-white transition-all duration-300',
      collapsed ? 'w-16' : 'w-64'
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-blue-800">
        {!collapsed && (
          <div>
            <div className="font-bold text-lg text-white">I-MENTOR</div>
            <div className="text-xs text-blue-300">Portal</div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-blue-800 transition-colors ml-auto"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map(item => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:bg-blue-800 hover:text-white'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User info & logout */}
      <div className="px-2 py-4 border-t border-blue-800">
        {!collapsed && (
          <div className="px-3 py-2 mb-2">
            <div className="text-sm font-medium text-white truncate">{session?.user?.name}</div>
            <div className="text-xs text-blue-300">
              {isAdmin ? 'Διαχειριστής' : 'Λογιστής'}
            </div>
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200 hover:bg-blue-800 hover:text-white transition-colors w-full"
          title={collapsed ? 'Αποσύνδεση' : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>Αποσύνδεση</span>}
        </button>
      </div>
    </aside>
  )
}
