import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  HomeIcon,
  PlusCircleIcon,
  ChartBarIcon,
  ArrowRightOnRectangleIcon,
  RocketLaunchIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'

const nav = [
  { to: '/', label: 'Υποθέσεις', Icon: HomeIcon, exact: true },
  { to: '/cases/new', label: 'Νέα Υπόθεση', Icon: PlusCircleIcon },
  { to: '/quick-quote', label: 'Γρήγορη Ανάλυση', Icon: BoltIcon },
  { to: '/pipeline', label: 'Sales Pipeline', Icon: RocketLaunchIcon },
  { to: '/statistics', label: 'Στατιστικά', Icon: ChartBarIcon },
]

export default function Layout({ auth, onLogout }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-gradient-to-b from-blue-900 to-blue-800 text-white shrink-0">
        <div className="px-5 py-6 border-b border-blue-700">
          <div className="text-xl font-black">⚖️ i-Mentor</div>
          <div className="text-blue-300 text-xs mt-1">Οφειλές &amp; Ρυθμίσεις</div>
        </div>

        <div className="px-3 py-3 border-b border-blue-700">
          <div className="text-xs text-blue-300 px-2 mb-1">Συνδεδεμένος ως</div>
          <div className="bg-blue-700 rounded-lg px-3 py-2 text-sm font-bold">{auth.employee}</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-white text-blue-800' : 'text-blue-100 hover:bg-blue-700'
                }`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-blue-700">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-blue-200 hover:bg-blue-700 w-full transition-colors"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            Αποσύνδεση
          </button>
          <div className="text-xs text-blue-400 mt-3 px-2">www.i-mentor.gr</div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-blue-900 text-white flex items-center justify-between px-4 h-14">
        <span className="font-black text-lg">⚖️ i-Mentor</span>
        <span className="text-sm text-blue-300">{auth.employee}</span>
      </div>

      {/* Main */}
      <main className="flex-1 overflow-auto md:pt-0 pt-14 pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex">
        {nav.map(({ to, label, Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${
                isActive ? 'text-blue-700' : 'text-gray-500'
              }`
            }
          >
            <Icon className="w-6 h-6 mb-0.5" />
            {label}
          </NavLink>
        ))}
        <button
          onClick={onLogout}
          className="flex-1 flex flex-col items-center py-2 text-xs font-medium text-gray-500"
        >
          <ArrowRightOnRectangleIcon className="w-6 h-6 mb-0.5" />
          Έξοδος
        </button>
      </nav>
    </div>
  )
}
