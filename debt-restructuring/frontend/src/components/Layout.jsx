import { Outlet, NavLink } from 'react-router-dom'
import {
  HomeIcon,
  PlusCircleIcon,
  ChartBarIcon,
  ArrowRightOnRectangleIcon,
  RocketLaunchIcon,
  BoltIcon,
  BanknotesIcon,
  UserGroupIcon,
  ListBulletIcon,
  PresentationChartLineIcon,
  XMarkIcon,
  CreditCardIcon,
  ScaleIcon,
  ChatBubbleLeftEllipsisIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { hangupCall } from '../api'
import ExternalReferralBanner from './ExternalReferralBanner'

const nav = [
  { to: '/leads', label: 'Leads', Icon: UserGroupIcon },
  { to: '/', label: 'Υποθέσεις', Icon: HomeIcon, exact: true },
  { to: '/cases/new', label: 'Νέα Υπόθεση', Icon: PlusCircleIcon },
  { to: '/quick-quote', label: 'Γρήγορη Ανάλυση', Icon: BoltIcon },
  { to: '/pipeline', label: 'Sales Pipeline', Icon: RocketLaunchIcon },
  { to: '/statistics', label: 'Στατιστικά', Icon: ChartBarIcon },
  { to: '/lead-lists', label: 'Λίστες', Icon: ListBulletIcon },
  { to: '/payments', label: 'Πληρωμές IRIS', Icon: CreditCardIcon },
  { to: '/themis-conversations', label: 'Συζητήσεις με Θέμις', Icon: ChatBubbleLeftEllipsisIcon },
]

const adminNav = [
  { to: '/finances', label: 'Οικονομικά', Icon: BanknotesIcon },
  { to: '/leads-reporting', label: 'Reporting', Icon: PresentationChartLineIcon },
  { to: '/themis-settings', label: 'Ρυθμίσεις Θέμις', Icon: ScaleIcon },
]

export default function Layout({ auth, onLogout }) {
  const isHaris = auth.employee === 'HARIS'
  const allNav = isHaris ? [...nav, ...adminNav] : nav

  const handleHangup = async () => {
    try {
      await hangupCall()
      toast.success('📞 Κλήση τερματίστηκε')
    } catch (err) {
      toast.info('📞 Κανένα ενεργό κάλεσμα')
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-gradient-to-b from-blue-900 to-blue-800 text-white shrink-0">
        <div className="px-5 py-6 border-b border-blue-700">
          <img src="/logo.png" alt="i-Mentor" className="h-14 w-auto object-contain" onError={e => { e.target.onerror=null; e.target.src='https://i-mentor.gr/wp-content/uploads/2026/06/logo-white-transparent.png' }} />
          <div className="text-blue-300 text-xs mt-1">Οφειλές &amp; Ρυθμίσεις</div>
        </div>

        <div className="px-3 py-3 border-b border-blue-700 space-y-2">
          <div className="text-xs text-blue-300 px-2 mb-1">Συνδεδεμένος ως</div>
          <div className="bg-blue-700 rounded-lg px-3 py-2 text-sm font-bold">{auth.employee}</div>
          <button onClick={handleHangup}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white w-full transition-colors font-bold">
            <XMarkIcon className="w-5 h-5" />
            ☎ Hang Up
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, Icon, exact }) => (
            <NavLink key={to} to={to} end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-white text-blue-800' : 'text-blue-100 hover:bg-blue-700'}`}>
              <Icon className="w-5 h-5 shrink-0" />{label}
            </NavLink>
          ))}
          {isHaris && (
            <>
              <div className="text-xs text-blue-400 px-2 pt-3 pb-1 uppercase tracking-widest">Admin</div>
              {adminNav.map(({ to, label, Icon }) => (
                <NavLink key={to} to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-amber-400 text-blue-900' : 'text-amber-300 hover:bg-blue-700'}`}>
                  <Icon className="w-5 h-5 shrink-0" />{label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="px-3 py-4 border-t border-blue-700 space-y-2">
          <button onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-blue-200 hover:bg-blue-700 w-full transition-colors">
            <ArrowRightOnRectangleIcon className="w-5 h-5" />Αποσύνδεση
          </button>
          <div className="text-xs text-blue-400 mt-3 px-2">www.i-mentor.gr</div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-blue-900 text-white flex items-center justify-between px-4 h-14">
        <img src="/logo.png" alt="i-Mentor" className="h-10 w-auto object-contain" onError={e => { e.target.onerror=null; e.target.src='https://i-mentor.gr/wp-content/uploads/2026/06/logo-white-transparent.png' }} />
        <div className="flex items-center gap-3">
          <button onClick={handleHangup} title="Hang up call" className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded transition-colors">
            ☎ Hang Up
          </button>
          <span className="text-sm text-blue-300">{auth.employee}</span>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 overflow-auto md:pt-0 pt-14 pb-16 md:pb-0 flex flex-col">
        <ExternalReferralBanner employee={auth.employee} />
        <div className="flex-1">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav - icon only to fit all items */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex flex-wrap justify-around">
        {allNav.map(({ to, label, Icon, exact }) => (
          <NavLink key={to} to={to} end={exact}
            title={label}
            className={({ isActive }) =>
              `flex items-center justify-center p-3 transition-colors ${
                isActive ? 'text-blue-700 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon className="w-6 h-6" />
          </NavLink>
        ))}
        <button onClick={onLogout}
          title="Αποσύνδεση"
          className="flex items-center justify-center p-3 text-gray-500 hover:text-red-600 transition-colors">
          <ArrowRightOnRectangleIcon className="w-6 h-6" />
        </button>
      </nav>
    </div>
  )
}
