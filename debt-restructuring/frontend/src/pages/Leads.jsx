import { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { format, parseISO, differenceInDays, isPast } from 'date-fns'
import { el } from 'date-fns/locale'
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  PhoneIcon,
  ChatBubbleLeftEllipsisIcon,
  EnvelopeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  TrashIcon,
  BellIcon,
  CheckCircleIcon,
  LinkIcon,
} from '@heroicons/react/24/outline'
import * as api from '../api'

const EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA', 'HARIS']

const STATUS_OPTIONS = ['call', 'hot', 'active', 'deal', 'cancelled', '']
const STATUS_CFG = {
  call:      { cls: 'bg-blue-100 text-blue-800',    label: 'Call' },
  hot:       { cls: 'bg-red-100 text-red-700',      label: '🔥 Hot' },
  active:    { cls: 'bg-yellow-100 text-yellow-800', label: 'Active' },
  deal:      { cls: 'bg-green-100 text-green-800',  label: '✅ Deal' },
  cancelled: { cls: 'bg-gray-100 text-gray-500',    label: 'Cancelled' },
  '':        { cls: 'bg-gray-50 text-gray-400',     label: '—' },
}

function StatusBadge({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const cfg = STATUS_CFG[value] || STATUS_CFG['']

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
        <div className="absolute z-50 top-7 left-0 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[120px] py-1">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 ${STATUS_CFG[s].cls} ${s === value ? 'ring-1 ring-inset ring-blue-400' : ''}`}
            >
              {STATUS_CFG[s].label || '— Καθαρισμός'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AssignedSelect({ value, onChange }) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      className="text-xs border-0 bg-transparent font-bold text-blue-800 cursor-pointer focus:outline-none hover:bg-blue-50 rounded px-1 py-0.5"
      onClick={e => e.stopPropagation()}
    >
      <option value="">—</option>
      {EMPLOYEES.map(e => <option key={e} value={e}>{e}</option>)}
    </select>
  )
}

function NextCallPill({ value, onChange }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ? value.slice(0, 10) : '')

  const parsed = value ? (() => { try { return parseISO(value) } catch { return null } })() : null
  const overdue = parsed ? isPast(parsed) && differenceInDays(new Date(), parsed) > 0 : false
  const today = parsed ? differenceInDays(new Date(), parsed) === 0 : false

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <input
          type="date"
          className="text-xs border border-blue-300 rounded px-1 py-0.5 focus:outline-none"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          autoFocus
        />
        <button onClick={() => { onChange(draft || ''); setEditing(false) }}
          className="text-xs text-green-700 font-bold hover:underline">OK</button>
        <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:underline">✕</button>
      </div>
    )
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex items-center gap-1
        ${value
          ? overdue ? 'bg-red-100 text-red-700' : today ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-700'
          : 'bg-gray-50 text-gray-400 border border-dashed border-gray-300'}`}
    >
      <BellIcon className="w-3 h-3" />
      {value ? format(parsed, 'dd/MM', { locale: el }) : 'Reminder'}
    </button>
  )
}

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
          placeholder="Νέο σχόλιο…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submit() }}
        />
        <button
          onClick={submit}
          disabled={saving || !text.trim()}
          className="btn-primary text-xs px-3 self-end"
        >
          {saving ? '…' : 'Αποστολή'}
        </button>
      </div>
    </div>
  )
}

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
        rows={3}
        placeholder="Μήνυμα Viber…"
        value={msg}
        onChange={e => setMsg(e.target.value)}
      />
      <button
        onClick={send}
        disabled={sending || !msg.trim() || !lead.phone}
        className="btn-primary text-xs px-4"
      >
        {sending ? '…' : '📱 Αποστολή Viber'}
      </button>
      {!lead.phone && <p className="text-xs text-red-500">Δεν υπάρχει τηλέφωνο</p>}
    </div>
  )
}

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
      <input className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none" placeholder="Προς (email)" value={to} onChange={e => setTo(e.target.value)} />
      <input className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none" placeholder="Θέμα" value={subject} onChange={e => setSubject(e.target.value)} />
      <textarea className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none" rows={4} placeholder="Κείμενο email…" value={body} onChange={e => setBody(e.target.value)} />
      <button onClick={send} disabled={sending || !to || !subject || !body} className="btn-primary text-xs px-4">
        {sending ? '…' : '✉️ Αποστολή Email'}
      </button>
    </div>
  )
}

