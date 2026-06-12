'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { Bell, Menu } from 'lucide-react'
import Link from 'next/link'

const breadcrumbMap: Record<string, string> = {
  '/': 'Dashboard', '/accountants': 'Λογιστές', '/businesses': 'Επιχειρήσεις',
  '/programs': 'Προγράμματα', '/matches': 'Matches', '/campaigns': 'Καμπάνιες',
  '/payments': 'Πληρωμές', '/commissions': 'Προμήθειες', '/requests': 'Αιτήματα', '/chat': 'Επικοινωνία',
  '/reports': 'Αναφορές', '/settings': 'Ρυθμίσεις', '/notify-matches': 'Custom Ειδοποιήσεις', '/audit-log': 'Καταγραφή Ενεργειών', '/invitations': 'Προσκλήσεις', '/cases': 'Υποθέσεις',
}

function NotificationBell() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchNotifications()
    const iv = setInterval(fetchNotifications, 60_000)
    return () => clearInterval(iv)
  }, [])

  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) setNotifications(await res.json())
    } catch {}
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const unread = notifications.filter(n => !n.read)

  async function markAllRead() {
    const ids = unread.map(n => n.id)
    if (!ids.length) return
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); if (!open && unread.length) markAllRead() }}
        className="relative p-2 rounded-lg hover:bg-slate-200 transition-colors"
        aria-label="Ειδοποιήσεις"
      >
        <Bell size={18} className="text-slate-600" />
        {unread.length > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 max-w-[calc(100vw-1rem)] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">Ειδοποιήσεις</span>
            {notifications.length > 0 && (
              <button onClick={markAllRead} className="text-xs text-indigo-600 hover:underline">
                Σήμανση όλων ως αναγνωσμένα
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">Δεν υπάρχουν ειδοποιήσεις</div>
            ) : notifications.map(n => (
              <Link
                key={n.id}
                href={n.link || '/matches'}
                onClick={() => setOpen(false)}
                className={`block px-4 py-3 hover:bg-slate-50 transition-colors ${!n.read ? 'bg-indigo-50' : ''}`}
              >
                <div className="flex gap-2 items-start">
                  {!n.read && <span className="w-2 h-2 mt-1.5 bg-indigo-500 rounded-full flex-shrink-0" />}
                  {n.read && <span className="w-2 h-2 mt-1.5 flex-shrink-0" />}
                  <div>
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{n.body}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {new Date(n.createdAt).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname()
  const base = '/' + pathname.split('/')[1]
  const title = breadcrumbMap[base] || 'Portal'

  return (
    <header className="fixed top-0 right-0 left-0 md:left-64 h-16 z-40 flex items-center px-4 md:px-6 gap-3 bg-white/90 backdrop-blur-xl border-b border-slate-200 shadow-sm">
      {/* Left accent bar matching sidebar */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 md:hidden" style={{background: 'linear-gradient(180deg, #4f46e5, #7c3aed)'}} />

      {/* Hamburger - mobile only */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
        aria-label="Άνοιγμα μενού"
      >
        <Menu size={20} className="text-slate-600" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs mb-0.5">
          <span className="font-semibold text-indigo-600 tracking-wide hidden sm:inline">I-MENTOR</span>
          <span className="text-slate-300 hidden sm:inline">›</span>
          <span className="text-slate-500 truncate">{title}</span>
        </div>
        <h1 className="text-base font-bold text-slate-900 truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Ενεργό
        </span>
        <span className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
          {new Date().toLocaleDateString('el-GR', { weekday: 'short', day: '2-digit', month: 'short' })}
        </span>
      </div>
    </header>
  )
}
