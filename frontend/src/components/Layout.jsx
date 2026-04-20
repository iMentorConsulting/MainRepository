import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  HomeIcon,
  FolderOpenIcon,
  ViewColumnsIcon,
  BellIcon,
  UsersIcon,
  ArrowDownTrayIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  BuildingOffice2Icon,
  KeyIcon,
} from '@heroicons/react/24/outline'
import { changePassword } from '../api'
import toast from 'react-hot-toast'

const nav = [
  { to: '/', label: 'Dashboard', Icon: HomeIcon, exact: true },
  { to: '/cases', label: 'Υποθέσεις', Icon: FolderOpenIcon },
  { to: '/kanban', label: 'Pipeline', Icon: ViewColumnsIcon },
  { to: '/notifications', label: 'Αποστολή', Icon: BellIcon },
  { to: '/import', label: 'Εισαγωγή Sheet', Icon: ArrowDownTrayIcon },
  { to: '/users', label: 'Χρήστες', Icon: UsersIcon },
]

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.new_password !== form.confirm) {
      toast.error('Οι νέοι κωδικοί δεν ταιριάζουν')
      return
    }
    setLoading(true)
    try {
      await changePassword(form.current_password, form.new_password)
      toast.success('Ο κωδικός άλλαξε επιτυχώς')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αλλαγής κωδικού')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Αλλαγή Κωδικού</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Τρέχων Κωδικός</label>
            <input
              type="password"
              required
              value={form.current_password}
              onChange={e => setForm(f => ({ ...f, current_password: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Νέος Κωδικός</label>
            <input
              type="password"
              required
              minLength={6}
              value={form.new_password}
              onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Επιβεβαίωση Νέου Κωδικού</label>
            <input
              type="password"
              required
              value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">Άκυρο</button>
            <button type="submit" disabled={loading} className="flex-1 btn-primary">
              {loading ? 'Αποθήκευση...' : 'Αποθήκευση'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Layout({ auth, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showPwModal, setShowPwModal] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#1e3a5f] text-white flex flex-col transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:flex`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          <BuildingOffice2Icon className="w-8 h-8 text-blue-300" />
          <div>
            <div className="font-bold text-sm leading-tight">iMentor Consulting</div>
            <div className="text-xs text-blue-300">Case Management</div>
          </div>
          <button
            className="ml-auto lg:hidden text-white/60 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map(({ to, label, Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                 ${isActive
                   ? 'bg-white/15 text-white'
                   : 'text-white/70 hover:bg-white/10 hover:text-white'}`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(p => !p)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left"
            >
              <div className="w-8 h-8 bg-blue-400 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                {auth.user?.full_name?.[0] || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{auth.user?.full_name}</div>
                <div className="text-xs text-blue-300">{auth.user?.role === 'admin' ? 'Διαχειριστής' : 'Agent'}</div>
              </div>
            </button>
            {showUserMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-lg shadow-lg border py-1 text-gray-700">
                <button
                  onClick={() => { setShowPwModal(true); setShowUserMenu(false) }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  <KeyIcon className="w-4 h-4" /> Αλλαγή Κωδικού
                </button>
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <ArrowRightOnRectangleIcon className="w-4 h-4" /> Αποσύνδεση
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="bg-white border-b px-4 py-3 flex items-center gap-4 sticky top-0 z-20">
          <button
            className="lg:hidden text-gray-500 hover:text-gray-700"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
          <div className="flex-1" />
          <div className="text-sm text-gray-500">
            {new Date().toLocaleDateString('el-GR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}
    </div>
  )
}
