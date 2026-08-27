import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
  Cell,
} from 'recharts'
import * as api from '../api'

const AGENTS = ['STELLA', 'VALLIA', 'SOFIA']
const AGENT_COLORS = { STELLA: '#3b82f6', VALLIA: '#f59e0b', SOFIA: '#10b981' }

// Same colors already used for status badges/pills on the Leads page (STATUS_CFG)
const STATUS_COLORS = {
  call: '#3b82f6',      // blue
  hot: '#ef4444',       // red
  active: '#f59e0b',    // yellow/amber
  deal: '#10b981',      // green
  cancelled: '#9ca3af', // gray
}

const SERIES_PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1']
const colorFor = (key, idx) => STATUS_COLORS[String(key).toLowerCase()] || AGENT_COLORS[key] || SERIES_PALETTE[idx % SERIES_PALETTE.length]

const VOLUME_VIEWS = [
  { id: 'total', label: 'Σύνολο' },
  { id: 'status', label: 'Ανά Status' },
  { id: 'agent', label: 'Ανά Σύμβουλο' },
]

const RANGE_OPTIONS = [
  { id: 'week', label: 'Εβδομάδα', days: 7 },
  { id: 'month', label: 'Μήνας', days: 30 },
  { id: '3month', label: '3 Μήνες', days: 90 },
  { id: '6month', label: '6 Μήνες', days: 180 },
  { id: 'custom', label: 'Custom' },
]

