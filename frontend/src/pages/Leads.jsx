import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getLeads, getLeadFilterOptions, createLead, updateLead, deleteLead,
  sendLeadMessage, convertLeadToCase, startLeadErmis,
  getLeadReportStatusDistribution,
} from '../api'
import {
  MagnifyingGlassIcon, PlusIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon,
  ChatBubbleLeftRightIcon, SparklesIcon, ArrowRightCircleIcon, PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export const LEAD_STATUSES = ['NEW LEAD', 'CALL', 'HOT', 'ACTIVE', 'DEAL', 'CANCEL']

const STATUS_BADGE = {
  'NEW LEAD': 'bg-yellow-100 text-yellow-800',
  'CALL': 'bg-blue-100 text-blue-800',
  'HOT': 'bg-red-100 text-red-700',
  'ACTIVE': 'bg-amber-100 text-amber-800',
  'DEAL': 'bg-green-100 text-green-800',
  'CANCEL': 'bg-gray-100 text-gray-500',
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

function nextCallClass(dateStr) {
  if (!dateStr) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff < 0) return 'bg-red-100 text-red-700'
  if (diff === 0) return 'bg-orange-100 text-orange-700'
  return 'bg-green-100 text-green-700'
}

// Inline click-to-edit cell
function EditableCell({ value, onSave, type = 'text', className = '' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value ?? '')
  useEffect(() => { setVal(value ?? '') }, [value])
  const commit = () => { setEditing(false); if ((val ?? '') !== (value ?? '')) onSave(val) }
  if (editing) {
    return (
      <input
        autoFocus type={type} value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(value ?? ''); setEditing(false) } }}
        className={`w-full px-1 py-0.5 border border-blue-300 rounded text-sm ${className}`}
      />
    )
  }
  return (
    <span onClick={() => setEditing(true)} className={`cursor-text hover:bg-blue-50 rounded px-1 py-0.5 block min-h-[1.4rem] ${className}`}>
      {value || <span className="text-gray-300">—</span>}
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
      ok ? toast.success('Το μήνυμα στάλθηκε') : toast.error('Δεν στάλθηκε: ' + JSON.stringify(res.results))
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
          {channel !== 'viber' && (
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Θέμα (email)"
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          )}
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} placeholder="Μήνυμα…"
            className="w-full px-3 py-2 border rounded-lg text-sm" />
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
  const [form, setForm] = useState({ name: '', phone: '', email: '', afm: '', program: '', total_amount: '', assigned_agent_id: '' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const submit = async () => {
    setBusy(true)
    try {
      const payload = { ...form, total_amount: parseFloat(form.total_amount) || 0, assigned_agent_id: form.assigned_agent_id ? Number(form.assigned_agent_id) : null }
      await createLead(payload)
      toast.success('Το lead δημιουργήθηκε')
      onCreated()
      onClose()
    } catch { toast.error('Σφάλμα δημιουργίας') } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b font-bold">Νέο Lead</div>
        <div className="p-4 grid grid-cols-2 gap-3">
          <input placeholder="Όνομα" value={form.name} onChange={e => set('name', e.target.value)} className="px-3 py-2 border rounded-lg text-sm col-span-2" />
          <input placeholder="Τηλέφωνο" value={form.phone} onChange={e => set('phone', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="Email" value={form.email} onChange={e => set('email', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="ΑΦΜ" value={form.afm} onChange={e => set('afm', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="Ποσό (€)" value={form.total_amount} onChange={e => set('total_amount', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={form.program} onChange={e => set('program', e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">— Πρόγραμμα —</option>
            {(options.programs || ['ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', 'ΔΥΠΑ', 'ΕΣΠΑ', 'ΑΝΑΚΑΙΝΙΖΩ']).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={form.assigned_agent_id} onChange={e => set('assigned_agent_id', e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">— Υπεύθυνος —</option>
            {(options.agents || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
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
  const [options, setOptions] = useState({ statuses: LEAD_STATUSES, agents: [], programs: [] })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', agent_id: '', program: '', q: '', date_from: '', date_to: '' })
  const [sort, setSort] = useState({ sort: 'created_at', direction: 'desc' })
  const [page, setPage] = useState(1)
  const [showNew, setShowNew] = useState(false)
  const [sendLead, setSendLead] = useState(null)
  const [dist, setDist] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { ...sort, page }
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
      const res = await getLeads(params)
      setData(res)
    } catch { toast.error('Σφάλμα φόρτωσης leads') } finally { setLoading(false) }
  }, [filters, sort, page])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    getLeadFilterOptions().then(setOptions).catch(() => {})
    getLeadReportStatusDistribution().then(setDist).catch(() => {})
  }, [])

  const patch = async (lead, field, value) => {
    try {
      await updateLead(lead.id, { [field]: value })
      setData(d => ({ ...d, items: d.items.map(l => l.id === lead.id ? { ...l, [field]: value } : l) }))
    } catch { toast.error('Σφάλμα αποθήκευσης') }
  }

  const toggleSort = (col) => {
    setSort(s => s.sort === col ? { sort: col, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { sort: col, direction: 'asc' })
  }

  const handleErmis = async (lead) => {
    if (!confirm(`Έναρξη προαξιολόγησης ΕΡΜΗΣ και αποστολή link στον ${lead.name || 'lead'};`)) return
    try {
      await startLeadErmis(lead.id, { send_link: true, channel: lead.phone ? 'viber' : 'email' })
      toast.success('Η συνεδρία ΕΡΜΗΣ ξεκίνησε και στάλθηκε link')
      load()
    } catch (e) { toast.error(e.response?.data?.detail || 'Σφάλμα ΕΡΜΗΣ') }
  }

  const handleConvert = async (lead) => {
    if (!confirm(`Μετατροπή του lead «${lead.name || ''}» σε υπόθεση;`)) return
    try {
      const res = await convertLeadToCase(lead.id)
      toast.success('Δημιουργήθηκε υπόθεση')
      if (res.id) navigate(`/cases/${res.id}`)
    } catch { toast.error('Σφάλμα μετατροπής') }
  }

  const handleDelete = async (lead) => {
    if (!confirm('Διαγραφή lead;')) return
    try { await deleteLead(lead.id); toast.success('Διαγράφηκε'); load() } catch { toast.error('Σφάλμα διαγραφής') }
  }

  const SortTh = ({ col, children }) => (
    <th onClick={() => toggleSort(col)} className="px-2 py-2 text-left font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap">
      <span className="inline-flex items-center gap-1">{children}
        {sort.sort === col && (sort.direction === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />)}
      </span>
    </th>
  )

  const totalPages = Math.max(1, Math.ceil(data.total / (data.page_size || 50)))

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          {dist && <div className="text-sm text-gray-500">Σύνολο: {dist.total} · Μετατροπή σε deal: {(dist.conversion_rate * 100).toFixed(1)}%</div>}
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary text-sm flex items-center gap-1">
          <PlusIcon className="w-4 h-4" />Νέο Lead
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
          <input value={filters.q} onChange={e => { setPage(1); setFilters(f => ({ ...f, q: e.target.value })) }}
            placeholder="Αναζήτηση…" className="pl-8 pr-3 py-2 border rounded-lg text-sm" />
        </div>
        <select value={filters.status} onChange={e => { setPage(1); setFilters(f => ({ ...f, status: e.target.value })) }} className="px-3 py-2 border rounded-lg text-sm">
          <option value="">Όλα τα status</option>
          {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.program} onChange={e => { setPage(1); setFilters(f => ({ ...f, program: e.target.value })) }} className="px-3 py-2 border rounded-lg text-sm">
          <option value="">Όλα τα προγράμματα</option>
          {(options.programs || []).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filters.agent_id} onChange={e => { setPage(1); setFilters(f => ({ ...f, agent_id: e.target.value })) }} className="px-3 py-2 border rounded-lg text-sm">
          <option value="">Όλοι οι υπεύθυνοι</option>
          {(options.agents || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" value={filters.date_from} onChange={e => { setPage(1); setFilters(f => ({ ...f, date_from: e.target.value })) }} className="px-2 py-2 border rounded-lg text-sm" />
        <input type="date" value={filters.date_to} onChange={e => { setPage(1); setFilters(f => ({ ...f, date_to: e.target.value })) }} className="px-2 py-2 border rounded-lg text-sm" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <SortTh col="name">Όνομα</SortTh>
              <SortTh col="phone">Τηλέφωνο</SortTh>
              <SortTh col="email">Email</SortTh>
              <th className="px-2 py-2 text-left font-semibold text-gray-600">Πρόγραμμα</th>
              <SortTh col="total_amount">Ποσό</SortTh>
              <SortTh col="status">Status</SortTh>
              <SortTh col="next_call_date">Επόμενη κλήση</SortTh>
              <th className="px-2 py-2 text-left font-semibold text-gray-600">Υπεύθυνος</th>
              <th className="px-2 py-2 text-left font-semibold text-gray-600">ΕΡΜΗΣ</th>
              <th className="px-2 py-2 text-right font-semibold text-gray-600">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center py-10 text-gray-400">Φόρτωση…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-10 text-gray-400">Δεν βρέθηκαν leads</td></tr>
            ) : data.items.map(lead => (
              <tr key={lead.id} className={`border-b hover:bg-blue-50/30 ${STATUS_ROW[lead.status] || ''}`}>
                <td className="px-2 py-1.5 min-w-[140px]">
                  <span className="text-blue-600 hover:underline cursor-pointer font-medium" onClick={() => navigate(`/leads/${lead.id}`)}>
                    {lead.name || '—'}
                  </span>
                </td>
                <td className="px-2 py-1.5 min-w-[120px]"><EditableCell value={lead.phone} onSave={v => patch(lead, 'phone', v)} /></td>
                <td className="px-2 py-1.5 min-w-[140px]"><EditableCell value={lead.email} onSave={v => patch(lead, 'email', v)} /></td>
                <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">{lead.program || '—'}</td>
                <td className="px-2 py-1.5 w-24"><EditableCell type="number" value={lead.total_amount} onSave={v => patch(lead, 'total_amount', parseFloat(v) || 0)} /></td>
                <td className="px-2 py-1.5">
                  <select value={lead.status} onChange={e => patch(lead, 'status', e.target.value)}
                    className={`text-xs font-semibold rounded-full px-2 py-1 border-0 cursor-pointer ${STATUS_BADGE[lead.status] || 'bg-gray-100'}`}>
                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <input type="date" value={lead.next_call_date || ''} onChange={e => patch(lead, 'next_call_date', e.target.value || null)}
                    className={`text-xs rounded px-1.5 py-1 border ${nextCallClass(lead.next_call_date)}`} />
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">{lead.assigned_agent_name || '—'}</td>
                <td className="px-2 py-1.5">
                  {lead.ermis_status
                    ? <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${ERMIS_BADGE[lead.ermis_status] || 'bg-gray-100'}`}>{lead.ermis_status}</span>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <button title="Έναρξη ΕΡΜΗΣ" onClick={() => handleErmis(lead)} className="p-1.5 rounded hover:bg-indigo-100 text-indigo-600"><SparklesIcon className="w-4 h-4" /></button>
                    <button title="Αποστολή μηνύματος" onClick={() => setSendLead(lead)} className="p-1.5 rounded hover:bg-blue-100 text-blue-600"><ChatBubbleLeftRightIcon className="w-4 h-4" /></button>
                    <button title="Μετατροπή σε υπόθεση" onClick={() => handleConvert(lead)} className="p-1.5 rounded hover:bg-green-100 text-green-600"><ArrowRightCircleIcon className="w-4 h-4" /></button>
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
        <div>Σύνολο: {data.total}</div>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm disabled:opacity-40">Προηγ.</button>
          <span>Σελίδα {data.page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm disabled:opacity-40">Επόμ.</button>
        </div>
      </div>

      {showNew && <NewLeadModal options={options} onClose={() => setShowNew(false)} onCreated={load} />}
      {sendLead && <SendModal lead={sendLead} onClose={() => setSendLead(null)} />}
    </div>
  )
}
