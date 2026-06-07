'use client'
import { usePathname } from 'next/navigation'

const breadcrumbMap: Record<string, string> = {
  '/': 'Dashboard', '/accountants': 'Λογιστές', '/businesses': 'Επιχειρήσεις',
  '/programs': 'Προγράμματα', '/matches': 'Matches', '/campaigns': 'Καμπάνιες',
  '/payments': 'Πληρωμές', '/commissions': 'Προμήθειες', '/requests': 'Αιτήματα',
  '/reports': 'Αναφορές', '/settings': 'Ρυθμίσεις',
}

export function Header() {
  const pathname = usePathname()
  const base = '/' + pathname.split('/')[1]
  const title = breadcrumbMap[base] || 'Portal'

  return (
    <header className="fixed top-0 right-0 left-64 h-16 z-40 flex items-center px-6 gap-4 bg-slate-100/80 backdrop-blur-xl border-b border-slate-200">
      <div className="flex-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-0.5">
          <span>I-MENTOR</span>
          <span>›</span>
          <span className="text-slate-600">{title}</span>
        </div>
        <h1 className="text-base font-semibold text-slate-900">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Ενεργό
        </span>
        <span className="hidden md:block text-xs text-slate-400">
          {new Date().toLocaleDateString('el-GR')}
        </span>
      </div>
    </header>
  )
}
