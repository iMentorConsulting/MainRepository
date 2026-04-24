import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getAllPendingOverview, getUsers } from '../api'
import {
  ExclamationCircleIcon,
  CalendarDaysIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowsUpDownIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const PROG_TABS = ['Όλα', 'ΕΣΠΑ', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ']
const PROG_COLORS = {
  ΕΣΠΑ: 'bg-blue-100 text-blue-700 border-blue-200',
  ΔΥΠΑ: 'bg-green-100 text-green-700 border-green-200',
  ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ: 'bg-purple-100 text-purple-700 border-purple-200',
}

function deadlineBadge(days) {
  if (days === null || days === undefined) return null
  if (days < 0) return { label: `${Math.abs(days)} ημ. εκπρόθεσμη`, cls: 'bg-red-100 text-red-700 border-red-200' }
  if (days === 0) return { label: 'Σήμερα!', cls: 'bg-red-100 text-red-700 border-red-200' }
  if (days <= 7) return { label: `${days} ημ.`, cls: 'bg-red-100 text-red-700 border-red-200' }
  if (days <= 30) return { label: `${days} ημ.`, cls: 'bg-orange-100 text-orange-700 border-orange-200' }
  return { label: `${days} ημ.`, cls: 'bg-gray-100 text-gray-500 border-gray-200' }
}

function CaseRow({ item, expanded, onToggle }) {
  const badge = deadlineBadge(item.days_to_deadline)
  const progColor = PROG_COLORS[item.program_category] || 'bg-gray-100 text-gray-600 border-gray-200'

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-2 bg-white hover:shadow-sm transition-shadow">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-shrink-0 text-gray-400">
          {expanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{item.client_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${progColor}`}>
              {item.program_category}
            </span>
            {item.service_type && (
              <span className="text-xs text-gray-400 truncate">{item.service_type}</span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{item.status}{item.assigned_agent_name ? ` · ${item.assigned_agent_name}` : ''}</div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {item.pending_count > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
              <ExclamationCircleIcon className="w-3.5 h-3.5" />
              {item.pending_count} εκκρεμ.
            </span>
          )}
          {badge && (
            <span className={`flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded-full ${badge.cls}`}>
              <CalendarDaysIcon className="w-3.5 h-3.5" />
              {badge.label}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
          {item.pending_items.length > 0 ? (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Εκκρεμότητες</p>
              {item.pending_items.map((pi, idx) => (
                <div key={pi.id} className="flex gap-3 items-start">
                  <span className="text-xs font-bold text-orange-400 mt-0.5 w-5 text-right flex-shrink-0">{idx + 1}.</span>
                  <div className="flex-1">
                    <span className="text-sm text-gray-800">{pi.item_text}</span>
                    {pi.comment && (
                      <p className="text-xs text-gray-500 mt-0.5 italic">→ {pi.comment}</p>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p className="text-xs text-gray-400 italic">Δεν υπάρχουν εκκρεμότητες — μόνο προθεσμία.</p>
          )}
          {item.project_deadline && (
            <div className="pt-2 border-t border-gray-200 mt-2 flex items-center gap-2">
              <CalendarDaysIcon className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-600">Προθεσμία: <strong>{item.project_deadline}</strong></span>
              {badge && <span className={`text-xs font-semibold border px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>}
            </div>
          )}
          <div className="pt-2">
            <Link to={`/cases/${item.id}`} className="text-xs text-blue-600 hover:underline font-medium">
              → Άνοιγμα υπόθεσης
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PendingPage() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState([])
  const [search, setSearch] = useState('')
  const [progTab, setProgTab] = useState('Όλα')
  const [filterAgent, setFilterAgent] = useState('')
  const [sortBy, setSortBy] = useState('pending_desc')
  const [showOnlyPending, setShowOnlyPending] = useState(false)
  const [showOnlyDeadline, setShowOnlyDeadline] = useState(false)
  const [expandedIds, setExpandedIds] = useState(new Set())

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (progTab !== 'Όλα') params.program_category = progTab
      if (filterAgent) params.assigned_agent_id = filterAgent
      if (search) params.search = search
      setData(await getAllPendingOverview(params))
    } catch { toast.error('Σφάλμα φόρτωσης') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [progTab, filterAgent])
  useEffect(() => { getUsers().then(setAgents).catch(() => {}) }, [])

  const filtered = useMemo(() => {
    let items = data
    if (search) items = items.filter(i => i.client_name?.toLowerCase().includes(search.toLowerCase()))
    if (showOnlyPending) items = items.filter(i => i.pending_count > 0)
    if (showOnlyDeadline) items = items.filter(i => i.project_deadline)

    return [...items].sort((a, b) => {
      if (sortBy === 'pending_desc') return b.pending_count - a.pending_count
      if (sortBy === 'pending_asc') return a.pending_count - b.pending_count
      if (sortBy === 'deadline_asc') {
        const da = a.days_to_deadline ?? 9999
        const db2 = b.days_to_deadline ?? 9999
        return da - db2
      }
      if (sortBy === 'name_asc') return (a.client_name || '').localeCompare(b.client_name || '', 'el')
      return 0
    })
  }, [data, search, showOnlyPending, showOnlyDeadline, sortBy])

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const expandAll = () => setExpandedIds(new Set(filtered.map(i => i.id)))
  const collapseAll = () => setExpandedIds(new Set())

  const totalPending = filtered.reduce((s, i) => s + i.pending_count, 0)
  const withDeadline = filtered.filter(i => i.project_deadline && i.days_to_deadline <= 30).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Εκκρεμότητες & Προθεσμίες</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} υποθέσεις · {totalPending} εκκρεμότητες · {withDeadline} προθεσμίες εντός 30 ημ.
          </p>
        </div>
        <button onClick={load} className="text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
          Ανανέωση
        </button>
      </div>

      {/* Program tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {PROG_TABS.map(tab => (
          <button key={tab} onClick={() => setProgTab(tab)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${progTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >{tab === 'ΔΥΠΑ' ? 'ΔΥΠΑ / ΟΑΕΔ' : tab}</button>
        ))}
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white w-52"
            placeholder="Αναζήτηση πελάτη..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select className="input w-auto text-sm" value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
          <option value="">Όλοι οι Agents</option>
          {agents.map(a => <option key={a.id} value={String(a.id)}>{a.full_name}</option>)}
        </select>

        <div className="flex items-center gap-1 border border-gray-200 rounded-lg bg-white px-1 py-1">
          <ArrowsUpDownIcon className="w-4 h-4 text-gray-400 ml-1" />
          <select className="text-sm border-none focus:outline-none bg-transparent pr-2"
            value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="pending_desc">Εκκρεμότητες ↓</option>
            <option value="pending_asc">Εκκρεμότητες ↑</option>
            <option value="deadline_asc">Προθεσμία ↑</option>
            <option value="name_asc">Όνομα A→Ω</option>
          </select>
        </div>

        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showOnlyPending} onChange={e => setShowOnlyPending(e.target.checked)} className="rounded" />
          Μόνο με εκκρεμότητες
        </label>

        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showOnlyDeadline} onChange={e => setShowOnlyDeadline(e.target.checked)} className="rounded" />
          Μόνο με προθεσμία
        </label>

        <div className="ml-auto flex gap-2">
          <button onClick={expandAll} className="text-xs text-gray-500 hover:text-gray-800 underline">Ανάπτυξη όλων</button>
          <button onClick={collapseAll} className="text-xs text-gray-500 hover:text-gray-800 underline">Σύμπτυξη όλων</button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ExclamationCircleIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Δεν βρέθηκαν υποθέσεις με εκκρεμότητες ή προθεσμίες</p>
        </div>
      ) : (
        <div>
          {filtered.map(item => (
            <CaseRow
              key={item.id}
              item={item}
              expanded={expandedIds.has(item.id)}
              onToggle={() => toggleExpand(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
