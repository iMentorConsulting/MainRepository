'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, Building2, Zap, Target, Send, CreditCard, Percent, Inbox, BarChart3, Settings, LogOut, Globe, Mail, Phone, TrendingUp, X, MessageSquare, ListChecks, FileText, BellRing } from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { href: '/accountants', label: 'Λογιστές', icon: Users, adminOnly: true },
  { href: '/businesses', label: 'Επιχειρήσεις', icon: Building2, adminOnly: false },
  { href: '/programs', label: 'Προγράμματα', icon: Zap, adminOnly: false },
  { href: '/matches', label: 'Matches', icon: Target, adminOnly: false },
  { href: '/notify-matches', label: 'Custom Ειδοποιήσεις', icon: BellRing, adminOnly: true },
  { href: '/criteria', label: 'Πρόσθετα Κριτήρια', icon: ListChecks, adminOnly: true },
  { href: '/templates', label: 'Πρότυπα Μηνυμάτων', icon: FileText, adminOnly: true },
  { href: '/campaigns', label: 'Καμπάνιες', icon: Send, adminOnly: false },
  { href: '/payments', label: 'Πληρωμές', icon: CreditCard, adminOnly: true },
  { href: '/commissions', label: 'Προμήθειες', icon: Percent, adminOnly: false },
  { href: '/reports', label: 'Αναφορές', icon: BarChart3, adminOnly: false },
  { href: '/requests', label: 'Αιτήματα', icon: Inbox, adminOnly: false },
  { href: '/chat', label: 'Επικοινωνία', icon: MessageSquare, adminOnly: false },
  { href: '/analytics', label: 'Αναλυτικά', icon: TrendingUp, adminOnly: true },
  { href: '/settings', label: 'Ρυθμίσεις', icon: Settings, adminOnly: false },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const accountantId = (session?.user as any)?.accountantId
  const visible = navItems.filter(i => !i.adminOnly || isAdmin)
  const officeHref = !isAdmin && accountantId ? `/accountants/${accountantId}` : null
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/logo')
      .then(r => r.json())
      .then(d => setLogoUrl(d.imentorLogoUrl || null))
      .catch(() => {})
  }, [])

  // Close sidebar on route change (mobile)
  useEffect(() => {
    onClose()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={cn(
        'fixed left-0 top-0 h-full w-64 bg-slate-900 border-r border-slate-800 flex flex-col z-50 shadow-xl',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}>
        {/* Brand accent bar at very top */}
        <div className="h-1 w-full flex-shrink-0" style={{background: 'linear-gradient(90deg, #4f46e5, #7c3aed, #4f46e5)'}} />

        {/* Logo */}
        <div className="px-5 pt-5 pb-5 border-b border-slate-800 relative">
          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="md:hidden absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            aria-label="Κλείσιμο μενού"
          >
            <X size={18} />
          </button>

          <Link href="/" className="block">
            <div className="flex items-center justify-center py-2 mb-4">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="I-MENTOR" className="max-h-24 w-auto object-contain drop-shadow-lg" />
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{background: 'linear-gradient(135deg, #4f46e5, #7c3aed)'}}>
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-2xl font-bold text-white tracking-tight">I-MENTOR</span>
                  </div>
                  <span className="text-[10px] text-slate-500 tracking-widest uppercase font-medium">Accountant Portal</span>
                </div>
              )}
            </div>
            {/* Contact info */}
            <div className="space-y-1.5 bg-slate-800/60 rounded-xl px-3 py-3">
              <a href="https://www.i-mentor.gr" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-indigo-300 transition-colors">
                <Globe className="w-3 h-3 flex-shrink-0 text-indigo-400" />
                www.i-mentor.gr
              </a>
              <a href="mailto:info@i-mentor.gr"
                className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-indigo-300 transition-colors">
                <Mail className="w-3 h-3 flex-shrink-0 text-indigo-400" />
                info@i-mentor.gr
              </a>
              <a href="tel:+302810363007"
                className="flex items-center gap-2 text-base font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
                <Phone className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                2810 363007
              </a>
            </div>
          </Link>
        </div>

        {/* Role badge */}
        <div className="px-4 pt-3 pb-1">
          <span className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
            isAdmin ? 'bg-indigo-500/20 text-indigo-300' : 'bg-violet-500/20 text-violet-300'
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', isAdmin ? 'bg-indigo-500' : 'bg-violet-500')} />
            {isAdmin ? 'Administrator' : 'Λογιστής'}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {visible.map(item => {
            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                )}>
                <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-indigo-300' : 'text-slate-500')} />
                {item.label}
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500" />}
              </Link>
            )
          })}
          {officeHref && (
            <Link href={officeHref}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                pathname === officeHref
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              )}>
              <Building2 className={cn('w-4 h-4 flex-shrink-0', pathname === officeHref ? 'text-indigo-300' : 'text-slate-500')} />
              Το Γραφείο μου
            </Link>
          )}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-800 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{background: 'linear-gradient(135deg, #4f46e5, #7c3aed)'}}>
              {session?.user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{session?.user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{session?.user?.email}</p>
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 text-xs font-medium">
            <LogOut className="w-3.5 h-3.5" />
            Αποσύνδεση
          </button>
          <div className="flex gap-3 px-3 pt-1 flex-wrap">
            <Link href="/security" className="text-[10px] text-slate-400 hover:text-slate-600">Ασφάλεια</Link>
            <Link href="/privacy" className="text-[10px] text-slate-400 hover:text-slate-600">Απόρρητο</Link>
            <Link href="/terms" className="text-[10px] text-slate-400 hover:text-slate-600">Όροι</Link>
          </div>
        </div>
      </aside>
    </>
  )
}
