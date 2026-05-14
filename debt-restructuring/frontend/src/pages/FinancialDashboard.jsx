import { useState, useEffect, useMemo } from 'react'
import { addDays, subWeeks, startOfWeek, isAfter, format, isSameWeek } from 'date-fns'
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
  CogIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import * as api from '../api'
import { patchOffer } from '../api'
import {
  DEFAULT_PRICING_CONFIG,
  loadPricingConfig,
  savePricingConfig,
  computeOffer,
  scoreBreakdown,
} from '../utils/pricing'

const SUCCESS_FEE_DAYS = 75
const CONSULTANTS = ['STELLA', 'VALLIA', 'SOFIA']

// Stages where app fee has been paid
const APP_FEE_PAID = new Set(['Έκλεισε', 'Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης'])
// Terminal stages
const TERMINAL = new Set(['Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης', 'Δεν Ενδιαφέρεται'])

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
  if (stage === 'Έκλεισε') {
    if (!c.submitted_at) return 'expected'
    const due = addDays(new Date(c.submitted_at), SUCCESS_FEE_DAYS)
    return isAfter(new Date(), due) ? 'overdue' : 'expected'
  }
  return 'pipeline'
}

function successFeeDue(c) {
  const stage = c.contact_stage || 'Νέα Ανάλυση'
  if (!['Έκλεισε', 'Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης'].includes(stage)) return null
  if (!c.submitted_at) return null
  return addDays(new Date(c.submitted_at), SUCCESS_FEE_DAYS)
}

