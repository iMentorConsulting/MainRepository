import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { differenceInDays } from 'date-fns'
import {
  ArrowPathIcon,
  EyeIcon,
  FunnelIcon,
  ChevronRightIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'
import * as api from '../api'
import { fmt } from '../utils/calculations'

const EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA', 'HARIS']

const STAGE_CONFIG = [
  { key: 'Νέα Ανάλυση',         icon: '📋', cls: 'bg-gray-100 text-gray-700',    border: 'border-gray-200',   header: 'bg-gray-50',    dot: 'bg-gray-400' },
  { key: 'Εστάλη Σύνδεσμος',    icon: '🔗', cls: 'bg-blue-100 text-blue-700',    border: 'border-blue-200',   header: 'bg-blue-50',    dot: 'bg-blue-500' },
  { key: 'Θετική Ανταπόκριση',   icon: '✅', cls: 'bg-green-100 text-green-700',  border: 'border-green-200',  header: 'bg-green-50',   dot: 'bg-green-500' },
  { key: 'Σε Διαπραγμάτευση',    icon: '💬', cls: 'bg-yellow-100 text-yellow-700',border: 'border-yellow-200', header: 'bg-yellow-50',  dot: 'bg-yellow-500' },
  { key: 'Έκλεισε',              icon: '🏆', cls: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-200', header: 'bg-emerald-50', dot: 'bg-emerald-500' },
  { key: 'Δεν Ενδιαφέρεται',    icon: '❌', cls: 'bg-red-100 text-red-700',      border: 'border-red-200',    header: 'bg-red-50',     dot: 'bg-red-400' },
]

const STAGE_MAP = Object.fromEntries(STAGE_CONFIG.map(s => [s.key, s]))

const TERMINAL = new Set(['Έκλεισε', 'Δεν Ενδιαφέρεται'])

// Higher = more urgent in the follow-up queue
const STAGE_URGENCY = {
  'Θετική Ανταπόκριση': 4,
  'Σε Διαπραγμάτευση': 3,
  'Εστάλη Σύνδεσμος': 2,
  'Νέα Ανάλυση': 1,
}

const EMPLOYEE_COLORS = {
  STELLA: 'bg-pink-100 text-pink-700',
  VALLIA: 'bg-purple-100 text-purple-700',
  SOFIA:  'bg-indigo-100 text-indigo-700',
  HARIS:  'bg-cyan-100 text-cyan-700',
}

function daysSince(c) {
  if (!c.last_contacted_at) return null
  return differenceInDays(new Date(), new Date(c.last_contacted_at))
}

function needsAttention(c) {
  const stage = c.contact_stage || 'Νέα Ανάλυση'
  if (TERMINAL.has(stage)) return false
  if (!c.last_contacted_at) return stage !== 'Νέα Ανάλυση'
  return differenceInDays(new Date(), new Date(c.last_contacted_at)) >= 3
}

function DaysBadge({ c }) {
  if (!c.last_contacted_at) {
    const stage = c.contact_stage || 'Νέα Ανάλυση'
    if (stage === 'Νέα Ανάλυση') return <span className="text-xs text-gray-400">—</span>
    return <span className="text-xs font-semibold text-gray-500">Δεν έχει σταλεί</span>
  }
  const d = daysSince(c)
  if (d === null) return null
  const cls = d >= 7 ? 'text-red-600 font-bold' : d >= 3 ? 'text-amber-600 font-semibold' : 'text-green-600'
  return <span className={`text-xs ${cls}`}>{d}ημ. χωρίς επαφή</span>
}

export default function SalesPipeline() {
  const navigate = useNavigate()
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [updatingId, setUpdatingId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterEmployee) params.employee = filterEmployee
      const res = await api.listCases(params)
      setCases(res.data)
    } catch {
      toast.error('Σφάλμα φόρτωσης')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterEmployee])

  const handleStageChange = async (caseId, newStage) => {
    setUpdatingId(caseId)
    try {
      await api.updateContact(caseId, { contact_stage: newStage })
      setCases(prev => prev.map(c => c.id === caseId ? { ...c, contact_stage: newStage } : c))
      toast.success(`→ ${newStage}`)
    } catch {
      toast.error('Σφάλμα ενημέρωσης')
    } finally {
      setUpdatingId(null)
    }
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const active    = cases.filter(c => !TERMINAL.has(c.contact_stage || 'Νέα Ανάλυση'))
    const followUp  = cases.filter(needsAttention)
    const hot       = cases.filter(c => ['Θετική Ανταπόκριση', 'Σε Διαπραγμάτευση'].includes(c.contact_stage))
    const closed    = cases.filter(c => c.contact_stage === 'Έκλεισε')
    const nonNew    = cases.filter(c => (c.contact_stage || 'Νέα Ανάλυση') !== 'Νέα Ανάλυση')
    const convRate  = nonNew.length > 0 ? Math.round((closed.length / nonNew.length) * 100) : 0
    const totalDebt = active.reduce((s, c) => s + (c.estimates?.sumDebt || 0), 0)
    return { active: active.length, followUp: followUp.length, hot: hot.length, closed: closed.length, convRate, totalDebt }
  }, [cases])

  // ── Funnel distribution ───────────────────────────────────────────────────
  const total = cases.length || 1
  const stageCounts = useMemo(() =>
    STAGE_CONFIG.map(s => ({
      ...s,
      count: cases.filter(c => (c.contact_stage || 'Νέα Ανάλυση') === s.key).length,
    })), [cases])

  // ── Follow-up queue: needs attention, sorted by urgency then days ─────────
  const followUpQueue = useMemo(() =>
    cases
      .filter(needsAttention)
      .sort((a, b) => {
        const uA = STAGE_URGENCY[a.contact_stage || 'Νέα Ανάλυση'] || 0
        const uB = STAGE_URGENCY[b.contact_stage || 'Νέα Ανάλυση'] || 0
        if (uB !== uA) return uB - uA
        return (daysSince(b) ?? 999) - (daysSince(a) ?? 999)
      }), [cases])

  // ── Kanban: group by stage, sort within column by days desc ───────────────
  const kanbanColumns = useMemo(() =>
    STAGE_CONFIG.map(s => ({
      ...s,
      cases: cases
        .filter(c => (c.contact_stage || 'Νέα Ανάλυση') === s.key)
        .sort((a, b) => (daysSince(b) ?? -1) - (daysSince(a) ?? -1)),
    })), [cases])

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-blue-800">🎯 Sales Pipeline</h1>
          <p className="text-gray-500 text-sm mt-0.5">{cases.length} υποθέσεις συνολικά</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="input w-auto text-sm"
            value={filterEmployee}
            onChange={e => setFilterEmployee(e.target.value)}
          >
            <option value="">Όλοι οι σύμβουλοι</option>
            {EMPLOYEES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <button onClick={load} className="btn-secondary p-2" title="Ανανέωση">
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── KPI Bar ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="card text-center">
          <div className="text-3xl font-black text-blue-800">{kpis.active}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium">Ενεργές υποθέσεις</div>
        </div>
        <div className={`card text-center ${kpis.followUp > 0 ? 'ring-2 ring-amber-400 bg-amber-50' : ''}`}>
          <div className={`text-3xl font-black ${kpis.followUp > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
            {kpis.followUp}
          </div>
          <div className="text-xs text-gray-500 mt-1 font-medium">⚡ Χρειάζονται follow-up</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-black text-green-700">{kpis.hot}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium">🔥 Hot leads</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-black text-emerald-700">{kpis.convRate}%</div>
          <div className="text-xs text-gray-500 mt-1 font-medium">🏆 Ποσοστό κλεισίματος</div>
        </div>
        <div className="card text-center">
          <div className="text-lg font-black text-blue-700 truncate">
            {kpis.totalDebt > 0 ? fmt(kpis.totalDebt) : '—'}
          </div>
          <div className="text-xs text-gray-500 mt-1 font-medium">💰 Σύνολο pipeline</div>
        </div>
      </div>

      {/* ── Funnel bar ──────────────────────────────────────────────────── */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-3">
          <FunnelIcon className="w-4 h-4 text-gray-400" />
          <span className="font-semibold text-gray-700 text-sm">Κατανομή σταδίων</span>
        </div>
        <div className="flex rounded-full overflow-hidden h-3.5 mb-3 bg-gray-100">
          {stageCounts.map(s =>
            s.count > 0 ? (
              <div
                key={s.key}
                style={{ width: `${(s.count / total) * 100}%` }}
                className={`${s.dot} transition-all`}
                title={`${s.key}: ${s.count}`}
              />
            ) : null
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {stageCounts.map(s => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
              <span className="text-gray-600">{s.icon} {s.key}</span>
              <span className="font-bold text-gray-800">{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Smart Follow-up Queue ────────────────────────────────────────── */}
      {followUpQueue.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BoltIcon className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-gray-800">Smart Follow-up Queue</h2>
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full ml-1">
              {followUpQueue.length}
            </span>
            <span className="text-xs text-gray-400 ml-auto">ταξινόμηση κατά επείγον</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold">Πελάτης</th>
                  <th className="py-2 px-3 text-xs text-gray-400 font-semibold">Στάδιο</th>
                  <th className="py-2 px-3 text-xs text-gray-400 font-semibold">Χωρίς επαφή</th>
                  <th className="py-2 px-3 text-xs text-gray-400 font-semibold">Σύμβουλος</th>
                  <th className="py-2 px-3 text-xs text-gray-400 font-semibold">Εκτ. Οφειλή</th>
                  <th className="py-2 px-3 text-xs text-gray-400 font-semibold">Ενέργεια</th>
                </tr>
              </thead>
              <tbody>
                {followUpQueue.map(c => {
                  const stage = STAGE_MAP[c.contact_stage || 'Νέα Ανάλυση'] || STAGE_CONFIG[0]
                  const stageIdx = STAGE_CONFIG.findIndex(s => s.key === (c.contact_stage || 'Νέα Ανάλυση'))
                  const nextStage = stageIdx >= 0 && stageIdx < 3 ? STAGE_CONFIG[stageIdx + 1] : null
                  const isHot = (STAGE_URGENCY[c.contact_stage || 'Νέα Ανάλυση'] || 0) >= 3
                  return (
                    <tr key={c.id} className={`border-b border-gray-50 hover:bg-amber-50/50 transition-colors ${isHot ? 'bg-amber-50/20' : ''}`}>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-gray-800">{c.client_name}</div>
                        {c.client_phone && <div className="text-xs text-gray-400">{c.client_phone}</div>}
                        {c.notes && <div className="text-xs text-gray-500 italic truncate max-w-[200px]">{c.notes}</div>}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stage.cls}`}>
                          {stage.icon} {c.contact_stage || 'Νέα Ανάλυση'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <DaysBadge c={c} />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${EMPLOYEE_COLORS[c.employee] || 'bg-gray-100 text-gray-600'}`}>
                          {c.employee}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-sm text-gray-600">
                        {c.estimates?.sumDebt ? fmt(c.estimates.sumDebt) : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => navigate(`/cases/${c.id}`)}
                            className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
                            title="Άνοιγμα υπόθεσης"
                          >
                            <EyeIcon className="w-4 h-4" />
                          </button>
                          {nextStage && (
                            <button
                              onClick={() => handleStageChange(c.id, nextStage.key)}
                              disabled={updatingId === c.id}
                              className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-opacity hover:opacity-75 disabled:opacity-50 ${nextStage.cls}`}
                              title={`Προχώρα σε: ${nextStage.key}`}
                            >
                              {nextStage.icon} <ChevronRightIcon className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Kanban Board ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-bold text-gray-700">Kanban Board</h2>
          <span className="text-xs text-gray-400 font-normal">— κλικ σε κάρτα για άνοιγμα</span>
        </div>
        {loading ? (
          <div className="text-center text-gray-400 py-12">Φόρτωση…</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {kanbanColumns.map(col => (
              <div key={col.key} className="shrink-0 w-60">
                {/* Column header */}
                <div className={`rounded-t-xl px-3 py-2.5 ${col.header} border ${col.border} border-b-0 flex items-center justify-between`}>
                  <span className="font-bold text-sm">{col.icon} {col.key}</span>
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full ${col.cls}`}>
                    {col.cases.length}
                  </span>
                </div>
                {/* Cards */}
                <div className={`border ${col.border} border-t-0 rounded-b-xl min-h-[100px] bg-gray-50/40 p-2 flex flex-col gap-2`}>
                  {col.cases.length === 0 && (
                    <div className="text-center text-xs text-gray-300 py-5">—</div>
                  )}
                  {col.cases.map(c => {
                    const urgent = needsAttention(c)
                    return (
                      <div
                        key={c.id}
                        onClick={() => navigate(`/cases/${c.id}`)}
                        className={`bg-white rounded-xl p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow border ${urgent ? 'border-amber-300' : 'border-gray-100'}`}
                      >
                        <div className="font-semibold text-gray-800 text-sm leading-tight">{c.client_name}</div>
                        {c.client_phone && (
                          <div className="text-xs text-gray-400 mt-0.5">{c.client_phone}</div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${EMPLOYEE_COLORS[c.employee] || 'bg-gray-100 text-gray-600'}`}>
                            {c.employee}
                          </span>
                          {c.estimates?.sumDebt ? (
                            <span className="text-xs font-mono text-gray-500">{fmt(c.estimates.sumDebt)}</span>
                          ) : null}
                        </div>
                        <div className="mt-1.5">
                          <DaysBadge c={c} />
                        </div>
                        {c.portal_visit_count > 0 && (
                          <div className="text-xs text-indigo-500 mt-1">
                            👁 {c.portal_visit_count} επίσκεψη{c.portal_visit_count !== 1 ? 'εις' : ''}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
