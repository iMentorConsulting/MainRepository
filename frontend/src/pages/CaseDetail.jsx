import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import PaymentsTab from '../components/PaymentsTab'
import MessagesTab from '../components/MessagesTab'
import DocumentsTab from '../components/DocumentsTab'
import BudgetTab from '../components/BudgetTab'
import PendingItemsTab from '../components/PendingItemsTab'
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
} from '../api'

// ─── Constants ────────────────────────────────────────────────────────────────

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

const TABS = [
  'Επισκόπηση',
  'Εκκρεμότητες',
  'Tasks',
  'Μηνύματα',
  'Προϋπολογισμός',
]

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
  done: 'bg-green-100 text-green-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-gray-100 text-gray-600',
  waiting_client: 'bg-orange-100 text-orange-700',
}

const TASK_STATUS_LABELS = {
  done: 'Ολοκληρώθηκε',
  in_progress: 'Σε εξέλιξη',
  pending: 'Εκκρεμεί',
  waiting_client: 'Αναμονή πελάτη',
}

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

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ caseData, users, onSaved }) {
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
    notes: '',
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
      agreed_fee_application: caseData.agreed_fee_application ?? '',
      agreed_fee_implementation: caseData.agreed_fee_implementation ?? '',
      assigned_agent_id: caseData.assigned_agent_id ?? '',
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
      for (const k of ['sale_date', 'project_deadline', 'approval_date'])
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
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
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
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────

const EMPTY_TASK = {
  title: '',
  priority: 'normal',
  assigned_to: '',
  due_date: '',
}

function TasksTab({ caseId, users }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTask, setNewTask] = useState(EMPTY_TASK)
  const [adding, setAdding] = useState(false)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      // getCase already returns tasks embedded; we fetch the case to stay DRY,
      // but here we call getTasks via getCase result passed down would be fine.
      // The parent already passed caseId so we can do a targeted fetch.
      const { getTasks } = await import('../api')
      const data = await getTasks(caseId)
      setTasks(data)
    } catch {
      toast.error('Σφάλμα φόρτωσης tasks')
    } finally {
      setLoading(false)
    }
  }, [caseId])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const setField = (key) => (e) =>
    setNewTask((p) => ({ ...p, [key]: e.target.value }))

  const handleAdd = async () => {
    if (!newTask.title.trim()) {
      toast.error('Ο τίτλος είναι υποχρεωτικός')
      return
    }
    setAdding(true)
    try {
      const payload = {
        title: newTask.title.trim(),
        priority: newTask.priority,
        due_date: newTask.due_date || null,
        assigned_to: newTask.assigned_to ? parseInt(newTask.assigned_to) : null,
        status: 'pending',
      }
      await createTask(caseId, payload)
      toast.success('Προστέθηκε task')
      setNewTask(EMPTY_TASK)
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
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status } : t))
      )
    } catch {
      toast.error('Σφάλμα ενημέρωσης')
    }
  }

  const handleDelete = async (taskId) => {
    if (!confirm('Διαγραφή task;')) return
    try {
      await deleteTask(caseId, taskId)
      toast.success('Διαγράφηκε')
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    } catch {
      toast.error('Σφάλμα διαγραφής')
    }
  }

  const getUserName = (id) => {
    if (!id) return '—'
    const u = users.find((u) => u.id === id)
    return u ? u.full_name : '—'
  }

  return (
    <div className="space-y-4">
      {/* Add task inline form */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Νέο Task
        </h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="label">Τίτλος</label>
            <input
              className="input"
              placeholder="Τίτλος task..."
              value={newTask.title}
              onChange={setField('title')}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>

          <div className="w-36">
            <label className="label">Προτεραιότητα</label>
            <select
              className="input"
              value={newTask.priority}
              onChange={setField('priority')}
            >
              <option value="urgent">Επείγον</option>
              <option value="high">Υψηλή</option>
              <option value="normal">Κανονική</option>
              <option value="low">Χαμηλή</option>
            </select>
          </div>

          <div className="w-44">
            <label className="label">Ανατέθηκε σε</label>
            <select
              className="input"
              value={newTask.assigned_to}
              onChange={setField('assigned_to')}
            >
              <option value="">— Κανείς —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="w-40">
            <label className="label">Λήξη</label>
            <input
              className="input"
              type="date"
              value={newTask.due_date}
              onChange={setField('due_date')}
            />
          </div>

          <button
            onClick={handleAdd}
            disabled={adding}
            className="btn-primary flex items-center gap-2 self-end"
          >
            <PlusIcon className="w-4 h-4" />
            {adding ? 'Προσθήκη...' : 'Προσθήκη'}
          </button>
        </div>
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
              <div
                key={task.id}
                className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                {/* Priority badge */}
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.normal
                  }`}
                >
                  {PRIORITY_LABELS[task.priority] || task.priority}
                </span>

                {/* Title */}
                <span
                  className={`flex-1 min-w-40 text-sm font-medium ${
                    task.status === 'done'
                      ? 'line-through text-gray-400'
                      : 'text-gray-800'
                  }`}
                >
                  {task.title}
                </span>

                {/* Assigned */}
                <span className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
                  <UserIcon className="w-3.5 h-3.5" />
                  {getUserName(task.assigned_to)}
                </span>

                {/* Due date */}
                {task.due_date ? (
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {fmtDate(task.due_date)}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300 whitespace-nowrap">—</span>
                )}

                {/* Status selector */}
                <select
                  className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer focus:ring-1 focus:ring-offset-1 ${
                    TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.pending
                  }`}
                  value={task.status}
                  onChange={(e) => handleStatusChange(task.id, e.target.value)}
                >
                  <option value="pending">Εκκρεμεί</option>
                  <option value="in_progress">Σε εξέλιξη</option>
                  <option value="waiting_client">Αναμονή πελάτη</option>
                  <option value="done">Ολοκληρώθηκε</option>
                </select>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(task.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CaseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [caseData, setCaseData] = useState(null)
  const [users, setUsers] = useState([])
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
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  STATUS_COLORS[caseData.status] || 'bg-gray-100 text-gray-600'
                }`}
              >
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
          {TABS.map((tab) => (
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
          />
        )}

        {activeTab === 'Εκκρεμότητες' && (
          <PendingItemsTab caseId={id} caseData={caseData} />
        )}

        {activeTab === 'Tasks' && (
          <TasksTab caseId={id} users={users} />
        )}

        {activeTab === 'Μηνύματα' && <MessagesTab caseId={id} caseData={caseData} onRefresh={load} />}
        {activeTab === 'Προϋπολογισμός' && <BudgetTab caseId={id} caseData={caseData} onRefresh={load} />}
      </div>
    </div>
  )
}
