import { useState, useEffect, useMemo } from 'react'
import { addDays, isAfter, startOfMonth, addMonths, format, isSameMonth } from 'date-fns'
import { el } from 'date-fns/locale'
import {
  BanknotesIcon,
  ClockIcon,
  CheckCircleIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'
import * as api from '../api'

const SUCCESS_FEE_DAYS = 75  // 2.5 months

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtEur(v) {
  if (!v && v !== 0) return '—'
  return Number(v).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

function appFeeStatus(c) {
  const stage = c.contact_stage || 'Νέα Ανάλυση'
  if (stage === 'Έκλεισε') return 'collected'
  if (stage === 'Θετική Ανταπόκριση' || stage === 'Σε Διαπραγμάτευση') return 'expected'
  if (stage === 'Δεν Ενδιαφέρεται') return 'lost'
  return 'pipeline'
}

function successFeeStatus(c) {
  if (c.status === 'completed') return 'collected'
  if (c.status === 'cancelled') return 'lost'
  if (c.status === 'submitted' || c.status === 'in_review') {
    if (!c.submitted_at) return 'expected'
    const due = addDays(new Date(c.submitted_at), SUCCESS_FEE_DAYS)
    return isAfter(new Date(), due) ? 'overdue' : 'expected'
  }
  return 'pipeline'
}

function successFeeDue(c) {
  if (!c.submitted_at) return null
  return addDays(new Date(c.submitted_at), SUCCESS_FEE_DAYS)
}

const EMPLOYEE_COLORS = {
  STELLA: 'bg-pink-100 text-pink-700 border-pink-200',
  VALLIA: 'bg-purple-100 text-purple-700 border-purple-200',
  SOFIA:  'bg-indigo-100 text-indigo-700 border-indigo-200',
  HARIS:  'bg-cyan-100 text-cyan-700 border-cyan-200',
}

const STATUS_LABELS = {
  collected: { label: 'Εισπράχθηκε', cls: 'bg-green-100 text-green-700' },
  expected:  { label: 'Αναμένεται',  cls: 'bg-blue-100 text-blue-700' },
  overdue:   { label: 'Καθυστέρηση', cls: 'bg-red-100 text-red-700' },
  pipeline:  { label: 'Pipeline',    cls: 'bg-amber-100 text-amber-700' },
  lost:      { label: 'Χαμένο',      cls: 'bg-gray-100 text-gray-400' },
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FinancialDashboard({ currentEmployee }) {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [empFilter, setEmpFilter] = useState('ALL')

  useEffect(() => {
    api.listCases({}).then(r => setCases(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Only cases with a commercial offer
  const offerCases = useMemo(() =>
    cases.filter(c => c.commercial_offer && (c.commercial_offer.application_fee || c.commercial_offer.success_fee)),
  [cases])

  const filtered = useMemo(() =>
    empFilter === 'ALL' ? offerCases : offerCases.filter(c => c.employee === empFilter),
  [offerCases, empFilter])

  // ── Summary KPIs ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let appCollected = 0, appExpected = 0, appPipeline = 0
    let sucCollected = 0, sucExpected = 0, sucOverdue = 0, sucPipeline = 0

    for (const c of filtered) {
      const af = Number(c.commercial_offer?.application_fee || 0)
      const sf = Number(c.commercial_offer?.success_fee || 0)
      const as = appFeeStatus(c)
      const ss = successFeeStatus(c)

      if (as === 'collected') appCollected += af
      else if (as === 'expected') appExpected += af
      else if (as === 'pipeline') appPipeline += af

      if (ss === 'collected') sucCollected += sf
      else if (ss === 'expected') sucExpected += sf
      else if (ss === 'overdue') sucOverdue += sf
      else if (ss === 'pipeline') sucPipeline += sf
    }

    const totalCollected = appCollected + sucCollected
    const totalExpected  = appExpected + sucExpected
    const totalOverdue   = sucOverdue
    const totalPipeline  = appPipeline + sucPipeline
    const totalOffered   = totalCollected + totalExpected + totalOverdue + totalPipeline

    return { appCollected, appExpected, appPipeline, sucCollected, sucExpected, sucOverdue, sucPipeline, totalCollected, totalExpected, totalOverdue, totalPipeline, totalOffered }
  }, [filtered])

  // ── Monthly Liquidity Forecast (current + next 7 months) ─────────────────
  const monthlyForecast = useMemo(() => {
    const today = new Date()
    const months = Array.from({ length: 8 }, (_, i) => addMonths(startOfMonth(today), i))

    return months.map(monthStart => {
      let sucAmt = 0, appAmt = 0, overdueAmt = 0

      for (const c of filtered) {
        const af = Number(c.commercial_offer?.application_fee || 0)
        const sf = Number(c.commercial_offer?.success_fee || 0)

        // Success fees: assigned to due month
        if (sf > 0) {
          const ss = successFeeStatus(c)
          if (ss === 'expected') {
            const due = successFeeDue(c)
            if (due && isSameMonth(due, monthStart)) sucAmt += sf
          } else if (ss === 'overdue') {
            // Show overdue in current month
            if (isSameMonth(monthStart, today)) overdueAmt += sf
          }
        }

        // Application fees: 'expected' ones assigned to current month as rough estimate
        if (af > 0 && appFeeStatus(c) === 'expected') {
          if (isSameMonth(monthStart, today)) appAmt += af
        }
      }

      return {
        monthStart,
        label: format(monthStart, 'MMM yyyy', { locale: el }),
        sucAmt, appAmt, overdueAmt,
        total: sucAmt + appAmt + overdueAmt,
      }
    })
  }, [filtered])

  const maxMonthly = Math.max(...monthlyForecast.map(m => m.total), 1)

  // ── Per-employee breakdown ────────────────────────────────────────────────
  const byEmployee = useMemo(() => {
    const EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA', 'HARIS']
    return EMPLOYEES.map(emp => {
      const empCases = offerCases.filter(c => c.employee === emp)
      let collected = 0, expected = 0, pipeline = 0, overdue = 0
      for (const c of empCases) {
        const af = Number(c.commercial_offer?.application_fee || 0)
        const sf = Number(c.commercial_offer?.success_fee || 0)
        const as = appFeeStatus(c)
        const ss = successFeeStatus(c)
        if (as === 'collected') collected += af
        else if (as === 'expected') expected += af
        else if (as === 'pipeline') pipeline += af
        if (ss === 'collected') collected += sf
        else if (ss === 'expected') expected += sf
        else if (ss === 'overdue') overdue += sf
        else if (ss === 'pipeline') pipeline += sf
      }
      return { emp, collected, expected, overdue, pipeline, cases: empCases.length }
    })
  }, [offerCases])

  // ── Sorted deal table ─────────────────────────────────────────────────────
  const dealRows = useMemo(() => {
    return [...filtered].sort((a, b) => {
      // Overdue first, then expected, then collected, then pipeline
      const order = { overdue: 0, expected: 1, collected: 2, pipeline: 3, lost: 4 }
      const aScore = Math.min(order[appFeeStatus(a)] ?? 3, order[successFeeStatus(a)] ?? 3)
      const bScore = Math.min(order[appFeeStatus(b)] ?? 3, order[successFeeStatus(b)] ?? 3)
      return aScore - bScore
    })
  }, [filtered])

  if (currentEmployee !== 'HARIS') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-gray-400">
          <ExclamationTriangleIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <div className="font-bold text-gray-500">Δεν έχετε πρόσβαση σε αυτή τη σελίδα.</div>
        </div>
      </div>
    )
  }

  if (loading) return <div className="p-8 text-gray-400 text-center animate-pulse">Φόρτωση…</div>

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-blue-900">Οικονομικό Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Ρευστότητα, απολαβές & πρόβλεψη εσόδων</p>
        </div>
        <div className="flex items-center gap-2">
          <FunnelIcon className="w-4 h-4 text-gray-400" />
          {['ALL','STELLA','VALLIA','SOFIA','HARIS'].map(e => (
            <button key={e} onClick={() => setEmpFilter(e)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                empFilter === e ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'
              }`}>
              {e === 'ALL' ? 'Όλοι' : e}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<CheckCircleIcon className="w-6 h-6 text-green-600" />}
          label="Εισπραχθέντα" value={fmtEur(kpis.totalCollected)}
          sub={`Αίτηση: ${fmtEur(kpis.appCollected)} | Success: ${fmtEur(kpis.sucCollected)}`}
          color="border-green-300 bg-green-50" />
        <KpiCard icon={<ClockIcon className="w-6 h-6 text-blue-600" />}
          label="Αναμενόμενα" value={fmtEur(kpis.totalExpected)}
          sub={`Αίτηση: ${fmtEur(kpis.appExpected)} | Success: ${fmtEur(kpis.sucExpected)}`}
          color="border-blue-300 bg-blue-50" />
        {kpis.totalOverdue > 0 ? (
          <KpiCard icon={<ExclamationTriangleIcon className="w-6 h-6 text-red-500" />}
            label="Καθυστερημένα" value={fmtEur(kpis.totalOverdue)}
            sub="Success fee — ημερ. λήξης πέρασε"
            color="border-red-300 bg-red-50" />
        ) : (
          <KpiCard icon={<ChartBarIcon className="w-6 h-6 text-amber-600" />}
            label="Pipeline" value={fmtEur(kpis.totalPipeline)}
            sub={`Αίτηση: ${fmtEur(kpis.appPipeline)} | Success: ${fmtEur(kpis.sucPipeline)}`}
            color="border-amber-300 bg-amber-50" />
        )}
        <KpiCard icon={<BanknotesIcon className="w-6 h-6 text-purple-600" />}
          label="Σύνολο Προσφορών" value={fmtEur(kpis.totalOffered)}
          sub={`${filtered.length} υποθέσεις με προσφορά`}
          color="border-purple-300 bg-purple-50" />
      </div>

      {/* Monthly Forecast + Employee Breakdown */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Monthly Liquidity */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
            <ChartBarIcon className="w-4 h-4 text-blue-600" />Πρόβλεψη Ρευστότητας (8 μήνες)
          </h2>
          <div className="flex items-end gap-2 h-36">
            {monthlyForecast.map((m, i) => {
              const totalH = maxMonthly > 0 ? (m.total / maxMonthly) * 100 : 0
              const sucH   = maxMonthly > 0 ? (m.sucAmt / maxMonthly) * 100 : 0
              const appH   = maxMonthly > 0 ? (m.appAmt / maxMonthly) * 100 : 0
              const ovdH   = maxMonthly > 0 ? (m.overdueAmt / maxMonthly) * 100 : 0
              const isNow  = i === 0
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-xs text-gray-500 font-semibold truncate">{m.total > 0 ? fmtEur(m.total) : ''}</div>
                  <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                    <div className="w-full rounded-t-md overflow-hidden flex flex-col-reverse"
                      style={{ height: `${Math.max(totalH, m.total > 0 ? 8 : 0)}%` }}>
                      {ovdH > 0 && <div className="w-full bg-red-400" style={{ height: `${(m.overdueAmt/m.total)*100}%` }} />}
                      {appH > 0 && <div className="w-full bg-blue-400" style={{ height: `${(m.appAmt/m.total)*100}%` }} />}
                      {sucH > 0 && <div className="w-full bg-green-400" style={{ height: `${(m.sucAmt/m.total)*100}%` }} />}
                    </div>
                  </div>
                  <div className={`text-xs text-center font-semibold truncate w-full ${isNow ? 'text-blue-700' : 'text-gray-400'}`}>
                    {m.label}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400 inline-block"/>Success fee</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400 inline-block"/>Αίτηση</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block"/>Καθυστέρηση</span>
          </div>
        </div>

        {/* Employee Breakdown */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-black text-gray-700 mb-4">Ανά Σύμβουλο</h2>
          <div className="space-y-3">
            {byEmployee.filter(e => e.cases > 0 || e.collected > 0).map(e => (
              <div key={e.emp} className={`rounded-xl border p-3 ${EMPLOYEE_COLORS[e.emp] || 'bg-gray-50 border-gray-200'}`}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="font-black text-sm">{e.emp}</span>
                  <span className="text-xs font-semibold">{e.cases} υποθ.</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div><span className="opacity-70">Εισπ.:</span> <b>{fmtEur(e.collected)}</b></div>
                  <div><span className="opacity-70">Αναμ.:</span> <b>{fmtEur(e.expected)}</b></div>
                  {e.overdue > 0 && <div className="col-span-2 text-red-600"><span className="opacity-80">Καθυστ.:</span> <b>{fmtEur(e.overdue)}</b></div>}
                  <div className="col-span-2"><span className="opacity-70">Pipeline:</span> <b>{fmtEur(e.pipeline)}</b></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Deals Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
          <BanknotesIcon className="w-4 h-4 text-blue-600" />Αναλυτικός Πίνακας Προσφορών
          <span className="ml-auto text-xs font-normal text-gray-400">{filtered.length} εγγραφές</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b-2 border-gray-100 text-xs text-gray-400 uppercase">
                <th className="text-left py-2 px-2">Πελάτης</th>
                <th className="py-2 px-2">Σύμβουλος</th>
                <th className="py-2 px-2">Αίτηση</th>
                <th className="py-2 px-2">Κατάσταση</th>
                <th className="py-2 px-2">Success Fee</th>
                <th className="py-2 px-2">Αναμ. Ημ/νία</th>
                <th className="py-2 px-2">Κατάσταση</th>
                <th className="py-2 px-2">Σύνολο</th>
              </tr>
            </thead>
            <tbody>
              {dealRows.map(c => {
                const af = Number(c.commercial_offer?.application_fee || 0)
                const sf = Number(c.commercial_offer?.success_fee || 0)
                const as = appFeeStatus(c)
                const ss = successFeeStatus(c)
                const dueDate = successFeeDue(c)
                const asInfo = STATUS_LABELS[as]
                const ssInfo = STATUS_LABELS[ss]
                return (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 px-2 font-semibold text-gray-800">{c.client_name}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${EMPLOYEE_COLORS[c.employee] || 'bg-gray-100'}`}>{c.employee}</span>
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-semibold">{af > 0 ? fmtEur(af) : '—'}</td>
                    <td className="py-2 px-2 text-center">
                      {af > 0 && <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${asInfo.cls}`}>{asInfo.label}</span>}
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-semibold">{sf > 0 ? fmtEur(sf) : '—'}</td>
                    <td className="py-2 px-2 text-center text-xs text-gray-500">
                      {dueDate ? format(dueDate, 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {sf > 0 && <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${ssInfo.cls}`}>{ssInfo.label}</span>}
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-black text-blue-800">{fmtEur(af + sf)}</td>
                  </tr>
                )
              })}
              {dealRows.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">Δεν υπάρχουν υποθέσεις με προσφορά</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-black text-sm">
                <td className="py-2 px-2 text-gray-700" colSpan={2}>Σύνολα</td>
                <td className="py-2 px-2 text-center font-mono">{fmtEur(filtered.reduce((s,c)=>s+Number(c.commercial_offer?.application_fee||0),0))}</td>
                <td />
                <td className="py-2 px-2 text-center font-mono">{fmtEur(filtered.reduce((s,c)=>s+Number(c.commercial_offer?.success_fee||0),0))}</td>
                <td /><td />
                <td className="py-2 px-2 text-center font-mono text-blue-800">
                  {fmtEur(filtered.reduce((s,c)=>s+Number(c.commercial_offer?.application_fee||0)+Number(c.commercial_offer?.success_fee||0),0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  )
}

function KpiCard({ icon, label, value, sub, color }) {
  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</span></div>
      <div className="text-2xl font-black text-gray-800">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}
