import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCases, getUsers, deleteCase, createCase } from '../api'
import { MagnifyingGlassIcon, PlusIcon, TrashIcon, FolderOpenIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const STATUSES = [
  'ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ',
  'ΕΓΚΡΙΣΗ - ΠΡΙΝ ΤΟ 1ο ΑΙΤΗΜΑ',
  'ΣΕ 1ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ',
  'ΣΕ 2ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ',
  'ΕΝΣΤΑΣΗ',
  'ΣΕ ΤΕΛΙΚΟ ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ',
]

const STATUS_COLORS = {
  'ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ': 'bg-blue-100 text-blue-800',
  'ΕΓΚΡΙΣΗ - ΠΡΙΝ ΤΟ 1ο ΑΙΤΗΜΑ': 'bg-green-100 text-green-800',
  'ΣΕ 1ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ': 'bg-yellow-100 text-yellow-800',
  'ΣΕ 2ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ': 'bg-orange-100 text-orange-800',
  'ΕΝΣΤΑΣΗ': 'bg-red-100 text-red-800',
  'ΣΕ ΤΕΛΙΚΟ ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ': 'bg-purple-100 text-purple-800',
}

const fmt = (n) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n || 0)

function NewCaseModal({ agents, onClose, onSaved }) {
  const [form, setForm] = useState({
    client_name: '', phone: '', email: '', afm: '', accountant: '',
    sale_date: '', service_type: '', status: 'ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ',
    approved_budget: '', subsidy_percent: '', project_deadline: '', approval_date: '',
    agreed_fee_application: '', agreed_fee_implementation: '',
    assigned_agent_id: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

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
            <div><label className="label">Είδος Υπηρεσίας / Πρόγραμμα</label><input className="input" {...f('service_type')} /></div>
            <div>
              <label className="label">Κατάσταση</label>
              <select className="input" {...f('status')}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
            </div>
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
  const [cases, setCases] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: '', agent_id: '', service_type: '', deadline_alert: false })
  const [showNew, setShowNew] = useState(false)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (filters.status) params.status = filters.status
      if (filters.agent_id) params.agent_id = filters.agent_id
      if (filters.service_type) params.service_type = filters.service_type
      if (filters.deadline_alert) params.deadline_alert = true
      setCases(await getCases(params))
    } catch { toast.error('Σφάλμα φόρτωσης') }
    finally { setLoading(false) }
  }, [search, filters])

  useEffect(() => { load() }, [load])
  useEffect(() => { getUsers().then(setAgents).catch(() => {}) }, [])

  const handleDelete = async (e, id) => {
    e.preventDefault(); e.stopPropagation()
    if (!confirm('Διαγραφή υπόθεσης;')) return
    try { await deleteCase(id); toast.success('Διαγράφηκε'); load() }
    catch { toast.error('Σφάλμα διαγραφής') }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Υποθέσεις</h1>
          <p className="text-sm text-gray-500">{cases.length} ενεργές υποθέσεις</p>
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
        <select className="input w-auto" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">Όλες οι Καταστάσεις</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input w-auto" value={filters.service_type} onChange={e => setFilters(f => ({ ...f, service_type: e.target.value }))}>
          <option value="">Όλα τα Προγράμματα</option>
          {[...new Set(cases.map(c => c.service_type).filter(Boolean))].sort().map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className="input w-auto" value={filters.agent_id} onChange={e => setFilters(f => ({ ...f, agent_id: e.target.value }))}>
          <option value="">Όλοι οι Agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={filters.deadline_alert} onChange={e => setFilters(f => ({ ...f, deadline_alert: e.target.checked }))} className="rounded" />
          Προθεσμίες 30 ημ.
        </label>
      </div>

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
                  {['Επωνυμία', 'Πρόγραμμα', 'Κατάσταση', 'Agent', 'Υπόλοιπο', 'Προθεσμία', 'Tasks', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cases.map(c => {
                  const urgent = c.days_to_deadline !== null && c.days_to_deadline <= 15 && c.days_to_deadline >= 0
                  return (
                    <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{c.client_name}</div>
                        <div className="text-xs text-gray-400">{c.afm || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-40">
                        <div className="truncate">{c.service_type || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-600'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.assigned_agent_name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {c.balance > 0.01
                          ? <span className="font-semibold text-orange-600">{fmt(c.balance)}</span>
                          : <span className="text-green-600 text-xs font-medium">Εξοφλήθηκε</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {c.project_deadline
                          ? <span className={`text-xs font-medium ${urgent ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                              {urgent ? `${c.days_to_deadline} ημ.` : new Date(c.project_deadline).toLocaleDateString('el-GR')}
                            </span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.open_tasks > 0
                          ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{c.open_tasks}</span>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={e => handleDelete(e, c.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <TrashIcon className="w-4 h-4" />
                        </button>
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
