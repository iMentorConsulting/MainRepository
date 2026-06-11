import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { format, parseISO, differenceInDays, isPast } from 'date-fns'
import { el } from 'date-fns/locale'
import {
  MagnifyingGlassIcon,
  PhoneIcon,
  ChatBubbleLeftEllipsisIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
  BellIcon,
  LinkIcon,
  PencilIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline'
import * as api from '../api'

const EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA']
const CASE_EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA', 'HARIS']
const PAGE_SIZE = 50
const AGENT_SHORT = { HARIS: 'H', SOFIA: 'S', VALLIA: 'V', STELLA: 'S', system: '⚙', Sheet: '📋' }

const THIS_YEAR = new Date().getFullYear()
const YEARS = [THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2]
const MONTHS_EL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

const STATUS_OPTIONS = ['call', 'hot', 'active', 'deal', 'cancelled']
const STATUS_CFG = {
  call:      { cls: 'bg-blue-100 text-blue-800',    label: 'Call',      rowCls: 'bg-blue-50/40' },
  hot:       { cls: 'bg-red-100 text-red-700',      label: '🔥 Hot',   rowCls: 'bg-red-50/40' },
  active:    { cls: 'bg-yellow-100 text-yellow-800', label: 'Active',   rowCls: 'bg-yellow-50/30' },
  deal:      { cls: 'bg-green-100 text-green-800',  label: '✅ Deal',  rowCls: 'bg-green-50/40' },
  cancelled: { cls: 'bg-gray-100 text-gray-500',    label: 'Cancelled', rowCls: 'bg-gray-50/60' },
  '':        { cls: 'bg-gray-50 text-gray-400',     label: '—',         rowCls: '' },
}

const REMINDER_OPTIONS = [
  { value: 'overdue', label: '🔴 Ληξιπρόθεσμα' },
  { value: 'today',   label: '🟡 Σήμερα' },
  { value: 'week',    label: '📅 Εβδομάδα' },
  { value: 'none',    label: '⬜ Χωρίς reminder' },
]

function statusCfg(val) {
  return STATUS_CFG[(val || '').toLowerCase()] || STATUS_CFG['']
}

function formatPhone(p) {
  const clean = (p || '').replace(/[\s\-\+\(\)]/g, '')
  if (clean.startsWith('30') && clean.length === 12) return clean.slice(2)
  return clean
}

function parseAnyDate(s) {
  if (!s) return null
  const str = String(s).trim()

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (4-digit year — must match before 2-digit)
  const m1 = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/)
  if (m1) { const d = new Date(+m1[3], +m1[2] - 1, +m1[1]); if (!isNaN(d)) return d }

  // DD/MM/YY or DD-MM-YY (2-digit year → 20xx; Google Sheets often exports this format)
  const m1b = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})(?:\s|$)/)
  if (m1b) { const d = new Date(2000 + +m1b[3], +m1b[2] - 1, +m1b[1]); if (!isNaN(d)) return d }

  // YYYY-MM-DD or YYYY/MM/DD — parse as LOCAL midnight (not UTC)
  const m2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m2) { const d = new Date(+m2[1], +m2[2] - 1, +m2[3]); if (!isNaN(d)) return d }

  // DD-GreekMonth-YYYY (e.g., "31-Μαρ-2026", "1-Ιουν-2026")
  // Normalize to lowercase without accents for robust matching
  const _norm = str => str.toLowerCase()
    .replace(/[άα]/g, v => v === 'ά' ? 'α' : v).replace(/ά/g,'α')
    .replace(/έ/g,'ε').replace(/ή/g,'η').replace(/[ίϊΐ]/g,'ι')
    .replace(/ό/g,'ο').replace(/[ύϋΰ]/g,'υ').replace(/ώ/g,'ω')
  const greekMonthsNorm = {
    'ιαν': 0, 'φεβ': 1, 'μαρ': 2, 'απρ': 3, 'μαι': 4,
    'ιουν': 5, 'ιουλ': 6, 'αυγ': 7, 'σεπ': 8, 'οκτ': 9, 'νοε': 10, 'δεκ': 11,
  }
  const m3 = str.match(/^(\d{1,2})[\/\-](\S{3,})[\/\-](\d{4})/)
  if (m3) {
    const month = greekMonthsNorm[_norm(m3[2])]
    if (month !== undefined) {
      const d = new Date(+m3[3], month, +m3[1])
      if (!isNaN(d)) return d
    }
  }

  return null
}

function applyTemplate(body, lead) {
  return (body || '').replace(/\{(\w+)\}/g, (_, key) => {
    const map = {
      name: lead.name, total_debt: lead.total_debt, offer_amount: lead.offer_amount,
      success_fee: lead.success_fee, assigned_to: lead.assigned_to,
      phone: formatPhone(lead.phone), email: lead.email,
    }
    return map[key] ?? `{${key}}`
  })
}

