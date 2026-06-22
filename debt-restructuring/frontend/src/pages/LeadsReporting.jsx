import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import * as api from '../api'

const AGENTS = ['STELLA', 'VALLIA', 'SOFIA']
const AGENT_COLORS = { STELLA: '#3b82f6', VALLIA: '#f59e0b', SOFIA: '#10b981' }

const SERIES_PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1']
const colorFor = (key, idx) => AGENT_COLORS[key] || SERIES_PALETTE[idx % SERIES_PALETTE.length]

const VOLUME_VIEWS = [
  { id: 'total', label: 'Σύνολο' },
  { id: 'status', label: 'Ανά Status' },
  { id: 'agent', label: 'Ανά Σύμβουλο' },
]

function DailyVolumeReport() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('total')
  const [range, setRange] = useState(30) // last N days shown, 0 = all

  useEffect(() => {
    setLoading(true)
    api.getLeadsDailyVolume()
      .then(r => setData(r.data))
      .catch(() => toast.error('Σφάλμα φόρτωσης αναφοράς leads ανά ημέρα'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card p-6 text-center text-gray-400">Φόρτωση…</div>
  if (!data) return null

  const seriesKeys = view === 'status' ? data.statuses : view === 'agent' ? data.agents : ['total']
  const rows = view === 'status' ? data.daily_by_status : view === 'agent' ? data.daily_by_agent : data.daily_total
  const limited = range > 0 ? rows.slice(-range) : rows
  const grandTotal = data.daily_total.reduce((s, d) => s + d.total, 0)

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-700">Αριθμός Leads ανά Ημέρα</h2>
          <p className="text-xs text-gray-400">Σύνολο: {grandTotal} leads με αναγνωρισμένη ημερομηνία
            {data.total_leads_unparsed_date > 0 && ` · ${data.total_leads_unparsed_date} χωρίς έγκυρη ημερομηνία`}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {VOLUME_VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors
                ${view === v.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {v.label}
            </button>
          ))}
          <select value={range} onChange={e => setRange(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-full px-2 py-1 ml-2">
            <option value={30}>30 ημέρες</option>
            <option value={90}>90 ημέρες</option>
            <option value={0}>Όλες</option>
          </select>
        </div>
      </div>

      {limited.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν δεδομένα</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={limited} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {seriesKeys.map((k, i) => (
                <Bar key={k} dataKey={k} stackId="a" fill={colorFor(k, i)} name={k} radius={[0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>

          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b-2 border-blue-100">
                  <th className="th text-left">Ημερομηνία</th>
                  {seriesKeys.map(k => <th key={k} className="th">{k}</th>)}
                  {seriesKeys.length > 1 && <th className="th font-bold">Σύνολο</th>}
                </tr>
              </thead>
              <tbody>
                {[...limited].reverse().map(row => {
                  const rowTotal = seriesKeys.reduce((s, k) => s + (row[k] || 0), 0)
                  return (
                    <tr key={row.date} className="border-b border-gray-100 hover:bg-blue-50">
                      <td className="td text-left font-mono">{row.date}</td>
                      {seriesKeys.map(k => <td key={k} className="td">{row[k] || 0}</td>)}
                      {seriesKeys.length > 1 && <td className="td font-bold">{rowTotal}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

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

      {/* Daily lead volume report */}
      <DailyVolumeReport />

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
