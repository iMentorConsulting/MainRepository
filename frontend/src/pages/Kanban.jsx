import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getCases, updateCase } from '../api'
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

const STATUSES = [
  'ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ',
  'ΕΓΚΡΙΣΗ - ΠΡΙΝ ΤΟ 1ο ΑΙΤΗΜΑ',
  'ΣΕ 1ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ',
  'ΣΕ 2ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ',
  'ΕΝΣΤΑΣΗ',
  'ΣΕ ΤΕΛΙΚΟ ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ',
]

const STATUS_COLORS = {
  'ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ': 'bg-blue-100 text-blue-800 border-blue-200',
  'ΕΓΚΡΙΣΗ - ΠΡΙΝ ΤΟ 1ο ΑΙΤΗΜΑ': 'bg-green-100 text-green-800 border-green-200',
  'ΣΕ 1ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'ΣΕ 2ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ': 'bg-orange-100 text-orange-800 border-orange-200',
  'ΕΝΣΤΑΣΗ': 'bg-red-100 text-red-800 border-red-200',
  'ΣΕ ΤΕΛΙΚΟ ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ': 'bg-purple-100 text-purple-800 border-purple-200',
}

const STATUS_HEADER_COLORS = {
  'ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ': 'border-t-blue-500',
  'ΕΓΚΡΙΣΗ - ΠΡΙΝ ΤΟ 1ο ΑΙΤΗΜΑ': 'border-t-green-500',
  'ΣΕ 1ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ': 'border-t-yellow-500',
  'ΣΕ 2ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ': 'border-t-orange-500',
  'ΕΝΣΤΑΣΗ': 'border-t-red-500',
  'ΣΕ ΤΕΛΙΚΟ ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ': 'border-t-purple-500',
}

const fmt = (n) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n || 0)

function MoveDropdown({ caseItem, currentStatus, onMoved }) {
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
      toast.success(`Μετακινήθηκε σε "${newStatus}"`)
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
          {/* backdrop to close */}
          <div
            className="fixed inset-0 z-10"
            onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(false) }}
          />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-56">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={e => handleMove(e, s)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center gap-2 ${
                  s === currentStatus ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-700'
                }`}
              >
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[s]?.split(' ')[0]?.replace('bg-', 'bg-') || 'bg-gray-300'}`} />
                {s}
                {s === currentStatus && <span className="ml-auto text-gray-400">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function CaseCard({ caseItem, onMoved }) {
  const urgent = caseItem.days_to_deadline !== null && caseItem.days_to_deadline <= 14 && caseItem.days_to_deadline >= 0

  return (
    <Link
      to={`/cases/${caseItem.id}`}
      className="block bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md hover:border-gray-300 transition-all group"
    >
      {/* Client name */}
      <div className="font-semibold text-gray-900 text-sm leading-tight mb-1 group-hover:text-blue-700 transition-colors">
        {caseItem.client_name}
      </div>

      {/* Service type */}
      {caseItem.service_type && (
        <div className="flex items-start gap-1 text-xs text-gray-500 mb-2">
          <BriefcaseIcon className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400" />
          <span className="line-clamp-2">{caseItem.service_type}</span>
        </div>
      )}

      {/* Agent */}
      {caseItem.assigned_agent_name && (
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
          <UserIcon className="w-3 h-3 flex-shrink-0 text-gray-400" />
          <span className="truncate">{caseItem.assigned_agent_name}</span>
        </div>
      )}

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
        {caseItem.balance > 0.01 && (
          <span className="flex items-center gap-0.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">
            <CurrencyEuroIcon className="w-3 h-3" />
            {fmt(caseItem.balance)}
          </span>
        )}
        {caseItem.days_to_deadline !== null && urgent && (
          <span className="flex items-center gap-0.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
            <ClockIcon className="w-3 h-3" />
            {caseItem.days_to_deadline} ημ.
          </span>
        )}
        {caseItem.open_tasks > 0 && (
          <span className="flex items-center gap-0.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
            <ClipboardDocumentListIcon className="w-3 h-3" />
            {caseItem.open_tasks} tasks
          </span>
        )}
      </div>

      {/* Move dropdown */}
      <div className="pt-1 border-t border-gray-100 mt-1">
        <MoveDropdown caseItem={caseItem} currentStatus={caseItem.status} onMoved={onMoved} />
      </div>
    </Link>
  )
}

function KanbanColumn({ status, cases, onMoved }) {
  const colorClasses = STATUS_COLORS[status] || 'bg-gray-100 text-gray-800 border-gray-200'
  const topBorder = STATUS_HEADER_COLORS[status] || 'border-t-gray-400'

  return (
    <div className={`flex flex-col bg-gray-50 rounded-xl border border-gray-200 border-t-4 ${topBorder} min-w-64 w-64 flex-shrink-0`}>
      {/* Column header */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full leading-tight border ${colorClasses}`}>
            {status}
          </span>
          <span className="text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">
            {cases.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-220px)]">
        {cases.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-400">
            Καμία υπόθεση
          </div>
        ) : (
          cases.map(c => (
            <CaseCard key={c.id} caseItem={c} onMoved={onMoved} />
          ))
        )}
      </div>
    </div>
  )
}

export default function Kanban() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getCases()
      setCases(data)
    } catch {
      toast.error('Σφάλμα φόρτωσης υποθέσεων')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Optimistic update: move card to new status column without refetching
  const handleMoved = useCallback((caseId, newStatus) => {
    setCases(prev =>
      prev.map(c => c.id === caseId ? { ...c, status: newStatus } : c)
    )
  }, [])

  // Group cases by status
  const grouped = STATUSES.reduce((acc, s) => {
    acc[s] = cases.filter(c => c.status === s)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline Υποθέσεων</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {cases.length} ενεργές υποθέσεις σε {STATUSES.length} στάδια
          </p>
        </div>
        <button
          onClick={load}
          className="text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          Ανανέωση
        </button>
      </div>

      {/* Summary strip */}
      <div className="flex gap-2 mb-4 flex-shrink-0 overflow-x-auto pb-1">
        {STATUSES.map(s => {
          const count = grouped[s]?.length ?? 0
          const colors = STATUS_COLORS[s] || 'bg-gray-100 text-gray-700 border-gray-200'
          return (
            <span
              key={s}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap flex-shrink-0 ${colors}`}
            >
              {s.split(' ').slice(0, 2).join(' ')}
              <span className="font-bold">{count}</span>
            </span>
          )
        })}
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
        {STATUSES.map(s => (
          <KanbanColumn
            key={s}
            status={s}
            cases={grouped[s] || []}
            onMoved={handleMoved}
          />
        ))}
      </div>
    </div>
  )
}