const _pad = n => String(n).padStart(2, '0')
const _isoDate = d => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`

const _valueLabel = { fontSize: 9, fill: '#fff', fontWeight: 600 }
const _hideZero = v => (v > 0 ? v : '')

function DailyVolumeReport() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('total')
  const [rangeOption, setRangeOption] = useState('month')
  const today = new Date()
  const [customFrom, setCustomFrom] = useState(_isoDate(new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())))
  const [customTo, setCustomTo] = useState(_isoDate(today))

  useEffect(() => {
    setLoading(true)
    api.getLeadsDailyVolume()
      .then(r => setData(r.data))
      .catch(() => toast.error('Σφάλμα φόρτωσης αναφοράς leads ανά ημέρα'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card p-6 text-center text-gray-400">Φόρτωση…</div>
  if (!data) return null

  const allKeys = view === 'status' ? data.statuses : view === 'agent' ? data.agents : ['total']
  const rows = view === 'status' ? data.daily_by_status : view === 'agent' ? data.daily_by_agent : data.daily_total

  let fromStr, toStr
  if (rangeOption === 'custom') {
    fromStr = customFrom || '0000-00-00'
    toStr = customTo || '9999-99-99'
  } else {
    const opt = RANGE_OPTIONS.find(o => o.id === rangeOption)
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - opt.days)
    fromStr = _isoDate(from)
    toStr = _isoDate(today)
  }
  const filtered = rows.filter(r => r.date >= fromStr && r.date <= toStr)

  // Only show series (status/agent) that actually have data within the selected range
  const seriesKeys = view === 'total' ? ['total'] : allKeys.filter(k => filtered.some(r => (r[k] || 0) > 0))
  const periodTotal = filtered.reduce((s, row) => s + seriesKeys.reduce((s2, k) => s2 + (row[k] || 0), 0), 0)

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-700">Αριθμός Leads ανά Ημέρα</h2>
          <p className="text-xs text-gray-400">Σύνολο περιόδου: {periodTotal} leads
            {data.total_leads_unparsed_date > 0 && ` · ${data.total_leads_unparsed_date} χωρίς έγκυρη ημερομηνία (σύνολο)`}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {VOLUME_VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors
                ${view === v.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {v.label}
            </button>
          ))}
          <span className="w-px h-4 bg-gray-200 mx-1" />
          {RANGE_OPTIONS.map(o => (
            <button key={o.id} onClick={() => setRangeOption(o.id)}
              className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors
                ${rangeOption === o.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {o.label}
            </button>
          ))}
          {rangeOption === 'custom' && (
            <span className="flex items-center gap-1">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="text-xs border border-gray-200 rounded-full px-2 py-1" />
              <span className="text-gray-400 text-xs">–</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="text-xs border border-gray-200 rounded-full px-2 py-1" />
            </span>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν δεδομένα</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={filtered} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {seriesKeys.map((k, i) => (
                <Bar key={k} dataKey={k} stackId="a" fill={colorFor(k, i)} name={k} radius={[0, 0, 0, 0]}>
                  {seriesKeys.length === 1 ? (
                    <LabelList dataKey={k} position="top" style={{ fontSize: 10, fill: '#374151' }} formatter={_hideZero} />
                  ) : (
                    <LabelList dataKey={k} position="center" style={_valueLabel} formatter={_hideZero} />
                  )}
                </Bar>
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
                {[...filtered].reverse().map(row => {
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

function ConversionReport() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('month') // 'month' | 'referrer' | 'consultant'

  useEffect(() => {
    setLoading(true)
    api.getLeadsConversion()
      .then(r => setData(r.data))
      .catch(() => toast.error('Σφάλμα φόρτωσης conversion stats'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card p-6 text-center text-gray-400">Φόρτωση…</div>
  if (!data) return null

  const TABS = [
    { id: 'month', label: 'Ανά Μήνα' },
    { id: 'referrer', label: 'Ανά Referrer' },
    { id: 'consultant', label: 'Ανά Σύμβουλο' },
  ]

  const rateColor = r => r >= 20 ? '#10b981' : r >= 10 ? '#f59e0b' : '#ef4444'

  const renderTable = (rows, labelKey, labelHeader) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b-2 border-blue-100 text-left">
            <th className="th">{labelHeader}</th>
            <th className="th text-right">Leads</th>
            <th className="th text-right">Deals</th>
            <th className="th text-right">Ποσοστό</th>
            <th className="th">
              <span className="invisible">bar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-green-50">
              <td className="td font-medium text-gray-700">{row[labelKey]}</td>
              <td className="td text-right text-gray-500">{row.total}</td>
              <td className="td text-right font-bold text-green-700">{row.deals}</td>
              <td className="td text-right font-black" style={{ color: rateColor(row.rate) }}>
                {row.rate}%
              </td>
              <td className="td w-32">
                <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(row.rate, 100)}%`, backgroundColor: rateColor(row.rate) }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="card p-4 space-y-4">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-700">Conversion Rate Leads → Deal</h2>
          <p className="text-xs text-gray-400">
            Σύνολο: {data.total} leads · {data.deals} Deals ·{' '}
            <span className="font-bold" style={{ color: rateColor(data.overall_rate) }}>
              {data.overall_rate}% overall
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setView(t.id)}
              className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors
                ${view === t.id ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Monthly view: line chart + table */}
      {view === 'month' && (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.by_month} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                unit="%" domain={[0, 100]} />
              <Tooltip contentStyle={{ fontSize: 12 }}
                formatter={(v, name) => name === 'rate' ? [`${v}%`, 'Conversion %'] : [v, name === 'deals' ? 'Deals' : 'Leads']} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={n => n === 'rate' ? 'Conversion %' : n === 'deals' ? 'Deals' : 'Leads'} />
              <Bar yAxisId="left" dataKey="total" fill="#93c5fd" name="total" radius={[3, 3, 0, 0]}>
                <LabelList dataKey="total" position="top" style={{ fontSize: 9, fill: '#374151' }} formatter={_hideZero} />
              </Bar>
              <Bar yAxisId="left" dataKey="deals" fill="#10b981" name="deals" radius={[3, 3, 0, 0]}>
                <LabelList dataKey="deals" position="top" style={{ fontSize: 9, fill: '#065f46' }} formatter={_hideZero} />
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="rate" stroke="#f59e0b" strokeWidth={2.5}
                dot={{ r: 3 }} name="rate" />
            </BarChart>
          </ResponsiveContainer>
          {renderTable(data.by_month, 'month', 'Μήνας')}
        </>
      )}

      {/* Referrer view */}
      {view === 'referrer' && (
        <>
          <ResponsiveContainer width="100%" height={Math.max(180, data.by_referrer.length * 32 + 40)}>
            <BarChart data={data.by_referrer} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="referrer" tick={{ fontSize: 10 }} width={100} />
              <Tooltip contentStyle={{ fontSize: 12 }}
                formatter={(v, name) => name === 'rate' ? [`${v}%`, 'Conv %'] : [v, name === 'deals' ? 'Deals' : 'Leads']} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={n => n === 'rate' ? 'Conv %' : n === 'deals' ? 'Deals' : 'Leads'} />
              <Bar dataKey="total" fill="#93c5fd" name="total" radius={[0, 3, 3, 0]}>
                <LabelList dataKey="total" position="right" style={{ fontSize: 9 }} formatter={_hideZero} />
              </Bar>
              <Bar dataKey="deals" fill="#10b981" name="deals" radius={[0, 3, 3, 0]}>
                <LabelList dataKey="deals" position="right" style={{ fontSize: 9, fill: '#065f46' }} formatter={_hideZero} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {renderTable(data.by_referrer, 'referrer', 'Referrer')}
        </>
      )}

      {/* Consultant view */}
      {view === 'consultant' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {data.by_consultant.map((c, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                <div className="text-xs font-bold text-gray-500 mb-1">{c.consultant}</div>
                <div className="text-2xl font-black" style={{ color: rateColor(c.rate) }}>{c.rate}%</div>
                <div className="text-xs text-gray-400 mt-0.5">conversion</div>
                <div className="mt-1.5 text-xs text-gray-500">
                  <span className="text-green-700 font-bold">{c.deals}</span> / {c.total} leads
                </div>
              </div>
            ))}
          </div>
          {renderTable(data.by_consultant, 'consultant', 'Σύμβουλος')}
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

      {/* Conversion rate panel */}
      <ConversionReport />

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
            <BarChart data={chartData} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey={dateKey} tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {AGENTS.map(a => (
                <Bar key={a} dataKey={a} stackId="a" fill={AGENT_COLORS[a]} name={a} radius={[0, 0, 0, 0]}>
                  <LabelList dataKey={a} position="center" style={_valueLabel} formatter={_hideZero} />
                </Bar>
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
            <BarChart data={data.hourly} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [v, 'Σχόλια']} />
              <Bar dataKey="count" fill="#6366f1" name="Σχόλια" radius={[3, 3, 0, 0]}>
                <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: '#374151' }} formatter={_hideZero} />
              </Bar>
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
