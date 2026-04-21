import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getCases, updateCase, getUsers } from '../api'
import { PIPELINES } from '../pipelines'
import {
  UserIcon,
  BriefcaseIcon,
  ClockIcon,
  CurrencyEuroIcon,
  ClipboardDocumentListIcon,
  ChevronDownIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const PROGRAM_TABS = ['ΕΣΠΑ', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ']
const PROGRAM_LABELS = {
  ΕΣΠΑ: 'ΕΣΠΑ',
  ΔΥΠΑ: 'ΔΥΠΑ / ΟΑΕΔ',
  ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ: 'Μικροπιστώσεις',
}

const PHASE_COLORS = {
  green:  { border: 'border-t-green-500',  badge: 'bg-green-100 text-green-800 border-green-200' },
  blue:   { border: 'border-t-blue-500',   badge: 'bg-blue-100 text-blue-800 border-blue-200' },
  yellow: { border: 'border-t-yellow-500', badge: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  orange: { border: 'border-t-orange-500', badge: 'bg-orange-100 text-orange-800 border-orange-200' },
  purple: { border: 'border-t-purple-500', badge: 'bg-purple-100 text-purple-800 border-purple-200' },
  gray:   { border: 'border-t-gray-400',   badge: 'bg-gray-100 text-gray-600 border-gray-200' },
}

const fmt = (n) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n || 0)

function MoveDropdown({ caseItem, currentStatus, onMoved, pipeline }) {
  const [open, setOpen] = useState(false)
  const [moving, setMoving] = useState(false)

  const handleMove = async (e, newStatus) => {
    e.preventDefault()
    e.stopPropagation()
    if (newStatus === currentStatus) { setOpen(false); return }
    setMoving(true)
    setOpen(false)
    try {
      await updateCase(caseItem.id, { status: newStatus })
      toast.success(`→ "${newStatus}"`)
      onMoved(caseItem.id, newStatus)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα μετακίνησης')
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="relative" onClick={e => e.preventDefault()}>
      <button
        disabled={moving}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded transition-colors disabled:opacity-50"
      >
        <ArrowsRightLeftIcon className="w-3 h-3" />
        {moving ? 'Μετακίνηση...' : 'Μετακίνηση'}
        <ChevronDownIcon className="w-3 h-3" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(false) }}
          />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-64 max-h-96 overflow-y-auto">
            {pipeline.phases.map(phase => (
              <div key={phase.id}>
                <div className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">
                  {phase.label}
                </div>
                {phase.statuses.map(s => (
                  <button
                    key={s}
                    onClick={e => handleMove(e, s)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2 ${
                      s === currentStatus ? 'font-semibold text-blue-700 bg-blue-50' : 'text-gray-700'
                    }`}
                  >
                    <span className="flex-1">{s}</span>
                    {s === currentStatus && <span className="text-blue-400 text-xs">✓</span>}
                  </button>
                ))}
              </div>
            ))}
            <div>
              <div className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-t border-b border-gray-100 sticky top-0">
                Άλλα
              </div>
              {pipeline.extra_statuses.map(s => (
                <button
                  key={s}
                  onClick={e => handleMove(e, s)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2 ${
                    s === currentStatus ? 'font-semibold text-blue-700 bg-blue-50' : 'text-gray-700'
                  }`}
                >
                  <span className="flex-1">{s}</span>
                  {s === currentStatus && <span className="text-blue-400 text-xs">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function CaseCard({ caseItem, onMoved, pipeline }) {
  const urgent = caseItem.days_to_deadline !== null && caseItem.days_to_deadline <= 14 && caseItem.days_to_deadline >= 0

  return (
    <Link
      to={`/cases/${caseItem.id}`}
      className="block bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md hover:border-gray-300 transition-all group"
    >
      <div className="font-semibold text-gray-900 text-sm leading-tight mb-1 group-hover:text-blue-700 transition-colors">
        {caseItem.client_name}
      </div>

      {caseItem.service_type && (
        <div className="flex items-start gap-1 text-xs text-gray-500 mb-1">
          <BriefcaseIcon className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400" />
          <span className="line-clamp-2">{caseItem.service_type}</span>
        </div>
      )}

      {caseItem.assigned_agent_name && (
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
          <UserIcon className="w-3 h-3 flex-shrink-0 text-gray-400" />
          <span className="truncate">{caseItem.assigned_agent_name}</span>
        </div>
      )}

      <div className="text-xs text-gray-400 mb-2 truncate" title={caseItem.status}>
        {caseItem.status}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {caseItem.balance > 0.01 && (
          <span className="flex items-center gap-0.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">
            <CurrencyEuroIcon className="w-3 h-3" />
            {fmt(caseItem.balance)}
          </span>
        )}
        {urgent && (
          <span className="flex items-center gap-0.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
            <ClockIcon className="w-3 h-3" />
            {caseItem.days_to_deadline} ημ.
          </span>
        )}
        {caseItem.open_tasks > 0 && (
          <span className="flex items-center gap-0.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
            <ClipboardDocumentListIcon className="w-3 h-3" />
            {caseItem.open_tasks}
          </span>
        )}
      </div>

      <div className="pt-1 border-t border-gray-100">
        <MoveDropdown caseItem={caseItem} currentStatus={caseItem.status} onMoved={onMoved} pipeline={pipeline} />
      </div>
    </Link>
  )
}

function KanbanColumn({ phase, cases, onMoved, pipeline }) {
  const colors = PHASE_COLORS[phase.color] || PHASE_COLORS.gray

  return (
    <div className={`flex flex-col bg-gray-50 rounded-xl border border-gray-200 border-t-4 ${colors.border} min-w-64 w-64 flex-shrink-0`}>
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full leading-tight border ${colors.badge}`}>
            {phase.label}
          </span>
          <span className="text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">
            {cases.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-300px)]">
        {cases.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-400">Καμία υπόθεση</div>
        ) : (
          cases.map(c => (
            <CaseCard key={c.id} caseItem={c} onMoved={onMoved} pipeline={pipeline} />
          ))
        )}
      </div>
    </div>
  )
}

export default function Kanban() {
  const [activeProgram, setActiveProgram] = useState('ΕΣΠΑ')
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState([])
  const [filterAgent, setFilterAgent] = useState('')

  const pipeline = PIPELINES[activeProgram]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getCases({ program_category: activeProgram })
      setCases(data)
    } catch {
      toast.error('Σφάλμα φόρτωσης υποθέσεων')
    } finally {
      setLoading(false)
    }
  }, [activeProgram])

  useEffect(() => { load() }, [load])
  useEffect(() => { getUsers().then(setAgents).catch(() => {}) }, [])

  const handleMoved = useCallback((caseId, newStatus) => {
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, status: newStatus } : c))
  }, [])

  const filtered = cases.filter(c => !filterAgent || String(c.assigned_agent_id) === filterAgent)

  const allPhaseStatusSet = new Set(pipeline.phases.flatMap(p => p.statuses))
  const phaseBuckets = pipeline.phases.map(phase => ({
    ...phase,
    cases: filtered.filter(c => phase.statuses.includes(c.status)),
  }))
  const extraCases = filtered.filter(c => !allPhaseStatusSet.has(c.status))

  const extraPhase = { id: '__extra__', label: 'Άλλα', color: 'gray' }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline Υποθέσεων</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} ενεργές υποθέσεις · {PROGRAM_LABELS[activeProgram]}
          </p>
        </div>
        <button
          onClick={load}
          className="text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          Ανανέωση
        </button>
      </div>

      {/* Program tabs */}
      <div className="flex gap-1 mb-4 flex-shrink-0 bg-gray-100 p-1 rounded-lg w-fit">
        {PROGRAM_TABS.map(prog => (
          <button
            key={prog}
            onClick={() => { setActiveProgram(prog); setFilterAgent('') }}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              activeProgram === prog
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {PROGRAM_LABELS[prog]}
          </button>
        ))}
      </div>

      {/* Agent filter */}
      <div className="flex gap-3 mb-4 flex-shrink-0 items-center">
        <select
          className="input w-auto text-sm"
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
        >
          <option value="">Όλοι οι Agents</option>
          {agents.map(a => <option key={a.id} value={String(a.id)}>{a.full_name}</option>)}
        </select>
        {filterAgent && (
          <button onClick={() => setFilterAgent('')} className="text-sm text-gray-500 hover:text-gray-800 underline">
            Καθαρισμός
          </button>
        )}
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {phaseBuckets.map(bucket => (
            <KanbanColumn
              key={bucket.id}
              phase={bucket}
              cases={bucket.cases}
              onMoved={handleMoved}
              pipeline={pipeline}
            />
          ))}
          <KanbanColumn
            key="__extra__"
            phase={extraPhase}
            cases={extraCases}
            onMoved={handleMoved}
            pipeline={pipeline}
          />
        </div>
      )}
    </div>
  )
}
