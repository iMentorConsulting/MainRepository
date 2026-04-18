import { Outlet, NavLink } from 'react-router-dom'
import {
  HomeIcon, CalendarDaysIcon, BookmarkSquareIcon, BuildingOfficeIcon,
  UsersIcon, ChartBarIcon, SparklesIcon, ArrowRightOnRectangleIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline'

const nav = [
  { to: '/', label: 'Αρχική', Icon: HomeIcon, exact: true },
  { to: '/calendar', label: 'Ημερολόγιο', Icon: CalendarDaysIcon },
  { to: '/bookings', label: 'Κρατήσεις', Icon: BookmarkSquareIcon },
  { to: '/units', label: 'Μονάδες', Icon: BuildingOfficeIcon },
  { to: '/customers', label: 'Πελάτες', Icon: UsersIcon },
  { to: '/reports', label: 'Αναφορές', Icon: ChartBarIcon },
  { to: '/smart-advisor', label: 'AI Σύμβουλος', Icon: SparklesIcon },
  { to: '/cleaning', label: 'Καθαριότητα', Icon: ClipboardDocumentCheckIcon },
]

function NavItem({ to, label, Icon, exact }) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      <span>{label}</span>
    </NavLink>
  )
}

export default function Layout({ auth, onLogout }) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar – desktop */}
      <aside className="hidden md:flex md:flex-col w-56 bg-white border-r border-gray-200 flex-shrink-0">
        <div className="px-4 py-5 border-b border-gray-200">
          <h1 className="text-lg font-bold text-blue-700 leading-tight">🏨 Κρατήσεις</h1>
          <p className="text-xs text-gray-500 mt-0.5 font-medium truncate">{auth?.name}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {nav.map((item) => <NavItem key={item.to} {...item} />)}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <button
            onClick={onLogout}
            className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
            Αποσύνδεση
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <div>
            <h1 className="text-base font-bold text-blue-700">🏨 Κρατήσεις</h1>
            <p className="text-xs text-gray-500 leading-none">{auth?.name}</p>
          </div>
          <button onClick={onLogout} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600">
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10">
          <div className="flex justify-around">
            {nav.map(({ to, label, Icon, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  `flex flex-col items-center py-2 px-1 text-xs transition-colors flex-1 ${
                    isActive ? 'text-blue-600' : 'text-gray-500'
                  }`
                }
              >
                <Icon className="h-5 w-5 mb-0.5" />
                <span className="truncate w-full text-center" style={{ fontSize: '10px' }}>{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
