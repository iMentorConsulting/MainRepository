import { useEffect, useState, useMemo } from 'react'
import { getOccupancy, getByChannel, getFinancial, getPriceAnalytics, getExpenses, getLoanTotal, getOwners, getOwnerReport, sendOwnerReport } from '../api'
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
  const [totalLoans, setTotalLoans] = useState(0)
  const [loanByMonth, setLoanByMonth] = useState({})

  // Owner report state
  const [owners, setOwners] = useState([])
  const [ownerReport, setOwnerReport] = useState(null)
  const [ownerLoading, setOwnerLoading] = useState(false)
  const [ownerSending, setOwnerSending] = useState(false)
  const [selectedOwner, setSelectedOwner] = useState('')
  const nowDate = new Date()
  const [ownerMonth, setOwnerMonth] = useState(nowDate.getMonth() + 1)
  const [ownerYear, setOwnerYear] = useState(nowDate.getFullYear())

  useEffect(() => {
    if (tab === 'owners') getOwners().then(r => setOwners(r.data)).catch(() => {})
  }, [tab])

  const loadOwnerReport = async () => {
    if (!selectedOwner) return
    setOwnerLoading(true)
    try {
      const r = await getOwnerReport(selectedOwner, ownerYear, ownerMonth)
      setOwnerReport(r.data)
    } catch { setOwnerReport(null) } finally { setOwnerLoading(false) }
  }

  useEffect(() => { if (tab === 'owners' && selectedOwner) loadOwnerReport() }, [selectedOwner, ownerMonth, ownerYear])

  const handleSendOwnerEmail = async () => {
    setOwnerSending(true)
    try {
      await sendOwnerReport(selectedOwner, ownerYear, ownerMonth)
      alert('Email εστάλη!')
    } catch { alert('Σφάλμα αποστολής') } finally { setOwnerSending(false) }
  }

  function fmtEurO(n) {
    return `€${Number(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const MONTH_NAMES_GR = ['','Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος',
    'Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος']

  useEffect(() => {
    getExpenses({ from_date: from, to_date: to }).then(r => {
      setExpenseList(r.data.expenses || [])
      setTotalExpenses(r.data.total || 0)
    }).catch(() => {})
    getLoanTotal({ from_date: from, to_date: to }).then(r => {
      setTotalLoans(r.data.total || 0)
      setLoanByMonth(r.data.by_month || {})
    }).catch(() => {})
  }, [from, to])

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
    { id: 'owners', label: 'Ιδιοκτήτες' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Αναφορές & Στατιστικά</h2>

      {/* Date range — hidden on owner tab which has its own controls */}
      {tab !== 'owners' && <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
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
      </div>}

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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Μ.Ο. Πληρότητας</p><p className="text-2xl font-bold text-blue-700">{occData.summary.avg_occupancy_rate}%</p></div>
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Μονάδες</p><p className="text-2xl font-bold text-gray-700">{occData.summary.total_units}</p></div>
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Συνολικά Έσοδα</p><p className="text-2xl font-bold text-green-700">{formatEur(occData.summary.total_revenue)}</p></div>
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Καθαρά Έσοδα</p><p className="text-2xl font-bold text-emerald-700">{formatEur(occData.summary.total_net_revenue)}</p></div>
            <div className="bg-white rounded-xl border border-red-100 p-4"><p className="text-xs text-gray-700 mb-1">Σύνολο Εξόδων</p><p className="text-2xl font-bold text-red-600">{formatEur(totalExpenses)}</p></div>
            <div className="bg-white rounded-xl border border-orange-100 p-4"><p className="text-xs text-gray-700 mb-1">Δανειακές Υποχρ.</p><p className="text-2xl font-bold text-orange-600">{formatEur(totalLoans)}</p></div>
            <div className={`rounded-xl border p-4 ${occData.summary.total_net_revenue - totalExpenses - totalLoans >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs text-gray-700 mb-1">Καθαρό Cash Flow</p>
              <p className={`text-2xl font-bold ${occData.summary.total_net_revenue - totalExpenses - totalLoans >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatEur(occData.summary.total_net_revenue - totalExpenses - totalLoans)}</p>
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
                  <th className="text-right px-4 py-3 text-orange-500">Δάνεια*</th>
                  <th className="text-right px-4 py-3 text-emerald-600">Cash Flow</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {occData.units.map((u) => {
                    const unitExp = u.unit_expenses ?? 0
                    const unitLoans = u.unit_loan_payments ?? 0
                    const cashflow = u.unit_profit ?? (u.net_revenue - unitExp - unitLoans)
                    const hasTypeShare = (u.type_expenses ?? 0) > 0 || (u.type_loan_payments ?? 0) > 0
                    return (
                    <tr key={u.unit_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">
                        {u.unit_name}
                        {hasTypeShare && (
                          <span className="ml-1 text-xs text-gray-400" title={`+€${((u.type_expenses??0)+(u.type_loan_payments??0)).toFixed(0)} κοινόχρηστα τύπου`}>⊕</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{u.occupied_days}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{u.free_days}</td>
                      <td className="px-4 py-3 text-right"><span className={`font-semibold ${u.occupancy_rate >= 70 ? 'text-green-600' : u.occupancy_rate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{u.occupancy_rate}%</span></td>
                      <td className="px-4 py-3 text-right">{formatEur(u.total_revenue)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{formatEur(u.total_revenue - u.net_revenue)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{formatEur(u.net_revenue)}</td>
                      <td className="px-4 py-3 text-right text-red-500">{unitExp > 0 ? formatEur(unitExp) : '—'}</td>
                      <td className="px-4 py-3 text-right text-orange-500">{unitLoans > 0 ? formatEur(unitLoans) : '—'}</td>
                      <td className="px-4 py-3 text-right font-bold"><span className={cashflow >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatEur(cashflow)}</span></td>
                    </tr>
                  )})}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300 text-xs text-gray-500">
                    <td colSpan={9} className="px-4 py-2 italic">Έξοδα/Δάνεια: μόνο ποσά αποδοθέντα στη συγκεκριμένη μονάδα. ⊕ = υπάρχουν κοινόχρηστα έξοδα/δάνεια τύπου μονάδας (εμφανίζονται στο Σύνολο).</td>
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Σύνολο Κρατήσεων</p><p className="text-2xl font-bold text-gray-700">{chData.total_bookings}</p></div>
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Συνολικά Έσοδα</p><p className="text-2xl font-bold text-green-700">{formatEur(chData.total_revenue)}</p></div>
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Καθαρά Έσοδα</p><p className="text-2xl font-bold text-emerald-700">{formatEur(chData.total_net_revenue)}</p></div>
            <div className="bg-white rounded-xl border border-red-100 p-4"><p className="text-xs text-gray-700 mb-1">Σύνολο Εξόδων</p><p className="text-2xl font-bold text-red-600">{formatEur(totalExpenses)}</p></div>
            <div className="bg-white rounded-xl border border-orange-100 p-4"><p className="text-xs text-gray-700 mb-1">Δανειακές Υποχρ.</p><p className="text-2xl font-bold text-orange-600">{formatEur(totalLoans)}</p></div>
            <div className={`rounded-xl border p-4 ${chData.total_net_revenue - totalExpenses - totalLoans >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs text-gray-700 mb-1">Καθαρό Cash Flow</p>
              <p className={`text-2xl font-bold ${chData.total_net_revenue - totalExpenses - totalLoans >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatEur(chData.total_net_revenue - totalExpenses - totalLoans)}</p>
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Συνολικά Έσοδα</p><p className="text-2xl font-bold text-green-700">{formatEur(finData.data.reduce((s,d)=>s+d.total_revenue,0))}</p></div>
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Καθαρά Έσοδα</p><p className="text-2xl font-bold text-emerald-700">{formatEur(finData.data.reduce((s,d)=>s+d.net_revenue,0))}</p></div>
            <div className="bg-white rounded-xl border border-red-100 p-4"><p className="text-xs text-gray-700 mb-1">Σύνολο Εξόδων</p><p className="text-2xl font-bold text-red-600">{formatEur(totalExpenses)}</p></div>
            <div className="bg-white rounded-xl border border-orange-100 p-4"><p className="text-xs text-gray-700 mb-1">Δανειακές Υποχρ.</p><p className="text-2xl font-bold text-orange-600">{formatEur(totalLoans)}</p></div>
            <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-700 mb-1">Σύνολο Κόστους</p><p className="text-2xl font-bold text-red-700">{formatEur(totalExpenses + totalLoans)}</p></div>
            <div className={`rounded-xl border p-4 ${finData.data.reduce((s,d)=>s+d.net_revenue,0) - totalExpenses - totalLoans >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs text-gray-700 mb-1">Καθαρό Cash Flow</p>
              <p className={`text-2xl font-bold ${finData.data.reduce((s,d)=>s+d.net_revenue,0) - totalExpenses - totalLoans >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatEur(finData.data.reduce((s,d)=>s+d.net_revenue,0) - totalExpenses - totalLoans)}</p>
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
                  expenses: expByMonth[d.key] || 0,
                  loans: loanByMonth[d.key] || 0,
                  cashflow: d.net_revenue - (expByMonth[d.key] || 0) - (loanByMonth[d.key] || 0),
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
                <Bar dataKey="loans" fill="#F97316" radius={[4,4,0,0]} name="Δάνεια" />
                <Bar dataKey="cashflow" fill="#059669" radius={[4,4,0,0]} name="Cash Flow" />
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
                  <th className="text-right px-4 py-3 text-orange-500">Δάνεια</th>
                  <th className="text-right px-4 py-3 text-emerald-600">Cash Flow</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {finData.data.map((d) => {
                    const exp = expByMonth[d.key] || 0
                    const loan = loanByMonth[d.key] || 0
                    const cashflow = d.net_revenue - exp - loan
                    return (
                    <tr key={d.key} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{d.label}</td>
                      <td className="px-4 py-3 text-right">{d.bookings_count}</td>
                      <td className="px-4 py-3 text-right">{d.nights}</td>
                      <td className="px-4 py-3 text-right">{formatEur(d.total_revenue)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{formatEur(d.total_commission)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{formatEur(d.net_revenue)}</td>
                      <td className="px-4 py-3 text-right text-red-500">{exp > 0 ? formatEur(exp) : '—'}</td>
                      <td className="px-4 py-3 text-right text-orange-500">{loan > 0 ? formatEur(loan) : '—'}</td>
                      <td className="px-4 py-3 text-right font-bold"><span className={cashflow >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatEur(cashflow)}</span></td>
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
                    <td className="px-4 py-3 text-right text-orange-500">{totalLoans > 0 ? formatEur(totalLoans) : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold">
                      <span className={finData.data.reduce((s,d)=>s+d.net_revenue,0)-totalExpenses-totalLoans>=0?'text-emerald-700':'text-red-600'}>
                        {formatEur(finData.data.reduce((s,d)=>s+d.net_revenue,0)-totalExpenses-totalLoans)}
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

      {/* ── Owner Report Tab ─────────────────────────────── */}
      {tab === 'owners' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="label">Ιδιοκτήτης</label>
              <select className="input" value={selectedOwner} onChange={e => { setSelectedOwner(e.target.value); setOwnerReport(null) }}>
                <option value="">-- Επιλέξτε --</option>
                {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Μήνας</label>
              <select className="input" value={ownerMonth} onChange={e => setOwnerMonth(+e.target.value)}>
                {MONTH_NAMES_GR.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Έτος</label>
              <input type="number" className="input w-24" value={ownerYear} onChange={e => setOwnerYear(+e.target.value)} />
            </div>
            <button onClick={loadOwnerReport} disabled={!selectedOwner || ownerLoading} className="btn-primary text-sm">
              {ownerLoading ? 'Φόρτωση...' : 'Εμφάνιση'}
            </button>
          </div>

          {ownerLoading && <div className="text-center py-10 text-gray-400">Φόρτωση αναφοράς...</div>}

          {!ownerLoading && ownerReport && (() => {
            const s = ownerReport.summary
            const o = ownerReport.owner
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="font-bold text-gray-800 text-lg">Αναφορά: {o.name}</h3>
                    <p className="text-sm text-gray-500">{ownerReport.period.label} · Μονάδες: {ownerReport.units.map(u => u.name).join(' · ') || '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Αμοιβή Διαχειριστή: {o.management_fee_percent}% (χρεώνεται στον ιδιοκτήτη)</p>
                  </div>
                  {o.email && (
                    <button onClick={handleSendOwnerEmail} disabled={ownerSending} className="btn-primary text-sm flex items-center gap-1">
                      {ownerSending ? '...' : '✉ Email'}
                    </button>
                  )}
                </div>

                {/* Summary tiles */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {[
                    { label: 'Συνολικά Έσοδα', value: fmtEurO(s.total_revenue), color: 'text-gray-800' },
                    { label: 'Καθαρά Έσοδα', value: fmtEurO(s.net_revenue), color: 'text-blue-700' },
                    { label: 'Έξοδα Μονάδων', value: fmtEurO(s.total_expenses), color: 'text-red-600' },
                    { label: 'Δανειακές Υποχρ.', value: fmtEurO(s.total_loan_payments ?? 0), color: 'text-orange-600' },
                    { label: `Αμοιβή Διαχ. (${o.management_fee_percent}%)`, value: fmtEurO(s.management_fee), color: 'text-amber-600' },
                  ].map(t => (
                    <div key={t.label} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                      <p className="text-xs text-gray-500 mb-1">{t.label}</p>
                      <p className={`text-lg font-bold ${t.color}`}>{t.value}</p>
                    </div>
                  ))}
                </div>

                {/* Profit */}
                <div className={`rounded-xl border-2 p-4 flex items-center justify-between ${s.owner_profit >= 0 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                  <p className="font-bold text-gray-700 text-lg">ΚΑΘΑΡΟ ΚΕΡΔΟΣ ΙΔΙΟΚΤΗΤΗ</p>
                  <p className={`text-3xl font-bold ${s.owner_profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtEurO(s.owner_profit)}</p>
                </div>

                {/* Bookings */}
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">📋 Κρατήσεις ({ownerReport.bookings.length})</h4>
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                        <th className="text-left px-3 py-2">Μονάδα</th>
                        <th className="text-left px-3 py-2">Πελάτης</th>
                        <th className="text-left px-3 py-2">Check-in</th>
                        <th className="text-center px-3 py-2">Νύχτες</th>
                        <th className="text-left px-3 py-2">Κανάλι</th>
                        <th className="text-right px-3 py-2">Έσοδα</th>
                        <th className="text-right px-3 py-2 text-red-300">Προμήθεια</th>
                        <th className="text-right px-3 py-2 text-green-300">Καθαρά</th>
                      </tr></thead>
                      <tbody>
                        {ownerReport.bookings.length === 0
                          ? <tr><td colSpan={8} className="text-center py-6 text-gray-400">Δεν υπάρχουν κρατήσεις</td></tr>
                          : ownerReport.bookings.map(b => (
                            <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium text-gray-700">{b.unit_name}</td>
                              <td className="px-3 py-2">{b.customer}</td>
                              <td className="px-3 py-2 text-gray-500">{b.check_in}</td>
                              <td className="px-3 py-2 text-center">{b.nights}</td>
                              <td className="px-3 py-2 text-gray-500">{b.channel}</td>
                              <td className="px-3 py-2 text-right">{fmtEurO(b.total_price)}</td>
                              <td className="px-3 py-2 text-right text-red-600">-{fmtEurO(b.commission)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-green-700">{fmtEurO(b.net)}</td>
                            </tr>
                          ))
                        }
                      </tbody>
                      {ownerReport.bookings.length > 0 && (
                        <tfoot><tr className="bg-gray-50 border-t-2 border-gray-300 font-bold text-sm">
                          <td colSpan={5} className="px-3 py-2 text-right">Σύνολο</td>
                          <td className="px-3 py-2 text-right">{fmtEurO(s.total_revenue)}</td>
                          <td className="px-3 py-2 text-right text-red-600">-{fmtEurO(s.total_commission)}</td>
                          <td className="px-3 py-2 text-right text-green-700">{fmtEurO(s.net_revenue)}</td>
                        </tr></tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Expenses */}
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">💶 Έξοδα Μονάδων ({ownerReport.expenses.length})</h4>
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                        <th className="text-left px-3 py-2">Ημ/νία</th>
                        <th className="text-left px-3 py-2">Κατηγορία</th>
                        <th className="text-left px-3 py-2">Περιγραφή</th>
                        <th className="text-left px-3 py-2">Μονάδα/Τύπος</th>
                        <th className="text-right px-3 py-2">Ποσό</th>
                      </tr></thead>
                      <tbody>
                        {ownerReport.expenses.length === 0
                          ? <tr><td colSpan={5} className="text-center py-6 text-gray-400">Δεν υπάρχουν έξοδα</td></tr>
                          : ownerReport.expenses.map(e => (
                            <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-500">{new Date(e.date+'T00:00:00').toLocaleDateString('el-GR')}</td>
                              <td className="px-3 py-2"><span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{e.category}</span></td>
                              <td className="px-3 py-2">{e.item}</td>
                              <td className="px-3 py-2 text-gray-400 text-xs">{e.unit_name}</td>
                              <td className="px-3 py-2 text-right font-semibold text-red-600">{fmtEurO(e.amount)}</td>
                            </tr>
                          ))
                        }
                      </tbody>
                      {ownerReport.expenses.length > 0 && (
                        <tfoot><tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                          <td colSpan={4} className="px-3 py-2 text-right">Σύνολο Εξόδων</td>
                          <td className="px-3 py-2 text-right text-red-700">{fmtEurO(s.total_expenses)}</td>
                        </tr></tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
