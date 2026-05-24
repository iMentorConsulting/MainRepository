import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const nav = [
  { to: '/',          icon: '📊', label: 'Dashboard' },
  { to: '/income',    icon: '💰', label: 'Έσοδα' },
  { to: '/expenses',  icon: '📤', label: 'Έξοδα' },
  { to: '/reports',   icon: '📈', label: 'Αναφορές' },
  { to: '/bonus',     icon: '🎯', label: 'Bonus Πρακτόρων' },
  { to: '/invoices',  icon: '🧾', label: 'Τιμολόγια' },
  { to: '/emails',    icon: '📧', label: 'Email Λογιστών' },
  { to: '/settings',  icon: '⚙️', label: 'Λίστες / Ρυθμίσεις' },
  { to: '/import',    icon: '📥', label: 'Εισαγωγή Δεδομένων' },
];

export default function Sidebar() {
  const { logout } = useAuth();
  return (
    <aside className="w-60 min-h-screen bg-primary-900 flex flex-col shrink-0">
      <div className="px-6 py-5 border-b border-primary-800">
        <div className="text-white font-bold text-xl">i-Mentor</div>
        <div className="text-primary-300 text-xs mt-0.5">Finance Manager</div>
      </div>
      <nav className="flex-1 py-4 space-y-0.5">
        {nav.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-primary-700 text-white font-medium'
                  : 'text-primary-200 hover:bg-primary-800 hover:text-white'
              }`
            }
          >
            <span>{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-primary-800">
        <button onClick={logout} className="flex items-center gap-2 text-primary-300 hover:text-white text-sm w-full px-2 py-2">
          <span>🚪</span> Αποσύνδεση
        </button>
      </div>
    </aside>
  );
}
