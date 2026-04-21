import { useState, useEffect, useCallback } from 'react'
import {
  BellIcon,
  EnvelopeIcon,
  ChatBubbleLeftEllipsisIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  FunnelIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import {
  getCases,
  getUsers,
  sendNotification,
  sendBulkNotification,
  getNotificationLogs,
  getNotificationTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../api'

const STATUSES = [
  'ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ',
  'ΕΓΚΡΙΣΗ - ΠΡΙΝ ΤΟ 1ο ΑΙΤΗΜΑ',
  'ΣΕ 1ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ',
  'ΣΕ 2ο ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ',
  'ΕΝΣΤΑΣΗ',
  'ΣΕ ΤΕΛΙΚΟ ΑΙΤΗΜΑ ΕΛΕΓΧΟΥ',
]

function applyTemplateVars(text, caseData) {
  if (!text || !caseData) return text || ''
  return text
    .replace(/\{client_name\}/g, caseData.client_name || '')
    .replace(/\{balance\}/g, caseData.balance != null ? `${caseData.balance} €` : '')
    .replace(/\{service_type\}/g, caseData.service_type || '')
    .replace(/\{status\}/g, caseData.status || '')
    .replace(/\{deadline\}/g,
      caseData.project_deadline
        ? new Date(caseData.project_deadline).toLocaleDateString('el-GR')
        : ''
    )
}

function TemplatesPanel({ templates, setTemplates }) {
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ key: '', label: '', notification_type: 'both', subject: '', content: '' })
  const [saving, setSaving] = useState(false)

  const startEdit = (t) => { setEditId(t.id); setEditForm({ label: t.label, subject: t.subject || '', content: t.content, notification_type: t.notification_type }) }
  const cancelEdit = () => { setEditId(null); setEditForm({}) }

  const handleSave = async (id) => {
    setSaving(true)
    try {
      const updated = await updateTemplate(id, editForm)
      setTemplates(prev => prev.map(t => t.id === id ? updated : t))
      toast.success('Αποθηκεύτηκε')
      cancelEdit()
    } catch { toast.error('Σφάλμα αποθήκευσης') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Διαγραφή προτύπου;')) return
    try {
      await deleteTemplate(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
      toast.success('Διαγράφηκε')
    } catch { toast.error('Σφάλμα διαγραφής') }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const t = await createTemplate(createForm)
      setTemplates(prev => [...prev, t])
      setShowCreate(false)
      setCreateForm({ key: '', label: '', notification_type: 'both', subject: '', content: '' })
      toast.success('Δημιουργήθηκε')
    } catch (err) { toast.error(err.response?.data?.detail || 'Σφάλμα') }
    finally { setSaving(false) }
  }

  const TYPE_COLORS = { email: 'bg-blue-100 text-blue-800', viber: 'bg-purple-100 text-purple-800', both: 'bg-gray-100 text-gray-700' }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{templates.length} πρότυπα μηνυμάτων</p>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 btn-primary text-sm px-3 py-1.5">
          <PlusIcon className="w-4 h-4" /> Νέο Πρότυπο
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-gray-50 rounded-xl border p-4 space-y-3">
          <h3 className="font-semibold text-sm text-gray-800">Νέο Πρότυπο</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Key (μοναδικό ID)</label><input className="input" required value={createForm.key} onChange={e => setCreateForm(p => ({...p, key: e.target.value}))} placeholder="p.x. payment_reminder_2" /></div>
            <div><label className="label">Όνομα</label><input className="input" required value={createForm.label} onChange={e => setCreateForm(p => ({...p, label: e.target.value}))} placeholder="Υπενθύμιση Πληρωμής" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Τύπος</label><select className="input" value={createForm.notification_type} onChange={e => setCreateForm(p => ({...p, notification_type: e.target.value}))}><option value="both">Email & Viber</option><option value="email">Email</option><option value="viber">Viber</option></select></div>
            <div><label className="label">Θέμα (email)</label><input className="input" value={createForm.subject} onChange={e => setCreateForm(p => ({...p, subject: e.target.value}))} /></div>
          </div>
          <div><label className="label">Περιεχόμενο</label><textarea className="input" rows={4} required value={createForm.content} onChange={e => setCreateForm(p => ({...p, content: e.target.value}))} /></div>
          <p className="text-xs text-gray-400">Μεταβλητές: {'{client_name}'} {'{status}'} {'{service_type}'} {'{balance}'} {'{deadline}'}</p>
          <div className="flex gap-2"><button type="button" onClick={() => setShowCreate(false)} className="btn-secondary text-sm">Άκυρο</button><button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Αποθήκευση...' : 'Δημιουργία'}</button></div>
        </form>
      )}

      <div className="space-y-3">
        {templates.map(t => (
          <div key={t.id} className="bg-white rounded-xl border p-4">
            {editId === t.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Όνομα</label><input className="input" value={editForm.label} onChange={e => setEditForm(p => ({...p, label: e.target.value}))} /></div>
                  <div><label className="label">Τύπος</label><select className="input" value={editForm.notification_type} onChange={e => setEditForm(p => ({...p, notification_type: e.target.value}))}><option value="both">Email & Viber</option><option value="email">Email</option><option value="viber">Viber</option></select></div>
                </div>
                <div><label className="label">Θέμα (email)</label><input className="input" value={editForm.subject} onChange={e => setEditForm(p => ({...p, subject: e.target.value}))} /></div>
                <div><label className="label">Περιεχόμενο</label><textarea className="input" rows={5} value={editForm.content} onChange={e => setEditForm(p => ({...p, content: e.target.value}))} /></div>
                <div className="flex gap-2"><button onClick={cancelEdit} className="btn-secondary text-sm">Άκυρο</button><button onClick={() => handleSave(t.id)} disabled={saving} className="btn-primary text-sm">{saving ? '...' : 'Αποθήκευση'}</button></div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-gray-900 text-sm">{t.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TYPE_COLORS[t.notification_type] || 'bg-gray-100 text-gray-700'}`}>{t.notification_type}</span>
                  <div className="ml-auto flex gap-2">
                    <button onClick={() => startEdit(t)} className="text-gray-400 hover:text-blue-600 transition-colors"><PencilIcon className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(t.id)} className="text-gray-400 hover:text-red-600 transition-colors"><TrashIcon className="w-4 h-4" /></button>
                  </div>
                </div>
                {t.subject && <p className="text-xs text-gray-500 mb-1"><span className="font-medium">Θέμα:</span> {t.subject}</p>}
                <p className="text-xs text-gray-600 bg-gray-50 rounded p-2 whitespace-pre-wrap line-clamp-3">{t.content}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Notifications() {
  const [mode, setMode] = useState('single') // 'single' | 'bulk' | 'templates'

  // Templates
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [loadingTemplates, setLoadingTemplates] = useState(true)

  // Cases
  const [cases, setCases] = useState([])
  const [loadingCases, setLoadingCases] = useState(true)

  // Single mode
  const [caseSearch, setCaseSearch] = useState('')
  const [selectedCase, setSelectedCase] = useState(null)
  const [showCaseDropdown, setShowCaseDropdown] = useState(false)

  // Bulk mode
  const [bulkStatusFilter, setBulkStatusFilter] = useState('')
  const [selectedCaseIds, setSelectedCaseIds] = useState(new Set())

  // Common form
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [notifType, setNotifType] = useState('email') // 'email' | 'viber' | 'both'
  const [sending, setSending] = useState(false)

  // Logs
  const [logs, setLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(true)

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    try {
      const data = await getNotificationTemplates()
      setTemplates(data)
    } catch {
      toast.error('Σφάλμα φόρτωσης προτύπων')
    } finally {
      setLoadingTemplates(false)
    }
  }, [])

  const loadCases = useCallback(async () => {
    setLoadingCases(true)
    try {
      setCases(await getCases())
    } catch {
      toast.error('Σφάλμα φόρτωσης υποθέσεων')
    } finally {
      setLoadingCases(false)
    }
  }, [])

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const data = await getNotificationLogs()
      setLogs(Array.isArray(data) ? data.slice(0, 50) : [])
    } catch {
      toast.error('Σφάλμα φόρτωσης ιστορικού')
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
    loadCases()
    loadLogs()
  }, [loadTemplates, loadCases, loadLogs])

  // When a template is selected, fill subject+message (with replacements if single mode)
  const handleSelectTemplate = (tpl) => {
    setSelectedTemplate(tpl)
    const ref = mode === 'single' && selectedCase ? selectedCase : null
    setSubject(applyTemplateVars(tpl.subject || '', ref))
    setMessage(applyTemplateVars(tpl.content || '', ref))
  }

  // When a case is selected in single mode, re-apply template vars
  const handleSelectCase = (c) => {
    setSelectedCase(c)
    setCaseSearch(c.client_name)
    setShowCaseDropdown(false)
    if (selectedTemplate) {
      setSubject(applyTemplateVars(selectedTemplate.subject || '', c))
      setMessage(applyTemplateVars(selectedTemplate.content || '', c))
    }
  }

  const filteredCaseSearch = cases.filter(c =>
    c.client_name?.toLowerCase().includes(caseSearch.toLowerCase()) ||
    c.afm?.includes(caseSearch)
  ).slice(0, 10)

  const bulkFilteredCases = bulkStatusFilter
    ? cases.filter(c => c.status === bulkStatusFilter)
    : cases

  const toggleBulkCase = (id) => {
    setSelectedCaseIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAllBulk = () => {
    if (selectedCaseIds.size === bulkFilteredCases.length) {
      setSelectedCaseIds(new Set())
    } else {
      setSelectedCaseIds(new Set(bulkFilteredCases.map(c => c.id)))
    }
  }

  const handleSendSingle = async () => {
    if (!selectedCase) { toast.error('Επιλέξτε υπόθεση'); return }
    if (!subject.trim() || !message.trim()) { toast.error('Συμπληρώστε θέμα και μήνυμα'); return }
    setSending(true)
    try {
      const res = await sendNotification(selectedCase.id, { subject, message, notification_type: notifType })
      const failed = (res.results || []).filter(r => r.status === 'failed')
      const sent = (res.results || []).filter(r => r.status === 'sent')
      if (sent.length > 0) toast.success(`Εστάλη (${sent.length})`)
      if (failed.length > 0) toast.error(`Αποτυχία: ${failed.map(r => r.error).filter(Boolean).join('; ') || 'Έλεγξε τις ρυθμίσεις SMTP/Viber'}`)
      if (res.results?.length === 0) toast.error('Δεν βρέθηκε email ή τηλέφωνο')
      setSubject('')
      setMessage('')
      setSelectedCase(null)
      setCaseSearch('')
      setSelectedTemplate(null)
      await loadLogs()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποστολής')
    } finally {
      setSending(false)
    }
  }

  const handleSendBulk = async () => {
    if (selectedCaseIds.size === 0) { toast.error('Επιλέξτε τουλάχιστον μία υπόθεση'); return }
    if (!subject.trim() || !message.trim()) { toast.error('Συμπληρώστε θέμα και μήνυμα'); return }
    setSending(true)
    try {
      const result = await sendBulkNotification({
        case_ids: Array.from(selectedCaseIds),
        subject,
        message,
        notification_type: notifType,
      })
      if ((result.sent ?? 0) > 0) toast.success(`Εστάλη σε ${result.sent} υποθέσεις`)
      if ((result.failed ?? 0) > 0) toast.error(`Αποτυχία σε ${result.failed} υποθέσεις. Έλεγξε ρυθμίσεις SMTP/Viber.`)
      setSubject('')
      setMessage('')
      setSelectedCaseIds(new Set())
      setSelectedTemplate(null)
      await loadLogs()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα μαζικής αποστολής')
    } finally {
      setSending(false)
    }
  }

  const TypeBadge = ({ type }) => {
    if (type === 'email') return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
        <EnvelopeIcon className="w-3 h-3" /> Email
      </span>
    )
    if (type === 'viber') return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
        <ChatBubbleLeftEllipsisIcon className="w-3 h-3" /> Viber
      </span>
    )
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
        Και τα δύο
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg">
          <BellIcon className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ειδοποιήσεις</h1>
          <p className="text-sm text-gray-500">Αποστολή email / Viber στους πελάτες</p>
        </div>
      </div>

      {/* Templates */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <DocumentTextIcon className="w-4 h-4" /> Πρότυπα Μηνυμάτων
        </h2>
        {loadingTemplates ? (
          <div className="flex gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 w-48 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-gray-400">Δεν βρέθηκαν πρότυπα</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => handleSelectTemplate(tpl)}
                className={`text-left px-4 py-3 rounded-lg border text-sm transition-all ${
                  selectedTemplate?.id === tpl.id
                    ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className="font-medium">{tpl.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{tpl.notification_type}</div>
              </button>
            ))}
          </div>
        )}
        {selectedTemplate && (
          <p className="text-xs text-gray-400 mt-2">
            Μεταβλητές: <code className="bg-gray-100 px-1 rounded">{'{client_name}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{balance}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{service_type}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{status}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{deadline}'}</code>
          </p>
        )}
      </div>

      {/* Mode Toggle */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => { setMode('single'); setSelectedCaseIds(new Set()) }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'single'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Μεμονωμένη
          </button>
          <button
            onClick={() => { setMode('bulk'); setSelectedCase(null); setCaseSearch('') }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'bulk'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Μαζική
          </button>
          <button
            onClick={() => setMode('templates')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${mode === 'templates' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
          >
            <DocumentTextIcon className="w-4 h-4" /> Πρότυπα
          </button>
        </div>

        {mode === 'templates' && <TemplatesPanel templates={templates} setTemplates={setTemplates} />}

        {mode !== 'templates' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Case selection */}
          <div>
            {mode === 'single' ? (
              <div>
                <label className="label">Υπόθεση *</label>
                <div className="relative">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className="input pl-9"
                    placeholder="Αναζήτηση πελάτη ή ΑΦΜ..."
                    value={caseSearch}
                    onChange={e => { setCaseSearch(e.target.value); setShowCaseDropdown(true); setSelectedCase(null) }}
                    onFocus={() => setShowCaseDropdown(true)}
                  />
                  {showCaseDropdown && caseSearch && (
                    <div className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {loadingCases ? (
                        <div className="p-3 text-sm text-gray-400">Φόρτωση...</div>
                      ) : filteredCaseSearch.length === 0 ? (
                        <div className="p-3 text-sm text-gray-400">Δεν βρέθηκε</div>
                      ) : filteredCaseSearch.map(c => (
                        <button
                          key={c.id}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm"
                          onMouseDown={() => handleSelectCase(c)}
                        >
                          <div className="font-medium text-gray-800">{c.client_name}</div>
                          <div className="text-xs text-gray-400">{c.afm || ''} · {c.status}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedCase && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                    <div className="font-semibold text-blue-800">{selectedCase.client_name}</div>
                    <div className="text-blue-600 text-xs mt-0.5">
                      {selectedCase.service_type} · {selectedCase.status}
                    </div>
                    {selectedCase.email && (
                      <div className="text-blue-500 text-xs">{selectedCase.email}</div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FunnelIcon className="w-4 h-4 text-gray-400" />
                  <label className="label mb-0">Φίλτρο κατάστασης</label>
                </div>
                <select
                  className="input mb-3"
                  value={bulkStatusFilter}
                  onChange={e => { setBulkStatusFilter(e.target.value); setSelectedCaseIds(new Set()) }}
                >
                  <option value="">Όλες οι καταστάσεις</option>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 border-b flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={bulkFilteredCases.length > 0 && selectedCaseIds.size === bulkFilteredCases.length}
                        onChange={toggleAllBulk}
                      />
                      Επιλογή όλων ({bulkFilteredCases.length})
                    </label>
                    {selectedCaseIds.size > 0 && (
                      <span className="text-xs text-blue-600 font-medium">{selectedCaseIds.size} επιλεγμένες</span>
                    )}
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y">
                    {loadingCases ? (
                      <div className="p-4 text-sm text-gray-400 text-center">Φόρτωση...</div>
                    ) : bulkFilteredCases.length === 0 ? (
                      <div className="p-4 text-sm text-gray-400 text-center">Δεν βρέθηκαν υποθέσεις</div>
                    ) : bulkFilteredCases.map(c => (
                      <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedCaseIds.has(c.id)}
                          onChange={() => toggleBulkCase(c.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{c.client_name}</div>
                          <div className="text-xs text-gray-400 truncate">{c.status}</div>
                        </div>
                        {c.email && <EnvelopeIcon className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Message form */}
          <div className="space-y-3">
            <div>
              <label className="label">Θέμα *</label>
              <input
                className="input"
                placeholder="Θέμα ειδοποίησης..."
                value={subject}
                onChange={e => setSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Μήνυμα *</label>
              <textarea
                className="input"
                rows={6}
                placeholder="Κείμενο μηνύματος..."
                value={message}
                onChange={e => setMessage(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Τύπος αποστολής</label>
              <div className="flex gap-2">
                {[
                  { value: 'email', label: 'Email', icon: EnvelopeIcon, color: 'blue' },
                  { value: 'viber', label: 'Viber', icon: ChatBubbleLeftEllipsisIcon, color: 'purple' },
                  { value: 'both', label: 'Και τα δύο', icon: BellIcon, color: 'gray' },
                ].map(({ value, label, icon: Icon, color }) => (
                  <button
                    key={value}
                    onClick={() => setNotifType(value)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      notifType === value
                        ? color === 'blue' ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : color === 'purple' ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-500 bg-gray-100 text-gray-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={mode === 'single' ? handleSendSingle : handleSendBulk}
              disabled={sending}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {sending ? (
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <PaperAirplaneIcon className="w-4 h-4" />
              )}
              {sending
                ? 'Αποστολή...'
                : mode === 'single'
                  ? 'Αποστολή Ειδοποίησης'
                  : `Μαζική Αποστολή${selectedCaseIds.size > 0 ? ` (${selectedCaseIds.size})` : ''}`
              }
            </button>
          </div>
        </div>}
      </div>

      {/* Notification Log */}
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex items-center gap-2">
          <ClockIcon className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-700">Ιστορικό Ειδοποιήσεων</h2>
          <span className="text-xs text-gray-400">(τελευταίες 50)</span>
        </div>
        {loadingLogs ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            <BellIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Δεν υπάρχουν ειδοποιήσεις ακόμα
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Ημ/νία', 'Τύπος', 'Παραλήπτης', 'Θέμα', 'Κατάσταση'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log, i) => (
                  <tr key={log.id ?? i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {log.created_at
                        ? new Date(log.created_at).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={log.notification_type} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{log.recipient_name || '—'}</div>
                      {log.recipient_contact && (
                        <div className="text-xs text-gray-400">{log.recipient_contact}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <div className="truncate">{log.subject || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      {log.status === 'sent' || log.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                          <CheckCircleIcon className="w-4 h-4" /> Εστάλη
                        </span>
                      ) : log.status === 'failed' || log.status === 'error' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                          <XCircleIcon className="w-4 h-4" /> Αποτυχία
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">{log.status || '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
