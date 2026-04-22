import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { getCases, updateCase, getUsers } from '../api'
import { PIPELINES } from '../pipelines'
import {
  ClockIcon,
  CurrencyEuroIcon,
  ClipboardDocumentListIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowsRightLeftIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const PROGRAM_TABS = ['ΕΣΠΑ', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ']
const PROGRAM_LABELS = { ΕΣΠΑ: 'ΕΣΠΑ', ΔΥΠΑ: 'ΔΥΠΑ / ΟΑΕΔ', ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ: 'Μικροπιστώσεις' }

const PHASE_COLORS = {
  green:  { border: 'border-t-green-500',  header: 'bg-green-500',  badge: 'bg-green-100 text-green-800 border-green-200',  sub: 'bg-green-50 text-green-700' },
  blue:   { border: 'border-t-blue-500',   header: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-800 border-blue-200',     sub: 'bg-blue-50 text-blue-700' },
  yellow: { border: 'border-t-yellow-500', header: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-800 border-yellow-200', sub: 'bg-yellow-50 text-yellow-700' },
  orange: { border: 'border-t-orange-500', header: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800 border-orange-200', sub: 'bg-orange-50 text-orange-700' },
  purple: { border: 'border-t-purple-500', header: 'bg-purple-500', badge: 'bg-purple-100 text-purple-800 border-purple-200', sub: 'bg-purple-50 text-purple-700' },
  gray:   { border: 'border-t-gray-400',   header: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600 border-gray-200',      sub: 'bg-gray-50 text-gray-500' },
}

const fmt = (n) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n || 0)

function MoveDropdown({ caseItem, currentStatus, onMoved, pipeline }) {
  const [open, setOpen] = useState(false)
  const [moving, setMoving] = useState(false)
  const [dropStyle, setDropStyle] = useState({})
  const btnRef = useRef(null)

  const handleToggle = (e) => {
    e.preventDefault(); e.stopPropagation()
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const openUp = spaceBelow < 330
      setDropStyle(openUp
        ? { position: 'fixed', bottom: window.innerHeight - rect.top + 4, left: rect.left, zIndex: 9999 }
        : { position: 'fixed', top: rect.bottom + 4, left: rect.left, zIndex: 9999 }
      )
    }
    setOpen(o => !o)
  }

  const handleMove = async (e, newStatus) => {
    e.preventDefault(); e.stopPropagation()
    if (newStatus === currentStatus) { setOpen(false); return }
    setMoving(true); setOpen(false)
    try {
      await updateCase(caseItem.id, { status: newStatus })
      toast.success(`→ "${newStatus}"`)
      onMoved(caseItem.id, newStatus)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα μετακίνησης')
    } finally { setMoving(false) }
  }

  return (
    <div onClick={e => e.preventDefault()}>
      <button
        ref={btnRef}
        disabled={moving}
        onClick={handleToggle}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors disabled:opacity-40"
      >
        <ArrowsRightLeftIcon className="w-3 h-3" />
        {moving ? '...' : 'Μετακίνηση'}
        <ChevronDownIcon className="w-2.5 h-2.5" />
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(false) }} />
          <div className="bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-64 max-h-80 overflow-y-auto" style={dropStyle}>
            {pipeline.phases.map(phase => (
              <div key={phase.id}>
                <div className="px-3 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                  {phase.label}
                </div>
                {phase.statuses.map(s => (
                  <button key={s} onClick={e => handleMove(e, s)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2 ${s === currentStatus ? 'font-semibold text-blue-700 bg-blue-50' : 'text-gray-700'}`}
                  >
                    <span className="flex-1">{s}</span>
                    {s === currentStatus && <span className="text-blue-400">✓</span>}
                  </button>
                ))}
              </div>
            ))}
            <div>
              <div className="px-3 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-t border-b border-gray-100">Άλλα</div>
              {pipeline.extra_statuses.map(s => (
                <button key={s} onClick={e => handleMove(e, s)}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2 ${s === currentStatus ? 'font-semibold text-blue-700 bg-blue-50' : 'text-gray-700'}`}
                >
                  <span className="flex-1">{s}</span>
                  {s === currentStatus && <span className="text-blue-400">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

function CaseCard({ caseItem, onMoved, pipeline }) {
  const urgent = caseItem.days_to_deadline !== null && caseItem.days_to_deadline <= 14 && caseItem.days_to_deadline >= 0
  return (
    <Link
      to={`/cases/${caseItem.id}`}
      className="block bg-white border border-gray-200 rounded-md px-2.5 py-2 hover:shadow-sm hover:border-gray-300 transition-all group"
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="font-medium text-gray-900 text-xs leading-tight group-hover:text-blue-700 transition-colors flex-1 min-w-0">
          {caseItem.client_name}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {caseItem.balance > 0.01 && (
            <span className="flex items-center gap-0.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-1 py-0 rounded">
              <CurrencyEuroIcon className="w-2.5 h-2.5" />{fmt(caseItem.balance)}
            </span>
          )}
          {urgent && (
            <span className="flex items-center gap-0.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-1 py-0 rounded">
              <ClockIcon className="w-2.5 h-2.5" />{caseItem.days_to_deadline}
            </span>
          )}
          {caseItem.open_tasks > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 px-1 py-0 rounded">
              <ClipboardDocumentListIcon className="w-2.5 h-2.5" />{caseItem.open_tasks}
            </span>
          )}
        </div>
      </div>
      {caseItem.pending_count > 0 && (
        <div className="flex items-center gap-1 mb-1.5">
          <span className="flex items-center gap-0.5 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 px-1 py-0 rounded">
            <ExclamationCircleIcon className="w-2.5 h-2.5" />{caseItem.pending_count}
          </span>
        </div>
      )}
      <MoveDropdown caseItem={caseItem} currentStatus={caseItem.status} onMoved={onMoved} pipeline={pipeline} />
    </Link>
  )
}

// A sub-section within a phase column for one specific status
function StatusSection({ status, cases, onMoved, pipeline, colors }) {
  const [collapsed, setCollapsed] = useState(false)
  if (cases.length === 0) return null
  return (
    <div className="mb-1">
      <button
        onClick={() => setCollapsed(c => !c)}
        className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs font-medium ${colors.sub} hover:opacity-80 transition-opacity`}
      >
        <span className="truncate text-left">{status}</span>
        <span className="flex items-center gap-1 flex-shrink-0 ml-1">
          <span className="font-bold">{cases.length}</span>
          {collapsed ? <ChevronRightIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
        </span>
      </button>
      {!collapsed && (
        <div className="mt-1 space-y-1">
          {cases.map(c => <CaseCard key={c.id} caseItem={c} onMoved={onMoved} pipeline={pipeline} />)}
        </div>
      )}
    </div>
  )
}

function PhaseColumn({ phase, casesByStatus, onMoved, pipeline }) {
  const [collapsed, setCollapsed] = useState(false)
  const colors = PHASE_COLORS[phase.color] || PHASE_COLORS.gray
  const totalInPhase = phase.statuses
    ? phase.statuses.reduce((sum, s) => sum + (casesByStatus[s]?.length || 0), 0)
    : (casesByStatus.__extra__ || []).length

  const statusList = phase.statuses || []
  const extraCases = casesByStatus.__extra__ || []

  return (
    <div className={`flex flex-col bg-gray-50 rounded-xl border border-gray-200 border-t-4 ${colors.border} min-w-60 w-60 flex-shrink-0`}>
      {/* Phase header — click to collapse */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center justify-between p-3 border-b border-gray-200 w-full text-left hover:bg-gray-100 transition-colors rounded-t-xl"
      >
        <span className={`text-xs font-semibold px-2 py-1 rounded-full leading-tight border ${colors.badge}`}>
          {phase.label}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-full w-6 h-6 flex items-center justify-center">
            {totalInPhase}
          </span>
          {collapsed
            ? <ChevronRightIcon className="w-3.5 h-3.5 text-gray-400" />
            : <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400" />
          }
        </div>
      </button>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-2 max-h-[calc(100vh-280px)]">
          {statusList.length > 0 ? (
            statusList.map(status => (
              <StatusSection
                key={status}
                status={status}
                cases={casesByStatus[status] || []}
                onMoved={onMoved}
                pipeline={pipeline}
                colors={colors}
              />
            ))
          ) : (
            // Extra column
            extraCases.length === 0 ? (
              <div className="text-center py-6 text-xs text-gray-400">Καμία υπόθεση</div>
            ) : (
              extraCases.map(c => <CaseCard key={c.id} caseItem={c} onMoved={onMoved} pipeline={pipeline} />)
            )
          )}
          {statusList.length > 0 && totalInPhase === 0 && (
            <div className="text-center py-6 text-xs text-gray-400">Καμία υπόθεση</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Kanban() {
  const [activeProgram, setActiveProgram] = useState('ΕΣΠΑ')
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState([])
  const [filterAgent, setFilterAgent] = useState('')
  const [filterService, setFilterService] = useState('')
  const [filterSLA, setFilterSLA] = useState(0)

  const pipeline = PIPELINES[activeProgram]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getCases({ program_category: activeProgram })
      setCases(data)
    } catch { toast.error('Σφάλμα φόρτωσης') }
    finally { setLoading(false) }
  }, [activeProgram])

  useEffect(() => { load() }, [load])
  useEffect(() => { getUsers().then(setAgents).catch(() => {}) }, [])

  const handleMoved = useCallback((caseId, newStatus) => {
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, status: newStatus } : c))
  }, [])

  const filtered = cases.filter(c =>
    (!filterAgent || String(c.assigned_agent_id) === filterAgent) &&
    (!filterService || c.service_type === filterService) &&
    (!filterSLA || (c.sla_overdue_days != null && c.sla_overdue_days >= filterSLA))
  )

  // Build lookup: status → [cases]
  const allPhaseStatusSet = new Set(pipeline.phases.flatMap(p => p.statuses))
  const casesByStatus = {}
  for (const c of filtered) {
    if (!casesByStatus[c.status]) casesByStatus[c.status] = []
    casesByStatus[c.status].push(c)
  }
  const extraCases = filtered.filter(c => !allPhaseStatusSet.has(c.status))

  const extraPhase = { id: '__extra__', label: 'Άλλα', color: 'gray' }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline Υποθέσεων</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} ενεργές · {PROGRAM_LABELS[activeProgram]}
          </p>
        </div>
        <button onClick={load} className="text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors">
          Ανανέωση
        </button>
      </div>

      {/* Program tabs */}
      <div className="flex gap-1 mb-3 flex-shrink-0 bg-gray-100 p-1 rounded-lg w-fit">
        {PROGRAM_TABS.map(prog => (
          <button
            key={prog}
            onClick={() => { setActiveProgram(prog); setFilterAgent('') }}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              activeProgram === prog ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {PROGRAM_LABELS[prog]}
          </button>
        ))}
      </div>

      {/* Agent filter */}
      <div className="flex gap-3 mb-3 flex-shrink-0 items-center">
        <select
          className="input w-auto text-sm"
          value={filterService}
          onChange={e => setFilterService(e.target.value)}
        >
          <option value="">Όλα τα Προγράμματα</option>
          {[...new Set(cases.map(c => c.service_type).filter(Boolean))].sort().map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className="input w-auto text-sm" value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
          <option value="">Όλοι οι Agents</option>
          {agents.map(a => <option key={a.id} value={String(a.id)}>{a.full_name}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-500 whitespace-nowrap">SLA &gt;</span>
          <input
            type="number"
            min="0"
            className="input w-20 text-sm"
            placeholder="ημ."
            value={filterSLA || ''}
            onChange={e => setFilterSLA(parseInt(e.target.value) || 0)}
          />
        </div>
        {(filterAgent || filterService || filterSLA > 0) && (
          <button onClick={() => { setFilterAgent(''); setFilterService(''); setFilterSLA(0) }} className="text-sm text-gray-500 hover:text-gray-800 underline">
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
        <div className="flex gap-3 overflow-x-auto pb-4 flex-1">
          {pipeline.phases.map(phase => (
            <PhaseColumn
              key={phase.id}
              phase={phase}
              casesByStatus={casesByStatus}
              onMoved={handleMoved}
              pipeline={pipeline}
            />
          ))}
          <PhaseColumn
            key="__extra__"
            phase={{ ...extraPhase, statuses: [] }}
            casesByStatus={{ __extra__: extraCases }}
            onMoved={handleMoved}
            pipeline={pipeline}
          />
        </div>
      )}
    </div>
  )
}
