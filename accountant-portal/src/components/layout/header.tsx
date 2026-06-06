'use client'
import { usePathname } from 'next/navigation'

const breadcrumbMap: Record<string, string> = {
  '/': 'Dashboard',
  '/accountants': 'Λογιστές',
  '/businesses': 'Επιχειρήσεις',
  '/programs': 'Προγράμματα',
  '/matches': 'Matches',
  '/campaigns': 'Καμπάνιες',
  '/payments': 'Πληρωμές',
  '/commissions': 'Προμήθειες',
  '/requests': 'Αιτήματα',
  '/reports': 'Αναφορές',
  '/settings': 'Ρυθμίσεις',
}

export function Header() {
  const pathname = usePathname()
  const base = '/' + pathname.split('/')[1]
  const title = breadcrumbMap[base] || breadcrumbMap[pathname] || 'Portal'

  return (
    <header className="fixed top-0 right-0 left-64 h-16 z-40 flex items-center px-6 gap-4"
      style={{
        background: 'rgba(5,5,8,0.8)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
      {/* Page title */}
      <div className="flex-1">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>I-MENTOR</span>
          <span className="text-white/20">›</span>
          <span className="text-text-secondary">{title}</span>
        </div>
        <h1 className="text-base font-semibold text-text-primary leading-tight">{title}</h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Live indicator */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)'}}>
          <div className="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"
            style={{boxShadow: '0 0 6px #10b981'}} />
          <span className="text-xs text-accent-emerald font-medium">Live</span>
        </div>

        {/* Date */}
        <div className="hidden md:block text-xs text-text-muted font-mono">
          {new Date().toLocaleDateString('el-GR')}
        </div>
      </div>
    </header>
  )
}
