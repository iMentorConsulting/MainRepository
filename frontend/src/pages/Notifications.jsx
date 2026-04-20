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
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import {
  getCases,
  getUsers,
  sendNotification,
  sendBulkNotification,
  getNotificationLogs,
  getNotificationTemplates,
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

export default function Notifications() {
  const [mode, setMode] = useState('single') // 'single' | 'bulk'

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
    setMessage(applyTemplateVars(tpl.body || tpl.message || '', ref))
  }

  // When a case is selected in single mode, re-apply template vars
  const handleSelectCase = (c) => {
    setSelectedCase(c)
    setCaseSearch(c.client_name)
    setShowCaseDropdown(false)
    if (selectedTemplate) {
      setSubject(applyTemplateVars(selectedTemplate.subject || '', c))
      setMessage(applyTemplateVars(selectedTemplate.body || selectedTemplate.message || '', c))
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
      await sendNotification(selectedCase.id, { subject, message, type: notifType })
      toast.success('Η ειδοποίηση στάλθηκε')
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
        type: notifType,
      })
      toast.success(`Στάλθηκε σε ${result.sent ?? selectedCaseIds.size} υποθέσεις`)
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
                <div className="font-medium">{tpl.name}</div>
                {tpl.description && (
                  <div className="text-xs text-gray-400 mt-0.5 max-w-40 truncate">{tpl.description}</div>
                )}
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        </div>
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
                      <TypeBadge type={log.type} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{log.client_name || log.recipient || '—'}</div>
                      {log.recipient_email && (
                        <div className="text-xs text-gray-400">{log.recipient_email}</div>
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
