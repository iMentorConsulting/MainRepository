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
  AdjustmentsHorizontalIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import * as api from '../api'

const SUCCESS_FEE_DAYS = 75
const CONSULTANTS = ['STELLA', 'VALLIA', 'SOFIA']

// Stages where app fee has been paid
const APP_FEE_PAID = new Set(['Έκλεισε', 'Υποβλήθηκε Αίτηση', 'Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης'])
// Terminal stages (no further pipeline movement)
const TERMINAL = new Set(['Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης', 'Δεν Ενδιαφέρεται'])
// All "decided" stages (closed one way or another)
const CLOSED_STAGES = new Set(['Έκλεισε', 'Υποβλήθηκε Αίτηση', 'Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης'])

const CC = {
  STELLA: { bar: 'bg-pink-500',   light: 'bg-pink-50',   border: 'border-pink-200',   text: 'text-pink-700',   badge: 'bg-pink-100 text-pink-700 border-pink-200' },
  VALLIA: { bar: 'bg-purple-500', light: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700 border-purple-200' },
  SOFIA:  { bar: 'bg-indigo-500', light: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  HARIS:  { bar: 'bg-cyan-500',   light: 'bg-cyan-50',   border: 'border-cyan-200',   text: 'text-cyan-700',   badge: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
}

function fmtEur(v) {
  if (!v && v !== 0) return '—'
  return Number(v).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

function pct(n, d) {
  if (!d) return 0
  return Math.round((n / d) * 100)
}

function appFeeStatus(c) {
  const stage = c.contact_stage || 'Νέα Ανάλυση'
  if (APP_FEE_PAID.has(stage)) return 'collected'
  if (stage === 'Θετική Ανταπόκριση' || stage === 'Σε Διαπραγμάτευση') return 'expected'
  if (stage === 'Δεν Ενδιαφέρεται') return 'lost'
  return 'pipeline'
}

function successFeeStatus(c) {
  const stage = c.contact_stage || 'Νέα Ανάλυση'
  if (stage === 'Αποδοχή Ρύθμισης') return 'collected'
  if (stage === 'Απόρριψη Ρύθμισης' || stage === 'Δεν Ενδιαφέρεται') return 'lost'
  if (stage === 'Υποβλήθηκε Αίτηση') {
    if (!c.submitted_at) return 'expected'
    const due = addDays(new Date(c.submitted_at), SUCCESS_FEE_DAYS)
    return isAfter(new Date(), due) ? 'overdue' : 'expected'
  }
  return 'pipeline'
}

function successFeeDue(c) {
  const stage = c.contact_stage || 'Νέα Ανάλυση'
  if (!['Υποβλήθηκε Αίτηση', 'Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης'].includes(stage)) return null
  if (!c.submitted_at) return null
  return addDays(new Date(c.submitted_at), SUCCESS_FEE_DAYS)
}

const STATUS_LABELS = {
  collected: { label: 'Εισπράχθηκε', cls: 'bg-green-100 text-green-700' },
  expected:  { label: 'Αναμένεται',  cls: 'bg-blue-100 text-blue-700' },
  overdue:   { label: 'Καθυστέρηση', cls: 'bg-red-100 text-red-700' },
  pipeline:  { label: 'Pipeline',    cls: 'bg-amber-100 text-amber-700' },
  lost:      { label: 'Χαμένο',      cls: 'bg-gray-100 text-gray-400' },
}

export default function FinancialDashboard({ currentEmployee }) {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [empFilter, setEmpFilter] = useState('ALL')
  const [closurePct, setClosurePct] = useState(40)
  const [acceptancePct, setAcceptancePct] = useState(60)

  useEffect(() => {
    api.listCases({}).then(r => setCases(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const offerCases = useMemo(() =>
    cases.filter(c => c.commercial_offer && (c.commercial_offer.application_fee || c.commercial_offer.success_fee)),
  [cases])

  const filtered = useMemo(() =>
    empFilter === 'ALL' ? offerCases : offerCases.filter(c => c.employee === empFilter),
  [offerCases, empFilter])

  // ── Scenario Projector ────────────────────────────────────────────────────
  const scenario = useMemo(() => {
    const active = offerCases.filter(c => !TERMINAL.has(c.contact_stage || 'Νέα Ανάλυση') && !CLOSED_STAGES.has(c.contact_stage || 'Νέα Ανάλυση'))
    const count = active.length
    const totalApp = active.reduce((s, c) => s + Number(c.commercial_offer?.application_fee || 0), 0)
    const totalSuc = active.reduce((s, c) => s + Number(c.commercial_offer?.success_fee || 0), 0)
    const avgApp = count ? totalApp / count : 0
    const avgSuc = count ? totalSuc / count : 0
    const projClosed = count * closurePct / 100
    const projAppRev = projClosed * avgApp
    const projSucRev = projClosed * (acceptancePct / 100) * avgSuc
    return { count, projClosed: Math.round(projClosed), projAppRev, projSucRev, avgApp, avgSuc }
  }, [offerCases, closurePct, acceptancePct])

  // ── Consultant Comparison ─────────────────────────────────────────────────
  const consultantStats = useMemo(() => {
    return CONSULTANTS.map(emp => {
      const empCases = cases.filter(c => c.employee === emp)
      const total = empCases.length
      const stageCount = s => empCases.filter(c => (c.contact_stage || 'Νέα Ανάλυση') === s).length
      const closed = ['Έκλεισε', 'Υποβλήθηκε Αίτηση', 'Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης']
        .reduce((s, st) => s + stageCount(st), 0)
      const notInterested = stageCount('Δεν Ενδιαφέρεται')
      const submitted = stageCount('Υποβλήθηκε Αίτηση')
      const accepted = stageCount('Αποδοχή Ρύθμισης')
      const rejected = stageCount('Απόρριψη Ρύθμισης')
      const active = total - closed - notInterested
      const decided = closed + notInterested
      const submittedTotal = submitted + accepted + rejected
      const closureRate = pct(closed, decided)
      const acceptanceRate = pct(accepted, submittedTotal)
      const rejectionRate = pct(rejected, submittedTotal)

      const empOffer = offerCases.filter(c => c.employee === emp)
      let collected = 0, expected = 0, pipeline = 0, overdue = 0
      for (const c of empOffer) {
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

      return { emp, total, active, closed, notInterested, submitted, accepted, rejected,
        closureRate, acceptanceRate, rejectionRate, decided, submittedTotal,
        collected, expected, overdue, pipeline }
    })
  }, [cases, offerCases])

  // ── KPIs ──────────────────────────────────────────────────────────────────
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
    return { appCollected, appExpected, appPipeline, sucCollected, sucExpected, sucOverdue, sucPipeline,
      totalCollected: appCollected + sucCollected,
      totalExpected: appExpected + sucExpected,
      totalOverdue: sucOverdue,
      totalPipeline: appPipeline + sucPipeline,
    }
  }, [filtered])

  // ── Monthly Liquidity Forecast ────────────────────────────────────────────
  const monthlyForecast = useMemo(() => {
    const today = new Date()
    const months = Array.from({ length: 8 }, (_, i) => addMonths(startOfMonth(today), i))
    return months.map(monthStart => {
      let sucAmt = 0, appAmt = 0, overdueAmt = 0
      for (const c of filtered) {
        const af = Number(c.commercial_offer?.application_fee || 0)
        const sf = Number(c.commercial_offer?.success_fee || 0)
        if (sf > 0) {
          const ss = successFeeStatus(c)
          if (ss === 'expected') {
            const due = successFeeDue(c)
            if (due && isSameMonth(due, monthStart)) sucAmt += sf
          } else if (ss === 'overdue' && isSameMonth(monthStart, today)) {
            overdueAmt += sf
          }
        }
        if (af > 0 && appFeeStatus(c) === 'expected' && isSameMonth(monthStart, today)) appAmt += af
      }
      return { monthStart, label: format(monthStart, 'MMM yyyy', { locale: el }), sucAmt, appAmt, overdueAmt, total: sucAmt + appAmt + overdueAmt }
    })
  }, [filtered])

  const maxMonthly = Math.max(...monthlyForecast.map(m => m.total), 1)

  // ── Deal table ────────────────────────────────────────────────────────────
  const dealRows = useMemo(() => {
    const order = { overdue: 0, expected: 1, collected: 2, pipeline: 3, lost: 4 }
    return [...filtered].sort((a, b) => {
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

  const maxClosed = Math.max(...consultantStats.map(s => s.closed), 1)
  const maxTotal = Math.max(...consultantStats.map(s => s.total), 1)

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-blue-900">Οικονομικό Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Ρευστότητα, σύγκριση συμβούλων &amp; σενάρια εσόδων</p>
      </div>

      {/* ── Scenario Projector ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
          <AdjustmentsHorizontalIcon className="w-4 h-4 text-blue-600" />
          Σενάριο Εσόδων
          <span className="ml-1 text-xs font-normal text-gray-400">— {scenario.count} ενεργά pipeline με προσφορά</span>
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-5">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-semibold text-gray-700">% Κλεισίματος</span>
                <span className="font-black text-blue-700 text-base">{closurePct}%</span>
              </div>
              <input type="range" min={0} max={100} value={closurePct}
                onChange={e => setClosurePct(Number(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="text-xs text-gray-400 mt-1">
                Εκτίμηση: <b>{scenario.projClosed}</b> από {scenario.count} υποθέσεις θα κλείσουν (app fee ~1 εβδομάδα)
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-semibold text-gray-700">% Αποδοχής Ρύθμισης</span>
                <span className="font-black text-emerald-700 text-base">{acceptancePct}%</span>
              </div>
              <input type="range" min={0} max={100} value={acceptancePct}
                onChange={e => setAcceptancePct(Number(e.target.value))}
                className="w-full accent-emerald-600" />
              <div className="text-xs text-gray-400 mt-1">
                Εκτίμηση: <b>{Math.round(scenario.projClosed * acceptancePct / 100)}</b> αποδοχές ρύθμισης (success fee ~75 ημέρες)
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-center flex flex-col justify-between">
              <div>
                <div className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-0.5">Ποσό Αίτησης</div>
                <div className="text-xs text-blue-400 mb-2">~1 εβδομάδα</div>
              </div>
              <div>
                <div className="text-2xl font-black text-blue-800">{fmtEur(scenario.projAppRev)}</div>
                <div className="text-xs text-blue-400 mt-1">μέσος: {fmtEur(scenario.avgApp)}/υπόθ.</div>
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center flex flex-col justify-between">
              <div>
                <div className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-0.5">Success Fee</div>
                <div className="text-xs text-emerald-400 mb-2">~75 ημέρες</div>
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-800">{fmtEur(scenario.projSucRev)}</div>
                <div className="text-xs text-emerald-400 mt-1">μέσος: {fmtEur(scenario.avgSuc)}/υπόθ.</div>
              </div>
            </div>
            <div className="col-span-2 rounded-xl bg-purple-50 border border-purple-200 p-4 text-center">
              <div className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-1">Σύνολο Αναμενόμενων Εσόδων</div>
              <div className="text-3xl font-black text-purple-800">{fmtEur(scenario.projAppRev + scenario.projSucRev)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Consultant Comparison ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-black text-gray-700 mb-5 flex items-center gap-2">
          <UserGroupIcon className="w-4 h-4 text-blue-600" />Σύγκριση Συμβούλων
        </h2>

        {/* Per-consultant cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          {consultantStats.map(s => {
            const c = CC[s.emp]
            return (
              <div key={s.emp} className={`rounded-xl border p-4 ${c.light} ${c.border}`}>
                <div className={`text-lg font-black mb-3 ${c.text}`}>{s.emp}</div>

                <div className="space-y-1.5 text-sm mb-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Σύνολο υποθέσεων</span>
                    <span className="font-black">{s.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ενεργά pipeline</span>
                    <span className="font-bold">{s.active}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Κλειστά (app fee paid)</span>
                    <span className="font-bold text-emerald-700">{s.closed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Δεν ενδιαφέρεται</span>
                    <span className="font-bold text-red-500">{s.notInterested}</span>
                  </div>
                </div>

                {/* Closure rate bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500 font-semibold">Ποσοστό Κλεισίματος</span>
                    <span className={`font-black ${c.text}`}>{s.closureRate}%</span>
                  </div>
                  <div className="w-full bg-white/60 rounded-full h-2.5 border border-gray-200">
                    <div className={`h-2.5 rounded-full ${c.bar} transition-all`} style={{ width: `${s.closureRate}%` }} />
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.closed} κλειστά / {s.decided} αποφασισμένα</div>
                </div>

                {/* Post-submission breakdown */}
                {s.submittedTotal > 0 && (
                  <div className="border-t border-black/10 pt-2 mb-3 space-y-1">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Μετά Υποβολή ({s.submittedTotal})</div>
                    <div className="flex justify-between text-xs">
                      <span className="text-teal-600">Σε εξέλιξη</span>
                      <span className="font-bold text-teal-700">{s.submitted}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-green-600">Αποδοχή Ρύθμισης</span>
                      <span className="font-bold text-green-700">{s.accepted} ({s.acceptanceRate}%)</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-orange-500">Απόρριψη Ρύθμισης</span>
                      <span className="font-bold text-orange-600">{s.rejected} ({s.rejectionRate}%)</span>
                    </div>
                  </div>
                )}

                {/* Financial summary */}
                <div className="border-t border-black/10 pt-2 space-y-1">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Οικονομικά</div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Εισπράχθηκε</span>
                    <span className="font-black text-green-700">{fmtEur(s.collected)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Αναμένεται</span>
                    <span className="font-bold text-blue-700">{fmtEur(s.expected)}</span>
                  </div>
                  {s.overdue > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-red-500">Καθυστέρηση</span>
                      <span className="font-bold text-red-600">{fmtEur(s.overdue)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Pipeline</span>
                    <span className="font-bold text-amber-700">{fmtEur(s.pipeline)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Visual bar comparison */}
        <div className="border-t border-gray-100 pt-5">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Οπτική Σύγκριση</div>
          <div className="space-y-5">
            {[
              { label: 'Σύνολο Υποθέσεων', getValue: s => s.total, max: maxTotal },
              { label: 'Κλειστά (App Fee Paid)', getValue: s => s.closed, max: maxClosed },
              { label: 'Ποσοστό Κλεισίματος', getValue: s => s.closureRate, max: 100, suffix: '%' },
            ].map(({ label, getValue, max, suffix }) => (
              <div key={label}>
                <div className="text-xs font-semibold text-gray-500 mb-2">{label}</div>
                <div className="space-y-2">
                  {consultantStats.map(s => {
                    const val = getValue(s)
                    const w = max > 0 ? (val / max) * 100 : 0
                    const c = CC[s.emp]
                    return (
                      <div key={s.emp} className="flex items-center gap-3">
                        <div className={`text-xs font-black w-14 shrink-0 ${c.text}`}>{s.emp}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                          <div className={`h-5 rounded-full ${c.bar} transition-all duration-300`} style={{ width: `${w}%` }} />
                        </div>
                        <div className="text-xs font-black text-gray-700 w-12 text-right shrink-0">
                          {val}{suffix || ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Financial Filter ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <FunnelIcon className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-500 font-semibold">Φίλτρο οικονομικών:</span>
        {['ALL', 'STELLA', 'VALLIA', 'SOFIA', 'HARIS'].map(e => (
          <button key={e} onClick={() => setEmpFilter(e)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              empFilter === e ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'
            }`}>
            {e === 'ALL' ? 'Όλοι' : e}
          </button>
        ))}
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
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
          label="Σύνολο Προσφορών"
          value={fmtEur(filtered.reduce((s, c) => s + Number(c.commercial_offer?.application_fee || 0) + Number(c.commercial_offer?.success_fee || 0), 0))}
          sub={`${filtered.length} υποθέσεις με προσφορά`}
          color="border-purple-300 bg-purple-50" />
      </div>

      {/* ── Monthly Forecast ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
          <ChartBarIcon className="w-4 h-4 text-blue-600" />Πρόβλεψη Ρευστότητας (8 μήνες)
        </h2>
        <div className="flex items-end gap-2 h-36">
          {monthlyForecast.map((m, i) => {
            const totalH = maxMonthly > 0 ? (m.total / maxMonthly) * 100 : 0
            const isNow = i === 0
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-xs text-gray-500 font-semibold truncate">{m.total > 0 ? fmtEur(m.total) : ''}</div>
                <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                  <div className="w-full rounded-t-md overflow-hidden flex flex-col-reverse"
                    style={{ height: `${Math.max(totalH, m.total > 0 ? 8 : 0)}%` }}>
                    {m.overdueAmt > 0 && <div className="w-full bg-red-400" style={{ height: `${(m.overdueAmt / m.total) * 100}%` }} />}
                    {m.appAmt > 0 && <div className="w-full bg-blue-400" style={{ height: `${(m.appAmt / m.total) * 100}%` }} />}
                    {m.sucAmt > 0 && <div className="w-full bg-green-400" style={{ height: `${(m.sucAmt / m.total) * 100}%` }} />}
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
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400 inline-block" />Success fee</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400 inline-block" />Αίτηση</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block" />Καθυστέρηση</span>
        </div>
      </div>

      {/* ── Deals Table ─────────────────────────────────────────────────────── */}
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
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${CC[c.employee]?.badge || 'bg-gray-100 border-gray-200'}`}>
                        {c.employee}
                      </span>
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
                <td className="py-2 px-2 text-center font-mono">
                  {fmtEur(filtered.reduce((s, c) => s + Number(c.commercial_offer?.application_fee || 0), 0))}
                </td>
                <td />
                <td className="py-2 px-2 text-center font-mono">
                  {fmtEur(filtered.reduce((s, c) => s + Number(c.commercial_offer?.success_fee || 0), 0))}
                </td>
                <td /><td />
                <td className="py-2 px-2 text-center font-mono text-blue-800">
                  {fmtEur(filtered.reduce((s, c) => s + Number(c.commercial_offer?.application_fee || 0) + Number(c.commercial_offer?.success_fee || 0), 0))}
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
