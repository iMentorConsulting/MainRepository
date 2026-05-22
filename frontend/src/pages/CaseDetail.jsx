import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { PIPELINES } from '../pipelines'
import { getPipelines } from '../api'
import PaymentsTab from '../components/PaymentsTab'
import MessagesTab from '../components/MessagesTab'
import DocumentsTab from '../components/DocumentsTab'
import BudgetTab from '../components/BudgetTab'
import PendingItemsTab from '../components/PendingItemsTab'
import ModificationsTab from '../components/ModificationsTab'
import AnakainizwTab from './AnakainizwTab'
import {
  ArrowLeftIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  ClockIcon,
  UserIcon,
  PaperAirplaneIcon,
  DocumentArrowUpIcon,
  DocumentIcon,
  CurrencyEuroIcon,
  ChartBarIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import {
  getCase,
  updateCase,
  getUsers,
  createTask,
  updateTask,
  deleteTask,
  getPayments,
  createPayment,
  deletePayment,
  getMessages,
  createMessage,
  deleteMessage,
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  getBudgetCategories,
  createBudgetCategory,
  updateBudgetCategory,
  deleteBudgetCategory,
  togglePortal,
  regeneratePortalToken,
} from '../api'

// ─── Constants ────────────────────────────────────────────────────────────────

let _cachedPipelines = null

function getStatusGroupsForProgram(program, livePipelines) {
  const source = livePipelines || _cachedPipelines || PIPELINES
  const pipeline = source[program] || source['ΕΣΠΑ'] || PIPELINES[program] || PIPELINES['ΕΣΠΑ']
  return pipeline.phases.map(p => ({
    label: p.label,
    statuses: p.statuses,
  })).concat(
    pipeline.extra_statuses?.length
      ? [{ label: 'Άλλες', statuses: pipeline.extra_statuses }]
      : []
  )
}

const BASE_TABS = [
  'Επισκόπηση',
  'Εκκρεμότητες',
  'Tasks',
  'Τροποποιήσεις',
  'Μηνύματα',
  'Έγγραφα',
  'Προϋπολογισμός',
  'Portal',
]
const getTabs = (programCategory) =>
  programCategory === 'ΑΝΑΚΑΙΝΙΖΩ'
    ? ['Επισκόπηση', 'Ανακαινίζω', 'Εκκρεμότητες', 'Tasks', 'Τροποποιήσεις', 'Μηνύματα', 'Έγγραφα', 'Προϋπολογισμός', 'Portal']
    : BASE_TABS

const PRIORITY_COLORS = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  normal: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-600',
}

const PRIORITY_LABELS = {
  urgent: 'Επείγον',
  high: 'Υψηλή',
  normal: 'Κανονική',
  low: 'Χαμηλή',
}

const TASK_STATUS_COLORS = {
  pending:             'bg-gray-100 text-gray-600',
  in_progress:         'bg-yellow-100 text-yellow-700',
  waiting_client:      'bg-orange-100 text-orange-700',
  waiting_third_party: 'bg-purple-100 text-purple-700',
  blocked:             'bg-red-100 text-red-700',
  review:              'bg-blue-100 text-blue-700',
  cancelled:           'bg-gray-200 text-gray-500',
  done:                'bg-green-100 text-green-700',
}

