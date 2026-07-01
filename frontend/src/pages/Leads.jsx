import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getLeads, getLeadFilterOptions, createLead, updateLead, deleteLead,
  sendLeadMessage, convertLeadToCase, startLeadErmis,
} from '../api'
import {
  MagnifyingGlassIcon, PlusIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon,
  ChatBubbleLeftRightIcon, SparklesIcon, ArrowRightCircleIcon, PaperAirplaneIcon,
  PhoneIcon, EnvelopeIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export const LEAD_STATUSES = ['NEW LEAD', 'CALL', 'HOT', 'ACTIVE', 'DEAL', 'CANCEL']

const STATUS_BADGE = {
  'NEW LEAD': 'bg-yellow-100 text-yellow-800',
  'CALL': 'bg-blue-100 text-blue-800',
  'HOT': 'bg-red-100 text-red-700',
  'ACTIVE': 'bg-amber-100 text-amber-800',
  'DEAL': 'bg-green-100 text-green-800',
  'CANCEL': 'bg-gray-200 text-gray-600',
}
const STATUS_ROW = {
  'NEW LEAD': 'bg-yellow-50/40',
  'CALL': 'bg-blue-50/40',
  'HOT': 'bg-red-50/40',
  'ACTIVE': 'bg-amber-50/30',
  'DEAL': 'bg-green-50/40',
  'CANCEL': 'bg-gray-50/60',
}
const ERMIS_BADGE = {
  in_progress: 'bg-indigo-100 text-indigo-700',
  eligible: 'bg-green-100 text-green-700',
  ineligible: 'bg-gray-100 text-gray-500',
}
const REMINDERS = [
  { key: 'overdue', label: 'Ληξιπρόθεσμα', dot: 'bg-red-500' },
  { key: 'today', label: 'Σήμερα', dot: 'bg-yellow-400' },
  { key: 'week', label: 'Εβδομάδα', dot: 'bg-orange-400' },
  { key: 'none', label: 'Χωρίς reminder', dot: 'bg-gray-300' },
]

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function nextCallClass(dateStr) {
  if (!dateStr) return 'text-gray-300 border-gray-200'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff < 0) return 'bg-red-50 text-red-700 border-red-200'
  if (diff === 0) return 'bg-orange-50 text-orange-700 border-orange-200'
  return 'bg-green-50 text-green-700 border-green-200'
}

