import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  getCases, getUsers, updateCase, getMessages, createMessage,
  getCasePendingItems, createCasePendingItem, deleteCasePendingItem,
} from '../api'
import { PIPELINES } from '../pipelines'
import {
  MagnifyingGlassIcon, ChevronDownIcon, ChevronRightIcon,
  PaperAirplaneIcon, PlusIcon, TrashIcon, ArrowTopRightOnSquareIcon,
  CalendarDaysIcon, ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

// ── helpers ──────────────────────────────────────────────────────────────────

const PROGRAMS = ['ΕΣΠΑ', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ']
const PROG_LABEL = { ΕΣΠΑ: 'ΕΣΠΑ', ΔΥΠΑ: 'ΔΥΠΑ', ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ: 'ΜΙΚΡΟ' }
const PROG_COLOR = {
  ΕΣΠΑ: 'bg-blue-100 text-blue-700',
  ΔΥΠΑ: 'bg-green-100 text-green-700',
  ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ: 'bg-purple-100 text-purple-700',
}

const fmtDate = (s) => s ? new Date(s).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''
const fmtTime = (s) => s ? new Date(s).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

function followUpColor(dateStr) {
  if (!dateStr) return 'text-gray-400'
  const days = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  if (days < 0) return 'text-red-600 font-semibold'
  if (days <= 3) return 'text-orange-600 font-semibold'
  if (days <= 7) return 'text-yellow-600'
  return 'text-gray-600'
}

// ── All statuses for a program ────────────────────────────────────────────────
function getStatuses(prog) {
  const pipeline = PIPELINES[prog]
  if (!pipeline) return []
  const all = []
  for (const phase of pipeline.phases) {
    all.push({ group: phase.label, statuses: phase.statuses })
  }
  if (pipeline.extra_statuses?.length) {
    all.push({ group: 'Λοιπά', statuses: pipeline.extra_statuses })
  }
  return all
}

// ── Inline Status Select ──────────────────────────────────────────────────────
function StatusSelect({ caseId, program, value, onChange }) {
  const groups = getStatuses(program)
  const [saving, setSaving] = useState(false)

  const handle = async (e) => {
    const newStatus = e.target.value
    setSaving(true)
    try {
      await updateCase(caseId, { status: newStatus })
      onChange(newStatus)
    } catch { toast.error('Σφάλμα αποθήκευσης') }
    finally { setSaving(false) }
  }

  return (
    <select
      value={value || ''}
      onChange={handle}
      disabled={saving}
      className={`text-xs border rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-full ${saving ? 'opacity-50' : ''}`}
      onClick={e => e.stopPropagation()}
    >
      <option value="">—</option>
      {groups.map(g => (
        <optgroup key={g.group} label={g.group}>
          {g.statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

// ── Inline date field ─────────────────────────────────────────────────────────
function DateField({ caseId, field, value, onChange, label }) {
  const [saving, setSaving] = useState(false)

  const handle = async (e) => {
    const val = e.target.value || null
    setSaving(true)
    try {
      await updateCase(caseId, { [field]: val })
      onChange(val)
    } catch { toast.error('Σφάλμα') }
    finally { setSaving(false) }
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <span className="text-xs text-gray-400">{label}</span>
      <input
        type="date"
        value={value || ''}
        onChange={handle}
        disabled={saving}
        className="text-xs border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
    </div>
  )
}

// ── Expanded row panel ────────────────────────────────────────────────────────
function ExpandedPanel({ caseItem, onCaseChange }) {
  const [messages, setMessages] = useState(null)
  const [pendingItems, setPendingItems] = useState(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [newPending, setNewPending] = useState('')
  const [addingPending, setAddingPending] = useState(false)
  const noteRef = useRef(null)

  useEffect(() => {
    getMessages(caseItem.id).then(setMessages).catch(() => setMessages([]))
    getCasePendingItems(caseItem.id).then(setPendingItems).catch(() => setPendingItems([]))
  }, [caseItem.id])

  const sendNote = async (e) => {
    e.preventDefault()
    if (!note.trim()) return
    setSending(true)
    try {
      const m = await createMessage(caseItem.id, { content: note.trim(), is_internal: true })
      setMessages(prev => [...(prev || []), m])
      setNote('')
      noteRef.current?.focus()
    } catch { toast.error('Σφάλμα αποστολής') }
    finally { setSending(false) }
  }

  const addPending = async () => {
    if (!newPending.trim()) return
    setAddingPending(true)
    try {
      const item = await createCasePendingItem(caseItem.id, { item_text: newPending.trim() })
      setPendingItems(prev => [...(prev || []), item])
      setNewPending('')
      onCaseChange({ pending_count: (caseItem.pending_count || 0) + 1 })
    } catch { toast.error('Σφάλμα') }
    finally { setAddingPending(false) }
  }

  const removePending = async (itemId) => {
    try {
      await deleteCasePendingItem(caseItem.id, itemId)
      setPendingItems(prev => prev.filter(i => i.id !== itemId))
      onCaseChange({ pending_count: Math.max(0, (caseItem.pending_count || 0) - 1) })
    } catch { toast.error('Σφάλμα') }
  }

  const sortedMessages = [...(messages || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  return (
    <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 border-t border-gray-200" onClick={e => e.stopPropagation()}>

      {/* Col 1: Quick fields */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Στοιχεία</p>
        <div className="space-y-2">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Κατάσταση</p>
            <StatusSelect
              caseId={caseItem.id}
              program={caseItem.program_category}
              value={caseItem.status}
              onChange={v => onCaseChange({ status: v })}
            />
          </div>
          <DateField caseId={caseItem.id} field="follow_up_date" value={caseItem.follow_up_date}
            onChange={v => onCaseChange({ follow_up_date: v })} label="Follow-up:" />
          <DateField caseId={caseItem.id} field="project_deadline" value={caseItem.project_deadline}
            onChange={v => onCaseChange({ project_deadline: v })} label="Προθεσμία:" />
        </div>
        <Link
          to={`/cases/${caseItem.id}`}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2"
          onClick={e => e.stopPropagation()}
        >
          <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
          Άνοιγμα πλήρους υπόθεσης
        </Link>
      </div>

      {/* Col 2: Notes */}
      <div className="flex flex-col min-h-0">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Σημειώσεις</p>
        <div className="flex-1 overflow-y-auto max-h-48 space-y-1.5 mb-2 pr-1">
          {messages === null ? (
            <p className="text-xs text-gray-400">Φόρτωση...</p>
          ) : sortedMessages.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Δεν υπάρχουν σημειώσεις</p>
          ) : sortedMessages.map(m => (
            <div key={m.id} className="text-xs bg-white border border-gray-200 rounded px-2 py-1.5">
              <div className="flex justify-between items-center mb-0.5">
                <span className="font-semibold text-gray-600">{m.author_name || '—'}</span>
                <span className="text-gray-400">{fmtTime(m.created_at)}</span>
              </div>
              <p className="text-gray-800 whitespace-pre-wrap leading-snug">{m.content}</p>
            </div>
          ))}
        </div>
        <form onSubmit={sendNote} className="flex gap-1.5">
          <input
            ref={noteRef}
            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Γράψε σημείωση... (Enter = αποστολή)"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendNote(e) } }}
          />
          <button type="submit" disabled={sending || !note.trim()}
            className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">
            <PaperAirplaneIcon className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* Col 3: Εκκρεμότητες */}
      <div className="flex flex-col min-h-0">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Εκκρεμότητες</p>
        <div className="flex-1 overflow-y-auto max-h-44 space-y-1 mb-2">
          {pendingItems === null ? (
            <p className="text-xs text-gray-400">Φόρτωση...</p>
          ) : pendingItems.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Καμία εκκρεμότητα</p>
          ) : pendingItems.map((item, idx) => (
            <div key={item.id} className="flex items-start gap-1.5 group text-xs bg-white border border-orange-100 rounded px-2 py-1.5">
              <span className="text-orange-400 font-bold flex-shrink-0 mt-0.5">{idx + 1}.</span>
              <span className="flex-1 text-gray-800">{item.item_text}</span>
              <button onClick={() => removePending(item.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 flex-shrink-0">
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400"
            placeholder="Νέα εκκρεμότητα..."
            value={newPending}
            onChange={e => setNewPending(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPending()}
          />
          <button onClick={addPending} disabled={addingPending || !newPending.trim()}
            className="p-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-40">
            <PlusIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WorkView() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState([])
  const [search, setSearch] = useState('')
  const [filterProgram, setFilterProgram] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [filterFollowUp, setFilterFollowUp] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterProgram) params.program_category = filterProgram
      if (filterAgent) params.agent_id = filterAgent
      if (search) params.search = search
      setCases(await getCases(params))
    } catch { toast.error('Σφάλμα φόρτωσης') }
    finally { setLoading(false) }
  }, [filterProgram, filterAgent, search])

  useEffect(() => { load() }, [load])
  useEffect(() => { getUsers().then(setAgents).catch(() => {}) }, [])

  const today = new Date().toISOString().slice(0, 10)
  const displayed = filterFollowUp
    ? cases.filter(c => c.follow_up_date && c.follow_up_date <= today)
    : cases

  const updateCaseField = (caseId, fields) => {
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, ...fields } : c))
  }

  const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Γρήγορη Εργασία</h1>
          <p className="text-sm text-gray-500 mt-0.5">{displayed.length} υποθέσεις</p>
        </div>
        <button onClick={load} className="text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
          Ανανέωση
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3 flex-shrink-0 items-center">
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white w-48"
            placeholder="Αναζήτηση πελάτη..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-auto text-sm" value={filterProgram} onChange={e => setFilterProgram(e.target.value)}>
          <option value="">Όλα τα Προγράμματα</option>
          {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="input w-auto text-sm" value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
          <option value="">Όλοι οι Agents</option>
          {agents.map(a => <option key={a.id} value={String(a.id)}>{a.full_name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={filterFollowUp} onChange={e => setFilterFollowUp(e.target.checked)} className="rounded" />
          <CalendarDaysIcon className="w-4 h-4 text-orange-500" />
          Follow-up σήμερα ή παλαιότερα
        </label>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white rounded-xl border">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-800 text-white text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left w-24">Πρόγραμμα</th>
              <th className="px-3 py-2.5 text-left">Πελάτης</th>
              <th className="px-3 py-2.5 text-left w-64">Κατάσταση</th>
              <th className="px-3 py-2.5 text-left">Τελευταία Σημείωση</th>
              <th className="px-3 py-2.5 text-center w-20">Εκκρεμ.</th>
              <th className="px-3 py-2.5 text-center w-28">Follow-up</th>
              <th className="px-3 py-2.5 text-center w-6"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-16 text-gray-400">
                <div className="animate-spin w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
                Φόρτωση...
              </td></tr>
            ) : displayed.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-16 text-gray-400">Δεν βρέθηκαν υποθέσεις</td></tr>
            ) : displayed.map(c => {
              const isExpanded = expandedId === c.id
              const lastMsg = c.last_note_preview
              const fuColor = followUpColor(c.follow_up_date)

              return (
                <>
                  <tr
                    key={c.id}
                    onClick={() => toggleExpand(c.id)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-3 py-2">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${PROG_COLOR[c.program_category] || 'bg-gray-100 text-gray-600'}`}>
                        {PROG_LABEL[c.program_category] || c.program_category || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-gray-900 text-sm">{c.client_name}</div>
                      <div className="text-xs text-gray-400 truncate max-w-xs">{c.service_type || '—'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <StatusSelect
                        caseId={c.id}
                        program={c.program_category}
                        value={c.status}
                        onChange={v => updateCaseField(c.id, { status: v })}
                      />
                    </td>
                    <td className="px-3 py-2 max-w-xs">
                      <p className="text-xs text-gray-500 truncate">{lastMsg || <span className="text-gray-300 italic">—</span>}</p>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {c.pending_count > 0
                        ? <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">
                            <ExclamationCircleIcon className="w-3 h-3" />{c.pending_count}
                          </span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className={`px-3 py-2 text-center text-xs ${fuColor}`}>
                      {c.follow_up_date ? fmtDate(c.follow_up_date) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-center text-gray-400">
                      {isExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`exp-${c.id}`} className="bg-gray-50">
                      <td colSpan={7} className="p-0">
                        <ExpandedPanel
                          caseItem={c}
                          onCaseChange={fields => updateCaseField(c.id, fields)}
                        />
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
