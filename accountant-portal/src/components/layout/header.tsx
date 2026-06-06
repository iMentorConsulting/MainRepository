'use client'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Bell } from 'lucide-react'

const breadcrumbLabels: Record<string, string> = {
  '': 'Dashboard',
  'accountants': 'Λογιστές',
  'businesses': 'Επιχειρήσεις',
  'programs': 'Προγράμματα',
  'matches': 'Matches',
  'campaigns': 'Καμπάνιες',
  'requests': 'Αιτήματα',
  'reports': 'Αναφορές',
  'settings': 'Ρυθμίσεις',
  'new': 'Νέο',
}

export function Header() {
  const pathname = usePathname()
  const { data: session } = useSession()

  const segments = pathname.split('/').filter(Boolean)
  const breadcrumbs = segments.map(seg => ({
    label: breadcrumbLabels[seg] || seg,
    href: '/' + segments.slice(0, segments.indexOf(seg) + 1).join('/')
  }))

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <span className="font-medium text-gray-900">I-MENTOR Portal</span>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            <span>/</span>
            <span className={i === breadcrumbs.length - 1 ? 'text-blue-800 font-medium' : ''}>
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
          <Bell size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-800 flex items-center justify-center text-white text-sm font-medium">
            {session?.user?.name?.charAt(0) || 'U'}
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-medium text-gray-900">{session?.user?.name}</div>
            <div className="text-xs text-gray-500">{session?.user?.email}</div>
          </div>
        </div>
      </div>
    </header>
  )
}
