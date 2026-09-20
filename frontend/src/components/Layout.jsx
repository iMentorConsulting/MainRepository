import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import IStayLogo from './IStayLogo'
import {
  HomeIcon, CalendarDaysIcon, BookmarkSquareIcon, BuildingOfficeIcon,
  UsersIcon, ChartBarIcon, SparklesIcon, ArrowRightOnRectangleIcon,
  ClipboardDocumentCheckIcon, GlobeAltIcon, BanknotesIcon, WrenchScrewdriverIcon,
  HomeModernIcon, TagIcon, ArrowsRightLeftIcon, CodeBracketIcon, CalendarIcon,
  CreditCardIcon, Bars3Icon, XMarkIcon,
} from '@heroicons/react/24/outline'

const navGroups = [
  {
    label: 'Κρατήσεις',
    items: [
      { to: '/', label: 'Αρχική', Icon: HomeIcon, exact: true },
      { to: '/calendar', label: 'Ημερολόγιο', Icon: CalendarDaysIcon },
      { to: '/bookings', label: 'Κρατήσεις', Icon: BookmarkSquareIcon },
      { to: '/customers', label: 'Πελάτες', Icon: UsersIcon },
      { to: '/availability', label: 'Availability', Icon: CalendarIcon },
      { to: '/pricing', label: 'Τιμολόγηση', Icon: TagIcon },
    ],
  },
  {
    label: 'Μονάδες',
    items: [
      { to: '/units', label: 'Μονάδες', Icon: BuildingOfficeIcon },
      { to: '/owners', label: 'Ιδιοκτήτες', Icon: HomeModernIcon },
      { to: '/cleaning', label: 'Καθαριότητα', Icon: ClipboardDocumentCheckIcon },
      { to: '/maintenance', label: 'Συντήρηση', Icon: WrenchScrewdriverIcon },
    ],
  },
  {
    label: 'Οικονομικά',
    items: [
      { to: '/reports', label: 'Αναφορές', Icon: ChartBarIcon },
      { to: '/expenses', label: 'Έξοδα', Icon: BanknotesIcon },
      { to: '/loans', label: 'Δάνεια', Icon: CreditCardIcon },
    ],
  },
  {
    label: 'Ρυθμίσεις',
    items: [
      { to: '/sync', label: 'Sync Πλατφορμών', Icon: ArrowsRightLeftIcon },
      { to: '/widget-admin', label: 'Availability Widget', Icon: CodeBracketIcon },
      { to: '/smart-advisor', label: 'AI Σύμβουλος', Icon: SparklesIcon },
      { to: '/portal', label: 'Guest Portal', Icon: GlobeAltIcon },
    ],
  },
]

// Quick-access items shown in the mobile bottom bar
const bottomBarItems = [
  { to: '/', label: 'Αρχική', Icon: HomeIcon, exact: true },
  { to: '/calendar', label: 'Ημερολόγιο', Icon: CalendarDaysIcon },
  { to: '/bookings', label: 'Κρατήσεις', Icon: BookmarkSquareIcon },
  { to: '/reports', label: 'Αναφορές', Icon: ChartBarIcon },
]

function NavItem({ to, label, Icon, exact, onClick }) {
  return (
    <NavLink
      to={to}
      end={exact}
      onClick={onClick}
      aria-label={label}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  )
}

export default function Layout({ auth, onLogout }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeDrawer = () => setDrawerOpen(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Skip navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-blue-700 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Μετάβαση στο κύριο περιεχόμενο
      </a>

      {/* ── Desktop sidebar ─────────────────────────────── */}
      <aside
        className="hidden md:flex md:flex-col w-56 bg-white border-r border-gray-200 flex-shrink-0"
        aria-label="Κύρια πλοήγηση"
      >
        <div className="px-4 py-4 border-b border-gray-200" role="banner">
          <IStayLogo variant="blue" className="h-7" />
          <p className="text-xs text-gray-600 mt-1 font-medium truncate">
            {auth?.name}
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Πλοήγηση εφαρμογής">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 select-none">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItem key={item.to} {...item} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <button
            onClick={onLogout}
            className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
            Αποσύνδεση
          </button>
        </div>
      </aside>

      {/* ── Mobile drawer overlay ────────────────────────── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <div className="relative flex flex-col w-72 max-w-[85vw] bg-white h-full shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
              <div>
                <IStayLogo variant="blue" className="h-7" />
                <p className="text-xs text-gray-500 mt-0.5 font-medium truncate">{auth?.name}</p>
              </div>
              <button
                onClick={closeDrawer}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                aria-label="Κλείσιμο μενού"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 p-3">
              {navGroups.map((group) => (
                <div key={group.label} className="mb-3">
                  <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 select-none">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavItem key={item.to} {...item} onClick={closeDrawer} />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <div className="p-3 border-t border-gray-200">
              <button
                onClick={() => { closeDrawer(); onLogout() }}
                className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5" />
                Αποσύνδεση
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200" role="banner">
          <div>
            <IStayLogo variant="blue" className="h-7" />
            <p className="text-xs text-gray-500 leading-none mt-0.5">{auth?.name}</p>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Άνοιγμα μενού"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>
        </header>

        {/* Content */}
        <main id="main-content" className="flex-1 overflow-y-auto pb-20 md:pb-0" tabIndex="-1">
          <Outlet />
        </main>

        {/* Mobile bottom bar — 4 quick items + menu button */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10"
          aria-label="Γρήγορη πλοήγηση"
        >
          <div className="grid grid-cols-5">
            {bottomBarItems.map(({ to, label, Icon, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                aria-label={label}
                className={({ isActive }) =>
                  `flex flex-col items-center py-2 px-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${
                    isActive ? 'text-blue-600' : 'text-gray-500'
                  }`
                }
              >
                <Icon className="h-5 w-5 mb-0.5" aria-hidden="true" />
                <span style={{ fontSize: '9px' }}>{label}</span>
              </NavLink>
            ))}
            {/* Menu button */}
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Όλο το μενού"
              className="flex flex-col items-center py-2 px-1 text-xs text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
            >
              <Bars3Icon className="h-5 w-5 mb-0.5" aria-hidden="true" />
              <span style={{ fontSize: '9px' }}>Μενού</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  )
}