// ── Formatted text renderer (supports **bold** and [c=#hex]color[/c]) ──────
function parseFormatted(text) {
  if (!text) return null
  const re = /(\*\*[^*]+\*\*|\[c=#[0-9a-fA-F]{3,6}\][^\[]+\[\/c\])/g
  const parts = []
  let last = 0, m, key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{text.slice(last, m.index)}</span>)
    const raw = m[0]
    if (raw.startsWith('**')) {
      parts.push(<strong key={key++}>{raw.slice(2, -2)}</strong>)
    } else {
      const cm = raw.match(/\[c=(#[0-9a-fA-F]{3,6})\]([^\[]+)\[\/c\]/)
      if (cm) parts.push(<span key={key++} style={{ color: cm[1] }}>{cm[2]}</span>)
    }
    last = m.index + raw.length
  }
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>)
  return parts.length ? parts : null
}

const PRESET_COLORS = ['#ef4444', '#f97316', '#3b82f6', '#16a34a', '#9333ea']

function FormatToolbar({ textareaRef, value, onChange }) {
  const wrap = (pre, suf) => {
    const el = textareaRef.current
    if (!el) return
    const s = el.selectionStart, e = el.selectionEnd
    const sel = value.slice(s, e) || 'κείμενο'
    const newVal = value.slice(0, s) + pre + sel + suf + value.slice(e)
    onChange(newVal)
    setTimeout(() => {
      el.focus()
      el.selectionStart = s + pre.length
      el.selectionEnd = s + pre.length + sel.length
    }, 0)
  }
  return (
    <div className="flex items-center gap-1 mb-1">
      <button type="button" onMouseDown={e => { e.preventDefault(); wrap('**', '**') }}
        className="text-xs px-2 py-0.5 border border-gray-300 rounded font-bold hover:bg-gray-100 text-gray-700 leading-none">
        B
      </button>
      {PRESET_COLORS.map(c => (
        <button key={c} type="button" onMouseDown={e => { e.preventDefault(); wrap(`[c=${c}]`, '[/c]') }}
          style={{ backgroundColor: c }}
          className="w-4 h-4 rounded-full border border-white shadow-sm hover:scale-110 transition-transform shrink-0" />
      ))}
    </div>
  )
}

// ── Sortable column header ──────────────────────────────────────────────────
function SortTh({ col, label, sortCol, sortDir, onSort, className = '' }) {
  const active = sortCol === col
  return (
    <th
      className={`th text-left cursor-pointer select-none hover:bg-gray-100 ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${active ? 'text-blue-600' : 'text-gray-300'}`}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  )
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

// ── Status badge: shows raw text with group color ──────────────────────────
function StatusBadge({ value, rawValue, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const cfg = statusCfg(value)
  const displayLabel = rawValue && rawValue !== value?.toUpperCase() ? rawValue : cfg.label

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        title={rawValue ? `Raw: ${rawValue}` : undefined}
        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 max-w-[110px] truncate block ${cfg.cls}`}
      >
        {displayLabel || '—'}
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

  if (value && parsed) {
    return (
      <button
        onClick={e => { e.stopPropagation(); setEditing(true) }}
        className={`text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex items-center gap-1
          ${overdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}
      >
        <BellIcon className="w-3 h-3 shrink-0" />
        {format(parsed, 'dd/MM/yy')}
      </button>
    )
  }

  if (sheetValue) {
    const sheetParsed = parseAnyDate(sheetValue)
    if (!sheetParsed) {
      // Non-date sheet text (e.g. "ΤΕΛΟΣ") — show as plain grey badge, not a reminder pill
      return (
        <button
          onClick={e => { e.stopPropagation(); setEditing(true) }}
          title={`Sheet: ${sheetValue} — κλικ για να θέσετε reminder`}
          className="text-xs px-1.5 py-0.5 rounded text-gray-400 border border-gray-200 whitespace-nowrap"
        >
          {sheetValue.length > 8 ? sheetValue.slice(0, 8) + '…' : sheetValue}
        </button>
      )
    }
    return (
      <button
        onClick={e => { e.stopPropagation(); setEditing(true) }}
        title={`Sheet: ${sheetValue} — κλικ για να θέσετε reminder`}
        className="text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200"
      >
        <BellIcon className="w-3 h-3 shrink-0" />
        {format(sheetParsed, 'dd/MM/yy')}
      </button>
    )
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      className="text-xs text-gray-300 hover:text-gray-500 flex items-center gap-1"
    >
      <BellIcon className="w-3 h-3 shrink-0" />
    </button>
  )
}

// ── Inline debt editor ──────────────────────────────────────────────────────
function DebtCell({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  if (editing) {
    return (
      <input
        autoFocus
        className="text-xs border border-blue-300 rounded px-1 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onSave(draft); setEditing(false) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave(draft); setEditing(false) }
          if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
        }}
      />
    )
  }
  return (
    <div
      className="text-xs text-gray-700 truncate cursor-pointer hover:bg-blue-50 rounded px-0.5 min-h-[18px]"
      title="Κλικ για επεξεργασία"
      onClick={() => { setDraft(value || ''); setEditing(true) }}
    >
      {value || <span className="text-gray-300">—</span>}
    </div>
  )
}

// ── Comment panel ───────────────────────────────────────────────────────────
function CommentPanel({ lead, currentEmployee, onUpdate }) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [editingIdx, setEditingIdx] = useState(null)
  const [editText, setEditText] = useState('')
  const [editingSheet, setEditingSheet] = useState(false)
  const [editSheetText, setEditSheetText] = useState('')
  const newRef = useRef()
  const editRef = useRef()

  const saveSheetEdit = async () => {
    setSaving(true)
    try {
      const res = await api.patchLead(lead.id, { sheet_comments: editSheetText })
      onUpdate(res.data)
      setEditingSheet(false)
    } catch { toast.error('Σφάλμα') }
    finally { setSaving(false) }
  }

  const deleteSheetComment = async () => {
    try {
      const res = await api.patchLead(lead.id, { sheet_comments: '' })
      onUpdate(res.data)
    } catch { toast.error('Σφάλμα') }
  }

  const autoResize = (el) => {
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

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

  const saveEdit = async (appIdx) => {
    if (!editText.trim()) return
    setSaving(true)
    try {
      const res = await api.editLeadComment(lead.id, appIdx, editText.trim())
      onUpdate(res.data)
      setEditingIdx(null)
      setEditText('')
    } catch { toast.error('Σφάλμα') }
    finally { setSaving(false) }
  }

  const all = [
    ...(lead.sheet_comments ? [{ text: lead.sheet_comments, author: 'Sheet', at: null, _sheet: true }] : []),
    ...(lead.app_comments || []),
  ]

  return (
    <div className="space-y-1.5">
      {/* Comment feed */}
      <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
        {all.length === 0 && <p className="text-xs text-gray-400 italic py-1">Χωρίς σχόλια</p>}
        {all.map((c, i) => {
          const isSystem = c.author === 'system'
          const isSheet = c._sheet
          const short = AGENT_SHORT[c.author?.toUpperCase?.()] ?? AGENT_SHORT[c.author] ?? c.author?.[0] ?? '?'
          const firstLine = c.text?.split('\n')[0] || ''
          const hasMore = isSystem && c.text?.includes('\n')
          const expanded = expandedIdx === i
          const appIdx = isSheet ? -1 : lead.app_comments?.indexOf(c) ?? -1
          const isEditing = editingIdx === appIdx && appIdx >= 0

          return (
            <div key={i}
              className={`flex items-start gap-1.5 text-xs group rounded px-1.5 py-0.5 -mx-1 transition-colors
                ${isSystem ? 'hover:bg-gray-50' : isSheet ? 'hover:bg-gray-50 opacity-80' : 'hover:bg-blue-50/40'}`}>

              {/* Avatar */}
              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5
                ${isSystem ? 'bg-gray-200 text-gray-500' : isSheet ? 'bg-gray-300 text-gray-500' : 'bg-blue-600 text-white'}`}>
                {short}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {isSystem ? (
                  <span className="text-gray-500">
                    {firstLine}
                    {hasMore && (
                      <button onClick={() => setExpandedIdx(expanded ? null : i)}
                        className="ml-1 text-blue-400 hover:text-blue-600 text-[10px]">
                        {expanded ? '▲' : '▼'}
                      </button>
                    )}
                    {expanded && (
                      <span className="block text-gray-400 mt-0.5 whitespace-pre-wrap leading-tight">
                        {c.text.split('\n').slice(1).join('\n')}
                      </span>
                    )}
                  </span>
                ) : isEditing ? (
                  <div>
                    <FormatToolbar textareaRef={editRef} value={editText} onChange={setEditText} />
                    <textarea
                      ref={editRef}
                      className="w-full text-xs border border-blue-300 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                      rows={2}
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') { setEditingIdx(null); setEditText('') } }}
                    />
                    {parseFormatted(editText) && (
                      <div className="text-xs text-gray-700 bg-gray-50 rounded px-2 py-1 mt-0.5 whitespace-pre-wrap leading-relaxed border border-gray-100">
                        {parseFormatted(editText)}
                      </div>
                    )}
                    <div className="flex gap-2 mt-0.5">
                      <button onClick={() => saveEdit(appIdx)} disabled={saving || !editText.trim()}
                        className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded font-semibold disabled:opacity-50">
                        {saving ? '…' : 'OK'}
                      </button>
                      <button onClick={() => { setEditingIdx(null); setEditText('') }}
                        className="text-xs text-gray-400 hover:text-gray-600">Άκυρο</button>
                    </div>
                  </div>
                ) : isSheet && editingSheet ? (
                  <div>
                    <textarea
                      className="w-full text-xs border border-blue-300 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                      rows={3}
                      value={editSheetText}
                      onChange={e => setEditSheetText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') setEditingSheet(false) }}
                    />
                    <div className="flex gap-2 mt-0.5">
                      <button onClick={saveSheetEdit} disabled={saving}
                        className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded font-semibold disabled:opacity-50">
                        {saving ? '…' : 'OK'}
                      </button>
                      <button onClick={() => setEditingSheet(false)}
                        className="text-xs text-gray-400 hover:text-gray-600">Άκυρο</button>
                    </div>
                  </div>
                ) : (
                  <span className="text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {!isSheet && <span className="font-semibold text-gray-600 mr-1">{short}:</span>}
                    {isSheet ? c.text : (parseFormatted(c.text) || c.text)}
                  </span>
                )}
              </div>

              {/* Timestamp + actions */}
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                {c.at && !isEditing && (
                  <span className="text-gray-400 text-[10px] whitespace-nowrap">
                    {format(parseISO(c.at), 'dd/MM HH:mm')}
                  </span>
                )}
                {isSheet && !editingSheet && (
                  <>
                    <button onClick={() => { setEditingSheet(true); setEditSheetText(c.text) }}
                      title="Επεξεργασία" className="text-gray-400 hover:text-blue-500 transition-colors">
                      <PencilIcon className="w-3 h-3" />
                    </button>
                    <button onClick={deleteSheetComment}
                      title="Διαγραφή" className="text-gray-400 hover:text-red-500 transition-colors">
                      <TrashIcon className="w-3 h-3" />
                    </button>
                  </>
                )}
                {!isSheet && !isSystem && appIdx >= 0 && !isEditing && (
                  <>
                    <button onClick={() => { setEditingIdx(appIdx); setEditText(c.text) }}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-500 transition-opacity">
                      <PencilIcon className="w-3 h-3" />
                    </button>
                    <button onClick={() => del(appIdx)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">
                      <TrashIcon className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* New comment input */}
      <div className="flex flex-col gap-1 pt-1 border-t border-gray-100">
        <FormatToolbar textareaRef={newRef} value={text} onChange={setText} />
        <div className="flex gap-2">
          <textarea
            ref={newRef}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
            rows={4}
            placeholder="Νέο σχόλιο… (Ctrl+Enter)"
            value={text}
            onChange={e => { setText(e.target.value); autoResize(e.target) }}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submit() }}
          />
          <button onClick={submit} disabled={saving || !text.trim()} className="btn-primary text-xs px-3 self-end">
            {saving ? '…' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Viber panel with template picker ────────────────────────────────────────
function ViberPanel({ lead, onUpdate, templates }) {
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [activeTpl, setActiveTpl] = useState('')
  const msgRef = useRef()

  const viberTpls = (templates || []).filter(t => t.type === 'viber' || t.type === 'both')

  const applyTpl = (tpl) => {
    setMsg(applyTemplate(tpl.body, lead))
    setActiveTpl(tpl.name)
  }

  const send = async () => {
    if (!msg.trim()) return
    setSending(true)
    try {
      await api.sendLeadViber(lead.id, msg.trim())
      toast.success('Viber εστάλη!')
      const res = await api.getLead(lead.id)
      onUpdate(res.data)
      setMsg('')
      setActiveTpl('')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Σφάλμα Viber')
    } finally { setSending(false) }
  }

  return (
    <div className="space-y-2">
      {viberTpls.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          <span className="text-xs text-gray-400 self-center mr-1">Template:</span>
          {viberTpls.map(t => (
            <button key={t.name} onClick={() => applyTpl(t)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors
                ${activeTpl === t.name ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      <FormatToolbar textareaRef={msgRef} value={msg} onChange={setMsg} />
      <textarea
        ref={msgRef}
        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        rows={3} placeholder="Μήνυμα Viber…" value={msg}
        onChange={e => { setMsg(e.target.value); setActiveTpl('') }}
      />
      <button onClick={send} disabled={sending || !msg.trim() || !lead.phone} className="btn-primary text-xs px-4">
        {sending ? '…' : '📱 Αποστολή Viber'}
      </button>
      {!lead.phone && <p className="text-xs text-red-500">Δεν υπάρχει τηλέφωνο</p>}
    </div>
  )
}

// ── Email panel with template picker ────────────────────────────────────────
function EmailPanel({ lead, onUpdate, templates }) {
  const [to, setTo] = useState(lead.email || '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [activeTpl, setActiveTpl] = useState('')
  const bodyRef = useRef()

  const emailTpls = (templates || []).filter(t => t.type === 'email' || t.type === 'both')

  const applyTpl = (tpl) => {
    if (tpl.subject) setSubject(applyTemplate(tpl.subject, lead))
    if (tpl.body) setBody(applyTemplate(tpl.body, lead))
    setActiveTpl(tpl.name)
  }

  const send = async () => {
    if (!to || !subject || !body) return
    setSending(true)
    try {
      await api.sendLeadEmail(lead.id, to, subject, body)
      toast.success('Email εστάλη!')
      const res = await api.getLead(lead.id)
      onUpdate(res.data)
      setSubject(''); setBody(''); setActiveTpl('')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Σφάλμα email')
    } finally { setSending(false) }
  }

  return (
    <div className="space-y-2">
      {emailTpls.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          <span className="text-xs text-gray-400 self-center mr-1">Template:</span>
          {emailTpls.map(t => (
            <button key={t.name} onClick={() => applyTpl(t)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors
                ${activeTpl === t.name ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      <input className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none" placeholder="Προς" value={to} onChange={e => setTo(e.target.value)} />
      <input className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none" placeholder="Θέμα" value={subject} onChange={e => { setSubject(e.target.value); setActiveTpl('') }} />
      <FormatToolbar textareaRef={bodyRef} value={body} onChange={setBody} />
      <textarea ref={bodyRef} className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none" rows={4} placeholder="Κείμενο…" value={body} onChange={e => { setBody(e.target.value); setActiveTpl('') }} />
      <button onClick={send} disabled={sending || !to || !subject || !body} className="btn-primary text-xs px-4">
        {sending ? '…' : '✉️ Αποστολή Email'}
      </button>
    </div>
  )
}

// ── Edit panel (inline edit name/phone/email with confirmation) ─────────────
function EditPanel({ lead, onUpdate }) {
  const [name, setName] = useState(lead.name || '')
  const [phone, setPhone] = useState(lead.phone || '')
  const [phone2, setPhone2] = useState(lead.phone2 || '')
  const [email, setEmail] = useState(lead.email || '')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const hasChanges = name !== (lead.name || '') || phone !== (lead.phone || '') || phone2 !== (lead.phone2 || '') || email !== (lead.email || '')

  const save = async () => {
    setSaving(true)
    try {
      const res = await api.patchLead(lead.id, { name, phone, phone2, email })
      onUpdate(res.data)
      toast.success('Αποθηκεύτηκε')
      setConfirming(false)
    } catch { toast.error('Σφάλμα αποθήκευσης') }
    finally { setSaving(false) }
  }

  const reset = () => {
    setName(lead.name || ''); setPhone(lead.phone || ''); setPhone2(lead.phone2 || ''); setEmail(lead.email || ''); setConfirming(false)
  }

  return (
    <div className="space-y-3 max-w-md">
      <div className="space-y-2">
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Επωνυμία</label>
          <input
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={name} onChange={e => { setName(e.target.value); setConfirming(false) }}
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-0.5 block">Τηλέφωνο 1</label>
            <input
              className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={phone} onChange={e => { setPhone(e.target.value); setConfirming(false) }}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-0.5 block">Τηλέφωνο 2</label>
            <input
              className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Προαιρετικό"
              value={phone2} onChange={e => { setPhone2(e.target.value); setConfirming(false) }}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Email</label>
          <input
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={email} onChange={e => { setEmail(e.target.value); setConfirming(false) }}
          />
        </div>
      </div>
      {hasChanges && !confirming && (
        <div className="flex gap-2">
          <button onClick={() => setConfirming(true)} className="btn-primary text-xs px-4">Αποθήκευση αλλαγών</button>
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600">Αναίρεση</button>
        </div>
      )}
      {confirming && (
        <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-xs text-amber-700 font-semibold">⚠ Επιβεβαίωση αλλαγής στοιχείων πελάτη;</span>
          <button onClick={save} disabled={saving} className="text-xs px-3 py-1 bg-amber-500 text-white rounded font-semibold shrink-0">
            {saving ? '…' : 'Ναι'}
          </button>
          <button onClick={() => setConfirming(false)} className="text-xs text-gray-500 shrink-0">Άκυρο</button>
        </div>
      )}
      {!hasChanges && <p className="text-xs text-gray-400">Τροποποιήστε τα στοιχεία και πατήστε αποθήκευση.</p>}
    </div>
  )
}

// ── TaxisNet panel ───────────────────────────────────────────────────────────
function TaxisNetPanel({ lead, onUpdate, links }) {
  const [username, setUsername] = useState(lead.taxisnet_username || '')
  const [password, setPassword] = useState(lead.taxisnet_password || '')
  const [spouseName, setSpouseName] = useState(lead.spouse_name || '')
  const [username2, setUsername2] = useState(lead.taxisnet_username_2 || '')
  const [password2, setPassword2] = useState(lead.taxisnet_password_2 || '')
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showPass2, setShowPass2] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await api.patchLead(lead.id, {
        taxisnet_username: username, taxisnet_password: password,
        spouse_name: spouseName, taxisnet_username_2: username2, taxisnet_password_2: password2,
      })
      onUpdate(res.data)
      toast.success('TaxisNet αποθηκεύτηκε')
    } catch { toast.error('Σφάλμα') }
    finally { setSaving(false) }
  }

  const openLink = async (link) => {
    if (link.auto_fill && (username || password)) {
      const text = [username, password].filter(Boolean).join('\n')
      const preview = [username, password].filter(Boolean).join('  ')
      try {
        await navigator.clipboard.writeText(text)
        toast.success(`📋 ${preview} — αντιγράφηκε στο πρόχειρο`, { duration: 4000 })
      } catch {
        toast(`${preview}`, { duration: 5000 })
      }
    }
    window.open(link.url, '_blank', 'noopener,noreferrer')
  }

  const hasCredentials = username || password

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 max-w-sm">
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Username / ΑΦΜ</label>
          <input
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={username} onChange={e => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Password</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 pr-7 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={password} onChange={e => setPassword(e.target.value)}
            />
            <button onClick={() => setShowPass(s => !s)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
              {showPass ? '🙈' : '👁'}
            </button>
          </div>
        </div>
      </div>
      {/* Spouse / 2nd person */}
      <div className="border-t border-gray-100 pt-3 mt-1">
        <div className="text-xs font-semibold text-gray-500 mb-2">Σύζυγος / 2ος Οφειλέτης</div>
        <div className="grid grid-cols-3 gap-2 max-w-lg">
          <div>
            <label className="text-xs text-gray-400 mb-0.5 block">Όνομα</label>
            <input className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Προαιρετικό" value={spouseName} onChange={e => setSpouseName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-0.5 block">Username / ΑΦΜ</label>
            <input className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={username2} onChange={e => setUsername2(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-0.5 block">Password</label>
            <div className="relative">
              <input type={showPass2 ? 'text' : 'password'}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 pr-7 focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={password2} onChange={e => setPassword2(e.target.value)} />
              <button onClick={() => setShowPass2(s => !s)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                {showPass2 ? '🙈' : '👁'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary text-xs px-4">
        {saving ? '…' : '💾 Αποθήκευση'}
      </button>
      {links && links.length > 0 && (
        <div className="mt-1 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-1.5 font-semibold">Σύνδεσμοι TaxisNet</div>
          <div className="flex flex-wrap gap-2">
            {links.map((l, i) => (
              <button key={i} onClick={() => openLink(l)}
                className={`text-xs px-3 py-1.5 rounded border flex items-center gap-1.5 transition-colors
                  ${hasCredentials && l.auto_fill ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`}>
                <LinkIcon className="w-3 h-3" />
                {l.label}
                {hasCredentials && l.auto_fill && <span className="text-[9px] text-blue-400 font-semibold">+ΑΦΜ</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {(!links || links.length === 0) && (
        <p className="text-xs text-gray-400">
          Διαχειριστείτε τους συνδέσμους από τη σελίδα <a href="/lead-lists" className="text-blue-500 hover:underline">Λίστες</a>.
        </p>
      )}
    </div>
  )
}

// ── Inline editable application number ─────────────────────────────────────
function AppNumberEdit({ lead, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(lead.application_number || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await api.patchLead(lead.id, { application_number: draft })
      onUpdate(res.data)
      setEditing(false)
    } catch { toast.error('Σφάλμα') }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <span className="font-semibold text-gray-600">Αρ. Αίτησης:</span>
        <input
          autoFocus
          className="text-xs border border-blue-300 rounded px-1.5 py-0.5 w-32 focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        />
        <button onClick={save} disabled={saving} className="text-xs text-green-700 font-bold">{saving ? '…' : 'OK'}</button>
        <button onClick={() => setEditing(false)} className="text-xs text-gray-400">✕</button>
      </span>
    )
  }

  return (
    <button
      onClick={() => { setDraft(lead.application_number || ''); setEditing(true) }}
      className="flex items-center gap-1 text-gray-600 hover:bg-gray-100 px-2 py-0.5 rounded transition-colors group/an"
    >
      <span className="font-semibold">Αρ. Αίτησης:</span>
      <span className={lead.application_number ? 'text-gray-800' : 'text-gray-300 italic text-[11px]'}>
        {lead.application_number || 'προσθήκη…'}
      </span>
      <PencilIcon className="w-3 h-3 text-gray-300 group-hover/an:text-gray-500 ml-0.5" />
    </button>
  )
}

// ── Expanded inline row ─────────────────────────────────────────────────────
function ExpandedRow({ lead, currentEmployee, onUpdate, colCount, templates, taxisnetLinks, allLeads }) {
  const [tab, setTab] = useState('comments')
  const [creatingCase, setCreatingCase] = useState(false)
  const navigate = useNavigate()
  const commentCount = (lead.app_comments?.length || 0) + (lead.sheet_comments ? 1 : 0)

  const handleCreateCase = async () => {
    setCreatingCase(true)
    try {
      const employee = CASE_EMPLOYEES.includes(lead.assigned_to) ? lead.assigned_to : currentEmployee
      const notesParts = []
      if (lead.total_debt) notesParts.push(`Σύνολο Οφειλών (από Lead): ${lead.total_debt}`)
      if (lead.sheet_comments) notesParts.push(`Σχόλια Lead: ${lead.sheet_comments}`)
      const res = await api.createCase({
        client_name: lead.name || '',
        client_phone: lead.phone || '',
        client_email: lead.email || '',
        employee,
        status: 'draft',
        contact_stage: 'Νέα Ανάλυση',
        notes: notesParts.join('\n'),
      })
      const newCase = res.data
      const patched = await api.patchLead(lead.id, { linked_case_id: newCase.id })
      onUpdate(patched.data)
      toast.success('Η υπόθεση δημιουργήθηκε ✓')
      navigate(`/cases/${newCase.id}/edit`)
    } catch {
      toast.error('Σφάλμα δημιουργίας υπόθεσης')
    } finally {
      setCreatingCase(false)
    }
  }

  const myPhone = formatPhone(lead.phone)
  const myEmail = (lead.email || '').toLowerCase()
  const relatedLeads = (allLeads || []).filter(l =>
    l.id !== lead.id && (
      (myPhone && myPhone.length > 5 && formatPhone(l.phone) === myPhone) ||
      (myEmail && myEmail.includes('@') && (l.email || '').toLowerCase() === myEmail)
    )
  )

  return (
    <tr className="bg-slate-50 border-b border-slate-200">
      <td colSpan={colCount} className="px-4 py-3">
        <div className="max-w-4xl">
          {/* Row 1: Offer / platform / case link */}
          {(lead.platform_result || lead.vulnerable_debtor || lead.offer_sent || lead.linked_case_id) && (
            <div className="flex flex-wrap gap-2 text-xs text-gray-600 mb-1">
              {lead.platform_result && <span className="bg-purple-50 px-2 py-0.5 rounded"><span className="font-semibold">Αποτ. Πλατφόρμας:</span> {lead.platform_result}</span>}
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
            </div>
          )}
          {/* Info + Tabs on one line */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 mb-3 pb-2 border-b border-gray-200">
            {!lead.linked_case_id && (
              <button onClick={handleCreateCase} disabled={creatingCase}
                className="bg-emerald-50 border border-emerald-300 text-emerald-700 hover:bg-emerald-100 font-semibold px-2 py-0.5 rounded flex items-center gap-1 disabled:opacity-50">
                <BriefcaseIcon className="w-3.5 h-3.5" /> {creatingCase ? 'Δημιουργία…' : 'Δημιουργία Υπόθεσης'}
              </button>
            )}
            {lead.service_type && <span className="bg-blue-50 px-2 py-0.5 rounded"><span className="font-semibold">Υπηρεσία:</span> {lead.service_type}</span>}
            {lead.referrer && <span className="bg-gray-50 border border-gray-200 px-2 py-0.5 rounded"><span className="font-semibold">Referrer:</span> {lead.referrer}</span>}
            <AppNumberEdit lead={lead} onUpdate={onUpdate} />
            <div className="flex-1" />
            {[
              { id: 'comments', label: `💬 Σχόλια${commentCount > 0 ? ` (${commentCount})` : ''}` },
              { id: 'viber', label: '📱 Viber' },
              { id: 'email', label: '✉️ Email' },
              { id: 'taxisnet', label: '🔑 TaxisNet' },
              { id: 'edit', label: '✏️ Επεξεργασία' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors whitespace-nowrap
                  ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t.label}
              </button>
            ))}
          </div>
          {/* Related leads (same phone or email) */}
          {relatedLeads.length > 0 && (
            <div className="mb-3 pb-2 border-b border-orange-200">
              <div className="text-xs font-semibold text-orange-600 mb-1.5 flex items-center gap-1">
                ⚠ {relatedLeads.length} άλλ{relatedLeads.length === 1 ? 'η' : 'ες'} εγγραφ{relatedLeads.length === 1 ? 'ή' : 'ές'} με ίδιο τηλ/email
              </div>
              <div className="flex flex-col gap-1">
                {relatedLeads.map(r => {
                  const cfg = statusCfg(r.status)
                  return (
                    <div key={r.id} className="flex items-center gap-2 text-xs bg-orange-50 border border-orange-100 rounded-lg px-2 py-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.cls}`}>{r.status_raw || r.status || '—'}</span>
                      <span className="font-semibold text-gray-700">{r.name || '—'}</span>
                      {r.assigned_to && <span className="text-gray-400">({r.assigned_to})</span>}
                      {formatPhone(r.phone) === myPhone && <span className="text-orange-500">📞 ίδιο τηλ</span>}
                      {(r.email || '').toLowerCase() === myEmail && myEmail && <span className="text-orange-500">✉️ ίδιο email</span>}
                      <span className="text-gray-400 ml-auto">{r.date || ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            {tab === 'comments' && <CommentPanel lead={lead} currentEmployee={currentEmployee} onUpdate={onUpdate} />}
            {tab === 'viber' && <ViberPanel lead={lead} onUpdate={onUpdate} templates={templates} />}
            {tab === 'email' && <EmailPanel lead={lead} onUpdate={onUpdate} templates={templates} />}
            {tab === 'taxisnet' && <TaxisNetPanel lead={lead} onUpdate={onUpdate} links={taxisnetLinks} />}
            {tab === 'edit' && <EditPanel lead={lead} onUpdate={onUpdate} />}
          </div>
        </div>
      </td>
    </tr>
  )
}

// ── Single lead row ─────────────────────────────────────────────────────────
function LeadRow({ lead, currentEmployee, expanded, onToggle, onLeadUpdate, templates, taxisnetLinks, allLeads, selected, onSelect }) {
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
  const phone = formatPhone(lead.phone)
  const statusRowCls = (STATUS_CFG[(lead.status || '').toLowerCase()] || STATUS_CFG['']).rowCls

  const agentShort = (author) => AGENT_SHORT[author?.toUpperCase?.()] ?? AGENT_SHORT[author] ?? author?.[0] ?? '?'

  return (
    <>
      <tr
        className={`border-b border-gray-100 hover:brightness-95 transition-colors cursor-pointer
          ${nextCallOverdue ? 'bg-amber-50/80' : statusRowCls}
          ${expanded ? '!bg-blue-100/50' : ''}`}
        onClick={onToggle}
      >
        {/* Checkbox */}
        <td className="td w-8 px-2 text-center" onClick={e => e.stopPropagation()}>
          <input type="checkbox" className="rounded border-gray-300 text-blue-600 cursor-pointer"
            checked={selected} onChange={() => onSelect(lead.id)} />
        </td>
        {/* Expand */}
        <td className="td w-6 text-center px-1">
          {expanded
            ? <ChevronUpIcon className="w-3.5 h-3.5 text-blue-500 mx-auto" />
            : <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400 mx-auto" />}
        </td>

        {/* Status */}
        <td className="td w-[120px]" onClick={e => e.stopPropagation()}>
          <StatusBadge value={lead.status} rawValue={lead.status_raw} onChange={v => update({ status: v })} />
        </td>

        {/* Assigned */}
        <td className="td w-[85px]" onClick={e => e.stopPropagation()}>
          <AssignedSelect value={lead.assigned_to} onChange={v => update({ assigned_to: v })} />
        </td>

        {/* Name — left aligned */}
        <td className="td text-left">
          <div className="font-semibold text-blue-900 text-sm leading-tight">{lead.name || '—'}</div>
        </td>

        {/* Phone + Email — narrow */}
        <td className="td w-[105px]" onClick={e => e.stopPropagation()}>
          {lead.phone
            ? <a href={`tel:${phone}`}
                className="text-blue-600 hover:underline font-mono text-[11px] flex items-center gap-0.5 leading-tight">
                <PhoneIcon className="w-3 h-3 shrink-0" />
                <span className="truncate">{phone}</span>
              </a>
            : <span className="text-gray-300 text-xs">—</span>}
          {lead.phone2 && (
            <a href={`tel:${formatPhone(lead.phone2)}`}
              className="text-blue-400 hover:underline font-mono text-[10px] flex items-center gap-0.5 leading-tight mt-0.5"
              title="Τηλέφωνο 2">
              <PhoneIcon className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{formatPhone(lead.phone2)}</span>
            </a>
          )}
          {lead.email && (
            <a
              href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(lead.email)}`}
              target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-blue-500 hover:underline truncate max-w-[100px] block mt-0.5"
              onClick={e => e.stopPropagation()}
              title={`Άνοιγμα Gmail → ${lead.email}`}
            >
              {lead.email.length > 14 ? lead.email.slice(0, 13) + '…' : lead.email}
            </a>
          )}
        </td>

        {/* Total Debt — inline editable */}
        <td className="td w-[85px] text-left" onClick={e => e.stopPropagation()}>
          <DebtCell value={lead.total_debt} onSave={v => update({ total_debt: v })} />
        </td>

        {/* Reminder */}
        <td className="td w-[80px]" onClick={e => e.stopPropagation()}>
          <NextCallPill
            value={nextCall}
            sheetValue={lead.next_call_sheet}
            onChange={v => update({ app_next_call: v })}
          />
        </td>

        {/* Date */}
        <td className="td w-[80px] text-xs text-gray-500">
          {(() => { const d = parseAnyDate(lead.date); return d ? format(d, 'dd/MM/yy') : (lead.date || '—') })()}
        </td>

        {/* Last comment */}
        <td className="td text-left min-w-[200px]">
          {lastComment
            ? <div className="text-xs text-gray-500 max-w-[380px]">
                <span className="font-semibold text-gray-700">{agentShort(lastComment.author)}:</span>{' '}
                <span className="line-clamp-3 whitespace-pre-wrap">{parseFormatted(lastComment.text) || lastComment.text}</span>
              </div>
            : lead.sheet_comments
            ? <div className="text-xs text-gray-400 max-w-[380px] italic line-clamp-3 whitespace-pre-wrap">{lead.sheet_comments}</div>
            : <span className="text-gray-300 text-xs">—</span>}
        </td>

        {/* Actions */}
        <td className="td w-[60px]" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-0.5 justify-center">
            {lead.phone && (
              <a href={`tel:${phone}`} title="Κλήση"
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
        <ExpandedRow
          lead={lead} currentEmployee={currentEmployee} onUpdate={onLeadUpdate}
          colCount={11} templates={templates} taxisnetLinks={taxisnetLinks} allLeads={allLeads}
        />
      )}
    </>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function Leads({ currentEmployee }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')  // immediate (typed by user)
  const [search, setSearch] = useState('')             // debounced (triggers backend)
  const [debtSearch, setDebtSearch] = useState('')
  const loadIdRef = useRef(0)
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterStatus, setFilterStatus] = useState([])
  const [filterEmployees, setFilterEmployees] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [massEmailOpen, setMassEmailOpen] = useState(false)
  const [massEmailTemplate, setMassEmailTemplate] = useState('')
  const [massSending, setMassSending] = useState(false)
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState(null)
  const [sortCol, setSortCol] = useState('sheet_row_num')
  const [sortDir, setSortDir] = useState('desc')
  const [templates, setTemplates] = useState([])
  const [taxisnetLinks, setTaxisnetLinks] = useState([])
  const [hideCancelled, setHideCancelled] = useState(true)
  const [filterReminder, setFilterReminder] = useState('')
  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [newLeadData, setNewLeadData] = useState({})
  const [newLeadSaving, setNewLeadSaving] = useState(false)

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  // Debounce: wait 400ms after user stops typing before hitting backend
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 400)
    return () => clearTimeout(id)
  }, [searchInput])

  const load = async () => {
    const myId = ++loadIdRef.current
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (filterStatus.length) params.status = filterStatus
      if (filterEmployees.length) params.assigned_to = filterEmployees
      // Always send a year scope to avoid loading all-time data
      if (filterDateFrom || filterDateTo) {
        const fromY = filterDateFrom ? parseInt(filterDateFrom.slice(0, 4)) : THIS_YEAR - 2
        const toY   = filterDateTo   ? parseInt(filterDateTo.slice(0, 4))   : THIS_YEAR
        const years = []
        for (let y = fromY; y <= toY; y++) years.push(String(y))
        params.years = years
      } else {
        params.years = [String(THIS_YEAR - 2), String(THIS_YEAR - 1), String(THIS_YEAR)]
      }
      const res = await api.listLeads(params)
      if (myId !== loadIdRef.current) return  // stale response — discard
      setLeads(res.data)
      setPage(1)
    } catch { toast.error('Σφάλμα φόρτωσης leads') }
    finally { if (myId === loadIdRef.current) setLoading(false) }
  }

  useEffect(() => { load() }, [search, filterStatus, filterEmployees, filterDateFrom, filterDateTo])

  useEffect(() => {
    api.getLeadTemplates().then(r => setTemplates(r.data || [])).catch(() => {})
    api.getLeadLinks().then(r => setTaxisnetLinks(r.data || [])).catch(() => {})
  }, [])

  const updateLead = (updated) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
  }

  function parseMonth(s) {
    const m1 = (s || '').match(/^\d{1,2}[\/\-](\d{1,2})[\/\-]20\d{2}/)
    if (m1) return String(parseInt(m1[1]))
    const m2 = (s || '').match(/^20\d{2}-(\d{2})-/)
    if (m2) return String(parseInt(m2[1]))
    return null
  }

  let displayed = leads
  if (hideCancelled && filterStatus.length === 0)
    displayed = displayed.filter(l => l.status !== 'cancelled')
  if (filterStatus.length > 0)
    displayed = displayed.filter(l => filterStatus.includes((l.status || '').toLowerCase()))
  if (filterDateFrom || filterDateTo) {
    // Parse filter bounds as LOCAL midnight to match how parseAnyDate builds dates
    const parseLocalDate = s => { const [y,m,d] = s.split('-'); return new Date(+y, +m-1, +d) }
    displayed = displayed.filter(l => {
      const d = parseAnyDate(l.date)
      if (!d) return false
      if (filterDateFrom && d < parseLocalDate(filterDateFrom)) return false
      if (filterDateTo) {
        const to = parseLocalDate(filterDateTo); to.setHours(23, 59, 59, 999)
        if (d > to) return false
      }
      return true
    })
  }
  if (debtSearch.trim())
    displayed = displayed.filter(l => (l.total_debt || '').toLowerCase().includes(debtSearch.toLowerCase()))

  // Reminder filter — checks app_next_call (ISO) and next_call_sheet (free text)
  if (filterReminder) {
    const _today = new Date()
    const todayDay = new Date(_today.getFullYear(), _today.getMonth(), _today.getDate())
    const weekEndDay = new Date(todayDay); weekEndDay.setDate(weekEndDay.getDate() + 7)

    const getCallDate = (l) => {
      if (l.app_next_call) {
        try { const d = parseISO(l.app_next_call); if (!isNaN(d)) return d } catch {}
        const d2 = parseAnyDate(l.app_next_call)
        if (d2) return d2
      }
      return parseAnyDate(l.next_call_sheet)
    }

    displayed = displayed.filter(l => {
      const d = getCallDate(l)
      if (filterReminder === 'none') return !d
      if (!d) return false
      // Strip time — compare date parts only to avoid any timezone/boundary issues
      const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      if (filterReminder === 'overdue') return dDay < todayDay
      if (filterReminder === 'today') return dDay.getTime() === todayDay.getTime()
      if (filterReminder === 'week') return dDay >= todayDay && dDay < weekEndDay
      return false
    })
  }

  // Client-side sort
  displayed = [...displayed].sort((a, b) => {
    let av = a[sortCol] ?? ''
    let bv = b[sortCol] ?? ''
    if (sortCol === 'sheet_row_num') { av = Number(av) || 0; bv = Number(bv) || 0 }
    else if (sortCol === 'app_next_call') {
      av = av ? new Date(av).getTime() : 0
      bv = bv ? new Date(bv).getTime() : 0
    }
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'el')
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalPages = Math.ceil(displayed.length / PAGE_SIZE)
  const paginated = displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const statusCounts = leads.reduce((acc, l) => {
    const k = (l.status || '').toLowerCase()
    if (k) acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})

  const hasFilters = filterStatus.length || filterEmployees.length || filterDateFrom || filterDateTo || searchInput || debtSearch || filterReminder

  const employeeOptions = EMPLOYEES.map(e => ({ value: e, label: e }))

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const allDisplayedSelected = displayed.length > 0 && displayed.every(l => selectedIds.has(l.id))
  const toggleSelectAll = () => {
    if (allDisplayedSelected) {
      setSelectedIds(prev => { const n = new Set(prev); displayed.forEach(l => n.delete(l.id)); return n })
    } else {
      setSelectedIds(prev => { const n = new Set(prev); displayed.forEach(l => n.add(l.id)); return n })
    }
  }

  const emailTemplates = templates.filter(t => t.type === 'email' || t.type === 'both')
  const sendMassEmail = async () => {
    const tpl = emailTemplates.find(t => t.name === massEmailTemplate)
    if (!tpl) return
    setMassSending(true)
    const targets = leads.filter(l => selectedIds.has(l.id))
    let sent = 0, failed = 0, skipped = 0
    for (const lead of targets) {
      if (!lead.email) { skipped++; continue }
      try {
        await api.sendLeadEmail(lead.id, lead.email, applyTemplate(tpl.subject || '', lead), applyTemplate(tpl.body, lead))
        sent++
      } catch { failed++ }
    }
    const msg = [`${sent} εστάλησαν`, skipped > 0 && `${skipped} χωρίς email παραλείφθηκαν`, failed > 0 && `${failed} απέτυχαν`].filter(Boolean).join(' · ')
    toast.success(msg, { duration: 5000 })
    setMassEmailOpen(false)
    setSelectedIds(new Set())
    setMassSending(false)
  }

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
        <button
          onClick={() => { setNewLeadData({}); setNewLeadOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow">
          + Νέο Lead
        </button>
      </div>

      {/* New Lead Modal */}
      {newLeadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-blue-800">Νέο Lead (χειροκίνητη εισαγωγή)</h2>
              <button onClick={() => setNewLeadOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              {[
                { key: 'name', label: 'Επωνυμία / Όνομα', required: true },
                { key: 'phone', label: 'Τηλέφωνο', type: 'tel' },
                { key: 'email', label: 'Email', type: 'email' },
                { key: 'total_debt', label: 'Σύνολο Οφειλών' },
                { key: 'service_type', label: 'Υπηρεσία' },
                { key: 'referrer', label: 'Referrer' },
                { key: 'application_number', label: 'Αρ. Αίτησης' },
                { key: 'offer_amount', label: 'Ποσό Προσφοράς' },
                { key: 'success_fee', label: 'Success Fee' },
              ].map(({ key, label, type, required }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
                  <input
                    type={type || 'text'}
                    className="input w-full text-sm"
                    value={newLeadData[key] || ''}
                    onChange={e => setNewLeadData(d => ({ ...d, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                <select className="input w-full text-sm" value={newLeadData.status || ''}
                  onChange={e => setNewLeadData(d => ({ ...d, status: e.target.value }))}>
                  <option value="">—</option>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Ανατέθηκε σε</label>
                <select className="input w-full text-sm" value={newLeadData.assigned_to || ''}
                  onChange={e => setNewLeadData(d => ({ ...d, assigned_to: e.target.value }))}>
                  <option value="">—</option>
                  {EMPLOYEES.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Ημερομηνία</label>
                <input type="date" className="input w-full text-sm"
                  value={newLeadData.date || ''}
                  onChange={e => setNewLeadData(d => ({ ...d, date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Σχόλια</label>
                <textarea rows={3} className="input w-full text-sm resize-none"
                  value={newLeadData.sheet_comments || ''}
                  onChange={e => setNewLeadData(d => ({ ...d, sheet_comments: e.target.value }))} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setNewLeadOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Ακύρωση
              </button>
              <button
                disabled={newLeadSaving || !newLeadData.name}
                onClick={async () => {
                  setNewLeadSaving(true)
                  try {
                    const res = await api.createLead(newLeadData)
                    setLeads(prev => [res.data, ...prev])
                    setNewLeadOpen(false)
                    toast.success('Lead δημιουργήθηκε!')
                  } catch { toast.error('Σφάλμα δημιουργίας lead') }
                  finally { setNewLeadSaving(false) }
                }}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors">
                {newLeadSaving ? 'Αποθήκευση…' : 'Δημιουργία'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status quick-filter pills */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {/* Hide cancelled toggle */}
        <button
          onClick={() => setHideCancelled(h => !h)}
          className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors
            ${hideCancelled ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'}`}>
          {hideCancelled ? '👁 Cancelled κρυφά' : '👁 Cancelled ορατά'}
        </button>
        <div className="w-px h-4 bg-gray-200" />
        {STATUS_OPTIONS.map(key => {
          const cfg = statusCfg(key)
          const active = filterStatus.includes(key)
          const count = (leads.filter(l => l.status === key)).length
          return (
            <button key={key}
              onClick={() => setFilterStatus(active ? filterStatus.filter(s => s !== key) : [...filterStatus, key])}
              className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${cfg.cls}
                ${active ? 'ring-2 ring-offset-1 ring-blue-500' : 'hover:opacity-80'}`}>
              {cfg.label} ({count})
            </button>
          )
        })}
        {hasFilters && (
          <button onClick={() => { setFilterStatus([]); setFilterEmployees([]); setFilterMonths([]); setSearch(''); setDebtSearch(''); setFilterReminder('') }}
            className="text-xs text-gray-400 hover:text-red-500 px-2 ml-1">
            ✕ Καθαρισμός φίλτρων
          </button>
        )}
      </div>

      {/* Reminder quick-filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-gray-400 font-medium">Reminder:</span>
        {REMINDER_OPTIONS.map(opt => (
          <button key={opt.value}
            onClick={() => setFilterReminder(filterReminder === opt.value ? '' : opt.value)}
            className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors font-medium
              ${filterReminder === opt.value ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {/* General search */}
        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9 text-sm w-full" placeholder="Αναζήτηση…"
            value={searchInput} onChange={e => setSearchInput(e.target.value)} />
        </div>

        {/* Debt search */}
        <div className="relative min-w-[140px] max-w-[180px]">
          <input className="input text-sm w-full" placeholder="Σύν. Οφειλών…"
            value={debtSearch} onChange={e => { setDebtSearch(e.target.value); setPage(1) }} />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1">
          <input type="date" className="input text-sm w-[135px]" value={filterDateFrom}
            onChange={e => { setFilterDateFrom(e.target.value); setPage(1) }}
            title="Από ημερομηνία" />
          <span className="text-gray-400 text-xs font-bold">—</span>
          <input type="date" className="input text-sm w-[135px]" value={filterDateTo}
            onChange={e => { setFilterDateTo(e.target.value); setPage(1) }}
            title="Έως ημερομηνία" />
          {(filterDateFrom || filterDateTo) && (
            <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setPage(1) }}
              className="text-xs text-gray-400 hover:text-gray-600 px-1" title="Καθαρισμός ημερομηνίας">✕</button>
          )}
        </div>

        {/* Agents */}
        <MultiSelect options={employeeOptions} selected={filterEmployees} onChange={setFilterEmployees} placeholder="Σύμβουλος" cls="w-[150px]" />
      </div>

      {/* Table */}
      <div className="card p-0 overflow-x-auto">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Φόρτωση…</div>
        ) : displayed.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <div className="text-4xl mb-3">📋</div>
            <div className="font-semibold mb-2">Δεν βρέθηκαν leads</div>
            {!hasFilters && leads.length === 0 && (
              <a href="/lead-lists" className="btn-primary mt-2 inline-flex items-center gap-2">
                → Μεταβείτε στις Λίστες για Sync
              </a>
            )}
            {hasFilters && (
              <p className="text-sm mt-1">Δοκιμάστε να αλλάξετε τα φίλτρα αναζήτησης.</p>
            )}
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="th w-8 px-2">
                    <input type="checkbox" className="rounded border-gray-300 text-blue-600 cursor-pointer"
                      checked={allDisplayedSelected} onChange={toggleSelectAll}
                      title="Επιλογή όλων" />
                  </th>
                  <th className="th w-6 px-1"></th>
                  <SortTh col="status" label="Status" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="w-[120px]" />
                  <SortTh col="assigned_to" label="Σύμβουλος" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="w-[85px]" />
                  <SortTh col="name" label="Επωνυμία" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                  <th className="th text-left w-[105px]">Τηλ / Email</th>
                  <SortTh col="total_debt" label="Σύν. Οφειλών" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="w-[85px]" />
                  <SortTh col="app_next_call" label="Reminder" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="w-[80px]" />
                  <SortTh col="date" label="Ημ/νία" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="w-[80px]" />
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
                    templates={templates}
                    taxisnetLinks={taxisnetLinks}
                    allLeads={leads}
                    selected={selectedIds.has(lead.id)}
                    onSelect={toggleSelect}
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

      {/* ── Mass selection action bar ────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-4 pointer-events-none">
          <div className="pointer-events-auto bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4 min-w-[400px]">
            <span className="font-bold text-sm">{selectedIds.size} επιλεγμένα</span>
            <div className="w-px h-5 bg-gray-600" />
            <button
              onClick={() => { setMassEmailOpen(true); setMassEmailTemplate(emailTemplates[0]?.name || '') }}
              className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg font-semibold transition-colors">
              ✉️ Mass Email
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-gray-400 hover:text-white transition-colors ml-2">
              ✕ Αποεπιλογή
            </button>
          </div>
        </div>
      )}

      {/* ── Mass email modal ─────────────────────────────────────────── */}
      {massEmailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-800">✉️ Mass Email</h2>
              <button onClick={() => setMassEmailOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm text-blue-700">
              {(() => {
                const targets = leads.filter(l => selectedIds.has(l.id))
                const withEmail = targets.filter(l => l.email).length
                const noEmail = targets.length - withEmail
                return (
                  <>
                    <span className="font-bold">{withEmail} leads με email</span>
                    {noEmail > 0 && <span className="text-orange-500 ml-2">· {noEmail} χωρίς email θα παραλειφθούν</span>}
                  </>
                )
              })()}
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1.5 block font-semibold">Επιλογή Template</label>
              {emailTemplates.length === 0 ? (
                <p className="text-sm text-gray-400">Δεν υπάρχουν email templates. <a href="/lead-lists" className="text-blue-500 hover:underline">Προσθέστε από τις Λίστες</a>.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {emailTemplates.map(t => (
                    <label key={t.name}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors
                        ${massEmailTemplate === t.name ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="masstpl" value={t.name} checked={massEmailTemplate === t.name}
                        onChange={() => setMassEmailTemplate(t.name)} className="mt-0.5 text-blue-600" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-gray-800">{t.name}</div>
                        {t.subject && <div className="text-xs text-gray-500 mt-0.5">Θέμα: {t.subject}</div>}
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{t.body}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {emailTemplates.length > 0 && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={sendMassEmail}
                  disabled={massSending || !massEmailTemplate}
                  className="btn-primary flex-1 justify-center py-2.5 disabled:opacity-60">
                  {massSending ? '⏳ Αποστολή…' : `✉️ Αποστολή σε ${leads.filter(l => selectedIds.has(l.id) && l.email).length} leads`}
                </button>
                <button onClick={() => setMassEmailOpen(false)} className="btn-secondary px-4">Άκυρο</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