// Inline expanded row
function ExpandedRow({ lead, currentEmployee, onUpdate, colCount }) {
  const [tab, setTab] = useState('comments')

  return (
    <tr className="bg-slate-50 border-b border-slate-200">
      <td colSpan={colCount} className="px-4 py-3">
        <div className="max-w-4xl">
          {/* Extra info strip */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-600 mb-3 pb-2 border-b border-gray-200">
            {lead.referrer && <span><span className="font-semibold">Referrer:</span> {lead.referrer}</span>}
            {lead.service_type && <span><span className="font-semibold">Υπηρεσία:</span> {lead.service_type}</span>}
            {lead.application_number && <span><span className="font-semibold">Αρ. Αίτησης:</span> {lead.application_number}</span>}
            {lead.vulnerable_debtor && <span className="text-orange-600 font-semibold">⚠ Ευάλωτος Οφειλέτης</span>}
            {lead.offer_sent && (
              <span className="text-green-700 font-semibold">
                ✓ Προσφορά εστάλη {lead.offer_sent_date ? `(${lead.offer_sent_date})` : ''} — {lead.offer_amount || '—'} € / suc {lead.success_fee || '—'} €
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
              { id: 'comments', label: `💬 Σχόλια (${(lead.app_comments?.length || 0) + (lead.sheet_comments ? 1 : 0)})` },
              { id: 'viber', label: '📱 Viber' },
              { id: 'email', label: '✉️ Email' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
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

  return (
    <>
      <tr
        className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors cursor-pointer text-sm
          ${expanded ? 'bg-blue-50/60' : ''}
          ${nextCallOverdue ? 'bg-amber-50/30' : ''}`}
        onClick={onToggle}
      >
        {/* Expand toggle */}
        <td className="td w-8 text-center">
          {expanded
            ? <ChevronUpIcon className="w-4 h-4 text-blue-500 mx-auto" />
            : <ChevronDownIcon className="w-4 h-4 text-gray-400 mx-auto" />}
        </td>

        {/* Status */}
        <td className="td" onClick={e => e.stopPropagation()}>
          <StatusBadge value={lead.status} onChange={v => update({ status: v })} />
        </td>

        {/* Assigned To */}
        <td className="td" onClick={e => e.stopPropagation()}>
          <AssignedSelect value={lead.assigned_to} onChange={v => update({ assigned_to: v })} />
        </td>

        {/* Name */}
        <td className="td font-semibold text-blue-900 max-w-[180px]">
          <div className="truncate">{lead.name || '—'}</div>
          {lead.date && <div className="text-[10px] text-gray-400">{lead.date}</div>}
        </td>

        {/* Phone */}
        <td className="td" onClick={e => e.stopPropagation()}>
          {lead.phone
            ? <a href={`tel:${lead.phone}`} className="text-blue-600 hover:text-blue-800 hover:underline font-mono text-xs flex items-center gap-1">
                <PhoneIcon className="w-3.5 h-3.5 shrink-0" />{lead.phone}
              </a>
            : <span className="text-gray-300">—</span>}
          {lead.email && (
            <div className="text-[10px] text-gray-400 truncate max-w-[120px]">{lead.email}</div>
          )}
        </td>

        {/* Total Debt */}
        <td className="td text-xs text-gray-700 max-w-[120px]">
          <div className="truncate">{lead.total_debt || '—'}</div>
        </td>

        {/* Next Call */}
        <td className="td" onClick={e => e.stopPropagation()}>
          <NextCallPill
            value={nextCall}
            onChange={v => update({ app_next_call: v })}
          />
        </td>

        {/* Last comment preview */}
        <td className="td max-w-[220px]">
          {lastComment
            ? <div className="text-xs text-gray-500 truncate">
                <span className="font-semibold text-gray-700">{lastComment.author}:</span> {lastComment.text}
              </div>
            : lead.sheet_comments
            ? <div className="text-xs text-gray-400 truncate italic">{lead.sheet_comments}</div>
            : <span className="text-gray-300 text-xs">—</span>}
        </td>

        {/* Quick actions */}
        <td className="td" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1 justify-center">
            {lead.phone && (
              <a href={`tel:${lead.phone}`} title="Κλήση"
                className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-700">
                <PhoneIcon className="w-4 h-4" />
              </a>
            )}
            <button title="Σχόλια / Viber / Email"
              onClick={onToggle}
              className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-700">
              <ChatBubbleLeftEllipsisIcon className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <ExpandedRow
          lead={lead}
          currentEmployee={currentEmployee}
          onUpdate={onLeadUpdate}
          colCount={9}
        />
      )}
    </>
  )
}

export default function Leads({ currentEmployee }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (filterStatus) params.status = filterStatus
      if (filterEmployee) params.assigned_to = filterEmployee
      const res = await api.listLeads(params)
      setLeads(res.data)
    } catch { toast.error('Σφάλμα φόρτωσης leads') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [search, filterStatus, filterEmployee])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await api.syncLeads()
      toast.success(`Sync OK — ${res.data.inserted} νέα, ${res.data.updated} ενημερώθηκαν`)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Σφάλμα sync')
    } finally { setSyncing(false) }
  }

  const updateLead = (updated) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
  }

  // Summary counts
  const counts = leads.reduce((acc, l) => {
    acc[l.status || ''] = (acc[l.status || ''] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black text-blue-800">Leads</h1>
          <p className="text-gray-500 text-sm mt-0.5">{leads.length} εγγραφές</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Συγχρονισμός…' : 'Sync Google Sheet'}
        </button>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(STATUS_CFG).filter(([k]) => k !== '').map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
            className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${cfg.cls} ${filterStatus === key ? 'ring-2 ring-offset-1 ring-blue-500' : 'hover:opacity-80'}`}
          >
            {cfg.label} {counts[key] ? `(${counts[key]})` : '(0)'}
          </button>
        ))}
        {(filterStatus || filterEmployee || search) && (
          <button onClick={() => { setFilterStatus(''); setFilterEmployee(''); setSearch('') }}
            className="text-xs text-gray-500 hover:text-red-600 px-2">✕ Καθαρισμός</button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 text-sm"
            placeholder="Αναζήτηση ονόματος, τηλεφώνου, email, σχολίου…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-auto text-sm" value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
          <option value="">Όλοι</option>
          {EMPLOYEES.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {/* Grid */}
      <div className="card p-0 overflow-x-auto">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Φόρτωση…</div>
        ) : leads.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <div className="text-4xl mb-3">📋</div>
            <div className="font-semibold mb-2">Δεν βρέθηκαν leads</div>
            <button onClick={handleSync} className="btn-primary mt-2 flex items-center gap-2 mx-auto">
              <ArrowPathIcon className="w-4 h-4" /> Sync από Google Sheet
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="th w-8"></th>
                <th className="th text-left">Status</th>
                <th className="th text-left">Assigned</th>
                <th className="th text-left">Επωνυμία</th>
                <th className="th text-left">Τηλ / Email</th>
                <th className="th text-left">Σύνολο Οφειλών</th>
                <th className="th text-left">Reminder</th>
                <th className="th text-left">Τελευταίο Σχόλιο</th>
                <th className="th text-center">Ενέργειες</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
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
        )}
      </div>

      {leads.length > 0 && (
        <p className="text-xs text-gray-400 mt-2 text-right">
          Κάντε κλικ σε μια γραμμή για να ανοίξετε σχόλια / Viber / Email inline
        </p>
      )}
    </div>
  )
}
