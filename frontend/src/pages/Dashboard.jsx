import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getDashboardStats } from '../api'
import {
  FolderOpenIcon, CurrencyEuroIcon, ClockIcon, ExclamationTriangleIcon,
  ArrowRightIcon, ClipboardDocumentListIcon, UserGroupIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  'ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ': 'bg-blue-100 text-blue-800',
  'ΕΓΚΡΙΣΗ - ΠΡΙΝ ΤΟ 1ο ΑΙΤΗΜΑ': 'bg-green-100 text-green-800',
  'ΣΕ 1ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ': 'bg-yellow-100 text-yellow-800',
  'ΣΕ 2ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ': 'bg-orange-100 text-orange-800',
  'ΕΝΣΤΑΣΗ': 'bg-red-100 text-red-800',
  'ΣΕ ΤΕΛΙΚΟ ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ': 'bg-purple-100 text-purple-800',
}

const fmt = (n) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n || 0)

function StatCard({ icon: Icon, label, value, sub, colorClass = 'bg-blue-50 text-blue-600', link }) {
  const inner = (
    <div className="bg-white rounded-xl border p-5 flex items-start gap-4 hover:shadow-md transition-shadow cursor-pointer">
      <div className={`p-3 rounded-xl ${colorClass}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
  return link ? <Link to={link}>{inner}</Link> : inner
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch(() => toast.error('Σφάλμα φόρτωσης dashboard'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
    </div>
  )
  if (!stats) return null

  const paidPct = stats.financial.total_agreed > 0
    ? Math.round((stats.financial.total_paid / stats.financial.total_agreed) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Επισκόπηση ενεργών υποθέσεων</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FolderOpenIcon} label="Ενεργές Υποθέσεις" value={stats.total_cases}
          colorClass="bg-blue-50 text-blue-600" link="/cases" />
        <StatCard icon={CurrencyEuroIcon} label="Εκκρεμείς Οφειλές"
          value={fmt(stats.financial.total_balance)}
          sub={`από σύνολο ${fmt(stats.financial.total_agreed)}`}
          colorClass="bg-orange-50 text-orange-600" />
        <StatCard icon={ClockIcon} label="Προθεσμίες <15 ημέρες"
          value={stats.deadlines.in_15_days}
          sub={`${stats.deadlines.in_30_days} συνολικά σε 30 ημέρες`}
          colorClass={stats.deadlines.in_15_days > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'} />
        <StatCard icon={ClipboardDocumentListIcon} label="Ανοιχτά Tasks"
          value={stats.tasks.open}
          sub={stats.tasks.overdue > 0 ? `${stats.tasks.overdue} ληξιπρόθεσμα` : 'Καμία καθυστέρηση'}
          colorClass={stats.tasks.overdue > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Pipeline Υποθέσεων</h3>
          <div className="space-y-3">
            {Object.entries(stats.status_counts).map(([s, cnt]) => {
              const total = stats.total_cases || 1
              return (
                <div key={s}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s] || 'bg-gray-100 text-gray-700'}`}>
                      {s}
                    </span>
                    <span className="text-sm font-bold text-gray-700">{cnt}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(cnt / total) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Financial */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <CurrencyEuroIcon className="w-5 h-5 text-gray-400" /> Οικονομική Εικόνα
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Συμφωνηθέν Σύνολο', value: fmt(stats.financial.total_agreed), cls: 'text-gray-900' },
              { label: 'Εισπραχθέν', value: fmt(stats.financial.total_paid), cls: 'text-green-600' },
              { label: 'Υπόλοιπο', value: fmt(stats.financial.total_balance), cls: 'text-orange-600' },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center py-2 border-b last:border-0">
                <span className="text-sm text-gray-500">{r.label}</span>
                <span className={`font-bold text-sm ${r.cls}`}>{r.value}</span>
              </div>
            ))}
            <div className="pt-1">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>% Είσπραξης</span><span>{paidPct}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${paidPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Agent Workload */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <UserGroupIcon className="w-5 h-5 text-gray-400" /> Φόρτος Agents
          </h3>
          {stats.agents_workload.length === 0
            ? <p className="text-sm text-gray-400">Δεν υπάρχουν εκχωρήσεις</p>
            : (
              <div className="space-y-2">
                {stats.agents_workload.map(a => (
                  <div key={a.agent_name} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">
                        {a.agent_name[0]}
                      </div>
                      <span className="text-sm text-gray-700">{a.agent_name}</span>
                    </div>
                    <span className="text-sm font-bold bg-gray-100 px-2 py-0.5 rounded-full">{a.case_count}</span>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Urgent Deadlines */}
        {stats.urgent_cases.length > 0 && (
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-red-600 mb-4 flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5" /> Επείγουσες Προθεσμίες
            </h3>
            <div className="space-y-2">
              {stats.urgent_cases.map(c => (
                <Link key={c.id} to={`/cases/${c.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-red-50 border border-red-100">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{c.client_name}</div>
                    <div className="text-xs text-gray-500">{c.service_type}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs font-bold ${c.days_to_deadline <= 7 ? 'text-red-600' : 'text-orange-500'}`}>
                      {c.days_to_deadline} ημέρες
                    </div>
                    <div className="text-xs text-gray-400">{c.project_deadline}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Πρόσφατη Δραστηριότητα</h3>
            <Link to="/cases" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              Όλες <ArrowRightIcon className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-1">
            {stats.recent_cases.map(c => (
              <Link key={c.id} to={`/cases/${c.id}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div>
                  <div className="text-sm font-medium text-gray-900">{c.client_name}</div>
                  <div className="text-xs text-gray-400">{c.service_type} · {c.assigned_agent_name || '—'}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-600'}`}>
                  {c.status?.split(' ').slice(0, 2).join(' ')}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Balance Cases */}
        {stats.balance_cases.length > 0 && (
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <CurrencyEuroIcon className="w-5 h-5 text-orange-500" /> Εκκρεμείς Οφειλές
            </h3>
            <div className="space-y-2">
              {stats.balance_cases.slice(0, 6).map(c => (
                <Link key={c.id} to={`/cases/${c.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-orange-50 border border-orange-50">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{c.client_name}</div>
                    <div className="text-xs text-gray-400">{c.service_type}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-orange-600">{fmt(c.balance)}</div>
                    <div className="text-xs text-gray-400">από {fmt(c.total_agreed)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
