import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import * as api from '../api'

const AGENTS = ['STELLA', 'VALLIA', 'SOFIA']
const AGENT_COLORS = { STELLA: '#3b82f6', VALLIA: '#f59e0b', SOFIA: '#10b981' }

const PERIODS = [
  { id: 'daily', label: 'Ημερήσια', dateKey: 'date' },
  { id: 'weekly', label: 'Εβδομαδιαία', dateKey: 'week' },
  { id: 'monthly', label: 'Μηνιαία', dateKey: 'month' },
]

export default function LeadsReporting({ currentEmployee }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('daily')

  useEffect(() => {
    setLoading(true)
    api.getLeadsReporting()
      .then(r => setData(r.data))
      .catch(() => toast.error('Σφάλμα φόρτωσης reporting'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-10 text-center text-gray-400">Φόρτωση…</div>
  if (!data) return null

  const periodCfg = PERIODS.find(p => p.id === period)
  const chartData = data[period] || []
  const dateKey = periodCfg.dateKey

  const statCards = [
    { label: 'Deals', value: data.deals, cls: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Active', value: data.active, cls: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Hot', value: data.hot, cls: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Cancelled', value: data.cancelled, cls: 'text-gray-500', bg: 'bg-gray-50' },
    { label: 'Σύνολο Leads', value: data.total_leads, cls: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Σχόλια', value: data.total_comments, cls: 'text-purple-600', bg: 'bg-purple-50' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-blue-800">Reporting Leads</h1>
          <p className="text-gray-500 text-sm">Ανάλυση δραστηριότητας ανά agent</p>
        </div>
        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold">🔒 Admin only</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(c => (
          <div key={c.label} className={`card p-3 text-center ${c.bg}`}>
            <div className={`text-2xl font-black ${c.cls}`}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`text-sm px-4 py-1.5 rounded-full font-semibold transition-colors
              ${period === p.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Activity bar chart */}
      <div className="card p-4">
        <h2 className="text-base font-bold text-gray-700 mb-4">Σχόλια / δραστηριότητα ανά agent</h2>
        {chartData.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν δεδομένα</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey={dateKey} tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {AGENTS.map(a => (
                <Bar key={a} dataKey={a} stackId="a" fill={AGENT_COLORS[a]} name={a} radius={[0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Line chart for trend */}
      {chartData.length > 1 && (
        <div className="card p-4">
          <h2 className="text-base font-bold text-gray-700 mb-4">Τάση ανά agent</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey={dateKey} tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {AGENTS.map(a => (
                <Line key={a} type="monotone" dataKey={a} stroke={AGENT_COLORS[a]} strokeWidth={2} dot={false} name={a} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Hourly distribution */}
      <div className="card p-4">
        <h2 className="text-base font-bold text-gray-700 mb-4">Κατανομή ανά ώρα (8:00–16:00)</h2>
        {(data.hourly || []).every(h => h.count === 0) ? (
          <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν δεδομένα</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.hourly} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [v, 'Σχόλια']} />
              <Bar dataKey="count" fill="#6366f1" name="Σχόλια" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Agent comparison table */}
      <div className="card p-4">
        <h2 className="text-base font-bold text-gray-700 mb-3">Σύγκριση agents — τελευταίοι 30 ημέρες</h2>
        <div className="grid grid-cols-3 gap-4">
          {AGENTS.map(agent => {
            const last30 = (data.daily || []).slice(-30)
            const total = last30.reduce((s, d) => s + (d[agent] || 0), 0)
            const max = Math.max(...last30.map(d => d[agent] || 0))
            const avg = last30.length ? (total / last30.length).toFixed(1) : '0'
            return (
              <div key={agent} className="text-center p-3 rounded-xl border border-gray-100 bg-gray-50">
                <div className="text-xs font-bold text-gray-500 mb-2">{agent}</div>
                <div className="text-3xl font-black" style={{ color: AGENT_COLORS[agent] }}>{total}</div>
                <div className="text-xs text-gray-400 mt-1">σχόλια / 30 ημέρες</div>
                <div className="mt-2 text-xs text-gray-500">
                  <span>μέσος: {avg}/ημ</span>
                  <span className="ml-3">max: {max}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
