import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getWorkLists, createWorkList, updateWorkList, deleteWorkList,
  getWorkListCases, getAllTasks, getServiceTypes, getPipelines,
} from '../api'
import {
  ClipboardDocumentListIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  XMarkIcon,
  ListBulletIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const PRIORITY_COLORS = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  normal: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
}
const PRIORITY_LABELS = { urgent: 'Επείγον', high: 'Υψηλή', normal: 'Κανονική', low: 'Χαμηλή' }
const TASK_STATUS_LABELS = {
  pending: 'Εκκρεμεί',
  in_progress: 'Σε εξέλιξη',
  waiting_client: 'Αναμονή πελάτη',
  done: 'Ολοκληρώθηκε',
}
const TASK_STATUS_COLORS = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  waiting_client: 'bg-purple-50 text-purple-700 border-purple-200',
  done: 'bg-green-50 text-green-700 border-green-200',
}

const PROGRAM_OPTIONS = ['ΕΣΠΑ', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ']

function DaysChip({ days }) {
  const color = days >= 30 ? 'bg-red-100 text-red-700' : days >= 14 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
  return <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{days}ημ.</span>
}

function MultiCheck({ label, options, selected, onChange }) {
  const all = selected.length === 0
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={all} onChange={() => onChange([])}
          className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f]" />
        <span className="text-gray-600">Όλα</span>
      </label>
      {options.map(o => (
        <label key={o} className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox"
            checked={selected.includes(o)}
            onChange={() => {
              const next = selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o]
              onChange(next)
            }}
            className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f]"
          />
          <span className="text-gray-700 truncate">{o}</span>
        </label>
      ))}
    </div>
  )
}

