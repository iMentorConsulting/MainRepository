import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCases, getUsers, deleteCase, createCase, updateCase, getPipelines, sendNotification, getCaseFilterOptions } from '../api'
import { PIPELINES } from '../pipelines'
import { MagnifyingGlassIcon, PlusIcon, TrashIcon, FolderOpenIcon, BoltIcon, ChevronDownIcon, ChevronUpIcon, CheckIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const FINAL_STATUSES = new Set(['ΟΛΟΚΛΗΡΩΜΕΝΗ ΥΠΟΘΕΣΗ', 'ΠΑΡΑΙΤΗΣΗ', 'ΠΑΓΩΜΕΝΗ ΥΠΟΘΕΣΗ', 'ΑΚΥΡΩΣΗ', 'ΑΠΟΡΡΙΨΗ', 'ΜΗ ΕΠΙΛΕΞΙΜΟΣ', 'ΟΧΙ ΕΝΔΙΑΦΕΡΟΝ'])

// ─── Multi-select dropdown ────────────────────────────────────────────────────
function MultiSelect({ label, options, value, onChange, minWidth = 160 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const allSelected = value.length === 0

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(opt) {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }

  const display = allSelected ? 'Όλα' : value.length === 1 ? value[0] : `${value.length} επιλεγμένα`

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:border-blue-400 focus:outline-none"
        style={{ minWidth }}>
        <span className="text-gray-500 text-xs shrink-0">{label}:</span>
        <span className={`font-medium truncate flex-1 text-left ${allSelected ? 'text-gray-400' : 'text-gray-800'}`}>{display}</span>
        {open ? <ChevronUpIcon className="w-3 h-3 text-gray-400 shrink-0" /> : <ChevronDownIcon className="w-3 h-3 text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[200px] max-h-64 overflow-y-auto">
          <button onClick={() => onChange([])}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 ${allSelected ? 'font-semibold text-blue-600' : 'text-gray-500'}`}>
            Όλα
          </button>
          {options.map(opt => (
            <button key={opt.value ?? opt} onClick={() => toggle(opt.value ?? opt)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${value.includes(opt.value ?? opt) ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${value.includes(opt.value ?? opt) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>
                {value.includes(opt.value ?? opt) && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </span>
              {opt.label ?? opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function QuickActions({ caseRow, allStatuses, onUpdated }) {
  const [open, setOpen] = useState(false)
  const [notifMsg, setNotifMsg] = useState('')
  const [showNotif, setShowNotif] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setShowNotif(false) } }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const changeStatus = async (status) => {
    setSaving(true)
    try {
      await updateCase(caseRow.id, { status })
      toast.success(`Status → ${status}`)
      setOpen(false)
      onUpdated()
    } catch { toast.error('Σφάλμα') }
    finally { setSaving(false) }
  }

  const sendQuickNotif = async () => {
    if (!notifMsg.trim()) return
    setSaving(true)
    try {
      await sendNotification(caseRow.id, { notification_type: 'both', message: notifMsg.trim() })
      toast.success('Εστάλη')
      setNotifMsg('')
      setShowNotif(false)
      setOpen(false)
    } catch { toast.error('Σφάλμα αποστολής') }
    finally { setSaving(false) }
  }

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => { setOpen(v => !v); setShowNotif(false) }}
        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        title="Γρήγορες Ενέργειες"
      >
        <BoltIcon className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-64 p-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-1">Αλλαγή Status</p>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {allStatuses.map(s => (
              <button key={s} onClick={() => changeStatus(s)} disabled={saving || s === caseRow.status}
                className={`w-full text-left text-xs px-3 py-1.5 rounded-lg transition-colors ${s === caseRow.status ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}>
                {s === caseRow.status && '✓ '}{s}
              </button>
            ))}
          </div>
          <hr className="my-2" />
          {!showNotif ? (
            <button onClick={() => setShowNotif(true)}
              className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-orange-50 text-orange-600 font-medium flex items-center gap-2">
              <BoltIcon className="w-3.5 h-3.5" /> Γρήγορη Ειδοποίηση
            </button>
          ) : (
            <div className="px-1 space-y-2">
              <textarea
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
                rows={3} placeholder="Μήνυμα..." value={notifMsg}
                onChange={e => setNotifMsg(e.target.value)}
              />
              <div className="flex gap-1">
                <button onClick={sendQuickNotif} disabled={saving || !notifMsg.trim()}
                  className="flex-1 text-xs bg-orange-500 text-white rounded-lg py-1.5 font-semibold hover:bg-orange-600 disabled:opacity-50">
                  Αποστολή (Email+Viber)
                </button>
                <button onClick={() => setShowNotif(false)} className="text-xs text-gray-400 px-2">Ακύρωση</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const PROGRAM_OPTIONS = [
  { value: 'ΕΣΠΑ', label: 'ΕΣΠΑ' },
  { value: 'ΔΥΠΑ', label: 'ΔΥΠΑ / ΟΑΕΔ' },
  { value: 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', label: 'Μικροπιστώσεις' },
  { value: 'ΑΝΑΚΑΙΝΙΖΩ', label: 'Ανακαινίζω' },
]

const NON_ANA_PROGRAMS = ['ΕΣΠΑ', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ']

function SortTh({ label, col, sortCol, sortDir, onSort, className = '' }) {
  const active = sortCol === col
  return (
    <th
      onClick={() => onSort(col)}
      className={`text-left px-3 py-3 text-xs font-semibold text-gray-500 tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${className}`}
    >
      <span className="flex items-center gap-1">
        {label}
        <span className="flex flex-col -space-y-1">
          <ChevronUpIcon className={`w-2.5 h-2.5 ${active && sortDir === 'asc' ? 'text-[#1e3a5f]' : 'text-gray-300'}`} />
          <ChevronDownIcon className={`w-2.5 h-2.5 ${active && sortDir === 'desc' ? 'text-[#1e3a5f]' : 'text-gray-300'}`} />
        </span>
      </span>
    </th>
  )
}

function sortCases(rows, col, dir) {
  if (!col) return rows
  return [...rows].sort((a, b) => {
    let av = a[col], bv = b[col]
    if (av == null) av = ''
    if (bv == null) bv = ''
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'el', { sensitivity: 'base' })
    return dir === 'asc' ? cmp : -cmp
  })
}

const fmt = (n) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n || 0)

function NewCaseModal({ agents, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const defaultProg = 'ΕΣΠΑ'
    const firstStatus = PIPELINES[defaultProg]?.phases?.[0]?.statuses?.[0] || ''
    return {
      client_name: '', phone: '', email: '', afm: '', accountant: '',
      sale_date: '', service_type: '',
      program_category: defaultProg,
      status: firstStatus,
      approved_budget: '', subsidy_percent: '', project_deadline: '', approval_date: '',
      agreed_fee_application: '', agreed_fee_implementation: '',
      assigned_agent_id: '', notes: '',
    }
  })
  const [saving, setSaving] = useState(false)

  const programStatuses = useMemo(() => {
    const p = PIPELINES[form.program_category]
    if (!p) return []
    return [...p.phases.flatMap(ph => ph.statuses), ...p.extra_statuses]
  }, [form.program_category])

  const handleProgramChange = (e) => {
    const prog = e.target.value
    const p = PIPELINES[prog]
    const firstStatus = p?.phases?.[0]?.statuses?.[0] || ''
    setForm(prev => ({ ...prev, program_category: prog, status: firstStatus }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form }
      for (const k of ['approved_budget', 'subsidy_percent', 'agreed_fee_application', 'agreed_fee_implementation'])
        payload[k] = payload[k] ? parseFloat(payload[k]) : 0
      for (const k of ['sale_date', 'project_deadline', 'approval_date'])
        if (!payload[k]) payload[k] = null
      payload.assigned_agent_id = payload.assigned_agent_id ? parseInt(payload.assigned_agent_id) : null
      await createCase(payload)
      toast.success('Η υπόθεση δημιουργήθηκε')
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα δημιουργίας')
    } finally {
      setSaving(false)
    }
  }

  const f = (key) => ({ value: form[key], onChange: e => setForm(p => ({ ...p, [key]: e.target.value })) })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-4">
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold">Νέα Υπόθεση</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Επωνυμία Πελάτη *</label>
              <input className="input" required {...f('client_name')} />
            </div>
            <div><label className="label">Τηλέφωνο</label><input className="input" {...f('phone')} /></div>
            <div><label className="label">Email</label><input className="input" type="email" {...f('email')} /></div>
            <div><label className="label">ΑΦΜ</label><input className="input" {...f('afm')} /></div>
            <div><label className="label">Λογιστής</label><input className="input" {...f('accountant')} /></div>
            <div>
              <label className="label">Πρόγραμμα (Pipeline)</label>
              <select className="input" value={form.program_category} onChange={handleProgramChange}>
                {PROGRAM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Κατάσταση</label>
              <select className="input" {...f('status')}>
                {programStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label className="label">Είδος Υπηρεσίας / Πρόγραμμα</label><input className="input" {...f('service_type')} /></div>
            <div><label className="label">Ημ/νία Πώλησης</label><input className="input" type="date" {...f('sale_date')} /></div>
            <div><label className="label">Ημ/νία Έγκρισης</label><input className="input" type="date" {...f('approval_date')} /></div>
            <div><label className="label">Ύψος Επένδυσης (€)</label><input className="input" type="number" step="0.01" {...f('approved_budget')} /></div>
            <div><label className="label">% Επιχορήγησης</label><input className="input" type="number" step="0.1" {...f('subsidy_percent')} /></div>
            <div><label className="label">Προθεσμία Ολοκλήρωσης</label><input className="input" type="date" {...f('project_deadline')} /></div>
            <div><label className="label">Ποσό Αίτησης (€)</label><input className="input" type="number" step="0.01" {...f('agreed_fee_application')} /></div>
            <div><label className="label">Ποσό Υλοποίησης (€)</label><input className="input" type="number" step="0.01" {...f('agreed_fee_implementation')} /></div>
            <div>
              <label className="label">Agent</label>
              <select className="input" {...f('assigned_agent_id')}>
                <option value="">— Επιλέξτε —</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
            </div>
            <div className="col-span-2"><label className="label">Σημειώσεις</label><textarea className="input" rows={2} {...f('notes')} /></div>
          </div>
          <div className="flex gap-3 mt-5">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">Άκυρο</button>
            <button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? 'Αποθήκευση...' : 'Δημιουργία'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Cases() {
  const [allCases, setAllCases] = useState([])
  const [filterOptions, setFilterOptions] = useState({ service_types: [], statuses: [], programs: [] })
  const [agents, setAgents] = useState([])
  const [livePipelines, setLivePipelines] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [filters, setFilters] = useState({
    programs: [],
    services: [],
    agentIds: [],
    statuses: [],
    deadline_alert: false,
    hide_completed: true,
    has_pending: false,
    sla_overdue: false,
    status_mismatch: false,
    has_documents: false,
    exclude_anakainizw: true,
    portal_only: false,
  })
  const [showNew, setShowNew] = useState(false)
  const [sortCol, setSortCol] = useState('client_name')
  const [sortDir, setSortDir] = useState('asc')
  const navigate = useNavigate()

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  useEffect(() => {
    getPipelines().then(setLivePipelines).catch(() => {})
  }, [])

  const cases = allCases.filter(c => {
    if (filters.hide_completed && FINAL_STATUSES.has(c.status)) return false
    if (filters.has_pending && !(c.pending_count > 0)) return false
    if (filters.sla_overdue && !(c.sla_overdue_days > 0)) return false
    if (filters.status_mismatch && !c.status_mismatch) return false
    if (filters.has_documents && !c.has_documents) return false
    if (filters.portal_only && !c.portal_case_number) return false
    if (filters.programs.length && !filters.programs.includes(c.program_category)) return false
    if (filters.services.length && !filters.services.includes(c.service_type)) return false
    if (filters.agentIds.length && !filters.agentIds.includes(String(c.assigned_agent_id))) return false
    if (filters.statuses.length && !filters.statuses.includes(c.status)) return false
    return true
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (filters.deadline_alert) params.deadline_alert = true
      if (filters.programs.length) {
        params.program_categories = filters.programs.join(',')
      } else if (filters.exclude_anakainizw) {
        params.program_categories = NON_ANA_PROGRAMS.join(',')
      }
      setAllCases(await getCases(params))
    } catch { toast.error('Σφάλμα φόρτωσης') }
    finally { setLoading(false) }
  }, [search, filters.deadline_alert, filters.programs, filters.exclude_anakainizw])

  useEffect(() => { load(); setSelectedIds(new Set()) }, [load])
  useEffect(() => { getUsers().then(setAgents).catch(() => {}) }, [])
  useEffect(() => { getCaseFilterOptions().then(setFilterOptions).catch(() => {}) }, [])

  const handleDelete = async (e, id) => {
    e.preventDefault(); e.stopPropagation()
    if (!confirm('Διαγραφή υπόθεσης;')) return
    try { await deleteCase(id); toast.success('Διαγράφηκε'); load() }
    catch { toast.error('Σφάλμα διαγραφής') }
  }

  const toggleSelect = (e, id) => {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === cases.length && cases.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(cases.map(c => c.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Οριστική διαγραφή ${selectedIds.size} υποθέσεων; Αυτή η ενέργεια δεν αναιρείται.`)) return
    setBulkDeleting(true)
    let ok = 0, fail = 0
    await Promise.allSettled([...selectedIds].map(id =>
      deleteCase(id).then(() => ok++).catch(() => fail++)
    ))
    setBulkDeleting(false)
    setSelectedIds(new Set())
    if (ok > 0) toast.success(`Διαγράφηκαν ${ok} υποθέσεις`)
    if (fail > 0) toast.error(`${fail} αποτυχίες διαγραφής`)
    load()
  }

  const sortedCases = useMemo(() => sortCases(cases, sortCol, sortDir), [cases, sortCol, sortDir])

  const serviceTypes = filterOptions.service_types
  const availableStatuses = filterOptions.statuses

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Υποθέσεις</h1>
          <p className="text-sm text-gray-500">
            {cases.length} υποθέσεις
            {allCases.some(c => c.portal_case_number) && (
              <> · {allCases.filter(c => c.portal_case_number).length} 🔗 LOGISTIS Portal</>
            )}
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary gap-2 flex items-center">
          <PlusIcon className="w-4 h-4" /> Νέα Υπόθεση
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Αναζήτηση..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <MultiSelect
          label="Pipeline"
          options={PROGRAM_OPTIONS}
          value={filters.programs}
          onChange={v => setFilters(f => ({ ...f, programs: v }))}
          minWidth={160}
        />
        <MultiSelect
          label="Υπηρεσία"
          options={serviceTypes}
          value={filters.services}
          onChange={v => setFilters(f => ({ ...f, services: v }))}
          minWidth={180}
        />
        <MultiSelect
          label="Agent"
          options={agents.map(a => ({ value: String(a.id), label: a.full_name }))}
          value={filters.agentIds}
          onChange={v => setFilters(f => ({ ...f, agentIds: v }))}
          minWidth={160}
        />
        <MultiSelect
          label="Status"
          options={availableStatuses}
          value={filters.statuses}
          onChange={v => setFilters(f => ({ ...f, statuses: v }))}
          minWidth={180}
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={filters.deadline_alert} onChange={e => setFilters(f => ({ ...f, deadline_alert: e.target.checked }))} className="rounded" />
          Προθεσμίες 30 ημ.
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={filters.hide_completed} onChange={e => setFilters(f => ({ ...f, hide_completed: e.target.checked }))} className="rounded" />
          Απόκρυψη ολοκληρωμένων
        </label>
        <label className="flex items-center gap-2 text-sm text-orange-600 cursor-pointer select-none">
          <input type="checkbox" checked={filters.has_pending} onChange={e => setFilters(f => ({ ...f, has_pending: e.target.checked }))} className="rounded" />
          Έχουν εκκρεμότητες
        </label>
        <label className="flex items-center gap-2 text-sm text-red-600 cursor-pointer select-none">
          <input type="checkbox" checked={filters.sla_overdue} onChange={e => setFilters(f => ({ ...f, sla_overdue: e.target.checked }))} className="rounded" />
          SLA Overdue
        </label>
        <label className="flex items-center gap-2 text-sm text-rose-700 cursor-pointer select-none font-medium">
          <input type="checkbox" checked={filters.status_mismatch} onChange={e => setFilters(f => ({ ...f, status_mismatch: e.target.checked }))} className="rounded" />
          ⚠ Λάθος Κατάσταση
        </label>
        <label className="flex items-center gap-2 text-sm text-blue-600 cursor-pointer select-none">
          <input type="checkbox" checked={filters.has_documents} onChange={e => setFilters(f => ({ ...f, has_documents: e.target.checked }))} className="rounded" />
          Έχουν έγγραφα
        </label>
        <label className="flex items-center gap-2 text-sm text-purple-700 cursor-pointer select-none font-medium">
          <input type="checkbox" checked={filters.portal_only} onChange={e => setFilters(f => ({ ...f, portal_only: e.target.checked }))} className="rounded" />
          🔗 Μόνο LOGISTIS Portal
        </label>
        <button
          onClick={() => setFilters(f => ({ ...f, exclude_anakainizw: !f.exclude_anakainizw, programs: [] }))}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors whitespace-nowrap ${
            filters.exclude_anakainizw
              ? 'bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200'
              : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
          }`}
        >
          {filters.exclude_anakainizw ? '🏠 Χωρίς Ανακαινίζω' : '🏠 Εμφάνιση Ανακαινίζω'}
        </button>
      </div>

      {/* ── Bulk action bar ────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-30 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-xl">
          <div className="flex-1 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold shrink-0">
              {selectedIds.size}
            </span>
            <span className="text-sm font-medium">
              {selectedIds.size === 1 ? 'υπόθεση επιλεγμένη' : 'υποθέσεις επιλεγμένες'}
            </span>
          </div>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            Αποεπιλογή
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-2 text-sm font-semibold bg-red-500 hover:bg-red-600 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
          >
            <TrashIcon className="w-4 h-4" />
            {bulkDeleting ? 'Διαγραφή...' : `Διαγραφή ${selectedIds.size}`}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FolderOpenIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>Δεν βρέθηκαν υποθέσεις</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <button
                      onClick={toggleSelectAll}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        selectedIds.size === cases.length && cases.length > 0
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : selectedIds.size > 0
                          ? 'bg-blue-100 border-blue-400 text-blue-600'
                          : 'border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {selectedIds.size === cases.length && cases.length > 0
                        ? <CheckIcon className="w-3 h-3" />
                        : selectedIds.size > 0
                        ? <span className="w-2 h-0.5 bg-blue-600 rounded" />
                        : null}
                    </button>
                  </th>
                  <SortTh label="Επωνυμία" col="client_name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Πρόγραμμα" col="program_category" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Κατάσταση" col="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Εκκρεμότητες" col="pending_count" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Προθεσμία" col="days_to_deadline" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 tracking-wider whitespace-nowrap">Εργασίες</th>
                  <th className="px-3 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedCases.map(c => {
                  const urgent = c.days_to_deadline !== null && c.days_to_deadline <= 15 && c.days_to_deadline >= 0
                  const prog = livePipelines?.[c.program_category] || PIPELINES[c.program_category] || {}
                  const caseStatuses = [
                    ...(prog.phases || []).flatMap(p => p.statuses),
                    ...(prog.extra_statuses || []),
                  ]
                  const isSelected = selectedIds.has(c.id)
                  return (
                    <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-3 w-8" onClick={e => toggleSelect(e, c.id)}>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                          isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 hover:border-blue-400'
                        }`}>
                          {isSelected && <CheckIcon className="w-3 h-3" />}
                        </div>
                      </td>
                      <td className="px-3 py-3 max-w-[160px]">
                        <div className="flex items-center gap-1.5">
                          <div className="font-medium text-gray-900 truncate">{c.client_name}</div>
                          {c.portal_case_number && (
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-purple-600 text-white" title={`LOGISTIS Portal — Υπόθεση #${c.portal_case_number}`}>
                              🔗 LOGISTIS
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">{c.afm || '—'}</div>
                      </td>
                      <td className="px-3 py-3 max-w-[130px]">
                        <div className="text-xs text-gray-400 mb-0.5">{c.program_category || '—'}</div>
                        <div className="truncate text-xs text-gray-600">{c.service_type || '—'}</div>
                      </td>
                      <td className="px-3 py-3 max-w-[160px]">
                        <div className="flex items-center gap-1">
                          <div className="text-xs text-gray-700 truncate font-medium" title={c.status}>{c.status || '—'}</div>
                          {c.status_mismatch && (
                            <span title="Η κατάσταση δεν ανήκει στο πρόγραμμα αυτής της υπόθεσης" className="text-rose-500 text-xs shrink-0">⚠</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 max-w-[200px]">
                        {(c.pending_items_text || []).length > 0
                          ? <ul className="space-y-0.5">
                              {c.pending_items_text.map((text, i) => (
                                <li key={i} className="flex items-start gap-1 text-xs text-orange-700 leading-snug">
                                  <span className="text-orange-400 font-bold shrink-0 mt-px">•</span>
                                  <span>{text}</span>
                                </li>
                              ))}
                            </ul>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {c.project_deadline
                          ? <span className={`text-xs font-medium ${urgent ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                              {urgent ? `${c.days_to_deadline} ημ.` : new Date(c.project_deadline).toLocaleDateString('el-GR')}
                            </span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-3 py-3 max-w-[180px]">
                        {(c.open_task_titles || []).length > 0
                          ? <ul className="space-y-0.5">
                              {c.open_task_titles.map((title, i) => (
                                <li key={i} className="flex items-start gap-1 text-xs text-blue-700 leading-snug">
                                  <span className="text-blue-400 font-bold shrink-0 mt-px">•</span>
                                  <span>{title}</span>
                                </li>
                              ))}
                            </ul>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <QuickActions caseRow={c} allStatuses={caseStatuses} onUpdated={load} />
                          <button onClick={e => handleDelete(e, c.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNew && <NewCaseModal agents={agents} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />}
    </div>
  )
}
