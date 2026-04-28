import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  getCases, getUsers, updateCase, getAllPendingOverview, createMessage,
  createCasePendingItem, deleteCasePendingItem, notifyCasePendingItems,
} from '../api'
import { PIPELINES } from '../pipelines'
import {
  MagnifyingGlassIcon, PlusIcon, TrashIcon,
  CalendarDaysIcon, PaperAirplaneIcon, ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const PROGRAMS = ['ΕΣΠΑ', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ']
const PROG_COLOR = {
  ΕΣΠΑ: 'bg-blue-100 text-blue-700',
  ΔΥΠΑ: 'bg-green-100 text-green-700',
  ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ: 'bg-purple-100 text-purple-700',
}

function followUpColor(dateStr) {
  if (!dateStr) return 'text-gray-400'
  const days = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  if (days < 0) return 'text-red-600 font-semibold'
  if (days <= 3) return 'text-orange-500 font-semibold'
  if (days <= 7) return 'text-yellow-600'
  return 'text-gray-600'
}

function getStatusGroups(prog) {
  const pipeline = PIPELINES[prog]
  if (!pipeline) return []
  const groups = pipeline.phases.map(ph => ({ group: ph.label, statuses: ph.statuses }))
  if (pipeline.extra_statuses?.length) groups.push({ group: 'Λοιπά', statuses: pipeline.extra_statuses })
  return groups
}

// ── Editable program badge ─────────────────────────────────────────────────────
function ProgramSelect({ caseId, value, onChange }) {
  const [saving, setSaving] = useState(false)

  const handle = async (e) => {
    const v = e.target.value
    setSaving(true)
    try {
      await updateCase(caseId, { program_category: v })
      onChange(v)
    } catch { toast.error('Σφάλμα') }
    finally { setSaving(false) }
  }

  return (
    <select
      value={value || ''}
      onChange={handle}
      disabled={saving}
      title="Αλλαγή προγράμματος"
      className={`mt-1 text-xs font-semibold px-1.5 py-0.5 rounded border cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400
        ${PROG_COLOR[value] || 'bg-gray-100 text-gray-600 border-gray-200'}
        ${saving ? 'opacity-50' : ''}`}
    >
      <option value="">—</option>
      {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  )
}

// ── Status inline select ───────────────────────────────────────────────────────
function StatusCell({ caseId, program, value, onChange }) {
  const groups = getStatusGroups(program)
  const [saving, setSaving] = useState(false)

  const handle = async (e) => {
    const v = e.target.value
    setSaving(true)
    try {
      await updateCase(caseId, { status: v })
      onChange(v)
    } catch { toast.error('Σφάλμα') }
    finally { setSaving(false) }
  }

  return (
    <select
      value={value || ''}
      onChange={handle}
      disabled={saving}
      className={`text-xs border rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full ${saving ? 'opacity-50' : ''}`}
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

// ── Notes cell (same messages as CaseDetail → Σημειώσεις tab) ─────────────────
function NotesCell({ caseId, lastNotePreview }) {
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [localLatest, setLocalLatest] = useState(null)

  const submit = async () => {
    const text = note.trim()
    if (!text) return
    setSending(true)
    try {
      await createMessage(caseId, { content: text, is_internal: true })
      setLocalLatest(text)
      setNote('')
    } catch { toast.error('Σφάλμα σημείωσης') }
    finally { setSending(false) }
  }

  const preview = localLatest || lastNotePreview

  return (
    <div className="space-y-1.5 min-w-[180px]">
      {preview ? (
        <p className="text-xs text-gray-600 leading-snug bg-gray-50 border border-gray-100 rounded px-2 py-1.5 line-clamp-3">
          {preview}
        </p>
      ) : (
        <p className="text-xs text-gray-300 italic">—</p>
      )}
      <div className="flex gap-1 items-end">
        <textarea
          rows={2}
          className="flex-1 min-w-0 text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none placeholder-gray-300"
          placeholder="Σημείωση... (Enter)"
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
        />
        <button
          onClick={submit}
          disabled={sending || !note.trim()}
          className="shrink-0 text-blue-400 hover:text-blue-600 disabled:opacity-30 mb-0.5"
        >
          <PaperAirplaneIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Follow-up date cell ────────────────────────────────────────────────────────
function FollowUpCell({ caseId, value, onUpdate }) {
  const [saving, setSaving] = useState(false)

  const handle = async (e) => {
    const val = e.target.value || null
    setSaving(true)
    try {
      await updateCase(caseId, { follow_up_date: val })
      onUpdate(val)
    } catch { toast.error('Σφάλμα') }
    finally { setSaving(false) }
  }

  return (
    <input
      type="date"
      value={value || ''}
      onChange={handle}
      disabled={saving}
      className={`text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full ${followUpColor(value)} ${saving ? 'opacity-50' : ''}`}
    />
  )
}

// ── Pending items cell (each item on its own line) ─────────────────────────────
function PendingCell({ caseId, items, onAdd, onDelete }) {
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    const text = newText.trim()
    if (!text) return
    setAdding(true)
    const ok = await onAdd(caseId, text)
    if (ok) setNewText('')
    setAdding(false)
  }

  return (
    <div className="space-y-0.5 min-w-[180px]">
      {items.length === 0
        ? <p className="text-xs text-gray-300 italic">—</p>
        : items.map((item, idx) => (
          <div key={item.id} className="flex items-start gap-1 group text-xs leading-snug">
            <span className="text-orange-400 font-bold shrink-0 w-4">{idx + 1}.</span>
            <span className="flex-1 text-gray-800 break-words">{item.item_text}</span>
            <button
              onClick={() => onDelete(caseId, item.id)}
              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 shrink-0 mt-0.5"
            >
              <TrashIcon className="w-3 h-3" />
            </button>
          </div>
        ))
      }
      <div className="flex gap-1 pt-1">
        <input
          className="flex-1 min-w-0 text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-orange-300 placeholder-gray-300"
          placeholder="+ Νέα εκκρεμότητα..."
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newText.trim()}
          className="shrink-0 text-orange-400 hover:text-orange-600 disabled:opacity-30"
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Send all pending items to client ──────────────────────────────────────────
function SendButton({ caseId, hasItems }) {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!hasItems) return <span className="text-gray-200 text-xs">—</span>

  const send = async (type) => {
    setOpen(false)
    setSending(true)
    try {
      await notifyCasePendingItems(caseId, { notification_type: type })
      toast.success('Εστάλη επιτυχώς')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποστολής')
    } finally { setSending(false) }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(p => !p)}
        disabled={sending}
        className="flex items-center gap-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded px-2 py-1 disabled:opacity-50"
      >
        <PaperAirplaneIcon className="w-3.5 h-3.5" />
        {sending ? '...' : 'Αποστολή'}
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 w-32">
          <button onClick={() => send('email')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">Email</button>
          <button onClick={() => send('viber')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">Viber</button>
          <button onClick={() => send('both')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 font-semibold">Και τα δύο</button>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function WorkView() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState([])
  const [search, setSearch] = useState('')
  const [filterProgram, setFilterProgram] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [filterFollowUp, setFilterFollowUp] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const caseParams = {}
      if (filterProgram) caseParams.program_category = filterProgram
      if (filterAgent) caseParams.agent_id = filterAgent
      if (search) caseParams.search = search

      const overviewParams = {}
      if (filterProgram) overviewParams.program_category = filterProgram
      if (filterAgent) overviewParams.assigned_agent_id = filterAgent
      if (search) overviewParams.search = search

      const [casesData, pendingData] = await Promise.all([
        getCases(caseParams),
        getAllPendingOverview(overviewParams).catch(() => []),
      ])

      const pendingMap = {}
      for (const p of pendingData) {
        pendingMap[p.id] = p.pending_items || []
      }

      setCases(casesData.map(c => ({
        ...c,
        pending_items: pendingMap[c.id] || [],
      })))
    } catch { toast.error('Σφάλμα φόρτωσης') }
    finally { setLoading(false) }
  }, [filterProgram, filterAgent, search])

  useEffect(() => { load() }, [load])
  useEffect(() => { getUsers().then(setAgents).catch(() => {}) }, [])

  const today = new Date().toISOString().slice(0, 10)
  const displayed = filterFollowUp
    ? cases.filter(c => c.follow_up_date && c.follow_up_date <= today)
    : cases

  const updateField = (caseId, fields) =>
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, ...fields } : c))

  const addPending = async (caseId, text) => {
    try {
      const item = await createCasePendingItem(caseId, { item_text: text })
      setCases(prev => prev.map(c =>
        c.id === caseId ? { ...c, pending_items: [...(c.pending_items || []), item] } : c
      ))
      return true
    } catch { toast.error('Σφάλμα'); return false }
  }

  const deletePending = async (caseId, itemId) => {
    try {
      await deleteCasePendingItem(caseId, itemId)
      setCases(prev => prev.map(c =>
        c.id === caseId ? { ...c, pending_items: c.pending_items.filter(i => i.id !== itemId) } : c
      ))
    } catch { toast.error('Σφάλμα') }
  }

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
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white w-52"
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
          Follow-up σήμερα/παρελθόν
        </label>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white rounded-xl border">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-800 text-white text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left w-44">Πελάτης</th>
              <th className="px-3 py-2.5 text-left w-44">Κατάσταση / Μετακίνηση</th>
              <th className="px-3 py-2.5 text-left w-56">Σημειώσεις</th>
              <th className="px-3 py-2.5 text-left">Εκκρεμότητες</th>
              <th className="px-3 py-2.5 text-center w-32">Υπενθύμιση</th>
              <th className="px-3 py-2.5 text-center w-28">Αποστολή</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-16 text-gray-400">
                <div className="animate-spin w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
                Φόρτωση...
              </td></tr>
            ) : displayed.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-16 text-gray-400">Δεν βρέθηκαν υποθέσεις</td></tr>
            ) : displayed.map(c => (
              <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50/50 align-top">
                <td className="px-3 py-2.5">
                  <Link
                    to={`/cases/${c.id}`}
                    className="font-semibold text-gray-900 hover:text-blue-600 text-sm leading-snug flex items-center gap-1 group"
                  >
                    {c.client_name}
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 shrink-0" />
                  </Link>
                  <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[10rem]">{c.service_type || '—'}</div>
                  <ProgramSelect
                    caseId={c.id}
                    value={c.program_category}
                    onChange={v => updateField(c.id, { program_category: v })}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <StatusCell
                    caseId={c.id}
                    program={c.program_category}
                    value={c.status}
                    onChange={v => updateField(c.id, { status: v })}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <NotesCell
                    caseId={c.id}
                    lastNotePreview={c.last_note_preview}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <PendingCell
                    caseId={c.id}
                    items={c.pending_items || []}
                    onAdd={addPending}
                    onDelete={deletePending}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <FollowUpCell
                    caseId={c.id}
                    value={c.follow_up_date}
                    onUpdate={v => updateField(c.id, { follow_up_date: v })}
                  />
                </td>
                <td className="px-3 py-2.5 text-center">
                  <SendButton caseId={c.id} hasItems={(c.pending_items || []).length > 0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
