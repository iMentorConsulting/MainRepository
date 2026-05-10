import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAnalyticsOverview, getAnalyticsMilestones } from '../api'
import {
  ChartBarIcon, UserGroupIcon, CheckCircleIcon, ExclamationTriangleIcon,
  ClockIcon, CalendarDaysIcon, ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline'

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
    red:    'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-start gap-4 shadow-sm">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 leading-tight">{value}</div>
        <div className="text-sm font-medium text-gray-600">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

function BarChart({ items, maxVal, colorClass = 'bg-blue-500' }) {
  if (!items?.length) return <p className="text-xs text-gray-400 py-4 text-center">Δεν υπάρχουν δεδομένα</p>
  const max = maxVal || Math.max(...items.map(i => i.value))
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="text-xs text-gray-600 w-36 truncate shrink-0">{item.label}</div>
          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
            <div
              className={`h-full rounded-full flex items-center justify-end pr-2 text-xs text-white font-semibold transition-all ${colorClass}`}
              style={{ width: `${Math.max((item.value / max) * 100, 5)}%` }}
            >
              {item.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function MilestoneRow({ item }) {
  const navigate = useNavigate()
  const typeColors = {
    deadline: 'bg-red-100 text-red-700',
    dypa_milestone: 'bg-blue-100 text-blue-700',
    followup: 'bg-purple-100 text-purple-700',
  }
  return (
    <tr onClick={() => navigate(`/cases/${item.case_id}`)} className="hover:bg-gray-50 cursor-pointer">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-800 text-sm">{item.client_name}</div>
        <div className="text-xs text-gray-400">{item.service_type || '—'}</div>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">{item.assigned_agent || '—'}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {item.events.map((ev, i) => (
            <span key={i} className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[ev.type] || 'bg-gray-100 text-gray-600'}`}>
              {ev.label} — {ev.days_away === 0 ? 'σήμερα' : `σε ${ev.days_away} ημ.`}
            </span>
          ))}
        </div>
      </td>
    </tr>
  )
}

export default function Analytics() {
  const [overview, setOverview] = useState(null)
  const [milestones, setMilestones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getAnalyticsOverview(), getAnalyticsMilestones(90)])
      .then(([ov, ms]) => { setOverview(ov); setMilestones(ms) })
      .catch(err => setError(err?.response?.data?.detail || 'Σφάλμα φόρτωσης'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full" />
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <ExclamationTriangleIcon className="w-10 h-10 text-red-400 mb-3" />
      <p className="text-gray-600 font-medium">Σφάλμα φόρτωσης δεδομένων</p>
      <p className="text-xs text-gray-400 mt-1">{error}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Αναλυτικά Στοιχεία</h1>
        <p className="text-sm text-gray-500">Επισκόπηση αποδοτικότητας και προόδου υποθέσεων</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ChartBarIcon} label="Σύνολο Υποθέσεων" value={overview?.total ?? '—'} color="blue" />
        <StatCard icon={ArrowTrendingUpIcon} label="Ενεργές" value={overview?.active ?? '—'} color="green" />
        <StatCard icon={CheckCircleIcon} label="Ολοκληρωμένες" value={overview?.completed ?? '—'} color="purple" />
        <StatCard icon={ExclamationTriangleIcon} label="Εκτός SLA" value={overview?.sla_overdue ?? '—'} color="red"
          sub={overview?.total ? `${Math.round((overview.sla_overdue / overview.total) * 100)}% του συνόλου` : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Per program */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-gray-700">Υποθέσεις ανά Πρόγραμμα</h2>
          <BarChart
            items={(overview?.per_program || []).map(r => ({ label: r.program, value: r.count }))}
            colorClass="bg-blue-500"
          />
        </div>

        {/* Per agent */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-gray-700">Ενεργές Υποθέσεις ανά Σύμβουλο</h2>
          <BarChart
            items={(overview?.per_agent || []).map(r => ({ label: r.agent, value: r.count }))}
            colorClass="bg-teal-500"
          />
        </div>
      </div>

      {/* Avg time per status */}
      {(overview?.avg_days_per_status || []).length > 0 && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-gray-700">Μέσος Χρόνος ανά Κατάσταση <span className="text-xs text-gray-400 font-normal">(ημέρες μέχρι επόμενη αλλαγή)</span></h2>
          <BarChart
            items={(overview.avg_days_per_status).map(r => ({ label: r.status, value: r.avg_days }))}
            colorClass="bg-orange-400"
          />
        </div>
      )}

      {/* Upcoming milestones */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <CalendarDaysIcon className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-gray-700">Επερχόμενα Ορόσημα & Προθεσμίες <span className="text-xs text-gray-400 font-normal">(επόμενες 90 ημέρες)</span></h2>
        </div>
        {milestones.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">Δεν υπάρχουν επερχόμενα ορόσημα</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Πελάτης</th>
                <th className="text-left px-4 py-2">Σύμβουλος</th>
                <th className="text-left px-4 py-2">Ορόσημα</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {milestones.map(item => <MilestoneRow key={item.case_id} item={item} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
