'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, Building2, Zap, Target, Send,
  CreditCard, Percent, Inbox, BarChart3, Settings, LogOut,
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false, color: '#00d4ff' },
  { href: '/accountants', label: 'Λογιστές', icon: Users, adminOnly: true, color: '#8b5cf6' },
  { href: '/businesses', label: 'Επιχειρήσεις', icon: Building2, adminOnly: false, color: '#10b981' },
  { href: '/programs', label: 'Προγράμματα', icon: Zap, adminOnly: false, color: '#f59e0b' },
  { href: '/matches', label: 'Matches', icon: Target, adminOnly: false, color: '#00d4ff' },
  { href: '/campaigns', label: 'Καμπάνιες', icon: Send, adminOnly: false, color: '#ec4899' },
  { href: '/payments', label: 'Πληρωμές', icon: CreditCard, adminOnly: false, color: '#10b981' },
  { href: '/commissions', label: 'Προμήθειες', icon: Percent, adminOnly: false, color: '#8b5cf6' },
  { href: '/requests', label: 'Αιτήματα', icon: Inbox, adminOnly: false, color: '#f59e0b' },
  { href: '/reports', label: 'Αναφορές', icon: BarChart3, adminOnly: false, color: '#00d4ff' },
  { href: '/settings', label: 'Ρυθμίσεις', icon: Settings, adminOnly: true, color: '#8892a4' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'

  const visible = navItems.filter(i => !i.adminOnly || isAdmin)

  return (
    <aside className="fixed left-0 top-0 h-full w-64 flex flex-col z-50"
      style={{
        background: 'linear-gradient(180deg, #070710 0%, #050508 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>

      {/* Top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)', opacity: 0.5}} />

      {/* Logo */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)', boxShadow: '0 0 20px rgba(0,212,255,0.4)'}}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary leading-tight">I-MENTOR</p>
            <p className="text-xs text-text-muted leading-tight">Portal</p>
          </div>
        </div>
      </div>

      {/* Role badge */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{background: isAdmin ? 'rgba(0,212,255,0.08)' : 'rgba(139,92,246,0.08)'}}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{
              background: isAdmin ? '#00d4ff' : '#8b5cf6',
              boxShadow: `0 0 6px ${isAdmin ? '#00d4ff' : '#8b5cf6'}`
            }} />
          <span className="text-xs font-medium" style={{color: isAdmin ? '#00d4ff' : '#8b5cf6'}}>
            {isAdmin ? 'Administrator' : 'Λογιστής'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {visible.map(item => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))

          return (
            <Link key={item.href} href={item.href}
              className={cn(
                'group flex items-center gap-3 py-2.5 rounded-xl text-sm transition-all duration-200 relative overflow-hidden',
                isActive ? 'text-white' : 'text-text-secondary hover:text-text-primary'
              )}
              style={isActive ? {
                background: `linear-gradient(90deg, ${item.color}15, transparent)`,
                borderLeft: `2px solid ${item.color}`,
                paddingLeft: '10px',
                paddingRight: '12px',
                boxShadow: `inset 0 0 20px ${item.color}08`,
              } : {
                borderLeft: '2px solid transparent',
                paddingLeft: '10px',
                paddingRight: '12px',
              }}
            >
              {/* Hover background */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl"
                style={{background: 'rgba(255,255,255,0.04)'}} />

              <Icon className="w-4 h-4 flex-shrink-0 relative z-10 transition-all duration-200"
                style={isActive ? {color: item.color, filter: `drop-shadow(0 0 6px ${item.color})`} : {}} />
              <span className="flex-1 font-medium relative z-10">{item.label}</span>
              {isActive && (
                <div className="w-1 h-1 rounded-full relative z-10 flex-shrink-0"
                  style={{background: item.color, boxShadow: `0 0 6px ${item.color}`}} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-2"
          style={{background: 'rgba(255,255,255,0.03)'}}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
            style={{background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)'}}>
            {session?.user?.name?.[0] || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-text-primary truncate">{session?.user?.name}</p>
            <p className="text-xs text-text-muted truncate">{session?.user?.email}</p>
          </div>
        </div>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-text-muted hover:text-red-400 transition-all duration-200 text-xs"
          style={{}}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Αποσύνδεση</span>
        </button>
      </div>

      {/* Bottom glow */}
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)', opacity: 0.2}} />
    </aside>
  )
}