// Strip **bold**/[c=#hex] markup for a compact preview
function stripMarkup(s) {
  if (!s) return ''
  return s.replace(/\[c=#[0-9a-fA-F]{3,6}\]/g, '').replace(/\[\/c\]/g, '').replace(/\*\*/g, '')
}

function EditableCell({ value, onSave, type = 'text', className = '', placeholder = '—' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value ?? '')
  useEffect(() => { setVal(value ?? '') }, [value])
  const commit = () => { setEditing(false); if ((val ?? '') !== (value ?? '')) onSave(val) }
  if (editing) {
    return (
      <input autoFocus type={type} value={val}
        onChange={e => setVal(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(value ?? ''); setEditing(false) } }}
        className={`w-full px-1 py-0.5 border border-blue-300 rounded text-sm ${className}`} />
    )
  }
  return (
    <span onClick={() => setEditing(true)} className={`cursor-text hover:bg-blue-50 rounded px-1 py-0.5 block min-h-[1.4rem] ${className}`}>
      {value || <span className="text-gray-300">{placeholder}</span>}
    </span>
  )
}

function SendModal({ lead, onClose }) {
  const [channel, setChannel] = useState('viber')
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState('i-Mentor Consulting')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      const payload = channel === 'email'
        ? { notification_type: 'email', subject, body: message }
        : channel === 'both'
          ? { notification_type: 'both', message, subject, body: message }
          : { notification_type: 'viber', message }
      const res = await sendLeadMessage(lead.id, payload)
      const ok = (res.results || []).some(r => r.status === 'sent')
      ok ? toast.success('Το μήνυμα στάλθηκε') : toast.error('Δεν στάλθηκε')
      if (ok) onClose()
    } catch { toast.error('Σφάλμα αποστολής') } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b font-bold">Αποστολή σε {lead.name || 'lead'}</div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            {['viber', 'email', 'both'].map(c => (
              <button key={c} onClick={() => setChannel(c)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${channel === c ? 'bg-blue-500 text-white border-blue-500' : 'bg-white border-gray-300'}`}>
                {c === 'viber' ? 'Viber' : c === 'email' ? 'Email' : 'Και τα δύο'}
              </button>
            ))}
          </div>
          {channel !== 'viber' && <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Θέμα (email)" className="w-full px-3 py-2 border rounded-lg text-sm" />}
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} placeholder="Μήνυμα…" className="w-full px-3 py-2 border rounded-lg text-sm" />
          <div className="text-xs text-gray-400">Υποστηρίζεται **έντονα** και [c=#FF0000]χρώμα[/c].</div>
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Άκυρο</button>
          <button onClick={submit} disabled={busy || !message} className="btn-primary text-sm flex items-center gap-1">
            <PaperAirplaneIcon className="w-4 h-4" />{busy ? 'Αποστολή…' : 'Αποστολή'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NewLeadModal({ options, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', afm: '', program: '', total_amount: '', assigned_name: '' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const submit = async () => {
    setBusy(true)
    try {
      await createLead({ ...form, total_amount: parseFloat(form.total_amount) || 0 })
      toast.success('Το lead δημιουργήθηκε'); onCreated(); onClose()
    } catch { toast.error('Σφάλμα δημιουργίας') } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b font-bold">Νέο Lead</div>
        <div className="p-4 grid grid-cols-2 gap-3">
          <input placeholder="Επωνυμία / Όνομα" value={form.name} onChange={e => set('name', e.target.value)} className="px-3 py-2 border rounded-lg text-sm col-span-2" />
          <input placeholder="Τηλέφωνο" value={form.phone} onChange={e => set('phone', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="Email" value={form.email} onChange={e => set('email', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="ΑΦΜ" value={form.afm} onChange={e => set('afm', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="Ποσό (€)" value={form.total_amount} onChange={e => set('total_amount', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={form.program} onChange={e => set('program', e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">— Πρόγραμμα —</option>
            {(options.programs || ['ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', 'ΔΥΠΑ', 'ΕΣΠΑ', 'ΑΝΑΚΑΙΝΙΖΩ']).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input placeholder="Σύμβουλος" value={form.assigned_name} onChange={e => set('assigned_name', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Άκυρο</button>
          <button onClick={submit} disabled={busy} className="btn-primary text-sm">{busy ? 'Δημιουργία…' : 'Δημιουργία'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Leads() {
  const navigate = useNavigate()
  const [data, setData] = useState({ items: [], total: 0, page: 1, page_size: 50 })
  const [options, setOptions] = useState({ statuses: LEAD_STATUSES, agents: [], programs: [], consultants: [], status_counts: {}, total: 0 })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', consultant: '', program: '', q: '', reminder: '', date_from: '', date_to: '' })
  const [sort, setSort] = useState({ sort: 'created_at', direction: 'desc' })
  const [page, setPage] = useState(1)
  const [showNew, setShowNew] = useState(false)
  const [sendLead, setSendLead] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { ...sort, page }
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
      const res = await getLeads(params)
      setData(res)
    } catch { toast.error('Σφάλμα φόρτωσης leads') } finally { setLoading(false) }
  }, [filters, sort, page])

  const loadOptions = useCallback(() => { getLeadFilterOptions().then(setOptions).catch(() => {}) }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadOptions() }, [loadOptions])

  const patch = async (lead, field, value) => {
    try {
      await updateLead(lead.id, { [field]: value })
      setData(d => ({ ...d, items: d.items.map(l => l.id === lead.id ? { ...l, [field]: value } : l) }))
      if (field === 'status') loadOptions()
    } catch { toast.error('Σφάλμα αποθήκευσης') }
  }

  const toggleSort = (col) => setSort(s => s.sort === col ? { sort: col, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { sort: col, direction: 'asc' })
  const setFilter = (patchObj) => { setPage(1); setFilters(f => ({ ...f, ...patchObj })) }

  const handleErmis = async (lead) => {
    if (!confirm(`Έναρξη προαξιολόγησης ΕΡΜΗΣ και αποστολή link στον ${lead.name || 'lead'};`)) return
    try { await startLeadErmis(lead.id, { send_link: true, channel: lead.phone ? 'viber' : 'email' }); toast.success('Η συνεδρία ΕΡΜΗΣ ξεκίνησε'); load() }
    catch (e) { toast.error(e.response?.data?.detail || 'Σφάλμα ΕΡΜΗΣ') }
  }
  const handleConvert = async (lead) => {
    if (!confirm(`Δημιουργία υπόθεσης από το lead «${lead.name || ''}»;`)) return
    try { const res = await convertLeadToCase(lead.id); toast.success('Δημιουργήθηκε υπόθεση'); if (res.id) navigate(`/cases/${res.id}`) }
    catch { toast.error('Σφάλμα μετατροπής') }
  }
  const handleDelete = async (lead) => {
    if (!confirm('Διαγραφή lead;')) return
    try { await deleteLead(lead.id); toast.success('Διαγράφηκε'); load(); loadOptions() } catch { toast.error('Σφάλμα διαγραφής') }
  }

  const SortTh = ({ col, children, className = '' }) => (
    <th onClick={() => toggleSort(col)} className={`px-2 py-2 text-left font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap ${className}`}>
      <span className="inline-flex items-center gap-1">{children}
        {sort.sort === col && (sort.direction === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />)}
      </span>
    </th>
  )

  const totalPages = Math.max(1, Math.ceil(data.total / (data.page_size || 50)))
  const counts = options.status_counts || {}

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <div className="text-sm text-gray-500">{data.total} εγγραφές {options.total ? `(από ${options.total})` : ''}</div>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary text-sm flex items-center gap-1"><PlusIcon className="w-4 h-4" />Νέο Lead</button>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2 mb-2">
        <button onClick={() => setFilter({ status: '' })}
          className={`px-3 py-1 rounded-full text-xs font-semibold border ${!filters.status ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300'}`}>
          Όλα ({options.total || 0})
        </button>
        {LEAD_STATUSES.map(s => (
          <button key={s} onClick={() => setFilter({ status: filters.status === s ? '' : s })}
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${filters.status === s ? 'ring-2 ring-offset-1 ring-blue-400 ' : ''}${STATUS_BADGE[s]} border-transparent`}>
            {s} ({counts[s] || 0})
          </button>
        ))}
      </div>

      {/* Reminder chips */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-gray-400">Reminder:</span>
        {REMINDERS.map(r => (
          <button key={r.key} onClick={() => setFilter({ reminder: filters.reminder === r.key ? '' : r.key })}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${filters.reminder === r.key ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-gray-300 text-gray-600'}`}>
            <span className={`w-2 h-2 rounded-full ${r.dot}`} />{r.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
          <input value={filters.q} onChange={e => setFilter({ q: e.target.value })} placeholder="Αναζήτηση…" className="pl-8 pr-3 py-2 border rounded-lg text-sm" />
        </div>
        <select value={filters.program} onChange={e => setFilter({ program: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
          <option value="">Όλα τα προγράμματα</option>
          {(options.programs || []).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filters.consultant} onChange={e => setFilter({ consultant: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
          <option value="">Σύμβουλος (όλοι)</option>
          {(options.consultants || []).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={filters.date_from} onChange={e => setFilter({ date_from: e.target.value })} className="px-2 py-2 border rounded-lg text-sm" />
        <input type="date" value={filters.date_to} onChange={e => setFilter({ date_to: e.target.value })} className="px-2 py-2 border rounded-lg text-sm" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <SortTh col="status">STATUS</SortTh>
              <SortTh col="consultant">ΣΥΜΒΟΥΛΟΣ</SortTh>
              <SortTh col="name">ΕΠΩΝΥΜΙΑ</SortTh>
              <th className="px-2 py-2 text-left font-semibold text-gray-600">ΤΗΛ / EMAIL</th>
              <SortTh col="next_call_date">REMINDER</SortTh>
              <SortTh col="created_at">ΗΜ/ΝΙΑ</SortTh>
              <th className="px-2 py-2 text-left font-semibold text-gray-600">ΤΕΛΕΥΤΑΙΟ ΣΧΟΛΙΟ</th>
              <th className="px-2 py-2 text-left font-semibold text-gray-600">ΕΡΜΗΣ</th>
              <th className="px-2 py-2 text-right font-semibold text-gray-600">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-10 text-gray-400">Φόρτωση…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-gray-400">Δεν βρέθηκαν leads</td></tr>
            ) : data.items.map(lead => (
              <tr key={lead.id} className={`border-b hover:bg-blue-50/30 align-top ${STATUS_ROW[lead.status] || ''}`}>
                <td className="px-2 py-1.5">
                  <select value={lead.status} onChange={e => patch(lead, 'status', e.target.value)}
                    className={`text-xs font-semibold rounded-full px-2 py-1 border-0 cursor-pointer ${STATUS_BADGE[lead.status] || 'bg-gray-100'}`}>
                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5 w-28"><EditableCell value={lead.consultant} onSave={v => patch(lead, 'assigned_name', v)} placeholder="—" /></td>
                <td className="px-2 py-1.5 min-w-[150px]">
                  <span className="text-blue-600 hover:underline cursor-pointer font-medium" onClick={() => navigate(`/leads/${lead.id}`)}>{lead.name || '—'}</span>
                </td>
                <td className="px-2 py-1.5 min-w-[160px]">
                  {lead.phone && <div className="flex items-center gap-1 text-gray-700"><PhoneIcon className="w-3.5 h-3.5 text-gray-400" />{lead.phone}</div>}
                  {lead.email && <div className="flex items-center gap-1 text-gray-500 text-xs truncate max-w-[180px]"><EnvelopeIcon className="w-3.5 h-3.5 text-gray-400" />{lead.email}</div>}
                  {!lead.phone && !lead.email && <span className="text-gray-300">—</span>}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <input type="date" value={lead.next_call_date || ''} onChange={e => patch(lead, 'next_call_date', e.target.value || null)}
                    className={`text-xs rounded px-1.5 py-1 border ${nextCallClass(lead.next_call_date)}`} />
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap text-gray-500 text-xs">{fmtDate(lead.created_at)}</td>
                <td className="px-2 py-1.5 max-w-[220px]">
                  {lead.last_comment
                    ? <div className="text-xs text-gray-600 truncate" title={stripMarkup(lead.last_comment.content)}>{stripMarkup(lead.last_comment.content)}</div>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-2 py-1.5">
                  {lead.ermis_status
                    ? <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${ERMIS_BADGE[lead.ermis_status] || 'bg-gray-100'}`}>{lead.ermis_status}</span>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <button title="Έναρξη ΕΡΜΗΣ" onClick={() => handleErmis(lead)} className="p-1.5 rounded hover:bg-indigo-100 text-indigo-600"><SparklesIcon className="w-4 h-4" /></button>
                    <button title="Αποστολή μηνύματος" onClick={() => setSendLead(lead)} className="p-1.5 rounded hover:bg-blue-100 text-blue-600"><ChatBubbleLeftRightIcon className="w-4 h-4" /></button>
                    <button title="Δημιουργία υπόθεσης" onClick={() => handleConvert(lead)} className="p-1.5 rounded hover:bg-green-100 text-green-600"><ArrowRightCircleIcon className="w-4 h-4" /></button>
                    <button title="Διαγραφή" onClick={() => handleDelete(lead)} className="p-1.5 rounded hover:bg-red-100 text-red-500"><TrashIcon className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
        <div>Σελίδα {data.page} / {totalPages}</div>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm disabled:opacity-40">Προηγ.</button>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm disabled:opacity-40">Επόμ.</button>
        </div>
      </div>

      {showNew && <NewLeadModal options={options} onClose={() => setShowNew(false)} onCreated={() => { load(); loadOptions() }} />}
      {sendLead && <SendModal lead={sendLead} onClose={() => setSendLead(null)} />}
    </div>
  )
}
