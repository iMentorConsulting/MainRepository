import { useState, useEffect, useCallback } from 'react'
import api from '../api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import {
  BanknotesIcon, ArrowTrendingUpIcon, ClockIcon,
  FunnelIcon, ChevronDownIcon, ChevronUpIcon,
} from '@heroicons/react/24/outline'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n) {
  if (!n) return '0 €'
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function fmtK(n) {
  if (!n || n < 50) return ''
  return `${(n / 1000).toFixed(1)}K`
}

function fmtMonth(ym) {
  const [y, m] = ym.split('-')
  const names = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']
  return `${names[parseInt(m) - 1]} ${y}`
}

function isCurrentMonth(ym) {
  const now = new Date()
  return ym === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ─── Multi-select dropdown ────────────────────────────────────────────────────
function MultiSelect({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const allSelected = value.length === 0 || value.length === options.length
  const displayLabel = allSelected ? 'Όλα' : value.length === 1 ? value[0] : `${value.length} επιλεγμένα`

  function toggle(opt) {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt))
    else onChange([...value, opt])
  }
  function toggleAll() { onChange([]) }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:border-blue-400 focus:outline-none min-w-[160px] justify-between">
        <span className="text-gray-700 truncate max-w-[140px]">
          <span className="text-xs text-gray-400 mr-1">{label}:</span>
          <span className="font-medium">{displayLabel}</span>
        </span>
        {open ? <ChevronUpIcon className="w-3 h-3 text-gray-400 shrink-0" /> : <ChevronDownIcon className="w-3 h-3 text-gray-400 shrink-0" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[200px] max-h-64 overflow-y-auto">
            <button onClick={toggleAll}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 ${allSelected ? 'font-semibold text-blue-600' : 'text-gray-600'}`}>
              Όλα
            </button>
            {options.map(opt => (
              <button key={opt} onClick={() => toggle(opt)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${value.includes(opt) ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${value.includes(opt) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>
                  {value.includes(opt) && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </span>
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, color }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-100 text-blue-900',
    green: 'bg-green-50 border-green-100 text-green-900',
    orange: 'bg-orange-50 border-orange-100 text-orange-900',
    purple: 'bg-purple-50 border-purple-100 text-purple-900',
    teal: 'bg-teal-50 border-teal-100 text-teal-900',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.blue}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Custom tooltip for chart ─────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">{fmtMonth(label)}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function RevenueForecastPage() {
  const [options, setOptions] = useState({ pipelines: [], service_types: [], statuses: [] })
  const [filterPipelines, setFilterPipelines] = useState([])
  const [filterServices, setFilterServices] = useState([])
  const [filterStatuses, setFilterStatuses] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAllCases, setShowAllCases] = useState(false)
  const [caseSearch, setCaseSearch] = useState('')
  const [forecastHorizon, setForecastHorizon] = useState(12) // months shown in chart

  useEffect(() => {
    api.get('/api/cm/revenue/filter-options').then(r => setOptions(r.data)).catch(() => {})
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    filterPipelines.forEach(p => params.append('pipelines', p))
    filterServices.forEach(s => params.append('service_types', s))
    filterStatuses.forEach(s => params.append('statuses', s))
    api.get(`/api/cm/revenue/forecast?${params}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [filterPipelines, filterServices, filterStatuses])

  useEffect(() => { load() }, [load])

  // Merge forecast + actual into a single chart series
  const chartData = (() => {
    if (!data) return []
    const forecast = data.forecast_series.slice(0, forecastHorizon)
    const actualMap = Object.fromEntries(data.actual_series.map(a => [a.month, a.actual]))

    // history: last 6 months
    const historyMonths = 6
    const historyKeys = data.actual_series.slice(-historyMonths).map(a => a.month)
    const historyRows = historyKeys.map(mk => ({
      month: mk,
      actual: actualMap[mk] || 0,
      expected: null,
      isFuture: false,
    }))

    const forecastRows = forecast.map(f => ({
      month: f.month,
      expected: f.expected || null,
      actual: actualMap[f.month] || null,
      isFuture: true,
    }))

    return [...historyRows, ...forecastRows]
  })()

  const filteredCases = (data?.cases || []).filter(c =>
    !caseSearch || c.client_name?.toLowerCase().includes(caseSearch.toLowerCase()) ||
    c.service_type?.toLowerCase().includes(caseSearch.toLowerCase())
  )
  const displayedCases = showAllCases ? filteredCases : filteredCases.slice(0, 10)

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ArrowTrendingUpIcon className="w-6 h-6 text-blue-500" />
          Οικονομικές Προβλέψεις Εισπράξεων
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Γραμμική κατανομή ανείσπρακτου υπολοίπου ανά μήνα έως λήξη έργου
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
        <FunnelIcon className="w-4 h-4 text-gray-400 shrink-0" />
        <MultiSelect label="Pipeline" options={options.pipelines} value={filterPipelines} onChange={setFilterPipelines} />
        <MultiSelect label="Υπηρεσία" options={options.service_types} value={filterServices} onChange={setFilterServices} />
        <MultiSelect label="Status" options={options.statuses} value={filterStatuses} onChange={setFilterStatuses} />
        {(filterPipelines.length > 0 || filterServices.length > 0 || filterStatuses.length > 0) && (
          <button onClick={() => { setFilterPipelines([]); setFilterServices([]); setFilterStatuses([]) }}
            className="text-xs text-red-500 hover:text-red-700 underline ml-1">
            Καθαρισμός φίλτρων
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm">Υπολογισμός...</p>
          </div>
        </div>
      ) : data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <SummaryCard label="Υποθέσεις" value={`${data.summary.total_cases}`}
              sub={data.summary.excluded_cases > 0 ? `+${data.summary.excluded_cases} εξαιρέθηκαν` : null} color="blue" />
            <SummaryCard label="Συμφωνηθέν σύνολο" value={fmt(data.summary.total_agreed)} color="purple" />
            <SummaryCard label="Εισπραχθέντα" value={fmt(data.summary.total_paid)} color="green" />
            <SummaryCard label="Ανείσπρακτο" value={fmt(data.summary.total_balance)} color="orange" />
            <SummaryCard label="Πρόβλεψη 12μ" value={fmt(data.summary.expected_next_12m)}
              sub={`Πραγματικά 12μ: ${fmt(data.summary.actual_last_12m)}`} color="teal" />
          </div>

          {/* Charts: side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Actual receipts */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
                    Πραγματικές Εισπράξεις
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Τελευταίοι 12 μήνες (από Google Sheet)</p>
                </div>
                <span className="text-lg font-bold text-emerald-700">{fmt(data.summary.actual_last_12m)}</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={data.actual_series.slice(-12)}
                  margin={{ top: 20, right: 8, left: 0, bottom: 0 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: '#f0fdf4' }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow">
                          <p className="font-semibold text-gray-600 mb-1">{fmtMonth(label)}</p>
                          <p className="text-emerald-700 font-bold">{fmt(payload[0]?.value)}</p>
                        </div>
                      ) : null}
                  />
                  <Bar dataKey="actual" radius={[4, 4, 0, 0]} maxBarSize={50}>
                    {data.actual_series.slice(-12).map((entry, i) => (
                      <Cell key={i} fill={entry.actual > 0 ? '#10b981' : '#d1fae5'} />
                    ))}
                    <LabelList dataKey="actual" position="top" formatter={fmtK}
                      style={{ fontSize: 10, fontWeight: 600, fill: '#059669' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Forecast */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" />
                    Προβλεπόμενες Εισπράξεις
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Γραμμική κατανομή ανείσπρακτου υπολοίπου</p>
                </div>
                <div className="flex gap-1">
                  {[6, 12, 18, 24].map(m => (
                    <button key={m} onClick={() => setForecastHorizon(m)}
                      className={`px-2 py-0.5 text-xs rounded border font-medium transition-colors ${forecastHorizon === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'}`}>
                      {m}μ
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={data.forecast_series.slice(0, forecastHorizon)}
                  margin={{ top: 20, right: 8, left: 0, bottom: 0 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: '#eff6ff' }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow">
                          <p className="font-semibold text-gray-600 mb-1">{fmtMonth(label)}</p>
                          <p className="text-blue-700 font-bold">{fmt(payload[0]?.value)}</p>
                        </div>
                      ) : null}
                  />
                  <Bar dataKey="expected" radius={[4, 4, 0, 0]} maxBarSize={50}>
                    {data.forecast_series.slice(0, forecastHorizon).map((entry, i) => (
                      <Cell key={i} fill={isCurrentMonth(entry.month) ? '#2563eb' : '#93c5fd'} />
                    ))}
                    <LabelList dataKey="expected" position="top" formatter={fmtK}
                      style={{ fontSize: 10, fontWeight: 600, fill: '#1d4ed8' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Case breakdown table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <ClockIcon className="w-4 h-4 text-gray-400" />
                Ανάλυση ανά υπόθεση ({data.cases.length})
              </h2>
              <input
                value={caseSearch} onChange={e => setCaseSearch(e.target.value)}
                placeholder="Αναζήτηση..."
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-48"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left">Πελάτης</th>
                    <th className="px-4 py-2.5 text-left">Υπηρεσία</th>
                    <th className="px-4 py-2.5 text-left">Status</th>
                    <th className="px-4 py-2.5 text-right">Ανείσπρακτο</th>
                    <th className="px-4 py-2.5 text-right">Λήξη</th>
                    <th className="px-4 py-2.5 text-right">Μήνες</th>
                    <th className="px-4 py-2.5 text-right">Μηνιαία πρόβλεψη</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayedCases.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{c.client_name}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{c.service_type || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-orange-700">{fmt(c.balance)}</td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        <span className={c.is_overdue ? 'text-red-600 font-medium' : c.deadline_estimated ? 'text-gray-400 italic' : 'text-gray-600'}>
                          {c.deadline ? new Date(c.deadline).toLocaleDateString('el-GR') : '—'}
                          {c.deadline_estimated && ' *'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{c.months_left}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-blue-700">{fmt(c.monthly_expected)}/μήνα</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredCases.length > 10 && (
              <div className="px-4 py-3 border-t border-gray-100 text-center">
                <button onClick={() => setShowAllCases(s => !s)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                  {showAllCases ? 'Λιγότερα' : `Εμφάνιση όλων (${filteredCases.length})`}
                </button>
              </div>
            )}
            {filteredCases.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">
                Δεν βρέθηκαν υποθέσεις με ανείσπρακτο υπόλοιπο
              </div>
            )}
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400">* Εκτιμώμενη λήξη (δεν έχει οριστεί προθεσμία)</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
