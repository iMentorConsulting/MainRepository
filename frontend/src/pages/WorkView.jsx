import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  getCases, getUsers, updateCase, getAllPendingOverview, createMessage, getMessages, deleteMessage,
  createCasePendingItem, deleteCasePendingItem, notifyCasePendingItems, getNotificationLogs,
  getPendingItemTemplates, sendNotification,
} from '../api'
import { PIPELINES } from '../pipelines'
import {
  MagnifyingGlassIcon, PlusIcon, TrashIcon,
  CalendarDaysIcon, PaperAirplaneIcon, ArrowTopRightOnSquareIcon, BoltIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const PROGRAMS = ['ΕΣΠΑ', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ']
const PROG_COLOR = {
  ΕΣΠΑ: 'bg-blue-100 text-blue-700',
  ΔΥΠΑ: 'bg-green-100 text-green-700',
  ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ: 'bg-purple-100 text-purple-700',
}

function followUpCellClass(dateStr) {
  if (!dateStr) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  if (d < today) return 'bg-red-50'
  if (d.getTime() === today.getTime()) return 'bg-blue-50'
  return 'bg-green-50'
}

function fmtNoteDate(s) {
  if (!s) return ''
  const d = new Date(s)
  const now = new Date()
  const isThisYear = d.getFullYear() === now.getFullYear()
  if (isThisYear) return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' })
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function getStatusGroups(prog) {
  const pipeline = PIPELINES[prog]
  if (!pipeline) return []
  const groups = pipeline.phases.map(ph => ({ group: ph.label, statuses: ph.statuses }))
  if (pipeline.extra_statuses?.length) groups.push({ group: 'Λοιπά', statuses: pipeline.extra_statuses })
  return groups
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

// ── Notes cell — shows preview, lazy-loads all messages on first click ─────────
function NotesCell({ caseId, lastNotePreview, lastNoteAt }) {
  const [messages, setMessages] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  const expand = () => {
    if (expanded) return
    setExpanded(true)
    getMessages(caseId)
      .then(msgs => setMessages([...msgs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))))
      .catch(() => setMessages([]))
  }

  const submit = async () => {
    const text = note.trim()
    if (!text) return
    setSending(true)
    try {
      const m = await createMessage(caseId, { content: text, is_internal: true })
      setMessages(prev => [...(prev || []), m])
      setNote('')
    } catch { toast.error('Σφάλμα σημείωσης') }
    finally { setSending(false) }
  }

  const del = async (msgId) => {
    try {
      await deleteMessage(caseId, msgId)
      setMessages(prev => prev.filter(m => m.id !== msgId))
    } catch { toast.error('Σφάλμα διαγραφής') }
  }

  return (
    <div className="space-y-1">
      {!expanded ? (
        /* Collapsed — show last note preview, click to expand */
        <div onClick={expand} className="cursor-pointer group">
          {lastNotePreview ? (
            <div className="flex items-start gap-1 text-xs bg-gray-50 border border-gray-100 rounded px-2 py-1.5 hover:border-blue-200 transition-colors">
              <div className="flex-1 min-w-0">
                {lastNoteAt && (
                  <span className="font-mono text-[9px] bg-gray-200 text-gray-400 rounded px-1 py-px mr-1 shrink-0">
                    {fmtNoteDate(lastNoteAt)}
                  </span>
                )}
                <span className="text-gray-600 leading-snug">{lastNotePreview}</span>
              </div>
              <span className="text-[9px] text-blue-400 group-hover:text-blue-600 shrink-0 ml-1 mt-0.5">▼</span>
            </div>
          ) : (
            <p className="text-xs text-gray-300 italic hover:text-blue-400 cursor-pointer">+ Σημείωση</p>
          )}
        </div>
      ) : (
        /* Expanded — show all messages */
        <>
          {messages === null ? (
            <p className="text-xs text-gray-300">Φόρτωση...</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-gray-300 italic">—</p>
          ) : messages.map(m => (
            <div key={m.id} className="flex items-start gap-1 group text-xs bg-gray-50 border border-gray-100 rounded px-2 py-1.5">
              <div className="flex-1 min-w-0">
                <span className="font-mono text-[9px] bg-gray-200 text-gray-400 rounded px-1 py-px mr-1 shrink-0">
                  {fmtNoteDate(m.created_at)}
                </span>
                <span className="text-gray-800 leading-snug whitespace-pre-wrap">{m.content}</span>
              </div>
              <button onClick={() => del(m.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 shrink-0 mt-0.5">
                <TrashIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </>
      )}

      {/* Add note — always visible if expanded or on click to expand+focus */}
      {expanded && (
        <div className="flex gap-1 items-end pt-0.5">
          <textarea
            rows={2}
            autoFocus
            className="flex-1 min-w-0 text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none placeholder-gray-300"
            placeholder="Σημείωση... (Enter)"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          />
          <button onClick={submit} disabled={sending || !note.trim()}
            className="shrink-0 text-blue-400 hover:text-blue-600 disabled:opacity-30 mb-0.5">
            <PaperAirplaneIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
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
      className={`text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full ${saving ? 'opacity-50' : ''}`}
    />
  )
}

// ── Pending items cell (each item on its own line) ─────────────────────────────
function PendingCell({ caseId, programCategory, items, onAdd, onDelete }) {
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [templates, setTemplates] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    getPendingItemTemplates(programCategory).then(setTemplates).catch(() => {})
  }, [programCategory])

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const suggestions = newText.trim().length > 0
    ? templates.filter(t =>
        t.item_text.toLowerCase().includes(newText.toLowerCase()) &&
        !items.some(i => i.item_text === t.item_text)
      )
    : []

  const handleAdd = async (text) => {
    const t = (text || newText).trim()
    if (!t) return
    setAdding(true)
    setShowSuggestions(false)
    const ok = await onAdd(caseId, t)
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
      <div ref={wrapperRef} className="relative flex gap-1 pt-1">
        <input
          className="flex-1 min-w-0 text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-orange-300 placeholder-gray-300"
          placeholder="+ Νέα εκκρεμότητα..."
          value={newText}
          onChange={e => { setNewText(e.target.value); setShowSuggestions(true) }}
          onFocus={() => newText.trim() && setShowSuggestions(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleAdd() }
            if (e.key === 'Escape') setShowSuggestions(false)
          }}
        />
        <button
          onClick={() => handleAdd()}
          disabled={adding || !newText.trim()}
          className="shrink-0 text-orange-400 hover:text-orange-600 disabled:opacity-30"
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-6 top-full mt-0.5 bg-white border border-orange-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
            {suggestions.map(t => (
              <button
                key={t.id}
                onMouseDown={e => { e.preventDefault(); handleAdd(t.item_text) }}
                className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 hover:bg-orange-50 hover:text-orange-800 border-b border-gray-100 last:border-0"
              >
                {t.item_text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Send button + past notification dates ─────────────────────────────────────
function QuickNotifyButtonWV({ caseId, clientName }) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSend = async () => {
    if (!msg.trim()) return
    setSending(true)
    try {
      await sendNotification(caseId, { notification_type: 'email', message: msg })
      toast.success('Ειδοποίηση εστάλη')
      setMsg(''); setOpen(false)
    } catch { toast.error('Σφάλμα') }
    finally { setSending(false) }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Γρήγορη Ειδοποίηση"
        className="p-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-500 hover:text-amber-600 transition-colors border border-amber-200"
      >
        <BoltIcon className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-200 w-60 p-3 space-y-2">
          <div className="text-xs font-medium text-gray-700 truncate">{clientName}</div>
          <textarea rows={3} value={msg} onChange={e => setMsg(e.target.value)} autoFocus
            placeholder="Κείμενο ειδοποίησης..."
            className="w-full border rounded-lg px-2 py-1.5 text-xs resize-none focus:ring-1 focus:ring-blue-500" />
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="flex-1 text-xs py-1.5 border rounded-lg hover:bg-gray-50">Άκυρο</button>
            <button onClick={handleSend} disabled={!msg.trim() || sending}
              className="flex-1 text-xs py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {sending ? '...' : 'Αποστολή'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SendButton({ caseId, hasItems }) {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [logs, setLogs] = useState(null)
  const menuRef = useRef(null)

  const loadLogs = () => {
    if (logs !== null) return
    getNotificationLogs(caseId)
      .then(data => setLogs([...data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))))
      .catch(() => setLogs([]))
  }

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const send = async (type) => {
    setOpen(false)
    setSending(true)
    try {
      await notifyCasePendingItems(caseId, { notification_type: type })
      toast.success('Εστάλη επιτυχώς')
      const newLogs = await getNotificationLogs(caseId)
      setLogs([...newLogs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)))
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποστολής')
    } finally { setSending(false) }
  }

  return (
    <div className="space-y-1" onMouseEnter={loadLogs}>
      {/* Past send dates */}
      {logs && logs.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
          {logs.map(log => (
            <span key={log.id} className="font-mono text-[9px] bg-gray-100 text-gray-400 rounded px-1 py-px">
              {fmtNoteDate(log.created_at)}
            </span>
          ))}
        </div>
      )}

      {/* Send button */}
      {hasItems && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => { loadLogs(); setOpen(p => !p) }}
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
  const [filterServiceType, setFilterServiceType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
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
  useEffect(() => { setFilterServiceType(''); setFilterStatus('') }, [filterProgram])
  useEffect(() => { getUsers().then(setAgents).catch(() => {}) }, [])

  const serviceTypeOptions = [...new Set(cases.map(c => c.service_type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el'))

  const statusGroups = filterProgram
    ? getStatusGroups(filterProgram)
    : PROGRAMS.flatMap(p => getStatusGroups(p).map(g => ({ ...g, group: `${p} · ${g.group}` })))

  const today = new Date().toISOString().slice(0, 10)
  const displayed = cases.filter(c => {
    if (filterFollowUp && !(c.follow_up_date && c.follow_up_date <= today)) return false
    if (filterServiceType && c.service_type !== filterServiceType) return false
    if (filterStatus && c.status !== filterStatus) return false
    return true
  })

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

      {/* Program tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-3 flex-shrink-0">
        {['Όλα', ...PROGRAMS].map(tab => {
          const val = tab === 'Όλα' ? '' : tab
          return (
            <button
              key={tab}
              onClick={() => setFilterProgram(val)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                filterProgram === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab === 'ΔΥΠΑ' ? 'ΔΥΠΑ / ΟΑΕΔ' : tab}
            </button>
          )
        })}
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
        <select className="input w-auto text-sm" value={filterServiceType} onChange={e => setFilterServiceType(e.target.value)}>
          <option value="">Όλες οι Υπηρεσίες</option>
          {serviceTypeOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input w-auto text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Όλες οι Καταστάσεις</option>
          {statusGroups.map(g => (
            <optgroup key={g.group} label={g.group}>
              {g.statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </optgroup>
          ))}
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
              <th className="px-3 py-2.5 text-left min-w-[18rem]">Σημειώσεις</th>
              <th className="px-3 py-2.5 text-left w-64">Εκκρεμότητες</th>
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
                  <span className={`inline-block mt-1 text-xs font-semibold px-1.5 py-0.5 rounded ${PROG_COLOR[c.program_category] || 'bg-gray-100 text-gray-600'}`}>
                    {c.program_category || '—'}
                  </span>
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
                  <NotesCell caseId={c.id} lastNotePreview={c.last_note_preview} lastNoteAt={c.last_note_at} />
                </td>
                <td className="px-3 py-2.5">
                  <PendingCell
                    caseId={c.id}
                    programCategory={c.program_category}
                    items={c.pending_items || []}
                    onAdd={addPending}
                    onDelete={deletePending}
                  />
                </td>
                <td className={`px-3 py-2.5 ${followUpCellClass(c.follow_up_date)}`}>
                  <FollowUpCell
                    caseId={c.id}
                    value={c.follow_up_date}
                    onUpdate={v => updateField(c.id, { follow_up_date: v })}
                  />
                </td>
                <td className="px-3 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <SendButton caseId={c.id} hasItems={(c.pending_items || []).length > 0} />
                    <QuickNotifyButtonWV caseId={c.id} clientName={c.client_name} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