function WorkListModal({ wl, allServices, allStatuses, onSave, onClose }) {
  const isEdit = !!wl
  const [form, setForm] = useState({
    name: wl?.name || '',
    description: wl?.description || '',
    programs: wl?.programs || [],
    service_types: wl?.service_types || [],
    statuses: wl?.statuses || [],
    min_days_in_status: wl?.min_days_in_status ?? '',
    max_days_in_status: wl?.max_days_in_status ?? '',
    sort_order: wl?.sort_order ?? 0,
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Το όνομα είναι υποχρεωτικό'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        min_days_in_status: form.min_days_in_status !== '' ? parseInt(form.min_days_in_status) : null,
        max_days_in_status: form.max_days_in_status !== '' ? parseInt(form.max_days_in_status) : null,
      }
      const result = isEdit
        ? await updateWorkList(wl.id, payload)
        : await createWorkList(payload)
      onSave(result, isEdit)
    } catch {
      toast.error('Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Επεξεργασία Λίστας' : 'Νέα Λίστα Εργασιών'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Όνομα Λίστας *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="π.χ. ΕΣΠΑ σε καθυστέρηση > 30 ημέρες"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Περιγραφή (προαιρετικό)</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-1">
            <div className="bg-gray-50 rounded-xl p-4">
              <MultiCheck
                label="Πρόγραμμα"
                options={PROGRAM_OPTIONS}
                selected={form.programs}
                onChange={v => setForm(p => ({ ...p, programs: v }))}
              />
            </div>
            <div className="bg-gray-50 rounded-xl p-4 max-h-52 overflow-y-auto">
              <MultiCheck
                label="Υπηρεσία"
                options={allServices}
                selected={form.service_types}
                onChange={v => setForm(p => ({ ...p, service_types: v }))}
              />
            </div>
            <div className="bg-gray-50 rounded-xl p-4 max-h-52 overflow-y-auto">
              <MultiCheck
                label="Κατάσταση"
                options={allStatuses}
                selected={form.statuses}
                onChange={v => setForm(p => ({ ...p, statuses: v }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Ημέρες στην Κατάσταση</label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Από</span>
                <input
                  type="number"
                  min={0}
                  value={form.min_days_in_status}
                  onChange={e => setForm(p => ({ ...p, min_days_in_status: e.target.value }))}
                  placeholder="—"
                  className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Έως</span>
                <input
                  type="number"
                  min={0}
                  value={form.max_days_in_status}
                  onChange={e => setForm(p => ({ ...p, max_days_in_status: e.target.value }))}
                  placeholder="—"
                  className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                />
              </div>
              <span className="text-xs text-gray-400">Αφήστε κενό για χωρίς όριο</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              Άκυρο
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-[#1e3a5f] text-white rounded-xl text-sm font-semibold hover:bg-[#16305a] disabled:opacity-50">
              {saving ? 'Αποθήκευση...' : isEdit ? 'Αποθήκευση' : 'Δημιουργία'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function WorkListsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('tasks') // tasks | worklists
  const [workLists, setWorkLists] = useState([])
  const [selectedWL, setSelectedWL] = useState(null)
  const [wlCases, setWlCases] = useState([])
  const [wlLoading, setWlLoading] = useState(false)
  const [allTasks, setAllTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [taskFilter, setTaskFilter] = useState('')
  const [taskSearch, setTaskSearch] = useState('')
  const [allServices, setAllServices] = useState([])
  const [allStatuses, setAllStatuses] = useState([])
  const [modal, setModal] = useState(null) // null | 'create' | {wl}
  const [searchWL, setSearchWL] = useState('')
  const [caseSearch, setCaseSearch] = useState('')

  useEffect(() => {
    getWorkLists().then(setWorkLists).catch(() => {})
    // Load available services and statuses for modal
    getServiceTypes().then(d => setAllServices((d || []).sort((a, b) => a.localeCompare(b, 'el')))).catch(() => {})
    getPipelines().then(pipelines => {
      const statuses = new Set()
      Object.values(pipelines || {}).forEach(p => {
        (p.phases || []).forEach(ph => (ph.statuses || []).forEach(s => statuses.add(s)))
      })
      setAllStatuses([...statuses].sort((a, b) => a.localeCompare(b, 'el')))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab !== 'tasks') return
    setTasksLoading(true)
    getAllTasks().then(setAllTasks).catch(() => {}).finally(() => setTasksLoading(false))
  }, [tab])

  const loadWLCases = async (wl) => {
    setSelectedWL(wl)
    setWlLoading(true)
    setCaseSearch('')
    try {
      const data = await getWorkListCases(wl.id)
      setWlCases(data)
    } catch {
      toast.error('Σφάλμα φόρτωσης')
      setWlCases([])
    } finally {
      setWlLoading(false)
    }
  }

  const handleSaveWL = (result, isEdit) => {
    if (isEdit) {
      setWorkLists(prev => prev.map(w => w.id === result.id ? result : w))
      if (selectedWL?.id === result.id) loadWLCases(result)
      toast.success('Ενημερώθηκε')
    } else {
      setWorkLists(prev => [...prev, result])
      toast.success('Δημιουργήθηκε')
    }
    setModal(null)
  }

  const handleDelete = async (wl) => {
    if (!confirm(`Διαγραφή λίστας "${wl.name}";`)) return
    try {
      await deleteWorkList(wl.id)
      setWorkLists(prev => prev.filter(w => w.id !== wl.id))
      if (selectedWL?.id === wl.id) { setSelectedWL(null); setWlCases([]) }
      toast.success('Διαγράφηκε')
    } catch { toast.error('Σφάλμα') }
  }

  const filteredTasks = useMemo(() => {
    return allTasks.filter(t => {
      if (taskFilter && t.status !== taskFilter) return false
      if (taskSearch) {
        const q = taskSearch.toLowerCase()
        return t.title?.toLowerCase().includes(q) || t.case_name?.toLowerCase().includes(q)
      }
      return true
    })
  }, [allTasks, taskFilter, taskSearch])

  const filteredWLs = workLists.filter(w =>
    !searchWL || w.name.toLowerCase().includes(searchWL.toLowerCase())
  )

  const filteredCases = useMemo(() => {
    if (!caseSearch) return wlCases
    const q = caseSearch.toLowerCase()
    return wlCases.filter(c => c.client_name?.toLowerCase().includes(q) || c.service_type?.toLowerCase().includes(q))
  }, [wlCases, caseSearch])

  const criteriaLabel = (wl) => {
    const parts = []
    if (wl.programs?.length) parts.push(wl.programs.join(', '))
    if (wl.service_types?.length) parts.push(`${wl.service_types.length} υπηρεσίες`)
    if (wl.statuses?.length) parts.push(`${wl.statuses.length} καταστάσεις`)
    if (wl.min_days_in_status != null) parts.push(`≥${wl.min_days_in_status}ημ.`)
    if (wl.max_days_in_status != null) parts.push(`≤${wl.max_days_in_status}ημ.`)
    return parts.join(' · ') || 'Χωρίς φίλτρα (όλα)'
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardDocumentListIcon className="w-7 h-7 text-[#1e3a5f]" />
          Εκκρεμείς Εργασίες Συμβούλου
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Λίστα tasks και δυναμικές λίστες υποθέσεων βάσει κριτηρίων.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-gray-100">
        {[
          { key: 'tasks', label: 'Όλα τα Tasks', Icon: ListBulletIcon },
          { key: 'worklists', label: 'Λίστες Εργασιών', Icon: Squares2X2Icon },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              tab === key
                ? 'border-[#1e3a5f] text-[#1e3a5f]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {key === 'tasks' && allTasks.length > 0 && (
              <span className="bg-orange-100 text-orange-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {allTasks.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Όλα τα Tasks ── */}
      {tab === 'tasks' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Αναζήτηση task / υπόθεση..."
                value={taskSearch}
                onChange={e => setTaskSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1e3a5f]"
              />
            </div>
            <div className="flex gap-1">
              {[
                { value: '', label: 'Όλα' },
                { value: 'pending', label: 'Εκκρεμεί' },
                { value: 'in_progress', label: 'Σε εξέλιξη' },
                { value: 'waiting_client', label: 'Αναμονή πελάτη' },
              ].map(o => (
                <button
                  key={o.value}
                  onClick={() => setTaskFilter(o.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    taskFilter === o.value
                      ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <span className="text-sm text-gray-400 ml-auto">{filteredTasks.length} tasks</span>
          </div>

          {tasksLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Task', 'Υπόθεση', 'Κατάσταση Task', 'Προτεραιότητα', 'Ανατέθηκε', 'Προθεσμία'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTasks.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-400">Δεν βρέθηκαν tasks</td></tr>
                  )}
                  {filteredTasks.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{t.title}</div>
                        {t.notes && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{t.notes}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(`/cases/${t.case_id}`)}
                          className="text-[#1e3a5f] font-medium hover:underline text-sm"
                        >
                          {t.case_name}
                        </button>
                        {t.case_service && <div className="text-xs text-gray-400">{t.case_service}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${TASK_STATUS_COLORS[t.status] || ''}`}>
                          {TASK_STATUS_LABELS[t.status] || t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[t.priority] || ''}`}>
                          {PRIORITY_LABELS[t.priority] || t.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{t.assigned_name || '—'}</td>
                      <td className="px-4 py-3">
                        {t.due_date ? (
                          <span className={`text-xs font-medium ${new Date(t.due_date) < new Date() ? 'text-red-600' : 'text-gray-600'}`}>
                            {new Date(t.due_date).toLocaleDateString('el-GR')}
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Λίστες Εργασιών ── */}
      {tab === 'worklists' && (
        <div className="flex gap-5 items-start">
          {/* Left: list of work lists */}
          <div className="w-72 flex-shrink-0 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Αναζήτηση λίστας..."
                  value={searchWL}
                  onChange={e => setSearchWL(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <button
                onClick={() => setModal('create')}
                className="flex items-center gap-1 bg-[#1e3a5f] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#16305a]"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Νέα
              </button>
            </div>

            <div className="space-y-2">
              {filteredWLs.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  {workLists.length === 0
                    ? 'Δεν έχετε δημιουργήσει λίστες ακόμα.'
                    : 'Δεν βρέθηκαν λίστες'}
                </div>
              )}
              {filteredWLs.map(wl => (
                <div
                  key={wl.id}
                  onClick={() => loadWLCases(wl)}
                  className={`group p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedWL?.id === wl.id
                      ? 'border-[#1e3a5f] bg-blue-50'
                      : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="font-semibold text-sm text-gray-800 leading-tight flex-1">{wl.name}</div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); setModal(wl) }}
                        className="p-1 hover:bg-white rounded">
                        <PencilIcon className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleDelete(wl) }}
                        className="p-1 hover:bg-white rounded">
                        <TrashIcon className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 mt-1 leading-snug">{criteriaLabel(wl)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: cases for selected work list */}
          <div className="flex-1 min-w-0">
            {!selectedWL ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Squares2X2Icon className="w-12 h-12 mb-3 text-gray-200" />
                <p className="text-sm">Επιλέξτε μια λίστα για να δείτε τις υποθέσεις</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{selectedWL.name}</h2>
                    {selectedWL.description && <p className="text-sm text-gray-500">{selectedWL.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Αναζήτηση..."
                        value={caseSearch}
                        onChange={e => setCaseSearch(e.target.value)}
                        className="pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm w-44 focus:ring-2 focus:ring-[#1e3a5f]"
                      />
                    </div>
                    <span className="text-sm text-gray-400 whitespace-nowrap">
                      {filteredCases.length} υποθέσεις
                    </span>
                  </div>
                </div>

                {wlLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full" />
                  </div>
                ) : filteredCases.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-100">
                    <CheckCircleIcon className="w-10 h-10 text-green-300 mb-2" />
                    <p className="text-gray-400 text-sm">Δεν βρέθηκαν υποθέσεις για αυτά τα κριτήρια</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {['Πελάτης', 'Υπηρεσία', 'Κατάσταση', 'Ημέρες', 'Σύμβουλος', 'Τηλ.'].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredCases.map(c => (
                          <tr key={c.id}
                            onClick={() => navigate(`/cases/${c.id}`)}
                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3 font-medium text-gray-800">
                              {c.client_name}
                              <div className="text-xs text-gray-400">{c.program_category}</div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs max-w-[140px] truncate">{c.service_type || '—'}</td>
                            <td className="px-4 py-3 text-xs text-gray-600 max-w-[150px] truncate">{c.status}</td>
                            <td className="px-4 py-3">
                              <DaysChip days={c.days_in_status} />
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">{c.assigned_name || '—'}</td>
                            <td className="px-4 py-3">
                              {c.phone
                                ? <span className="font-mono text-xs text-gray-700">{c.phone}</span>
                                : <span className="text-gray-300 text-xs">—</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {modal && (
        <WorkListModal
          wl={modal === 'create' ? null : modal}
          allServices={allServices}
          allStatuses={allStatuses}
          onSave={handleSaveWL}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
