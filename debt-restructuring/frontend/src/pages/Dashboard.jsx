import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { format, differenceInDays } from 'date-fns'
import { el } from 'date-fns/locale'
import { MagnifyingGlassIcon, PlusIcon, DocumentDuplicateIcon, TrashIcon, EyeIcon, PencilIcon, LinkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import * as api from '../api'
import { fmt } from '../utils/calculations'

const EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA', 'HARIS']

const STATUS_LABELS = {
  draft: { label: 'Πρόχειρο', cls: 'bg-gray-100 text-gray-700' },
  submitted: { label: 'Υποβλήθηκε', cls: 'bg-blue-100 text-blue-700' },
  in_review: { label: 'Υπό Εξέταση', cls: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Ολοκληρώθηκε', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Ακυρώθηκε', cls: 'bg-red-100 text-red-700' },
}

const CONTACT_STAGE_CONFIG = {
  'Νέα Ανάλυση': { cls: 'bg-gray-100 text-gray-600', icon: '📋' },
  'Εστάλη Σύνδεσμος': { cls: 'bg-blue-100 text-blue-700', icon: '🔗' },
  'Θετική Ανταπόκριση': { cls: 'bg-green-100 text-green-700', icon: '✅' },
  'Σε Διαπραγμάτευση': { cls: 'bg-yellow-100 text-yellow-700', icon: '💬' },
  'Έκλεισε': { cls: 'bg-emerald-100 text-emerald-800', icon: '🏆' },
  'Δεν Ενδιαφέρεται': { cls: 'bg-red-100 text-red-700', icon: '❌' },
}

const SCENARIO_LABELS = {
  0: { label: 'ΝΠ', cls: 'bg-purple-100 text-purple-700' },
  1: { label: 'Σενάριο 1 ✅', cls: 'bg-green-100 text-green-700' },
  2: { label: 'Σενάριο 2 💰', cls: 'bg-yellow-100 text-yellow-700' },
  3: { label: 'Σενάριο 3 ⚖️', cls: 'bg-orange-100 text-orange-700' },
  4: { label: 'Σενάριο 4 🏠', cls: 'bg-blue-100 text-blue-700' },
  5: { label: 'Σενάριο 5 🏠💰', cls: 'bg-indigo-100 text-indigo-700' },
}

const TERMINAL_STAGES = new Set(['Έκλεισε', 'Δεν Ενδιαφέρεται'])

function needsAttention(c) {
  const stage = c.contact_stage || 'Νέα Ανάλυση'
  if (TERMINAL_STAGES.has(stage)) return false
  if (!c.last_contacted_at) return stage !== 'Νέα Ανάλυση'
  return differenceInDays(new Date(), new Date(c.last_contacted_at)) >= 3
}

export default function Dashboard({ currentEmployee }) {
  const navigate = useNavigate()
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showFunnel, setShowFunnel] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterEmployee) params.employee = filterEmployee
      if (filterStatus) params.status = filterStatus
      if (search) params.search = search
      const res = await api.listCases(params)
      setCases(res.data)
    } catch {
      toast.error('Σφάλμα φόρτωσης')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterEmployee, filterStatus, search])

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Διαγραφή υπόθεσης "${name}";`)) return
    try {
      await api.deleteCase(id)
      toast.success('Διαγράφηκε')
      load()
    } catch { toast.error('Σφάλμα διαγραφής') }
  }

  const handleDuplicate = async (id) => {
    try {
      const res = await api.duplicateCase(id)
      toast.success('Δημιουργήθηκε αντίγραφο')
      navigate(`/cases/${res.data.id}/edit`)
    } catch { toast.error('Σφάλμα αντιγραφής') }
  }

  const copyShareLink = (token) => {
    const url = `${window.location.origin}/preview/${token}`
    navigator.clipboard.writeText(url).then(() => toast.success('Σύνδεσμος αντιγράφηκε!')).catch(() => toast.error('Αδύνατη αντιγραφή'))
  }

  const statusSummary = cases.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {})

  const attentionCases = cases.filter(needsAttention)

  // Sales funnel counts
  const funnelCounts = Object.keys(CONTACT_STAGE_CONFIG).reduce((acc, k) => {
    acc[k] = cases.filter((c) => (c.contact_stage || 'Νέα Ανάλυση') === k).length
    return acc
  }, {})

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-blue-800">Υποθέσεις Οφειλών</h1>
          <p className="text-gray-500 text-sm mt-0.5">{cases.length} υποθέσεις συνολικά</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary gap-2 text-sm"
            onClick={() => setShowFunnel((v) => !v)}
          >
            📊 {showFunnel ? 'Κρύψε' : 'Pipeline'}
          </button>
          <button className="btn-primary gap-2" onClick={() => navigate('/cases/new')}>
            <PlusIcon className="w-4 h-4" /> Νέα Υπόθεση
          </button>
        </div>
      </div>

      {/* Sales Funnel */}
      {showFunnel && (
        <div className="card mb-6">
          <h2 className="font-bold text-gray-700 mb-3">🏷️ Pipeline Πωλήσεων</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {Object.entries(CONTACT_STAGE_CONFIG).map(([stage, { cls, icon }]) => (
              <div key={stage} className={`rounded-xl p-3 text-center ${cls}`}>
                <div className="text-xl mb-1">{icon}</div>
                <div className="text-2xl font-black">{funnelCounts[stage] || 0}</div>
                <div className="text-xs font-semibold mt-1 leading-tight">{stage}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Needs attention */}
      {attentionCases.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-600" />
            <span className="font-bold text-amber-800">{attentionCases.length} υποθέσεις χρειάζονται follow-up</span>
          </div>
          <div className="flex flex-col gap-2">
            {attentionCases.map((c) => {
              const stage = CONTACT_STAGE_CONFIG[c.contact_stage] || CONTACT_STAGE_CONFIG['Νέα Ανάλυση']
              const daysSince = c.last_contacted_at
                ? differenceInDays(new Date(), new Date(c.last_contacted_at))
                : null
              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div>
                    <span className="font-semibold text-gray-800">{c.client_name}</span>
                    {c.client_phone && <span className="text-xs text-gray-400 ml-2">{c.client_phone}</span>}
                    {c.notes && <span className="text-xs text-gray-500 ml-2 italic">— {c.notes}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stage.cls}`}>
                      {stage.icon} {c.contact_stage || 'Νέα Ανάλυση'}
                    </span>
                    <span className="text-xs text-amber-600 font-semibold">
                      {daysSince === null ? 'Δεν έχει σταλεί' : `${daysSince}ημ. χωρίς επαφή`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {Object.entries(STATUS_LABELS).map(([key, { label, cls }]) => (
          <button
            key={key}
            onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
            className={`card text-center cursor-pointer hover:shadow-md transition-shadow ${filterStatus === key ? 'ring-2 ring-blue-500' : ''}`}
          >
            <div className="text-2xl font-black text-blue-800">{statusSummary[key] || 0}</div>
            <div className={`text-xs font-semibold mt-1 px-2 py-0.5 rounded-full ${cls} inline-block`}>{label}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Αναζήτηση πελάτη…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto min-w-[140px]" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}>
          <option value="">Όλοι οι υπάλληλοι</option>
          {EMPLOYEES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select className="input w-auto min-w-[140px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Όλες οι καταστάσεις</option>
          {Object.entries(STATUS_LABELS).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
        </select>
        {(filterEmployee || filterStatus || search) && (
          <button className="btn-secondary text-xs" onClick={() => { setFilterEmployee(''); setFilterStatus(''); setSearch('') }}>
            Καθαρισμός
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-x-auto">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Φόρτωση…</div>
        ) : cases.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <div className="text-4xl mb-3">📂</div>
            <div className="font-semibold">Δεν βρέθηκαν υποθέσεις</div>
            <button className="btn-primary mt-4" onClick={() => navigate('/cases/new')}>Νέα Υπόθεση</button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th text-left pl-4">Πελάτης</th>
                <th className="th">Υπάλληλος</th>
                <th className="th">Κατάσταση</th>
                <th className="th">Pipeline</th>
                <th className="th">Εκτ. Οφειλή</th>
                <th className="th">Εκτ. Διαγραφή</th>
                <th className="th">Εκτ. Δόση</th>
                <th className="th">Ημ/νία</th>
                <th className="th">Ενέργειες</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const est = c.estimates || {}
                const st = STATUS_LABELS[c.status] || STATUS_LABELS.draft
                const hasActuals = !!c.actual_results
                const stageKey = c.contact_stage || 'Νέα Ανάλυση'
                const stageCfg = CONTACT_STAGE_CONFIG[stageKey] || CONTACT_STAGE_CONFIG['Νέα Ανάλυση']
                const attention = needsAttention(c)
                return (
                  <tr key={c.id} className={`hover:bg-blue-50 transition-colors ${attention ? 'bg-amber-50/40' : ''}`}>
                    <td className="td text-left pl-4">
                      <div className="font-semibold text-blue-900">{c.client_name}</div>
                      {c.client_phone && <div className="text-xs text-gray-500">{c.client_phone}</div>}
                      {hasActuals && <div className="text-xs text-green-600 font-semibold mt-0.5">✓ Αποτέλεσμα</div>}
                      {attention && <div className="text-xs text-amber-600 font-semibold mt-0.5">⚡ Follow-up</div>}
                      {c.portal_visit_count > 0 && <div className="text-xs text-indigo-600 font-semibold mt-0.5">👁 {c.portal_visit_count} επίσκεψη{c.portal_visit_count !== 1 ? 'εις' : ''}</div>}
                    </td>
                    <td className="td">
                      <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">{c.employee}</span>
                    </td>
                    <td className="td">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="td">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${stageCfg.cls}`}>
                        {stageCfg.icon} {stageKey}
                      </span>
                    </td>
                    <td className="td font-mono text-sm">{est.sumDebt ? fmt(est.sumDebt) : '—'}</td>
                    <td className="td font-mono text-sm text-orange-600">{est.sumWr ? fmt(est.sumWr) : '—'}</td>
                    <td className="td font-mono text-sm text-blue-700">{est.totalMonthlyPay ? fmt(est.totalMonthlyPay) : '—'}</td>
                    <td className="td text-xs text-gray-500">
                      {c.created_at ? format(new Date(c.created_at), 'dd/MM/yy', { locale: el }) : '—'}
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-center gap-1">
                        <button title="Προβολή" onClick={() => navigate(`/cases/${c.id}`)} className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-700">
                          <EyeIcon className="w-4 h-4" />
                        </button>
                        <button title="Επεξεργασία" onClick={() => navigate(`/cases/${c.id}/edit`)} className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-700">
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button title="Αντίγραφο" onClick={() => handleDuplicate(c.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
                          <DocumentDuplicateIcon className="w-4 h-4" />
                        </button>
                        <button title="Σύνδεσμος πελάτη" onClick={() => copyShareLink(c.share_token)} className="p-1.5 rounded-lg hover:bg-green-100 text-green-700">
                          <LinkIcon className="w-4 h-4" />
                        </button>
                        <button title="Διαγραφή" onClick={() => handleDelete(c.id, c.client_name)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-600">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
