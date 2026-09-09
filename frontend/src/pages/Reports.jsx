import { useEffect, useState, useMemo } from 'react'
import { getOccupancy, getByChannel, getFinancial, getPriceAnalytics, getExpenses } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth } from 'date-fns'

const CHANNEL_COLORS_PIE = {
  booking: '#003580', airbnb: '#FF5A5F', direct: '#10B981',
  oga: '#8B5CF6', social_tourism: '#14B8A6', other: '#9CA3AF',
}
const CH_LABELS = {
  booking: 'Booking.com', airbnb: 'Airbnb', direct: 'Απευθείας',
  oga: 'ΟΓΑ', social_tourism: 'Κοιν.Τουρισμός', other: 'Άλλο',
}

const today = new Date()
const DEF_FROM = format(startOfYear(today), 'yyyy-MM-dd')
const DEF_TO = format(endOfYear(today), 'yyyy-MM-dd')

function formatEur(v) {
  return `€${Number(v).toLocaleString('el-GR', { minimumFractionDigits: 0 })}`
}

export default function Reports() {
  const [tab, setTab] = useState('occupancy')
  const [from, setFrom] = useState(DEF_FROM)
  const [to, setTo] = useState(DEF_TO)
  const [occData, setOccData] = useState(null)
  const [chData, setChData] = useState(null)
  const [finData, setFinData] = useState(null)
  const [priceData, setPriceData] = useState(null)
  const [finGroup, setFinGroup] = useState('month')
  const [priceGroup, setPriceGroup] = useState('month')
  const [loading, setLoading] = useState(false)
  const [expenseList, setExpenseList] = useState([])
  const [totalExpenses, setTotalExpenses] = useState(0)

  // Always reload expenses when date range changes
  useEffect(() => {
    getExpenses({ from_date: from, to_date: to }).then(r => {
      setExpenseList(r.data.expenses || [])
      setTotalExpenses(r.data.total || 0)
    }).catch(() => {})
  }, [from, to])

  // Expenses by month key "YYYY-MM" for joining with financial data
  const expByMonth = useMemo(() => {
    const map = {}
    expenseList.forEach(e => {
      const key = e.date.slice(0, 7)
      map[key] = (map[key] || 0) + e.amount
    })
    return map
  }, [expenseList])

  const load = async () => {
    setLoading(true)
    try {
      if (tab === 'occupancy') {
        const r = await getOccupancy({ from_date: from, to_date: to })
        setOccData(r.data)
      } else if (tab === 'channel') {
        const r = await getByChannel({ from_date: from, to_date: to })
        setChData(r.data)
      } else if (tab === 'financial') {
        const r = await getFinancial({ from_date: from, to_date: to, group_by: finGroup })
        setFinData(r.data)
      } else if (tab === 'price') {
        const r = await getPriceAnalytics({ from_date: from, to_date: to, group_by: priceGroup })
        setPriceData(r.data)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tab, from, to, finGroup, priceGroup])

  const tabs = [
    { id: 'occupancy', label: 'Πληρότητα' },
    { id: 'channel', label: 'Ανά Κανάλι' },
    { id: 'financial', label: 'Οικονομικά' },
    { id: 'price', label: 'Τιμή/Νύχτα' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Αναφορές & Στατιστικά</h2>

      {/* Date range */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="rep-from" className="label">Από</label>
          <input id="rep-from" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="rep-to" className="label">Έως</label>
          <input id="rep-to" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {[
            { label: 'Τρέχων Μήνας', f: format(startOfMonth(today), 'yyyy-MM-dd'), t: format(endOfMonth(today), 'yyyy-MM-dd') },
            { label: 'Φέτος', f: DEF_FROM, t: DEF_TO },
          ].map((q) => (
            <button key={q.label} onClick={() => { setFrom(q.f); setTo(q.t) }} className="btn-secondary text-xs">{q.label}</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-8 text-gray-400">Φόρτωση...</div>}

      {/* OCCUPANCY */}
      {!loading && tab === 'occupancy' && occData && occData.summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Μ.Ο. Πληρότητας</p><p className="text-2xl font-bold text-blue-700">{occData.summary.avg_occupancy_rate}%</p></div>
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Μονάδες</p><p className="text-2xl font-bold text-gray-700">{occData.summary.total_units}</p></div>
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Συνολικά Έσοδα</p><p className="text-2xl font-bold text-green-700">{formatEur(occData.summary.total_revenue)}</p></div>
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Καθαρά Έσοδα</p><p className="text-2xl font-bold text-emerald-700">{formatEur(occData.summary.total_net_revenue)}</p></div>
            <div className="bg-white rounded-xl border border-red-100 p-4"><p className="text-xs text-gray-700 mb-1">Σύνολο Εξόδων</p><p className="text-2xl font-bold text-red-600">{formatEur(totalExpenses)}</p></div>
            <div className={`rounded-xl border p-4 ${occData.summary.total_net_revenue - totalExpenses >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs text-gray-700 mb-1">Καθαρό Κέρδος</p>
              <p className={`text-2xl font-bold ${occData.summary.total_net_revenue - totalExpenses >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatEur(occData.summary.total_net_revenue - totalExpenses)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Πληρότητα ανά Μονάδα (%)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={occData.units} margin={{ top: 0, right: 0, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="unit_name" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="occupancy_rate" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Πληρότητα" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-gray-50 text-xs text-gray-700 uppercase">
                  <th className="text-left px-4 py-3">Μονάδα</th>
                  <th className="text-right px-4 py-3">Πληρ. Μέρες</th>
                  <th className="text-right px-4 py-3">Ελεύθ. Μέρες</th>
                  <th className="text-right px-4 py-3">Πληρότητα</th>
                  <th className="text-right px-4 py-3">Έσοδα</th>
                  <th className="text-right px-4 py-3">Προμήθειες</th>
                  <th className="text-right px-4 py-3">Καθαρά</th>
                  <th className="text-right px-4 py-3 text-red-500">Έξοδα*</th>
                  <th className="text-right px-4 py-3 text-emerald-600">Κέρδος</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {occData.units.map((u) => {
                    const profit = u.net_revenue - totalExpenses / occData.units.length
                    return (
                    <tr key={u.unit_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{u.unit_name}</td>
                      <td className="px-4 py-3 text-right">{u.occupied_days}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{u.free_days}</td>
                      <td className="px-4 py-3 text-right"><span className={`font-semibold ${u.occupancy_rate >= 70 ? 'text-green-600' : u.occupancy_rate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{u.occupancy_rate}%</span></td>
                      <td className="px-4 py-3 text-right">{formatEur(u.total_revenue)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{formatEur(u.total_revenue - u.net_revenue)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{formatEur(u.net_revenue)}</td>
                      <td className="px-4 py-3 text-right text-red-500">{formatEur(totalExpenses / occData.units.length)}</td>
                      <td className="px-4 py-3 text-right font-bold"><span className={profit >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatEur(profit)}</span></td>
                    </tr>
                  )})}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300 text-xs text-gray-500">
                    <td colSpan={8} className="px-4 py-2 italic">* Τα έξοδα κατανέμονται ισόποσα ανά μονάδα. Για ακριβή κατανομή χρησιμοποιήστε τη στήλη Μονάδα στα Έξοδα.</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* BY CHANNEL */}
      {!loading && tab === 'channel' && chData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Σύνολο Κρατήσεων</p><p className="text-2xl font-bold text-gray-700">{chData.total_bookings}</p></div>
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Συνολικά Έσοδα</p><p className="text-2xl font-bold text-green-700">{formatEur(chData.total_revenue)}</p></div>
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Καθαρά Έσοδα</p><p className="text-2xl font-bold text-emerald-700">{formatEur(chData.total_net_revenue)}</p></div>
            <div className="bg-white rounded-xl border border-red-100 p-4"><p className="text-xs text-gray-700 mb-1">Σύνολο Εξόδων</p><p className="text-2xl font-bold text-red-600">{formatEur(totalExpenses)}</p></div>
            <div className={`rounded-xl border p-4 ${chData.total_net_revenue - totalExpenses >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs text-gray-700 mb-1">Καθαρό Κέρδος</p>
              <p className={`text-2xl font-bold ${chData.total_net_revenue - totalExpenses >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatEur(chData.total_net_revenue - totalExpenses)}</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Κρατήσεις ανά Κανάλι</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={chData.channels} dataKey="bookings_count" nameKey="channel" cx="50%" cy="50%" outerRadius={80} label={({ channel, percent }) => `${CH_LABELS[channel] || channel} ${(percent * 100).toFixed(0)}%`}>
                    {chData.channels.map((c) => <Cell key={c.channel} fill={CHANNEL_COLORS_PIE[c.channel] || '#9CA3AF'} />)}
                  </Pie>
                  <Tooltip formatter={(v, name) => [v, CH_LABELS[name] || name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Έσοδα ανά Κανάλι (€)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chData.channels} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="channel" tick={{ fontSize: 11 }} tickFormatter={(v) => CH_LABELS[v] || v} width={70} />
                  <Tooltip formatter={(v) => formatEur(v)} />
                  <Bar dataKey="net_revenue" fill="#10B981" radius={[0, 4, 4, 0]} name="Καθαρά" />
                  <Bar dataKey="total_commission" fill="#F59E0B" radius={[0, 4, 4, 0]} name="Προμήθεια" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-gray-50 text-xs text-gray-700 uppercase">
                  <th className="text-left px-4 py-3">Κανάλι</th>
                  <th className="text-right px-4 py-3">Κρατήσεις</th>
                  <th className="text-right px-4 py-3">Νύχτες</th>
                  <th className="text-right px-4 py-3">Έσοδα</th>
                  <th className="text-right px-4 py-3">Προμήθεια</th>
                  <th className="text-right px-4 py-3">Καθαρά</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {chData.channels.map((c) => (
                    <tr key={c.channel} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{CH_LABELS[c.channel] || c.channel}</td>
                      <td className="px-4 py-3 text-right">{c.bookings_count}</td>
                      <td className="px-4 py-3 text-right">{c.total_nights}</td>
                      <td className="px-4 py-3 text-right">{formatEur(c.total_revenue)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{formatEur(c.total_commission)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{formatEur(c.net_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* FINANCIAL */}
      {!loading && tab === 'financial' && finData && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Συνολικά Έσοδα</p><p className="text-2xl font-bold text-green-700">{formatEur(finData.data.reduce((s,d)=>s+d.total_revenue,0))}</p></div>
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Καθαρά Έσοδα</p><p className="text-2xl font-bold text-emerald-700">{formatEur(finData.data.reduce((s,d)=>s+d.net_revenue,0))}</p></div>
            <div className="bg-white rounded-xl border border-red-100 p-4"><p className="text-xs text-gray-700 mb-1">Σύνολο Εξόδων</p><p className="text-2xl font-bold text-red-600">{formatEur(totalExpenses)}</p></div>
            <div className={`rounded-xl border p-4 ${finData.data.reduce((s,d)=>s+d.net_revenue,0) - totalExpenses >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs text-gray-700 mb-1">Καθαρό Κέρδος</p>
              <p className={`text-2xl font-bold ${finData.data.reduce((s,d)=>s+d.net_revenue,0) - totalExpenses >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatEur(finData.data.reduce((s,d)=>s+d.net_revenue,0) - totalExpenses)}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {[{ v: 'month', l: 'Ανά Μήνα' }, { v: 'week', l: 'Ανά Εβδομάδα' }, { v: 'channel', l: 'Ανά Κανάλι' }].map((g) => (
              <button key={g.v} onClick={() => setFinGroup(g.v)} className={`btn-secondary text-xs ${finGroup === g.v ? 'bg-blue-600 text-white border-blue-600' : ''}`}>{g.l}</button>
            ))}
          </div>

          {/* Chart: revenue + commissions + expenses + profit */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Έσοδα, Έξοδα & Κέρδος (€)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={finData.data.map(d => ({
                  ...d,
                  expenses: -(expByMonth[d.key] || (finGroup !== 'month' ? 0 : 0)),
                  profit: d.net_revenue - (expByMonth[d.key] || 0),
                }))}
                margin={{ top: 10, right: 10, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#666" strokeWidth={1} />
                <Tooltip formatter={(v, name) => [formatEur(Math.abs(v)), name]} />
                <Legend />
                <Bar dataKey="net_revenue" fill="#10B981" radius={[4,4,0,0]} name="Καθαρά Έσοδα" stackId="a" />
                <Bar dataKey="total_commission" fill="#F59E0B" radius={[0,0,0,0]} name="Προμήθειες" stackId="a" />
                <Bar dataKey="expenses" fill="#EF4444" radius={[4,4,0,0]} name="Έξοδα" />
                <Bar dataKey="profit" fill="#059669" radius={[4,4,0,0]} name="Καθαρό Κέρδος" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-gray-50 text-xs text-gray-700 uppercase">
                  <th className="text-left px-4 py-3">Περίοδος</th>
                  <th className="text-right px-4 py-3">Κρατήσεις</th>
                  <th className="text-right px-4 py-3">Νύχτες</th>
                  <th className="text-right px-4 py-3">Έσοδα</th>
                  <th className="text-right px-4 py-3">Προμήθειες</th>
                  <th className="text-right px-4 py-3">Καθαρά</th>
                  <th className="text-right px-4 py-3 text-red-500">Έξοδα</th>
                  <th className="text-right px-4 py-3 text-emerald-600">Κέρδος</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {finData.data.map((d) => {
                    const exp = expByMonth[d.key] || 0
                    const profit = d.net_revenue - exp
                    return (
                    <tr key={d.key} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{d.label}</td>
                      <td className="px-4 py-3 text-right">{d.bookings_count}</td>
                      <td className="px-4 py-3 text-right">{d.nights}</td>
                      <td className="px-4 py-3 text-right">{formatEur(d.total_revenue)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{formatEur(d.total_commission)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{formatEur(d.net_revenue)}</td>
                      <td className="px-4 py-3 text-right text-red-500">{exp > 0 ? formatEur(exp) : '—'}</td>
                      <td className="px-4 py-3 text-right font-bold"><span className={profit >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatEur(profit)}</span></td>
                    </tr>
                  )})}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold text-sm">
                    <td className="px-4 py-3" colSpan={3}>ΣΥΝΟΛΟ</td>
                    <td className="px-4 py-3 text-right">{formatEur(finData.data.reduce((s,d)=>s+d.total_revenue,0))}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{formatEur(finData.data.reduce((s,d)=>s+d.total_commission,0))}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{formatEur(finData.data.reduce((s,d)=>s+d.net_revenue,0))}</td>
                    <td className="px-4 py-3 text-right text-red-500">{formatEur(totalExpenses)}</td>
                    <td className="px-4 py-3 text-right font-bold">
                      <span className={finData.data.reduce((s,d)=>s+d.net_revenue,0)-totalExpenses>=0?'text-emerald-700':'text-red-600'}>
                        {formatEur(finData.data.reduce((s,d)=>s+d.net_revenue,0)-totalExpenses)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PRICE PER NIGHT */}
      {!loading && tab === 'price' && priceData && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2">
              {[{ v: 'month', l: 'Ανά Μήνα' }, { v: 'week', l: 'Ανά Εβδομάδα' }, { v: 'channel', l: 'Ανά Κανάλι' }].map((g) => (
                <button key={g.v} onClick={() => setPriceGroup(g.v)} className={`btn-secondary text-xs ${priceGroup === g.v ? 'bg-blue-600 text-white border-blue-600' : ''}`}>{g.l}</button>
              ))}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <span className="text-xs text-blue-600">Μ.Ο. τιμή/νύχτα: </span>
              <span className="font-bold text-blue-800 text-lg">€{priceData.overall_avg_price_per_night}</span>
            </div>
          </div>

          {/* Line chart - price per night over time */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Μέση Τιμή ανά Νύχτα (€)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={priceData.data} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="€" />
                <Tooltip formatter={(v) => [`€${v}`, 'Τιμή/νύχτα']} />
                <Line type="monotone" dataKey="avg_price_per_night" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Τιμή/νύχτα" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bar chart - revenue */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Συνολικά Έσοδα & Νύχτες ανά Περίοδο</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={priceData.data} margin={{ top: 0, right: 10, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, name) => name === 'total_revenue' ? formatEur(v) : v} />
                <Legend />
                <Bar dataKey="total_revenue" fill="#10B981" radius={[4, 4, 0, 0]} name="Έσοδα (€)" />
                <Bar dataKey="total_nights" fill="#93C5FD" radius={[4, 4, 0, 0]} name="Νύχτες" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-gray-50 text-xs text-gray-700 uppercase">
                  <th className="text-left px-4 py-3">Περίοδος</th>
                  <th className="text-right px-4 py-3">Κρατήσεις</th>
                  <th className="text-right px-4 py-3">Νύχτες</th>
                  <th className="text-right px-4 py-3">Έσοδα</th>
                  <th className="text-right px-4 py-3">Μ.Ο. Τιμή/Νύχτα</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {priceData.data.map((d) => (
                    <tr key={d.key} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{d.label}</td>
                      <td className="px-4 py-3 text-right">{d.bookings_count}</td>
                      <td className="px-4 py-3 text-right">{d.total_nights}</td>
                      <td className="px-4 py-3 text-right">{formatEur(d.total_revenue)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">€{d.avg_price_per_night}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