const TASK_STATUSES = [
  { value: 'pending',             label: 'Εκκρεμεί' },
  { value: 'in_progress',         label: 'Σε εξέλιξη' },
  { value: 'waiting_client',      label: 'Αναμονή πελάτη' },
  { value: 'waiting_third_party', label: 'Αναμονή τρίτου' },
  { value: 'blocked',             label: 'Μπλοκαρισμένο' },
  { value: 'review',              label: 'Προς έλεγχο' },
  { value: 'cancelled',           label: 'Ακυρώθηκε' },
  { value: 'done',                label: 'Ολοκληρώθηκε' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) =>
  new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(n || 0)

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('el-GR') : '—'

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormField({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

function ComingSoon({ tab }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
      <ClockIcon className="w-12 h-12 mb-3 opacity-40" />
      <p className="text-lg font-medium">{tab}</p>
      <p className="text-sm mt-1">Σύντομα διαθέσιμο</p>
    </div>
  )
}

// ─── ΔΥΠΑ Milestone Timeline (internal) ──────────────────────────────────────

function DypaMilestoneTimeline({ startDate }) {
  if (!startDate) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-xs text-yellow-700">
        <span className="font-semibold">Α Ορόσημο δεν έχει οριστεί.</span> Ορίστε την ημερομηνία Α Ορόσημο στο πεδίο παραπάνω.
      </div>
    )
  }

  const addMonths = (base, n) => {
    const d = new Date(base)
    d.setMonth(d.getMonth() + n)
    return d
  }

  const milestoneA = new Date(startDate)
  const milestoneB = addMonths(startDate, 6)
  const milestoneC = addMonths(startDate, 12)
  const today = new Date()

  const totalMs = milestoneC - milestoneA
  const elapsedMs = today - milestoneA
  const todayPct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100))

  const phase = today < milestoneA ? 'before'
    : today < milestoneB ? 'AB'
    : today < milestoneC ? 'BC'
    : 'after'

  const milestones = [
    { key: 'A', label: 'Α', sublabel: 'Έναρξη', date: milestoneA, pct: 0, dot: 'bg-blue-500', text: 'text-blue-700' },
    { key: 'B', label: 'Β', sublabel: '+6μ', date: milestoneB, pct: 50, dot: 'bg-yellow-500', text: 'text-yellow-700' },
    { key: 'C', label: 'Γ', sublabel: '+12μ', date: milestoneC, pct: 100, dot: 'bg-green-500', text: 'text-green-700' },
  ]

  const fmtD = (d) => d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div className="bg-white rounded-xl border p-5 space-y-3">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Χρονοδιάγραμμα Ορόσημων ΔΥΠΑ</h3>

      {/* Timeline bar */}
      <div className="relative pt-1 pb-10">
        <div className="relative h-3 bg-gray-100 rounded-full">
          <div
            className="absolute left-0 top-0 h-3 rounded-full bg-gradient-to-r from-blue-400 via-yellow-400 to-green-400"
            style={{ width: `${todayPct}%` }}
          />
          {milestones.map(m => (
            <div
              key={m.key}
              className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow z-10 ${m.dot}`}
              style={{ left: `calc(${m.pct}% - 10px)` }}
            />
          ))}
          {phase !== 'before' && phase !== 'after' && (
            <div className="absolute top-1/2 -translate-y-1/2 z-20" style={{ left: `calc(${todayPct}% - 8px)` }}>
              <div className="w-4 h-4 bg-white border-2 border-[#1e3a5f] rounded-full shadow-lg flex items-center justify-center">
                <div className="w-2 h-2 bg-[#1e3a5f] rounded-full" />
              </div>
            </div>
          )}
        </div>
        {milestones.map(m => (
          <div
            key={m.key}
            className="absolute top-6 flex flex-col items-center"
            style={{ left: `${m.pct}%`, transform: m.pct === 0 ? 'none' : m.pct === 100 ? 'translateX(-100%)' : 'translateX(-50%)' }}
          >
            <span className={`text-xs font-bold ${m.text}`}>{m.label} Ορόσημο</span>
            <span className="text-xs text-gray-400">{m.sublabel}</span>
            <span className="text-xs text-gray-600 font-medium">{fmtD(m.date)}</span>
          </div>
        ))}
      </div>

      {/* Today info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3 h-3 rounded-full border-2 border-[#1e3a5f] bg-white flex-shrink-0" />
          <span>Σήμερα <span className="font-semibold text-gray-800">{fmtD(today)}</span></span>
        </div>
        <div className="flex-1 border-t border-dashed border-gray-200" />
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          phase === 'before' ? 'bg-blue-50 text-blue-700' :
          phase === 'AB'     ? 'bg-yellow-50 text-yellow-700' :
          phase === 'BC'     ? 'bg-orange-50 text-orange-700' :
                               'bg-green-50 text-green-700'
        }`}>
          {phase === 'before' ? `Β Ορόσημο σε ${Math.ceil((milestoneB - today) / 86400000)} ημέρες` :
           phase === 'AB'     ? `Β Ορόσημο σε ${Math.ceil((milestoneB - today) / 86400000)} ημέρες` :
           phase === 'BC'     ? `Γ Ορόσημο σε ${Math.ceil((milestoneC - today) / 86400000)} ημέρες` :
                                `Γ Ορόσημο ολοκληρώθηκε ✓`}
        </span>
      </div>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ caseData, users, onSaved, livePipelines }) {
  const [form, setForm] = useState({
    client_name: '',
    phone: '',
    email: '',
    afm: '',
    accountant: '',
    sale_date: '',
    service_type: '',
    status: '',
    approved_budget: '',
    subsidy_percent: '',
    project_deadline: '',
    approval_date: '',
    agreed_fee_application: '',
    agreed_fee_implementation: '',
    assigned_agent_id: '',
    drive_folder_url: '',
    notes: '',
    dypa_start_date: '',
  })
  const [saving, setSaving] = useState(false)

  // Populate form when caseData arrives / changes
  useEffect(() => {
    if (!caseData) return
    setForm({
      client_name: caseData.client_name || '',
      phone: caseData.phone || '',
      email: caseData.email || '',
      afm: caseData.afm || '',
      accountant: caseData.accountant || '',
      sale_date: caseData.sale_date || '',
      service_type: caseData.service_type || '',
      status: caseData.status || '',
      approved_budget: caseData.approved_budget ?? '',
      subsidy_percent: caseData.subsidy_percent ?? '',
      project_deadline: caseData.project_deadline || '',
      approval_date: caseData.approval_date || '',
      dypa_start_date: caseData.dypa_start_date || '',
      agreed_fee_application: caseData.agreed_fee_application ?? '',
      agreed_fee_implementation: caseData.agreed_fee_implementation ?? '',
      assigned_agent_id: caseData.assigned_agent_id ?? '',
      drive_folder_url: caseData.drive_folder_url || '',
      notes: caseData.notes || '',
    })
  }, [caseData])

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...form }
      for (const k of [
        'approved_budget',
        'subsidy_percent',
        'agreed_fee_application',
        'agreed_fee_implementation',
      ])
        payload[k] = payload[k] !== '' ? parseFloat(payload[k]) : 0
      for (const k of ['sale_date', 'project_deadline', 'approval_date', 'dypa_start_date'])
        if (!payload[k]) payload[k] = null
      payload.assigned_agent_id = payload.assigned_agent_id
        ? parseInt(payload.assigned_agent_id)
        : null
      const updated = await updateCase(caseData.id, payload)
      toast.success('Αποθηκεύτηκε')
      onSaved(updated)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  // Financial summary
  const totalAgreed =
    (parseFloat(form.agreed_fee_application) || 0) +
    (parseFloat(form.agreed_fee_implementation) || 0)
  const totalPaid = caseData?.total_paid || 0
  const balance = totalAgreed - totalPaid
  const paidPct = totalAgreed > 0 ? Math.min(100, (totalPaid / totalAgreed) * 100) : 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left — editable form */}
      <div className="lg:col-span-2 bg-white rounded-xl border p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Στοιχεία Υπόθεσης
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <FormField label="Επωνυμία Πελάτη">
              <input className="input" value={form.client_name} onChange={set('client_name')} />
            </FormField>
          </div>

          <FormField label="Τηλέφωνο">
            <input className="input" value={form.phone} onChange={set('phone')} />
          </FormField>

          <FormField label="Email">
            <input className="input" type="email" value={form.email} onChange={set('email')} />
          </FormField>

          <FormField label="ΑΦΜ">
            <input className="input" value={form.afm} onChange={set('afm')} />
          </FormField>

          <FormField label="Λογιστής">
            <input className="input" value={form.accountant} onChange={set('accountant')} />
          </FormField>

          <FormField label="Ημ/νία Πώλησης">
            <input className="input" type="date" value={form.sale_date} onChange={set('sale_date')} />
          </FormField>

          <FormField label="Είδος Υπηρεσίας / Πρόγραμμα">
            <input className="input" value={form.service_type} onChange={set('service_type')} />
          </FormField>

          <div className="sm:col-span-2">
            <FormField label="Κατάσταση">
              <select className="input" value={form.status} onChange={set('status')}>
                {getStatusGroupsForProgram(caseData?.program_category || 'ΕΣΠΑ', livePipelines).map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.statuses.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Ύψος Επένδυσης (€)">
            <input
              className="input"
              type="number"
              step="0.01"
              value={form.approved_budget}
              onChange={set('approved_budget')}
            />
          </FormField>

          <FormField label="% Επιχορήγησης">
            <input
              className="input"
              type="number"
              step="0.1"
              value={form.subsidy_percent}
              onChange={set('subsidy_percent')}
            />
          </FormField>

          <FormField label="Προθεσμία Ολοκλήρωσης">
            <input
              className="input"
              type="date"
              value={form.project_deadline}
              onChange={set('project_deadline')}
            />
          </FormField>

          <FormField label="Ημ/νία Έγκρισης">
            <input
              className="input"
              type="date"
              value={form.approval_date}
              onChange={set('approval_date')}
            />
          </FormField>

          {caseData?.program_category === 'ΔΥΠΑ' && (
            <FormField label="Α Ορόσημο ΔΥΠΑ (Έγκριση / Έναρξη Επιχ.)">
              <input
                className="input"
                type="date"
                value={form.dypa_start_date}
                onChange={set('dypa_start_date')}
              />
            </FormField>
          )}

          <FormField label="Ποσό Αίτησης (€)">
            <input
              className="input"
              type="number"
              step="0.01"
              value={form.agreed_fee_application}
              onChange={set('agreed_fee_application')}
            />
          </FormField>

          <FormField label="Ποσό Υλοποίησης (€)">
            <input
              className="input"
              type="number"
              step="0.01"
              value={form.agreed_fee_implementation}
              onChange={set('agreed_fee_implementation')}
            />
          </FormField>

          <div className="sm:col-span-2">
            <FormField label="Agent">
              <select
                className="input"
                value={form.assigned_agent_id}
                onChange={set('assigned_agent_id')}
              >
                <option value="">— Επιλέξτε —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="sm:col-span-2">
            <FormField label="Σύνδεσμος Φακέλου Drive">
              <div className="flex gap-2 items-center">
                <input className="input flex-1" value={form.drive_folder_url} onChange={set('drive_folder_url')} placeholder="https://drive.google.com/... ή G:\Το Drive μου\..." />
                {form.drive_folder_url && (
                  <button
                    type="button"
                    onClick={() => {
                      const raw = form.drive_folder_url.trim()
                      // Web URL — open directly
                      if (/^https?:\/\//i.test(raw)) { window.open(raw, '_blank'); return }
                      // Windows local path — convert to file:// URL
                      const normalized = raw.replace(/\\/g, '/')
                      const fileUrl = /^[a-zA-Z]:\//.test(normalized)
                        ? 'file:///' + normalized.split('/').map(encodeURIComponent).join('/')
                        : raw
                      const w = window.open(fileUrl, '_blank')
                      if (!w) {
                        navigator.clipboard.writeText(raw).then(() =>
                          toast.success('Το path αντιγράφηκε — επικολλήστε το στον Explorer')
                        )
                      }
                    }}
                    className="shrink-0 text-blue-600 hover:text-blue-800 text-xs underline"
                  >
                    Άνοιγμα ↗
                  </button>
                )}
              </div>
            </FormField>
          </div>

          <div className="sm:col-span-2">
            <FormField label="Σημειώσεις">
              <textarea
                className="input"
                rows={3}
                value={form.notes}
                onChange={set('notes')}
              />
            </FormField>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary min-w-32"
          >
            {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
          </button>
        </div>
      </div>

      {/* Right — financial summary */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Οικονομική Σύνοψη
          </h3>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Συμφωνηθείσα Αμοιβή</span>
              <span className="font-semibold text-gray-900">{fmt(totalAgreed)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Πληρωμένο</span>
              <span className="font-semibold text-green-600">{fmt(totalPaid)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Υπόλοιπο</span>
              <span
                className={`font-bold text-lg ${
                  balance > 0.01 ? 'text-orange-600' : 'text-green-600'
                }`}
              >
                {balance > 0.01 ? fmt(balance) : 'Εξοφλήθηκε'}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Πρόοδος Πληρωμών</span>
              <span>{paidPct.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${paidPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* ΔΥΠΑ milestone timeline */}
        {caseData?.program_category === 'ΔΥΠΑ' && (
          <DypaMilestoneTimeline startDate={form.dypa_start_date || caseData?.dypa_start_date} />
        )}

        {/* Quick info card */}
        <div className="bg-white rounded-xl border p-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Γρήγορη Πληροφορία
          </h3>
          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Ύψος Επένδυσης</span>
              <span className="font-medium">{fmt(form.approved_budget)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Επιχορήγηση</span>
              <span className="font-medium">
                {form.subsidy_percent ? `${form.subsidy_percent}%` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Προθεσμία</span>
              <span className="font-medium">{fmtDate(form.project_deadline)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Ημ. Έγκρισης</span>
              <span className="font-medium">{fmtDate(form.approval_date)}</span>
            </div>
            {caseData?.program_category === 'ΔΥΠΑ' && (
              <div className="flex justify-between border-t pt-2">
                <span className="text-gray-500">Α Ορόσημο</span>
                <span className="font-medium text-blue-700">{fmtDate(form.dypa_start_date)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────

const EMPTY_TASK = { title: '', priority: 'normal', assigned_to: '', due_date: '', notes: '' }

function TaskEditModal({ task, users, onSave, onClose }) {
  const [form, setForm] = useState({
    title: task.title || '',
    priority: task.priority || 'normal',
    status: task.status || 'pending',
    assigned_to: task.assigned_to || '',
    due_date: task.due_date || '',
    notes: task.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const setF = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Ο τίτλος είναι υποχρεωτικός'); return }
    setSaving(true)
    try {
      await onSave({
        title: form.title.trim(),
        priority: form.priority,
        status: form.status,
        assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
        due_date: form.due_date || null,
        notes: form.notes || null,
      })
      onClose()
    } catch { toast.error('Σφάλμα αποθήκευσης') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Επεξεργασία Task</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="label">Τίτλος *</label>
            <input className="input" value={form.title} onChange={setF('title')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Κατάσταση</label>
              <select className="input" value={form.status} onChange={setF('status')}>
                {TASK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Προτεραιότητα</label>
              <select className="input" value={form.priority} onChange={setF('priority')}>
                <option value="urgent">Επείγον</option>
                <option value="high">Υψηλή</option>
                <option value="normal">Κανονική</option>
                <option value="low">Χαμηλή</option>
              </select>
            </div>
            <div>
              <label className="label">Ανατέθηκε σε</label>
              <select className="input" value={form.assigned_to} onChange={setF('assigned_to')}>
                <option value="">— Κανείς —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Προθεσμία</label>
              <input className="input" type="date" value={form.due_date} onChange={setF('due_date')} />
            </div>
          </div>
          <div>
            <label className="label">Σημειώσεις</label>
            <textarea className="input min-h-[80px] resize-y" value={form.notes} onChange={setF('notes')} placeholder="Σημειώσεις, οδηγίες, πλαίσιο..." />
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Άκυρο</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TasksTab({ caseId, users }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTask, setNewTask] = useState(EMPTY_TASK)
  const [adding, setAdding] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [showNewNotes, setShowNewNotes] = useState(false)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const { getTasks } = await import('../api')
      const data = await getTasks(caseId)
      setTasks(data)
    } catch {
      toast.error('Σφάλμα φόρτωσης tasks')
    } finally {
      setLoading(false)
    }
  }, [caseId])

  useEffect(() => { loadTasks() }, [loadTasks])

  const setField = (key) => (e) => setNewTask((p) => ({ ...p, [key]: e.target.value }))

  const handleAdd = async () => {
    if (!newTask.title.trim()) { toast.error('Ο τίτλος είναι υποχρεωτικός'); return }
    setAdding(true)
    try {
      await createTask(caseId, {
        title: newTask.title.trim(),
        priority: newTask.priority,
        due_date: newTask.due_date || null,
        assigned_to: newTask.assigned_to ? parseInt(newTask.assigned_to) : null,
        notes: newTask.notes || null,
        status: 'pending',
      })
      toast.success('Προστέθηκε task')
      setNewTask(EMPTY_TASK)
      setShowNewNotes(false)
      loadTasks()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα προσθήκης')
    } finally {
      setAdding(false)
    }
  }

  const handleStatusChange = async (taskId, status) => {
    try {
      await updateTask(caseId, taskId, { status })
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)))
    } catch { toast.error('Σφάλμα ενημέρωσης') }
  }

  const handleEdit = async (taskId, payload) => {
    await updateTask(caseId, taskId, payload)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...payload } : t))
    toast.success('Αποθηκεύτηκε')
    loadTasks()
  }

  const handleDelete = async (taskId) => {
    if (!confirm('Διαγραφή task;')) return
    try {
      await deleteTask(caseId, taskId)
      toast.success('Διαγράφηκε')
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    } catch { toast.error('Σφάλμα διαγραφής') }
  }

  const getUserName = (id) => {
    if (!id) return '—'
    const u = users.find((u) => u.id === id)
    return u ? u.full_name : '—'
  }

  return (
    <div className="space-y-4">
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          users={users}
          onSave={(payload) => handleEdit(editingTask.id, payload)}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* Add task form */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Νέο Task</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="label">Τίτλος</label>
            <input className="input" placeholder="Τίτλος task..." value={newTask.title} onChange={setField('title')} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          </div>
          <div className="w-36">
            <label className="label">Προτεραιότητα</label>
            <select className="input" value={newTask.priority} onChange={setField('priority')}>
              <option value="urgent">Επείγον</option>
              <option value="high">Υψηλή</option>
              <option value="normal">Κανονική</option>
              <option value="low">Χαμηλή</option>
            </select>
          </div>
          <div className="w-44">
            <label className="label">Ανατέθηκε σε</label>
            <select className="input" value={newTask.assigned_to} onChange={setField('assigned_to')}>
              <option value="">— Κανείς —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div className="w-40">
            <label className="label">Προθεσμία</label>
            <input className="input" type="date" value={newTask.due_date} onChange={setField('due_date')} />
          </div>
          <button type="button" onClick={() => setShowNewNotes(v => !v)} className="self-end text-xs text-blue-500 hover:underline pb-2">
            {showNewNotes ? '− Σημειώσεις' : '+ Σημειώσεις'}
          </button>
          <button onClick={handleAdd} disabled={adding} className="btn-primary flex items-center gap-2 self-end">
            <PlusIcon className="w-4 h-4" />
            {adding ? 'Προσθήκη...' : 'Προσθήκη'}
          </button>
        </div>
        {showNewNotes && (
          <textarea className="input w-full min-h-[60px] resize-y" placeholder="Σημειώσεις..." value={newTask.notes} onChange={setField('notes')} />
        )}
      </div>

      {/* Task list */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <CheckCircleIcon className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm">Δεν υπάρχουν tasks</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {tasks.map((task) => (
              <div key={task.id} className="px-5 py-3 hover:bg-gray-50 transition-colors group">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Priority */}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.normal}`}>
                    {PRIORITY_LABELS[task.priority] || task.priority}
                  </span>
                  {/* Title */}
                  <span className={`flex-1 min-w-40 text-sm font-medium ${task.status === 'done' || task.status === 'cancelled' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                    {task.title}
                  </span>
                  {/* Assigned */}
                  <span className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
                    <UserIcon className="w-3.5 h-3.5" />
                    {getUserName(task.assigned_to)}
                  </span>
                  {/* Due date */}
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {task.due_date ? fmtDate(task.due_date) : '—'}
                  </span>
                  {/* Status */}
                  <select
                    className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer focus:ring-1 focus:ring-offset-1 ${TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.pending}`}
                    value={task.status}
                    onChange={(e) => handleStatusChange(task.id, e.target.value)}
                  >
                    {TASK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  {/* Edit */}
                  <button onClick={() => setEditingTask(task)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-500 transition-all" title="Επεξεργασία">
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  {/* Delete */}
                  <button onClick={() => handleDelete(task.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
                {/* Notes */}
                {task.notes && (
                  <p className="mt-1.5 ml-[calc(theme(spacing.6))] text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">{task.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Portal Tab ───────────────────────────────────────────────────────────────

function PortalTab({ caseData, onRefresh }) {
  const [loading, setLoading] = useState(false)
  const [regenLoading, setRegenLoading] = useState(false)
  const portalUrl = caseData?.share_token
    ? `${window.location.origin}/portal/${caseData.share_token}`
    : null
  const previewUrl = portalUrl ? `${portalUrl}?preview=1` : null

  const handleToggle = async () => {
    setLoading(true)
    try {
      await togglePortal(caseData.id)
      toast.success(caseData.portal_active ? 'Portal απενεργοποιήθηκε' : 'Portal ενεργοποιήθηκε')
      onRefresh()
    } catch {
      toast.error('Σφάλμα αλλαγής portal')
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerate = async () => {
    if (!confirm('Ο νέος σύνδεσμος θα αχρηστεύσει τον παλιό. Συνέχεια;')) return
    setRegenLoading(true)
    try {
      await regeneratePortalToken(caseData.id)
      toast.success('Νέος σύνδεσμος δημιουργήθηκε')
      onRefresh()
    } catch {
      toast.error('Σφάλμα ανανέωσης συνδέσμου')
    } finally {
      setRegenLoading(false)
    }
  }

  const copyLink = (url) => {
    navigator.clipboard.writeText(url)
    toast.success('Σύνδεσμος αντιγράφηκε!')
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Πύλη Πελάτη</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Ο πελάτης εισέρχεται με το ΑΦΜ του. Επισκέψεις μετράνε μόνο μετά από επαλήθευση ΑΦΜ.
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={loading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
              ${caseData?.portal_active ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                ${caseData?.portal_active ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className={`text-xs font-medium px-3 py-1.5 rounded-full w-fit
            ${caseData?.portal_active
              ? 'bg-green-100 text-green-700 border border-green-200'
              : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
            {caseData?.portal_active ? 'Ενεργό' : 'Ανενεργό'}
          </div>
          <span className="text-xs text-gray-500">
            Επισκέψεις πελάτη: <span className="font-semibold text-gray-700">{caseData?.portal_visit_count || 0}</span>
          </span>
        </div>
      </div>

      {portalUrl && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          {/* Client link */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h4 className="text-sm font-semibold text-gray-700">Σύνδεσμος Πελάτη</h4>
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">Απαιτεί ΑΦΜ</span>
            </div>
            <div className="flex items-center gap-2">
              <input readOnly value={portalUrl}
                className="flex-1 text-xs bg-gray-50 border rounded-lg px-3 py-2 text-gray-600 font-mono truncate" />
              <button onClick={() => copyLink(portalUrl)}
                className="flex-shrink-0 px-3 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Αντιγραφή
              </button>
            </div>
          </div>
          {/* Admin preview */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h4 className="text-sm font-semibold text-gray-700">Προεπισκόπηση (εσωτερικό)</h4>
              <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">Χωρίς ΑΦΜ · Δεν μετράει</span>
            </div>
            <div className="flex items-center gap-2">
              <input readOnly value={previewUrl}
                className="flex-1 text-xs bg-gray-50 border rounded-lg px-3 py-2 text-gray-500 font-mono truncate" />
              <button onClick={() => copyLink(previewUrl)}
                className="flex-shrink-0 px-3 py-2 text-xs bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                Αντιγραφή
              </button>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 px-3 py-2 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
                ↗
              </a>
            </div>
          </div>
          <button
            onClick={handleRegenerate}
            disabled={regenLoading}
            className="text-xs text-red-600 hover:text-red-800 underline"
          >
            {regenLoading ? 'Ανανέωση...' : 'Δημιουργία νέου συνδέσμου (ακυρώνει τον παλιό)'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CaseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [caseData, setCaseData] = useState(null)
  const [users, setUsers] = useState([])
  const [livePipelines, setLivePipelines] = useState(_cachedPipelines)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Επισκόπηση')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, u] = await Promise.all([getCase(id), getUsers()])
      setCaseData(c)
      setUsers(u)
    } catch {
      toast.error('Σφάλμα φόρτωσης υπόθεσης')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (!_cachedPipelines) {
      getPipelines().then(data => {
        _cachedPipelines = data
        setLivePipelines(data)
      }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCaseSaved = (updated) => {
    setCaseData(updated)
  }

  // Deadline warning
  const urgentDeadline =
    caseData?.days_to_deadline !== null &&
    caseData?.days_to_deadline !== undefined &&
    caseData.days_to_deadline >= 0 &&
    caseData.days_to_deadline < 15

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!caseData) {
    return (
      <div className="text-center py-24 text-gray-400">
        <p>Η υπόθεση δεν βρέθηκε.</p>
        <button
          onClick={() => navigate('/cases')}
          className="mt-4 btn-secondary"
        >
          Επιστροφή στις Υποθέσεις
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button
        onClick={() => navigate('/cases')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Πίσω στις Υποθέσεις
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              {caseData.client_name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-blue-100 text-blue-800">
                {caseData.status}
              </span>
              {caseData.service_type && (
                <span className="text-sm text-gray-500">
                  {caseData.service_type}
                </span>
              )}
              {caseData.assigned_agent_name && (
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <UserIcon className="w-3.5 h-3.5" />
                  {caseData.assigned_agent_name}
                </span>
              )}
            </div>
          </div>

          {/* Deadline warning */}
          {urgentDeadline && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 font-medium">
              <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
              Προθεσμία σε {caseData.days_to_deadline} ημέρ
              {caseData.days_to_deadline === 1 ? 'α' : 'ες'}!
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b bg-white rounded-t-xl overflow-hidden">
        <nav className="flex -mb-px overflow-x-auto">
          {getTabs(caseData?.program_category).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
              {tab === 'Εκκρεμότητες' && caseData?.pending_count > 0 && (
                <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                  {caseData.pending_count}
                </span>
              )}
              {tab === 'Έγγραφα' && (() => {
                const clientDocs = (caseData?.documents || []).filter(d => d.uploaded_by_client)
                return clientDocs.length > 0 ? (
                  <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white">
                    {clientDocs.length}
                  </span>
                ) : null
              })()}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'Επισκόπηση' && (
          <OverviewTab
            caseData={caseData}
            users={users}
            onSaved={handleCaseSaved}
            livePipelines={livePipelines}
          />
        )}

        {activeTab === 'Εκκρεμότητες' && (
          <PendingItemsTab caseId={id} caseData={caseData} />
        )}

        {activeTab === 'Tasks' && (
          <TasksTab caseId={id} users={users} />
        )}

        {activeTab === 'Ανακαινίζω' && <AnakainizwTab caseId={id} />}
        {activeTab === 'Τροποποιήσεις' && <ModificationsTab caseId={id} caseData={caseData} onRefresh={load} />}
        {activeTab === 'Μηνύματα' && <MessagesTab caseId={id} caseData={caseData} onRefresh={load} />}
        {activeTab === 'Έγγραφα' && <DocumentsTab caseId={id} caseData={caseData} onRefresh={load} />}
        {activeTab === 'Προϋπολογισμός' && <BudgetTab caseId={id} caseData={caseData} onRefresh={load} />}
        {activeTab === 'Portal' && <PortalTab caseData={caseData} onRefresh={load} />}
      </div>
    </div>
  )
}
