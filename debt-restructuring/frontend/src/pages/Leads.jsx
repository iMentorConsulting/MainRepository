import { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { format, parseISO, differenceInDays, isPast } from 'date-fns'
import { el } from 'date-fns/locale'
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  PhoneIcon,
  ChatBubbleLeftEllipsisIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
  BellIcon,
  LinkIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'
import * as api from '../api'

const EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA']
const PAGE_SIZE = 50

const THIS_YEAR = new Date().getFullYear()
const YEARS = [THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2]
const MONTHS_EL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

const STATUS_OPTIONS = ['call', 'hot', 'active', 'deal', 'cancelled']
const STATUS_CFG = {
  call:      { cls: 'bg-blue-100 text-blue-800',    label: 'Call' },
  hot:       { cls: 'bg-red-100 text-red-700',      label: '🔥 Hot' },
  active:    { cls: 'bg-yellow-100 text-yellow-800', label: 'Active' },
  deal:      { cls: 'bg-green-100 text-green-800',  label: '✅ Deal' },
  cancelled: { cls: 'bg-gray-100 text-gray-500',    label: 'Cancelled' },
  '':        { cls: 'bg-gray-50 text-gray-400',     label: '—' },
}

function statusCfg(val) {
  return STATUS_CFG[(val || '').toLowerCase()] || STATUS_CFG['']
}

// ── Reusable multi-select dropdown ─────────────────────────────────────────
function MultiSelect({ options, selected, onChange, placeholder, cls = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const toggle = (val) => onChange(
    selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]
  )

  const label = selected.length === 0
    ? placeholder
    : selected.length === options.length
    ? 'Όλα'
    : selected.length === 1
    ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
    : `${selected.length} επιλεγμένα`

  return (
    <div className={`relative ${cls}`} ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="input text-sm flex items-center gap-2 w-full min-w-0 justify-between"
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon className="w-4 h-4 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[160px] py-1 max-h-72 overflow-y-auto">
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="rounded border-gray-300 text-blue-600"
              />
              <span>{opt.label}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <div className="border-t border-gray-100 mt-1 pt-1 px-3 pb-1">
              <button onClick={() => onChange([])} className="text-xs text-gray-400 hover:text-red-500">
                Καθαρισμός
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Status badge with inline dropdown ──────────────────────────────────────
function StatusBadge({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const cfg = statusCfg(value)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`text-xs font-semibold px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 whitespace-nowrap ${cfg.cls}`}
      >
        {cfg.label}
      </button>
      {open && (
        <div className="absolute z-50 top-7 left-0 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[130px] py-1">
          {[...STATUS_OPTIONS, ''].map(s => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-gray-50
                ${statusCfg(s).cls}
                ${(value || '') === s ? 'ring-1 ring-inset ring-blue-400' : ''}`}
            >
              {s === '' ? '— Καθαρισμός' : statusCfg(s).label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Assigned-to inline select ───────────────────────────────────────────────
function AssignedSelect({ value, onChange }) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      className="text-xs border-0 bg-transparent font-bold text-blue-800 cursor-pointer focus:outline-none hover:bg-blue-50 rounded px-1 py-0.5 max-w-[80px]"
    >
      <option value="">—</option>
      {EMPLOYEES.map(e => <option key={e} value={e}>{e}</option>)}
    </select>
  )
}

// ── Next-call pill ──────────────────────────────────────────────────────────
// value = app_next_call (ISO), sheetValue = next_call_sheet (free text from sheet)
function NextCallPill({ value, sheetValue, onChange }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ? value.slice(0, 10) : '')

  const parsed = value ? (() => { try { return parseISO(value) } catch { return null } })() : null
  const overdue = parsed ? isPast(parsed) && differenceInDays(new Date(), parsed) > 0 : false

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <input
          type="date"
          className="text-xs border border-blue-300 rounded px-1 py-0.5 focus:outline-none w-[110px]"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          autoFocus
        />
        <button onClick={() => { onChange(draft || ''); setEditing(false) }}
          className="text-xs text-green-700 font-bold">OK</button>
        <button onClick={() => setEditing(false)} className="text-xs text-gray-400">✕</button>
      </div>
    )
  }

  // App reminder (ISO date)
  if (value && parsed) {
    return (
      <button
        onClick={e => { e.stopPropagation(); setEditing(true) }}
        className={`text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex items-center gap-1
          ${overdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}
      >
        <BellIcon className="w-3 h-3 shrink-0" />
        {format(parsed, 'dd/MM', { locale: el })}
      </button>
    )
  }

  // Sheet next call (free text, read-only display + click to set app reminder)
  if (sheetValue) {
    return (
      <button
        onClick={e => { e.stopPropagation(); setEditing(true) }}
        title={`Sheet: ${sheetValue} — κλικ για να θέσετε reminder`}
        className="text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200"
      >
        <BellIcon className="w-3 h-3 shrink-0" />
        {sheetValue.length > 8 ? sheetValue.slice(0, 8) + '…' : sheetValue}
      </button>
    )
  }

  // Empty — click to add
  return (
    <button
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      className="text-xs text-gray-300 hover:text-gray-500 flex items-center gap-1"
    >
      <BellIcon className="w-3 h-3 shrink-0" />
    </button>
  )
}

// ── Comment panel ───────────────────────────────────────────────────────────
function CommentPanel({ lead, currentEmployee, onUpdate }) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!text.trim()) return
    setSaving(true)
    try {
      const res = await api.addLeadComment(lead.id, text.trim(), currentEmployee)
      onUpdate(res.data)
      setText('')
    } catch { toast.error('Σφάλμα') }
    finally { setSaving(false) }
  }

  const del = async (idx) => {
    try {
      const res = await api.deleteLeadComment(lead.id, idx)
      onUpdate(res.data)
    } catch { toast.error('Σφάλμα') }
  }

  const all = [
    ...(lead.sheet_comments ? [{ text: lead.sheet_comments, author: 'Sheet', at: null, _sheet: true }] : []),
    ...(lead.app_comments || []),
  ]

  return (
    <div className="space-y-2">
      {all.length === 0 && <p className="text-xs text-gray-400 italic">Χωρίς σχόλια</p>}
      {all.map((c, i) => (
        <div key={i} className={`flex items-start gap-2 text-xs ${c._sheet ? 'opacity-70' : ''}`}>
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5
            ${c._sheet ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white'}`}>
            {c.author === 'system' ? '⚙' : (c.author?.[0] || '?')}
          </div>
          <div className="flex-1 bg-gray-50 rounded-lg px-2 py-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-gray-600">{c.author}</span>
              {c.at && <span className="text-gray-400">{format(parseISO(c.at), 'dd/MM HH:mm')}</span>}
            </div>
            <p className="text-gray-800 mt-0.5 whitespace-pre-wrap">{c.text}</p>
          </div>
          {!c._sheet && (
            <button onClick={() => del(lead.app_comments.indexOf(c))} className="text-gray-300 hover:text-red-500 mt-1">
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <textarea
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
          rows={2}
          placeholder="Νέο σχόλιο… (Ctrl+Enter)"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submit() }}
        />
        <button onClick={submit} disabled={saving || !text.trim()} className="btn-primary text-xs px-3 self-end">
          {saving ? '…' : 'OK'}
        </button>
      </div>
    </div>
  )
}

// ── Viber panel ─────────────────────────────────────────────────────────────
function ViberPanel({ lead, onUpdate }) {
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!msg.trim()) return
    setSending(true)
    try {
      await api.sendLeadViber(lead.id, msg.trim())
      toast.success('Viber εστάλη!')
      const res = await api.getLead(lead.id)
      onUpdate(res.data)
      setMsg('')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Σφάλμα Viber')
    } finally { setSending(false) }
  }

  return (
    <div className="space-y-2">
      <textarea
        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        rows={3} placeholder="Μήνυμα Viber…" value={msg} onChange={e => setMsg(e.target.value)}
      />
      <button onClick={send} disabled={sending || !msg.trim() || !lead.phone} className="btn-primary text-xs px-4">
        {sending ? '…' : '📱 Αποστολή Viber'}
      </button>
      {!lead.phone && <p className="text-xs text-red-500">Δεν υπάρχει τηλέφωνο</p>}
    </div>
  )
}

// ── Email panel ─────────────────────────────────────────────────────────────
function EmailPanel({ lead, onUpdate }) {
  const [to, setTo] = useState(lead.email || '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!to || !subject || !body) return
    setSending(true)
    try {
      await api.sendLeadEmail(lead.id, to, subject, body)
      toast.success('Email εστάλη!')
      const res = await api.getLead(lead.id)
      onUpdate(res.data)
      setSubject(''); setBody('')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Σφάλμα email')
    } finally { setSending(false) }
  }

  return (
    <div className="space-y-2">
      <input className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none" placeholder="Προς" value={to} onChange={e => setTo(e.target.value)} />
      <input className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none" placeholder="Θέμα" value={subject} onChange={e => setSubject(e.target.value)} />
      <textarea className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none" rows={4} placeholder="Κείμενο…" value={body} onChange={e => setBody(e.target.value)} />
      <button onClick={send} disabled={sending || !to || !subject || !body} className="btn-primary text-xs px-4">
        {sending ? '…' : '✉️ Αποστολή Email'}
      </button>
    </div>
  )
}

// ── Expanded inline row ─────────────────────────────────────────────────────
function ExpandedRow({ lead, currentEmployee, onUpdate, colCount }) {
  const [tab, setTab] = useState('comments')
  const commentCount = (lead.app_comments?.length || 0) + (lead.sheet_comments ? 1 : 0)

  return (
    <tr className="bg-slate-50 border-b border-slate-200">
      <td colSpan={colCount} className="px-4 py-3">
        <div className="max-w-4xl">
          {/* Info strip */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-600 mb-3 pb-2 border-b border-gray-200">
            {lead.referrer && <span><span className="font-semibold">Referrer:</span> {lead.referrer}</span>}
            {lead.service_type && <span><span className="font-semibold">Υπηρεσία:</span> {lead.service_type}</span>}
            {lead.application_number && <span><span className="font-semibold">Αρ. Αίτησης:</span> {lead.application_number}</span>}
            {lead.vulnerable_debtor && <span className="text-orange-600 font-semibold">⚠ Ευάλωτος Οφειλέτης</span>}
            {lead.offer_sent && (
              <span className="text-green-700 font-semibold">
                ✓ Προσφορά {lead.offer_sent_date ? `(${lead.offer_sent_date})` : ''} — {lead.offer_amount || '—'} € / suc {lead.success_fee || '—'} €
              </span>
            )}
            {lead.linked_case_id && (
              <a href={`/cases/${lead.linked_case_id}`} className="text-blue-600 hover:underline font-semibold flex items-center gap-1">
                <LinkIcon className="w-3.5 h-3.5" /> Υπόθεση #{lead.linked_case_id}
              </a>
            )}
            {lead.next_call_sheet && <span><span className="font-semibold">Next Call (Sheet):</span> {lead.next_call_sheet}</span>}
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mb-3">
            {[
              { id: 'comments', label: `💬 Σχόλια${commentCount > 0 ? ` (${commentCount})` : ''}` },
              { id: 'viber', label: '📱 Viber' },
              { id: 'email', label: '✉️ Email' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors
                  ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            {tab === 'comments' && <CommentPanel lead={lead} currentEmployee={currentEmployee} onUpdate={onUpdate} />}
            {tab === 'viber' && <ViberPanel lead={lead} onUpdate={onUpdate} />}
            {tab === 'email' && <EmailPanel lead={lead} onUpdate={onUpdate} />}
          </div>
        </div>
      </td>
    </tr>
  )
}

// ── Single lead row ─────────────────────────────────────────────────────────
function LeadRow({ lead, currentEmployee, expanded, onToggle, onLeadUpdate }) {
  const update = async (fields) => {
    try {
      const res = await api.patchLead(lead.id, fields)
      onLeadUpdate(res.data)
    } catch { toast.error('Σφάλμα αποθήκευσης') }
  }

  const lastComment = lead.app_comments?.length > 0
    ? lead.app_comments[lead.app_comments.length - 1]
    : null
  const nextCall = lead.app_next_call
  const parsed = nextCall ? (() => { try { return parseISO(nextCall) } catch { return null } })() : null
  const nextCallOverdue = parsed ? isPast(parsed) : false
  const commentCount = (lead.app_comments?.length || 0) + (lead.sheet_comments ? 1 : 0)

  return (
    <>
      <tr
        className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors cursor-pointer
          ${expanded ? 'bg-blue-50/60' : ''}
          ${nextCallOverdue ? 'bg-amber-50/30' : ''}`}
        onClick={onToggle}
      >
        {/* Expand */}
        <td className="td w-6 text-center px-1">
          {expanded
            ? <ChevronUpIcon className="w-3.5 h-3.5 text-blue-500 mx-auto" />
            : <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400 mx-auto" />}
        </td>

        {/* Status */}
        <td className="td w-[90px]" onClick={e => e.stopPropagation()}>
          <StatusBadge value={lead.status} onChange={v => update({ status: v })} />
        </td>

        {/* Assigned */}
        <td className="td w-[85px]" onClick={e => e.stopPropagation()}>
          <AssignedSelect value={lead.assigned_to} onChange={v => update({ assigned_to: v })} />
        </td>

        {/* Name — left aligned */}
        <td className="td text-left">
          <div className="font-semibold text-blue-900 text-sm leading-tight">{lead.name || '—'}</div>
          {lead.date && <div className="text-[10px] text-gray-400 mt-0.5">{lead.date}</div>}
        </td>

        {/* Phone + Email — narrow */}
        <td className="td w-[105px]" onClick={e => e.stopPropagation()}>
          {lead.phone
            ? <a href={`tel:${lead.phone}`}
                className="text-blue-600 hover:underline font-mono text-[11px] flex items-center gap-0.5 leading-tight">
                <PhoneIcon className="w-3 h-3 shrink-0" />
                <span className="truncate">{lead.phone}</span>
              </a>
            : <span className="text-gray-300 text-xs">—</span>}
          {lead.email && (
            <div className="text-[10px] text-gray-400 truncate max-w-[100px] mt-0.5">{lead.email}</div>
          )}
        </td>

        {/* Total Debt */}
        <td className="td w-[110px] text-xs text-gray-700">
          <div className="truncate">{lead.total_debt || '—'}</div>
        </td>

        {/* Reminder */}
        <td className="td w-[80px]" onClick={e => e.stopPropagation()}>
          <NextCallPill
            value={nextCall}
            sheetValue={lead.next_call_sheet}
            onChange={v => update({ app_next_call: v })}
          />
        </td>

        {/* Last comment */}
        <td className="td text-left">
          {lastComment
            ? <div className="text-xs text-gray-500 truncate max-w-[260px]">
                <span className="font-semibold text-gray-700">{lastComment.author}:</span> {lastComment.text}
              </div>
            : lead.sheet_comments
            ? <div className="text-xs text-gray-400 truncate max-w-[260px] italic">{lead.sheet_comments}</div>
            : <span className="text-gray-300 text-xs">—</span>}
        </td>

        {/* Actions */}
        <td className="td w-[60px]" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-0.5 justify-center">
            {lead.phone && (
              <a href={`tel:${lead.phone}`} title="Κλήση"
                className="p-1 rounded hover:bg-blue-100 text-blue-700">
                <PhoneIcon className="w-3.5 h-3.5" />
              </a>
            )}
            <button title={`Σχόλια/Viber/Email${commentCount > 0 ? ` (${commentCount})` : ''}`}
              onClick={onToggle}
              className="p-1 rounded hover:bg-blue-100 text-blue-700 relative">
              <ChatBubbleLeftEllipsisIcon className="w-3.5 h-3.5" />
              {commentCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-600 text-white text-[8px] rounded-full flex items-center justify-center font-bold">
                  {commentCount > 9 ? '9+' : commentCount}
                </span>
              )}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <ExpandedRow lead={lead} currentEmployee={currentEmployee} onUpdate={onLeadUpdate} colCount={9} />
      )}
    </>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function Leads({ currentEmployee }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [filterYears, setFilterYears] = useState([String(THIS_YEAR)])
  const [filterMonths, setFilterMonths] = useState([])
  const [filterStatus, setFilterStatus] = useState([])
  const [filterEmployees, setFilterEmployees] = useState([])
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (filterStatus.length) params.status = filterStatus
      if (filterEmployees.length) params.assigned_to = filterEmployees
      if (filterYears.length) params.years = filterYears
      const res = await api.listLeads(params)
      setLeads(res.data)
      setPage(1)
    } catch { toast.error('Σφάλμα φόρτωσης leads') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [search, filterStatus, filterEmployees, filterYears])

  const handleSync = async (full = false) => {
    setSyncing(true)
    try {
      const res = await api.syncLeads(full)
      const d = res.data
      toast.success(`Sync OK (${d.mode}) — ${d.inserted} νέα${d.updated ? `, ${d.updated} ενημ.` : ''}`)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Σφάλμα sync')
    } finally { setSyncing(false) }
  }

  const updateLead = (updated) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
  }

  // Client-side filters
  function parseMonth(s) {
    const m1 = (s || '').match(/^\d{1,2}[\/\-](\d{1,2})[\/\-]20\d{2}/)
    if (m1) return String(parseInt(m1[1]))
    const m2 = (s || '').match(/^20\d{2}-(\d{2})-/)
    if (m2) return String(parseInt(m2[1]))
    return null
  }

  let displayed = leads
  if (filterMonths.length > 0)
    displayed = displayed.filter(l => filterMonths.includes(parseMonth(l.date)))
  // Client-side status filter as well (for immediate feedback even if backend missed it)
  if (filterStatus.length > 0)
    displayed = displayed.filter(l => filterStatus.includes((l.status || '').toLowerCase()))

  // Pagination
  const totalPages = Math.ceil(displayed.length / PAGE_SIZE)
  const paginated = displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Status counts from full (unfiltered) list
  const statusCounts = leads.reduce((acc, l) => {
    const k = (l.status || '').toLowerCase()
    if (k) acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})

  const hasFilters = filterStatus.length || filterEmployees.length || filterMonths.length || search

  const yearOptions = YEARS.map(y => ({ value: String(y), label: String(y) }))
  const monthOptions = MONTHS_EL.map((m, i) => ({ value: String(i + 1), label: m }))
  const statusOptions = STATUS_OPTIONS.map(s => ({ value: s, label: statusCfg(s).label }))
  const employeeOptions = EMPLOYEES.map(e => ({ value: e, label: e }))

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black text-blue-800">Leads</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {displayed.length} εγγραφές{displayed.length !== leads.length ? ` (από ${leads.length})` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleSync(false)} disabled={syncing}
            className="btn-secondary flex items-center gap-2 text-sm"
            title="Εισάγει μόνο νέες γραμμές (δεν αγγίζει υπάρχουσες)">
            <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '…' : 'Sync'}
          </button>
          <button onClick={() => { if (window.confirm('Full sync: θα ανανεωθούν ΟΛΑ τα sheet πεδία σε υπάρχουσες εγγραφές. Συνέχεια;')) handleSync(true) }}
            disabled={syncing}
            className="btn-secondary text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
            title="Ανανεώνει sheet πεδία σε υπάρχουσες εγγραφές">
            Full Sync
          </button>
        </div>
      </div>

      {/* Status quick-filter pills */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {STATUS_OPTIONS.map(key => {
          const cfg = statusCfg(key)
          const active = filterStatus.includes(key)
          return (
            <button key={key}
              onClick={() => setFilterStatus(active ? filterStatus.filter(s => s !== key) : [...filterStatus, key])}
              className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${cfg.cls}
                ${active ? 'ring-2 ring-offset-1 ring-blue-500' : 'hover:opacity-80'}`}>
              {cfg.label} ({statusCounts[key] || 0})
            </button>
          )
        })}
        {hasFilters && (
          <button onClick={() => { setFilterStatus([]); setFilterEmployees([]); setFilterMonths([]); setSearch('') }}
            className="text-xs text-gray-400 hover:text-red-500 px-2 ml-1">
            ✕ Καθαρισμός φίλτρων
          </button>
        )}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[340px]">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9 text-sm w-full" placeholder="Αναζήτηση…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Years */}
        <MultiSelect
          options={yearOptions}
          selected={filterYears}
          onChange={setFilterYears}
          placeholder="Έτος"
          cls="w-[130px]"
        />

        {/* Months */}
        <MultiSelect
          options={monthOptions}
          selected={filterMonths}
          onChange={v => { setFilterMonths(v); setPage(1) }}
          placeholder="Μήνας"
          cls="w-[130px]"
        />

        {/* Agents */}
        <MultiSelect
          options={employeeOptions}
          selected={filterEmployees}
          onChange={setFilterEmployees}
          placeholder="Agent"
          cls="w-[140px]"
        />
      </div>

      {/* Table */}
      <div className="card p-0 overflow-x-auto">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Φόρτωση…</div>
        ) : displayed.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <div className="text-4xl mb-3">📋</div>
            <div className="font-semibold mb-2">Δεν βρέθηκαν leads</div>
            <button onClick={handleSync} className="btn-primary mt-2 flex items-center gap-2 mx-auto">
              <ArrowPathIcon className="w-4 h-4" /> Sync από Google Sheet
            </button>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="th w-6 px-1"></th>
                  <th className="th text-left w-[90px]">Status</th>
                  <th className="th text-left w-[85px]">Agent</th>
                  <th className="th text-left">Επωνυμία</th>
                  <th className="th text-left w-[105px]">Τηλ / Email</th>
                  <th className="th text-left w-[110px]">Σύν. Οφειλών</th>
                  <th className="th text-left w-[80px]">Reminder</th>
                  <th className="th text-left">Τελευταίο Σχόλιο</th>
                  <th className="th text-center w-[60px]">—</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(lead => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    currentEmployee={currentEmployee}
                    expanded={expandedId === lead.id}
                    onToggle={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                    onLeadUpdate={updateLead}
                  />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                <span className="text-xs text-gray-500">
                  Σελίδα {page} / {totalPages} — {displayed.length} αποτελέσματα
                </span>
                <div className="flex gap-1">
                  <button disabled={page === 1} onClick={() => setPage(1)}
                    className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">«</button>
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">‹</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                    const p = start + i
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        className={`px-2.5 py-1 text-xs rounded border ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 hover:bg-gray-100'}`}>
                        {p}
                      </button>
                    )
                  })}
                  <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                    className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">›</button>
                  <button disabled={page === totalPages} onClick={() => setPage(totalPages)}
                    className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">»</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