// Best date proxy for when a fee event occurred
function collectionDate(c) {
  return c.submitted_at || c.completed_at || c.created_at
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
  const [pricingConfig, setPricingConfig] = useState(() => loadPricingConfig())
  const [showPricingAdmin, setShowPricingAdmin] = useState(false)

  const handleSavePricing = (cfg) => {
    savePricingConfig(cfg)
    setPricingConfig(cfg)
  }

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
    const active = offerCases.filter(c => {
      const stage = c.contact_stage || 'Νέα Ανάλυση'
      return !TERMINAL.has(stage) && !APP_FEE_PAID.has(stage)
    })
    const count = active.length
    const totalApp = active.reduce((s, c) => s + Number(c.commercial_offer?.application_fee || 0), 0)
    const totalSuc = active.reduce((s, c) => s + Number(c.commercial_offer?.success_fee || 0), 0)
    const avgApp = count ? totalApp / count : 0
    const avgSuc = count ? totalSuc / count : 0
    const projClosed = count * closurePct / 100
    const projAppRev = projClosed * avgApp
    const projSucRev = projClosed * (acceptancePct / 100) * avgSuc
    const today = new Date()
    const appDate = addDays(today, 7)
    const sucDate = addDays(today, 75)
    return { count, projClosed: Math.round(projClosed), projAppRev, projSucRev, avgApp, avgSuc, today, appDate, sucDate }
  }, [offerCases, closurePct, acceptancePct])

  // ── Weekly Collections History (past 12 weeks) ────────────────────────────
  const weeklyHistory = useMemo(() => {
    const today = new Date()
    const weeks = Array.from({ length: 12 }, (_, i) =>
      startOfWeek(subWeeks(today, 11 - i), { weekStartsOn: 1 })
    )
    return weeks.map(weekStart => {
      let appAmt = 0, sucAmt = 0
      for (const c of filtered) {
        const af = Number(c.commercial_offer?.application_fee || 0)
        const sf = Number(c.commercial_offer?.success_fee || 0)
        const dateStr = collectionDate(c)
        if (!dateStr) continue
        const date = new Date(dateStr)
        const inWeek = isSameWeek(date, weekStart, { weekStartsOn: 1 })
        if (!inWeek) continue
        if (af > 0 && appFeeStatus(c) === 'collected') appAmt += af
        if (sf > 0 && successFeeStatus(c) === 'collected') sucAmt += sf
      }
      return {
        weekStart,
        label: format(weekStart, 'd MMM', { locale: el }),
        appAmt, sucAmt,
        total: appAmt + sucAmt,
      }
    })
  }, [filtered])

  const maxWeekly = Math.max(...weeklyHistory.map(w => w.total), 1)

  // ── Consultant Comparison ─────────────────────────────────────────────────
  const consultantStats = useMemo(() => {
    return CONSULTANTS.map(emp => {
      const empCases = cases.filter(c => c.employee === emp)
      const total = empCases.length
      const stageCount = s => empCases.filter(c => (c.contact_stage || 'Νέα Ανάλυση') === s).length
      const closed = ['Έκλεισε', 'Αποδοχή Ρύθμισης', 'Απόρριψη Ρύθμισης'].reduce((s, st) => s + stageCount(st), 0)
      const notInterested = stageCount('Δεν Ενδιαφέρεται')
      const accepted = stageCount('Αποδοχή Ρύθμισης')
      const rejected = stageCount('Απόρριψη Ρύθμισης')
      const active = total - closed - notInterested
      const decided = closed + notInterested
      const postClose = accepted + rejected
      const closureRate = pct(closed, decided)
      const acceptanceRate = pct(accepted, postClose)
      const rejectionRate = pct(rejected, postClose)

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

      return { emp, total, active, closed, notInterested, accepted, rejected,
        closureRate, acceptanceRate, rejectionRate, decided, postClose,
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

  // Timeline positioning helpers (0–100% across 90 days)
  const timelinePct = days => Math.min((days / 90) * 100, 100)

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-blue-900">Οικονομικό Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Ρευστότητα, σύγκριση συμβούλων &amp; σενάρια εσόδων</p>
      </div>

      {/* ── Pending Approvals ─────────────────────────────────────────────── */}
      <PendingApprovalsPanel cases={cases} onCasesUpdate={setCases} />

      {/* ── Scenario Projector ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
          <AdjustmentsHorizontalIcon className="w-4 h-4 text-blue-600" />
          Σενάριο Εσόδων
          <span className="ml-1 text-xs font-normal text-gray-400">— {scenario.count} ενεργά pipeline με προσφορά</span>
        </h2>

        {/* Sliders */}
        <div className="grid md:grid-cols-2 gap-5 mb-6">
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="font-semibold text-gray-700">% Κλεισίματος</span>
              <span className="font-black text-blue-700 text-base">{closurePct}%</span>
            </div>
            <input type="range" min={0} max={100} value={closurePct}
              onChange={e => setClosurePct(Number(e.target.value))}
              className="w-full accent-blue-600" />
            <div className="text-xs text-gray-400 mt-1">
              Εκτίμηση: <b>{scenario.projClosed}</b> υποθέσεις θα κλείσουν → app fee σε ~1 εβδομάδα
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
              Εκτίμηση: <b>{Math.round(scenario.projClosed * acceptancePct / 100)}</b> αποδοχές → success fee σε ~75 ημέρες
            </div>
          </div>
        </div>

        {/* Timeline visualization */}
        <div className="relative">
          {/* Axis line */}
          <div className="relative h-1 bg-gray-200 rounded-full mx-4 mb-0">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-300 via-blue-200 to-emerald-200 rounded-full" />
          </div>

          {/* Markers positioned on timeline */}
          <div className="relative h-28 mx-4">
            {/* Today marker */}
            <div className="absolute flex flex-col items-center" style={{ left: '0%', transform: 'translateX(-50%)' }}>
              <div className="w-3 h-3 rounded-full bg-gray-600 border-2 border-white shadow -mt-1.5" />
              <div className="mt-1 text-xs font-bold text-gray-500 whitespace-nowrap">Σήμερα</div>
              <div className="text-xs text-gray-400 whitespace-nowrap">{format(scenario.today, 'd MMM', { locale: el })}</div>
            </div>

            {/* App fee marker — +7 days = ~7.8% */}
            <div className="absolute flex flex-col items-center" style={{ left: `${timelinePct(7)}%`, transform: 'translateX(-50%)' }}>
              <div className="w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white shadow -mt-1.5" />
              <div className="mt-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded-xl text-center shadow-sm">
                <div className="text-xs font-bold text-blue-600 uppercase tracking-wide whitespace-nowrap">Ποσό Αίτησης</div>
                <div className="text-sm font-black text-blue-800 whitespace-nowrap">{fmtEur(scenario.projAppRev)}</div>
                <div className="text-xs text-blue-400 whitespace-nowrap">+7 ημ. · {format(scenario.appDate, 'd MMM', { locale: el })}</div>
              </div>
            </div>

            {/* Success fee marker — +75 days = 83.3% */}
            <div className="absolute flex flex-col items-center" style={{ left: `${timelinePct(75)}%`, transform: 'translateX(-50%)' }}>
              <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white shadow -mt-1.5" />
              <div className="mt-1 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-xl text-center shadow-sm">
                <div className="text-xs font-bold text-emerald-600 uppercase tracking-wide whitespace-nowrap">Success Fee</div>
                <div className="text-sm font-black text-emerald-800 whitespace-nowrap">{fmtEur(scenario.projSucRev)}</div>
                <div className="text-xs text-emerald-400 whitespace-nowrap">+75 ημ. · {format(scenario.sucDate, 'd MMM', { locale: el })}</div>
              </div>
            </div>

            {/* End marker — 90 days */}
            <div className="absolute flex flex-col items-center" style={{ left: '100%', transform: 'translateX(-50%)' }}>
              <div className="w-2 h-2 rounded-full bg-gray-300 border-2 border-white shadow -mt-1" />
              <div className="mt-1 text-xs text-gray-300 whitespace-nowrap">+90 ημ.</div>
            </div>
          </div>

          {/* Total */}
          <div className="mt-2 rounded-xl bg-purple-50 border border-purple-200 p-3 text-center">
            <div className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-0.5">Σύνολο Αναμενόμενων Εσόδων</div>
            <div className="text-3xl font-black text-purple-800">{fmtEur(scenario.projAppRev + scenario.projSucRev)}</div>
            <div className="text-xs text-purple-400 mt-0.5">εντός 75 ημερών</div>
          </div>
        </div>
      </div>

      {/* ── Consultant Comparison ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-black text-gray-700 mb-5 flex items-center gap-2">
          <UserGroupIcon className="w-4 h-4 text-blue-600" />Σύγκριση Συμβούλων
        </h2>

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
                    <span className="text-gray-500">Κλειστά (app fee)</span>
                    <span className="font-bold text-emerald-700">{s.closed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Δεν ενδιαφέρεται</span>
                    <span className="font-bold text-red-500">{s.notInterested}</span>
                  </div>
                </div>

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

                {s.postClose > 0 && (
                  <div className="border-t border-black/10 pt-2 mb-3 space-y-1">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Αποτέλεσμα ({s.postClose})</div>
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
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
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

      {/* ── Weekly Collections History ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
          <ChartBarIcon className="w-4 h-4 text-blue-600" />Ιστορικό Εισπράξεων (τελευταίες 12 εβδομάδες)
        </h2>
        <div className="flex items-end gap-1.5 h-36">
          {weeklyHistory.map((w, i) => {
            const totalH = maxWeekly > 0 ? (w.total / maxWeekly) * 100 : 0
            const isRecent = i >= 10
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                {w.total > 0 && (
                  <div className="text-xs text-gray-500 font-semibold truncate w-full text-center">
                    {fmtEur(w.total)}
                  </div>
                )}
                <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                  <div className="w-full rounded-t-md overflow-hidden flex flex-col-reverse"
                    style={{ height: `${Math.max(totalH, w.total > 0 ? 8 : 0)}%` }}>
                    {w.sucAmt > 0 && (
                      <div className="w-full bg-green-400" style={{ height: `${(w.sucAmt / w.total) * 100}%` }} />
                    )}
                    {w.appAmt > 0 && (
                      <div className="w-full bg-blue-400" style={{ height: `${(w.appAmt / w.total) * 100}%` }} />
                    )}
                  </div>
                </div>
                <div className={`text-xs text-center font-semibold truncate w-full ${isRecent ? 'text-blue-700' : 'text-gray-400'}`}>
                  {w.label}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400 inline-block" />Success fee</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400 inline-block" />Ποσό Αίτησης</span>
        </div>
      </div>

      {/* ── Pricing Admin ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <button
          onClick={() => setShowPricingAdmin(v => !v)}
          className="w-full flex items-center gap-2 p-5 text-left hover:bg-gray-50 rounded-2xl transition-colors"
        >
          <CogIcon className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-black text-gray-700">Παράμετροι Αυτόματης Τιμολόγησης</span>
          <span className="ml-auto text-xs text-gray-400">{showPricingAdmin ? 'Κλείσιμο ▲' : 'Επεξεργασία ▼'}</span>
        </button>
        {showPricingAdmin && (
          <PricingAdminPanel
            config={pricingConfig}
            onSave={handleSavePricing}
            allCases={cases}
          />
        )}
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

function PendingApprovalsPanel({ cases, onCasesUpdate }) {
  const pending = cases.filter(c => c.commercial_offer?.approval_status === 'pending')
  if (pending.length === 0) return null

  const approve = async (c, approved) => {
    const updated = {
      ...c.commercial_offer,
      approval_status: approved ? 'approved' : 'auto',
      ...(approved ? {} : {
        application_fee: c.commercial_offer.system_app,
        success_fee: c.commercial_offer.system_suc,
      }),
    }
    await patchOffer(c.id, updated)
    onCasesUpdate(prev => prev.map(x => x.id === c.id
      ? { ...x, commercial_offer: updated }
      : x
    ))
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
      <h2 className="text-sm font-black text-amber-800 mb-4 flex items-center gap-2">
        <ExclamationTriangleIcon className="w-4 h-4" />
        Εκκρεμείς Εγκρίσεις Τιμολόγησης
        <span className="ml-1 bg-amber-200 text-amber-900 text-xs font-black px-2 py-0.5 rounded-full">{pending.length}</span>
      </h2>
      <div className="space-y-3">
        {pending.map(c => {
          const af = Number(c.commercial_offer?.application_fee || 0)
          const sf = Number(c.commercial_offer?.success_fee || 0)
          const sysAf = Number(c.commercial_offer?.system_app || 0)
          const sysSf = Number(c.commercial_offer?.system_suc || 0)
          return (
            <div key={c.id} className="bg-white border border-amber-200 rounded-xl p-3 flex flex-wrap items-center gap-4">
              <div>
                <div className="font-bold text-gray-800">{c.client_name}</div>
                <div className="text-xs text-gray-500">{c.employee}</div>
              </div>
              <div className="flex gap-4 text-sm">
                <div>
                  <div className="text-xs text-gray-400">Προτεινόμενο</div>
                  <div className="font-black text-amber-700">{af.toLocaleString('el-GR')}€ + {sf.toLocaleString('el-GR')}€</div>
                </div>
                {sysAf > 0 && (
                  <div>
                    <div className="text-xs text-gray-400">Σύστημα</div>
                    <div className="font-black text-blue-600">{sysAf.toLocaleString('el-GR')}€ + {sysSf.toLocaleString('el-GR')}€</div>
                  </div>
                )}
              </div>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => approve(c, true)}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-colors"
                >
                  Έγκριση
                </button>
                <button
                  onClick={() => approve(c, false)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold px-4 py-1.5 rounded-lg transition-colors"
                >
                  Επαναφορά Συστήματος
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PricingAdminPanel({ config, onSave, allCases }) {
  const [local, setLocal] = useState({ ...config })
  const [search, setSearch] = useState('')
  const [saved, setSaved] = useState(false)

  const set = (key, val) => setLocal(prev => ({ ...prev, [key]: val }))
  const setBracket = (i, field, val) => {
    const brackets = local.debtBrackets.map((b, idx) => idx === i ? { ...b, [field]: val } : b)
    setLocal(prev => ({ ...prev, debtBrackets: brackets }))
  }

  const fmtEur = v => Number(v).toLocaleString('el-GR', { maximumFractionDigits: 0 }) + ' €'
  const fmtK   = v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : String(Math.round(v))

  // Filter cases by search; show all when empty
  const previewCases = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allCases
    return allCases.filter(c => (c.client_name || '').toLowerCase().includes(q))
  }, [allCases, search])

  // Per-row computed data
  const rows = useMemo(() => previewCases.map(c => {
    const debts   = c.debts || []
    const assets  = c.assets || []
    const income  = c.income_data || {}
    const result  = computeOffer(debts, assets, income, local)

    const totalDebt  = debts.reduce((s, d) => s + (d.amount || 0), 0)
    const bankDebts  = debts.filter(d => d.type === 'Τράπεζα' && d.amount > 0)
    const publicOnly = bankDebts.length === 0
    const realAssets = assets.filter(a => (a.value || 0) > 0)
    const annualInc  = Math.max(income.fp_income_t1 || 0, income.annualIncome || 0, income.kerdh_t1 || 0)
    const turnover   = Math.max(income.turnover || 0, income.ke_t1 || 0)
    const withSpouse = income.withSpouse || (income.spouseIncome || 0) > 0
    const hasGuarantor = income.hasGuarantor || false

    return { c, result, totalDebt, bankCount: bankDebts.length, publicOnly, assetCount: realAssets.length, annualInc, turnover, withSpouse, hasGuarantor }
  }), [previewCases, local])

  return (
    <div className="border-t border-gray-100 p-5 space-y-6">

      {/* ── Limits & scale ─────────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Όρια & Κλίμακα</div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { key: 'minFee',    label: 'Ελάχιστο (€)',  min: 0,  max: 2000, step: 50 },
            { key: 'maxFee',    label: 'Μέγιστο (€)',   min: 500, max: 5000, step: 50 },
            { key: 'scoreMax',  label: 'Score → Max',   min: 1,  max: 20,   step: 0.5 },
          ].map(({ key, label, min, max, step }) => (
            <div key={key}>
              <label className="text-xs text-gray-500 font-semibold block mb-1">{label}</label>
              <input type="number" min={min} max={max} step={step}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono"
                value={local[key]} onChange={e => set(key, Number(e.target.value))} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Debt brackets ──────────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Βάση Score Ανά Ύψος Οφειλής</div>
        <div className="space-y-1.5">
          {local.debtBrackets.map((b, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="text-xs text-gray-400 w-4 shrink-0">{i + 1}.</span>
              <span className="text-xs text-gray-400 shrink-0">έως</span>
              <input type="number" step={10000} min={0}
                className="w-28 border border-gray-200 rounded px-2 py-1 text-xs font-mono"
                value={b.upTo === 9999999 ? '' : b.upTo} placeholder="∞"
                onChange={e => setBracket(i, 'upTo', e.target.value === '' ? 9999999 : Number(e.target.value))} />
              <span className="text-xs text-gray-400">€ → score</span>
              <input type="number" step={0.1} min={0} max={10}
                className="w-16 border border-gray-200 rounded px-2 py-1 text-xs font-mono"
                value={b.score} onChange={e => setBracket(i, 'score', Number(e.target.value))} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Complexity bonuses + thresholds ───────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Bonus Πολυπλοκότητας</div>
          <div className="space-y-2">
            {[
              { key: 'bankBaseBonus',      label: 'Τράπεζες — βάση bonus' },
              { key: 'perBankBonus',       label: 'Ανά επιπλέον τράπεζα' },
              { key: 'maxBankBonus',       label: 'Cap τραπεζικού bonus' },
              { key: 'publicOnlyDiscount', label: 'Έκπτωση (μόνο δημόσιο)' },
              { key: 'perAssetBonus',      label: 'Ανά ακίνητο' },
              { key: 'guarantorBonus',     label: 'Εγγυητές' },
              { key: 'spouseBonus',        label: 'Σύζυγος / συν-οφειλέτης' },
              { key: 'highIncomeBonus',    label: 'Υψηλό εισόδημα' },
              { key: 'highTurnoverBonus',  label: 'Υψηλός τζίρος' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <label className="text-xs text-gray-600 flex-1">{label}</label>
                <input type="number" step={0.05} min={0} max={5}
                  className="w-20 border border-gray-200 rounded px-2 py-1 text-xs font-mono text-right"
                  value={local[key]} onChange={e => set(key, Number(e.target.value))} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Κατώφλια Εισοδήματος / Τζίρου</div>
          <div className="space-y-2">
            {[
              { key: 'highIncomeThreshold',  label: 'Εισόδημα threshold (€)', step: 5000 },
              { key: 'highTurnoverThreshold', label: 'Τζίρος threshold (€)',   step: 10000 },
            ].map(({ key, label, step }) => (
              <div key={key} className="flex items-center gap-3">
                <label className="text-xs text-gray-600 flex-1">{label}</label>
                <input type="number" step={step} min={0}
                  className="w-28 border border-gray-200 rounded px-2 py-1 text-xs font-mono text-right"
                  value={local[key]} onChange={e => set(key, Number(e.target.value))} />
              </div>
            ))}
          </div>

          {/* Mini legend: score → fee mapping */}
          <div className="mt-5">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Κλίμακα Score → Αμοιβή</div>
            <div className="space-y-1">
              {[0, 0.25, 0.5, 0.75, 1].map(t => {
                const fee = Math.round((local.minFee + t * (local.maxFee - local.minFee)) / 50) * 50
                const score = (t * local.scoreMax).toFixed(1)
                return (
                  <div key={t} className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="h-2 bg-blue-400 rounded-full" style={{ width: `${t * 100}%` }} />
                    </div>
                    <span className="text-xs font-mono text-gray-500 w-8">{score}</span>
                    <span className="text-xs font-black text-blue-700 w-20 text-right">{fmtEur(fee)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Preview table ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            <SparklesIcon className="w-3.5 h-3.5" />Preview Υποθέσεων ({rows.length})
          </div>
          <input
            type="text"
            placeholder="Αναζήτηση πελάτη…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ml-auto border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-56"
          />
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 text-center">
                <th className="text-left py-2 px-3 font-semibold">Πελάτης</th>
                <th className="py-2 px-2 font-semibold">Οφειλές</th>
                <th className="py-2 px-2 font-semibold">Τράπεζες</th>
                <th className="py-2 px-2 font-semibold">Μόνο Δημ.</th>
                <th className="py-2 px-2 font-semibold">Ακίνητα</th>
                <th className="py-2 px-2 font-semibold">Εγγυητές</th>
                <th className="py-2 px-2 font-semibold">Σύζυγος</th>
                <th className="py-2 px-2 font-semibold">Εισόδημα</th>
                <th className="py-2 px-2 font-semibold">Τζίρος</th>
                <th className="py-2 px-2 font-semibold text-blue-600">Score</th>
                <th className="py-2 px-2 font-semibold text-blue-700">Αίτηση</th>
                <th className="py-2 px-2 font-semibold text-emerald-700">Success</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={12} className="text-center py-6 text-gray-300">Δεν βρέθηκαν υποθέσεις</td></tr>
              )}
              {rows.map(({ c, result, totalDebt, bankCount, publicOnly, assetCount, annualInc, turnover, withSpouse, hasGuarantor }) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                  <td className="py-2 px-3 font-semibold text-gray-800 whitespace-nowrap">{c.client_name}</td>
                  <td className="py-2 px-2 text-center font-mono">
                    <span className={totalDebt > 300000 ? 'text-red-600 font-bold' : totalDebt > 100000 ? 'text-amber-600 font-bold' : 'text-gray-600'}>
                      {totalDebt > 0 ? fmtK(totalDebt) + '€' : '—'}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={bankCount > 0 ? 'font-black text-blue-700' : 'text-gray-300'}>{bankCount || '—'}</span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    {publicOnly ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={assetCount > 0 ? 'font-black text-purple-700' : 'text-gray-300'}>{assetCount || '—'}</span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    {hasGuarantor ? <span className="text-orange-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {withSpouse ? <span className="text-pink-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2 px-2 text-center font-mono text-gray-600">
                    {annualInc > 0 ? fmtK(annualInc) + '€' : '—'}
                  </td>
                  <td className="py-2 px-2 text-center font-mono text-gray-600">
                    {turnover > 0 ? fmtK(turnover) + '€' : '—'}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className="font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {result._score?.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center font-mono font-black text-blue-800">
                    {fmtEur(result.application_fee)}
                  </td>
                  <td className="py-2 px-2 text-center font-mono font-black text-emerald-700">
                    {fmtEur(result.success_fee)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={() => { onSave(local); setSaved(true); setTimeout(() => setSaved(false), 2000) }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors"
        >
          {saved ? '✓ Αποθηκεύτηκε' : 'Αποθήκευση Παραμέτρων'}
        </button>
        <button
          onClick={() => setLocal({ ...DEFAULT_PRICING_CONFIG })}
          className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg border border-gray-200 transition-colors"
        >
          Επαναφορά Προεπιλογών
        </button>
        <span className="ml-auto text-xs text-gray-400">Αποθηκεύεται τοπικά στον browser</span>
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
