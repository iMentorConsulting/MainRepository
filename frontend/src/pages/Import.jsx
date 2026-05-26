import { useState, useEffect } from 'react'
import {
  TableCellsIcon,
  CloudArrowDownIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  DocumentArrowDownIcon,
  UserIcon,
  TagIcon,
  ClockIcon,
  ArrowUturnLeftIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { previewSheet, importFromSheet, syncPaidFromSheet, syncAgentsFromSheet, getServiceTypes, assignPrograms, syncInvestmentFromSheet, syncSaleDatesFromSheet, getAutoRefreshStatus, previewAnakainizwSheet, importAnakainizwSheet, getAnakainizwHeaders, getFinanceSyncStatus, previewFinanceSync, runFinanceSync, undoFinanceSync, getFinanceSyncServiceTypes, updateFinanceSyncServiceTypes } from '../api'

const PREVIEW_COLUMNS = [
  { key: 'client_name', label: 'Πελάτης' },
  { key: 'afm', label: 'ΑΦΜ' },
  { key: 'status', label: 'Κατάσταση' },
  { key: 'service_type', label: 'Τύπος Υπηρεσίας' },
  { key: 'agreed_fee_application', label: 'Αμοιβή Αίτησης', currency: true },
  { key: 'agreed_fee_implementation', label: 'Αμοιβή Υλοποίησης', currency: true },
]

const fmtEur = (val) => {
  if (val == null || val === '') return '—'
  return new Intl.NumberFormat('el-GR', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(val)
}

function StatCard({ label, value, color = 'gray' }) {
  const colors = {
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  }
  return (
    <div className={`rounded-lg border px-5 py-4 text-center ${colors[color]}`}>
      <div className="text-2xl font-bold">{value ?? '—'}</div>
      <div className="text-xs font-medium mt-1 opacity-80">{label}</div>
    </div>
  )
}

function ResultBanner({ result, type = 'success' }) {
  if (!result) return null
  const isError = type === 'error'
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
      isError
        ? 'bg-red-50 border-red-200 text-red-700'
        : 'bg-green-50 border-green-200 text-green-700'
    }`}>
      {isError
        ? <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
        : <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      }
      <span>{result}</span>
    </div>
  )
}

function Spinner({ color = 'blue' }) {
  const colors = {
    blue: 'border-blue-500',
    green: 'border-green-500',
  }
  return (
    <div className={`animate-spin w-4 h-4 border-2 ${colors[color]} border-t-transparent rounded-full`} />
  )
}

const fmtEurDelta = (val) => {
  if (val == null) return '—'
  const abs = Math.abs(val)
  const sign = val >= 0 ? '+' : '-'
  return `${sign}${new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs)}`
}

export default function Import() {
  const [autoRefreshStatus, setAutoRefreshStatus] = useState(null)

  // Finance Sync state
  const [financeSyncStatus, setFinanceSyncStatus] = useState(null)
  const [financePreview, setFinancePreview] = useState(null)
  const [loadingFinancePreview, setLoadingFinancePreview] = useState(false)
  const [loadingFinanceRun, setLoadingFinanceRun] = useState(false)
  const [loadingFinanceUndo, setLoadingFinanceUndo] = useState(false)
  const [financeError, setFinanceError] = useState(null)
  const [financeResult, setFinanceResult] = useState(null)

  // Service type config state
  const [serviceTypesList, setServiceTypesList] = useState(null) // [{service_type, enabled}]
  const [loadingFinanceServiceTypes, setLoadingFinanceServiceTypes] = useState(false)
  const [savingServiceTypes, setSavingServiceTypes] = useState(false)
  const [showServiceTypes, setShowServiceTypes] = useState(false)

  useEffect(() => {
    getAutoRefreshStatus().then(setAutoRefreshStatus).catch(() => {})
    getFinanceSyncStatus().then(setFinanceSyncStatus).catch(() => {})
  }, [])

  const handleLoadServiceTypes = async () => {
    setLoadingFinanceServiceTypes(true)
    try {
      const data = await getFinanceSyncServiceTypes()
      setServiceTypesList(data)
      setShowServiceTypes(true)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα φόρτωσης τύπων υπηρεσιών')
    } finally {
      setLoadingFinanceServiceTypes(false)
    }
  }

  const handleToggleServiceType = (serviceType) => {
    setServiceTypesList(prev =>
      prev.map(item =>
        item.service_type === serviceType ? { ...item, enabled: !item.enabled } : item
      )
    )
  }

  const handleSaveServiceTypes = async () => {
    setSavingServiceTypes(true)
    try {
      const data = await updateFinanceSyncServiceTypes(serviceTypesList)
      toast.success(data.message)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποθήκευσης')
    } finally {
      setSavingServiceTypes(false)
    }
  }

  const handleFinancePreview = async () => {
    setLoadingFinancePreview(true)
    setFinancePreview(null)
    setFinanceError(null)
    setFinanceResult(null)
    try {
      const data = await previewFinanceSync()
      setFinancePreview(data)
      toast.success(`${data.new_cases_count} νέες + ${data.paid_updates_count} αλλαγές ΠΟΣΟ`)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Σφάλμα προεπισκόπησης'
      setFinanceError(msg)
      toast.error(msg)
    } finally {
      setLoadingFinancePreview(false)
    }
  }

  const handleFinanceRun = async () => {
    setLoadingFinanceRun(true)
    setFinanceError(null)
    setFinanceResult(null)
    try {
      const data = await runFinanceSync()
      setFinanceResult(data.message)
      setFinancePreview(null)
      const status = await getFinanceSyncStatus()
      setFinanceSyncStatus(status)
      toast.success(data.message)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Σφάλμα sync'
      setFinanceError(msg)
      toast.error(msg)
    } finally {
      setLoadingFinanceRun(false)
    }
  }

  const handleFinanceUndo = async () => {
    if (!window.confirm('Είσαι σίγουρος; Η αναίρεση θα διαγράψει τις νέες υποθέσεις και θα επαναφέρει τα ποσά από τον τελευταίο sync.')) return
    setLoadingFinanceUndo(true)
    setFinanceError(null)
    try {
      const data = await undoFinanceSync()
      setFinanceResult(null)
      const status = await getFinanceSyncStatus()
      setFinanceSyncStatus(status)
      toast.success(data.message)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Σφάλμα αναίρεσης'
      setFinanceError(msg)
      toast.error(msg)
    } finally {
      setLoadingFinanceUndo(false)
    }
  }

  // Preview state
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [previewError, setPreviewError] = useState(null)

  // Import state
  const [loadingImport, setLoadingImport] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState(null)

  // Sync state
  const [loadingSync, setLoadingSync] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [syncError, setSyncError] = useState(null)

  const [loadingAgents, setLoadingAgents] = useState(false)
  const [agentsResult, setAgentsResult] = useState(null)
  const [agentsError, setAgentsError] = useState(null)

  // Program assignment state
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(false)
  const [serviceTypes, setServiceTypes] = useState(null)
  const [programAssignments, setProgramAssignments] = useState({})
  const [loadingAssign, setLoadingAssign] = useState(false)
  const [assignResult, setAssignResult] = useState(null)
  const [assignError, setAssignError] = useState(null)

  const handlePreview = async () => {
    setLoadingPreview(true)
    setPreviewData(null)
    setPreviewError(null)
    try {
      const data = await previewSheet()
      setPreviewData(data)
      toast.success('Προεπισκόπηση ολοκληρώθηκε')
    } catch (err) {
      const msg = err.response?.data?.detail || 'Σφάλμα κατά την προεπισκόπηση'
      setPreviewError(msg)
      toast.error(msg)
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleImport = async () => {
    if (!previewData) {
      toast.error('Εκτελέστε πρώτα Προεπισκόπηση')
      return
    }
    if (previewData.new_to_import === 0) {
      toast('Δεν υπάρχουν νέες υποθέσεις για εισαγωγή', { icon: 'ℹ️' })
      return
    }
    setLoadingImport(true)
    setImportResult(null)
    setImportError(null)
    try {
      const data = await importFromSheet()
      const msg = `Εισαγωγή ολοκληρώθηκε: ${data.imported ?? 0} νέες υποθέσεις, ${data.skipped ?? 0} παραλείφθηκαν`
      setImportResult(msg)
      toast.success(`Εισήχθησαν ${data.imported ?? 0} υποθέσεις`)
      // Refresh preview stats
      setPreviewData(null)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Σφάλμα κατά την εισαγωγή'
      setImportError(msg)
      toast.error(msg)
    } finally {
      setLoadingImport(false)
    }
  }

  const handleSyncAgents = async () => {
    setLoadingAgents(true)
    setAgentsResult(null)
    setAgentsError(null)
    try {
      const data = await syncAgentsFromSheet()
      setAgentsResult(data.message)
      toast.success(data.message)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Σφάλμα συγχρονισμού agents'
      setAgentsError(msg)
      toast.error(msg)
    } finally {
      setLoadingAgents(false)
    }
  }

  const handleLoadServiceTypes = async () => {
    setLoadingServiceTypes(true)
    setAssignResult(null)
    setAssignError(null)
    try {
      const data = await getServiceTypes()
      setServiceTypes(data)
      // Pre-populate assignments from current program_category
      const initial = {}
      data.forEach(row => {
        initial[row.service_type ?? ''] = row.program_category
      })
      setProgramAssignments(initial)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα φόρτωσης')
    } finally {
      setLoadingServiceTypes(false)
    }
  }

  const handleAssignPrograms = async () => {
    setLoadingAssign(true)
    setAssignResult(null)
    setAssignError(null)
    try {
      const assignments = Object.entries(programAssignments).map(([service_type, program_category]) => ({
        service_type: service_type === '' ? null : service_type,
        program_category,
      }))
      const data = await assignPrograms(assignments)
      setAssignResult(data.message)
      toast.success(data.message)
      // Refresh list to show updated program_category
      const fresh = await getServiceTypes()
      setServiceTypes(fresh)
      const updated = {}
      fresh.forEach(row => { updated[row.service_type ?? ''] = row.program_category })
      setProgramAssignments(updated)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Σφάλμα ανάθεσης'
      setAssignError(msg)
      toast.error(msg)
    } finally {
      setLoadingAssign(false)
    }
  }

  const [loadingInvestment, setLoadingInvestment] = useState(false)
  const [investmentResult, setInvestmentResult] = useState(null)
  const [loadingSaleDates, setLoadingSaleDates] = useState(false)
  const [saleDatesResult, setSaleDatesResult] = useState(null)

  // ΑΝΑΚΑΙΝΙΖΩ import state
  const [loadingAnaPreview, setLoadingAnaPreview] = useState(false)
  const [anaPreviewData, setAnaPreviewData] = useState(null)
  const [selectedDupRows, setSelectedDupRows] = useState({}) // { sheet_row: bool }
  const [loadingAnaImport, setLoadingAnaImport] = useState(false)
  const [anaImportResult, setAnaImportResult] = useState(null)
  const [anaImportError, setAnaImportError] = useState(null)
  const [loadingAnaHeaders, setLoadingAnaHeaders] = useState(false)
  const [anaHeadersData, setAnaHeadersData] = useState(null)

  const handleSyncInvestment = async () => {
    setLoadingInvestment(true)
    setInvestmentResult(null)
    try {
      const data = await syncInvestmentFromSheet()
      setInvestmentResult(data.message)
      toast.success(data.message)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα')
    } finally {
      setLoadingInvestment(false)
    }
  }

  const handleSyncSaleDates = async () => {
    setLoadingSaleDates(true)
    setSaleDatesResult(null)
    try {
      const data = await syncSaleDatesFromSheet()
      setSaleDatesResult(data.message)
      toast.success(data.message)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα')
    } finally {
      setLoadingSaleDates(false)
    }
  }

  const handleAnaPreview = async () => {
    setLoadingAnaPreview(true)
    setAnaPreviewData(null)
    setSelectedDupRows({})
    setAnaImportResult(null)
    setAnaImportError(null)
    try {
      const data = await previewAnakainizwSheet()
      setAnaPreviewData(data)
      if (data.duplicate_groups?.length > 0) {
        toast(`Βρέθηκαν ${data.duplicate_groups.length} διπλότυπα — επιλέξτε ποιες γραμμές να εισαχθούν`, { icon: '⚠️', duration: 5000 })
      } else {
        toast.success(`${data.auto_count} εγγραφές έτοιμες για εισαγωγή`)
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Σφάλμα κατά την προεπισκόπηση'
      setAnaImportError(msg)
      toast.error(msg)
    } finally {
      setLoadingAnaPreview(false)
    }
  }

  const handleAnaHeaders = async () => {
    setLoadingAnaHeaders(true)
    setAnaHeadersData(null)
    try {
      const data = await getAnakainizwHeaders()
      setAnaHeadersData(data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα')
    } finally {
      setLoadingAnaHeaders(false)
    }
  }

  const handleAnaImport = async () => {
    setLoadingAnaImport(true)
    setAnaImportResult(null)
    setAnaImportError(null)
    const selectedRows = Object.entries(selectedDupRows)
      .filter(([, checked]) => checked)
      .map(([row]) => parseInt(row))
    try {
      const data = await importAnakainizwSheet(selectedRows)
      setAnaImportResult(data.message)
      setAnaPreviewData(null)
      setSelectedDupRows({})
      toast.success('Εισαγωγή ΑΝΑΚΑΙΝΙΖΩ ολοκληρώθηκε')
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Σφάλμα κατά την εισαγωγή'
      setAnaImportError(msg)
      toast.error(msg, { duration: 8000 })
    } finally {
      setLoadingAnaImport(false)
    }
  }

  const handleSync = async () => {
    setLoadingSync(true)
    setSyncResult(null)
    setSyncError(null)
    try {
      const data = await syncPaidFromSheet()
      const msg = `Ενημερώθηκαν ${data.updated ?? 0} υποθέσεις`
      setSyncResult(msg)
      toast.success(msg)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Σφάλμα κατά τον συγχρονισμό'
      setSyncError(msg)
      toast.error(msg)
    } finally {
      setLoadingSync(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Finance App Sync Panel ── */}
      <div className="bg-white rounded-xl border-2 border-indigo-200 p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <BoltIcon className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Συγχρονισμός από Finance App</h2>
              <p className="text-xs text-gray-500">finance.i-mentor.gr → case management (αντικαθιστά το Google Sheet)</p>
            </div>
          </div>
          {/* Last sync badge */}
          {financeSyncStatus?.last_run_at && (
            <div className={`text-xs px-3 py-1.5 rounded-full font-medium ${financeSyncStatus.error ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {financeSyncStatus.error
                ? `Σφάλμα: ${financeSyncStatus.error}`
                : `Τελευταίος: ${new Date(financeSyncStatus.last_run_at).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Athens' })} — ${financeSyncStatus.imported ?? 0} νέες, ${financeSyncStatus.updated_paid ?? 0} ποσά`
              }
            </div>
          )}
        </div>

        {/* Error / Result banners */}
        {financeError && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{financeError}</span>
          </div>
        )}
        {financeResult && (
          <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{financeResult}</span>
          </div>
        )}

        {/* Preview results */}
        {financePreview && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Εγγραφές finance app" value={financePreview.total_records} color="gray" />
              <StatCard label="Νέες υποθέσεις" value={financePreview.new_cases_count} color="green" />
              <StatCard label="Αλλαγές ΠΟΣΟ" value={financePreview.paid_updates_count} color="blue" />
              <StatCard label="Χωρίς αλλαγή" value={financePreview.no_change_count} color="gray" />
            </div>

            {/* New cases table */}
            {financePreview.new_cases?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Νέες υποθέσεις που θα εισαχθούν {financePreview.new_cases_count > 50 && `(πρώτες 50 από ${financePreview.new_cases_count})`}</p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {['Πελάτης', 'ΑΦΜ', 'Τύπος Υπηρεσίας', 'Ποσό', 'Email'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {financePreview.new_cases.map((r, i) => (
                        <tr key={i} className="hover:bg-green-50">
                          <td className="px-3 py-2 font-medium text-gray-800">{r.customer_name}</td>
                          <td className="px-3 py-2 text-gray-500 font-mono">{r.vat_number || '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{r.service_type || '—'}</td>
                          <td className="px-3 py-2 text-gray-700">{fmtEur(r.total_paid)}</td>
                          <td className="px-3 py-2 text-gray-500">{r.email || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Paid updates table */}
            {financePreview.paid_updates?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Αλλαγές ΠΟΣΟ σε υπάρχουσες υποθέσεις {financePreview.paid_updates_count > 50 && `(πρώτες 50)`}</p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {['Πελάτης', 'Τύπος Υπηρεσίας', 'Τρέχον ΠΟΣΟ', 'Νέο ΠΟΣΟ', 'Διαφορά'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {financePreview.paid_updates.map((r, i) => (
                        <tr key={i} className="hover:bg-blue-50">
                          <td className="px-3 py-2 font-medium text-gray-800">{r.client_name}</td>
                          <td className="px-3 py-2 text-gray-600">{r.service_type || '—'}</td>
                          <td className="px-3 py-2 text-gray-500">{fmtEur(r.current_paid)}</td>
                          <td className="px-3 py-2 font-semibold text-gray-800">{fmtEur(r.new_paid)}</td>
                          <td className={`px-3 py-2 font-bold ${r.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtEurDelta(r.delta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {financePreview.new_cases_count === 0 && financePreview.paid_updates_count === 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 border rounded-lg px-4 py-3">
                <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                Τα δεδομένα είναι ήδη ενημερωμένα. Δεν υπάρχουν αλλαγές.
              </div>
            )}
          </div>
        )}

        {/* Service type configurator */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => showServiceTypes ? setShowServiceTypes(false) : handleLoadServiceTypes()}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
          >
            <span className="flex items-center gap-2">
              <TagIcon className="w-4 h-4 text-gray-500" />
              Τύποι Υπηρεσιών που συγχρονίζονται
              {serviceTypesList && (
                <span className="ml-1 text-xs font-normal text-gray-500">
                  ({serviceTypesList.filter(s => s.enabled).length}/{serviceTypesList.length} ενεργοί)
                </span>
              )}
            </span>
            <span className="text-gray-400 text-xs">{showServiceTypes ? '▲ Απόκρυψη' : '▼ Εμφάνιση / Ανανέωση'}</span>
          </button>

          {showServiceTypes && serviceTypesList && (
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-500">
                Επίλεξε ποιοι τύποι υπηρεσιών θα εισάγονται κατά το sync. Νέοι τύποι που θα εμφανιστούν στο finance app θα προστίθενται αυτόματα εδώ ως <span className="font-semibold">απενεργοποιημένοι</span>.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {serviceTypesList.map(item => (
                  <label key={item.service_type} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer select-none text-sm transition-colors ${
                    item.enabled
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                      : 'bg-white border-gray-200 text-gray-500'
                  }`}>
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={() => handleToggleServiceType(item.service_type)}
                      className="rounded accent-indigo-600"
                    />
                    <span className="font-medium truncate">{item.service_type}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleSaveServiceTypes}
                  disabled={savingServiceTypes}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {savingServiceTypes ? <Spinner /> : <CheckCircleIcon className="w-4 h-4" />}
                  {savingServiceTypes ? 'Αποθήκευση...' : 'Αποθήκευση'}
                </button>
                <button
                  onClick={handleLoadServiceTypes}
                  disabled={loadingFinanceServiceTypes}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {loadingFinanceServiceTypes ? <Spinner /> : <ArrowPathIcon className="w-4 h-4" />}
                  Ανανέωση από Finance App
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={handleFinancePreview}
            disabled={loadingFinancePreview || loadingFinanceRun}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingFinancePreview ? <Spinner /> : <DocumentArrowDownIcon className="w-4 h-4" />}
            {loadingFinancePreview ? 'Φόρτωση...' : 'Προεπισκόπηση'}
          </button>

          <button
            onClick={handleFinanceRun}
            disabled={loadingFinanceRun || loadingFinancePreview}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingFinanceRun ? <Spinner /> : <BoltIcon className="w-4 h-4" />}
            {loadingFinanceRun ? 'Εκτέλεση...' : 'Εκτέλεση Sync'}
          </button>

          {financeSyncStatus?.can_undo && (
            <button
              onClick={handleFinanceUndo}
              disabled={loadingFinanceUndo}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 border border-red-300 text-red-700 text-sm font-medium hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingFinanceUndo ? <Spinner color="blue" /> : <ArrowUturnLeftIcon className="w-4 h-4" />}
              {loadingFinanceUndo ? 'Αναίρεση...' : 'Αναίρεση Τελευταίου Sync'}
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400">
          Ο αυτόματος sync τρέχει κάθε μέρα 08:00 &amp; 14:00. Η «Αναίρεση» είναι διαθέσιμη μόνο εφόσον η εφαρμογή δεν έχει επανεκκινηθεί από τον τελευταίο sync.
        </p>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
        <div className="relative flex justify-center">
          <span className="bg-gray-50 px-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">Google Sheets (παλαιό)</span>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-50 rounded-lg">
          <TableCellsIcon className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Εισαγωγή από Google Sheets</h1>
          <p className="text-sm text-gray-500">
            Εισαγωγή και συγχρονισμός υποθέσεων από το κεντρικό Google Sheet
          </p>
        </div>
      </div>

      {/* Auto-refresh status */}
      {autoRefreshStatus && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
          autoRefreshStatus.error
            ? 'bg-red-50 border-red-200 text-red-700'
            : autoRefreshStatus.last_run_at
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-gray-50 border-gray-200 text-gray-600'
        }`}>
          <ClockIcon className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">Αυτόματο Refresh Sheet:</span>{' '}
            {autoRefreshStatus.last_run_at
              ? <>
                  Τελευταία εκτέλεση:{' '}
                  <span className="font-medium">
                    {new Date(autoRefreshStatus.last_run_at).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Athens' })}
                  </span>
                  {autoRefreshStatus.error
                    ? <> — <span className="text-red-600">Σφάλμα: {autoRefreshStatus.error}</span></>
                    : <> — εισήχθησαν <span className="font-medium">{autoRefreshStatus.imported}</span> νέες,
                        ενημερώθηκαν <span className="font-medium">{autoRefreshStatus.updated_paid}</span> ποσά</>
                  }
                </>
              : 'Δεν έχει εκτελεστεί ακόμα (τρέχει κάθε μέρα 08:00 & 14:00 ώρα Ελλάδας)'
            }
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
        <InformationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Πώς λειτουργεί:</span>{' '}
          Πρώτα εκτελέστε <span className="font-medium">Προεπισκόπηση</span> για να δείτε ποιες
          υποθέσεις θα εισαχθούν. Στη συνέχεια πατήστε <span className="font-medium">Εισαγωγή</span>{' '}
          για να ολοκληρωθεί η διαδικασία. Οι ήδη εισηγμένες υποθέσεις (με βάση το ΑΦΜ) παραλείπονται.
          Το σύστημα εκτελεί <span className="font-medium">αυτόματο refresh κάθε μέρα στις 08:00 & 14:00</span>.
        </div>
      </div>

      {/* Preview + Import Section */}
      <div className="bg-white rounded-xl border p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <CloudArrowDownIcon className="w-5 h-5 text-green-600" />
            Προεπισκόπηση &amp; Εισαγωγή
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handlePreview}
              disabled={loadingPreview || loadingImport}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingPreview ? <Spinner color="blue" /> : <DocumentArrowDownIcon className="w-4 h-4" />}
              {loadingPreview ? 'Φόρτωση...' : 'Προεπισκόπηση'}
            </button>
            <button
              onClick={handleImport}
              disabled={loadingImport || loadingPreview || !previewData || previewData.new_to_import === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingImport ? <Spinner /> : <CloudArrowDownIcon className="w-4 h-4" />}
              {loadingImport ? 'Εισαγωγή...' : 'Εισαγωγή'}
            </button>
          </div>
        </div>

        {/* Result banners */}
        <ResultBanner result={importResult} type="success" />
        <ResultBanner result={importError} type="error" />
        <ResultBanner result={previewError} type="error" />

        {/* Preview stats */}
        {previewData && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Σύνολο ενεργών γραμμών"
                value={previewData.total_active_rows}
                color="gray"
              />
              <StatCard
                label="Ήδη εισηγμένες"
                value={previewData.already_imported}
                color="yellow"
              />
              <StatCard
                label="Νέες για εισαγωγή"
                value={previewData.new_to_import}
                color="green"
              />
            </div>

            {/* Preview table */}
            {Array.isArray(previewData.preview) && previewData.preview.length > 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Προεπισκόπηση νέων εγγραφών
                  </h3>
                  <span className="text-xs text-gray-400">
                    (πρώτες {previewData.preview.length})
                  </span>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {PREVIEW_COLUMNS.map(col => (
                          <th
                            key={col.key}
                            className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewData.preview.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          {PREVIEW_COLUMNS.map(col => (
                            <td key={col.key} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[200px] truncate">
                              {col.currency
                                ? fmtEur(row[col.key])
                                : row[col.key] != null && row[col.key] !== ''
                                  ? String(row[col.key])
                                  : <span className="text-gray-300">—</span>
                              }
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : previewData.new_to_import === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 border rounded-lg px-4 py-3">
                <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                Όλες οι εγγραφές του Sheet είναι ήδη εισηγμένες.
              </div>
            ) : null}
          </div>
        )}

        {/* Loading skeleton */}
        {loadingPreview && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
            <div className="h-40 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-gray-50 px-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Συγχρονισμός ΠΟΣΟ
          </span>
        </div>
      </div>

      {/* Sync Section */}
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-orange-50 rounded-lg flex-shrink-0">
            <ArrowPathIcon className="w-5 h-5 text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-800 mb-1">
              Συγχρονισμός Πληρωθέντος Ποσού
            </h2>
            <p className="text-sm text-gray-500">
              Ενημερώνει μόνο το πεδίο{' '}
              <span className="font-semibold text-gray-700">ΠΟΣΟ (πληρωθέν)</span> από το Sheet
              για όλες τις υπάρχουσες υποθέσεις. Δεν δημιουργεί νέες υποθέσεις, δεν τροποποιεί
              άλλα πεδία.
            </p>
          </div>
        </div>

        {/* Result banners */}
        <ResultBanner result={syncResult} type="success" />
        <ResultBanner result={syncError} type="error" />

        <button
          onClick={handleSync}
          disabled={loadingSync}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loadingSync
            ? <><Spinner /><span>Συγχρονισμός...</span></>
            : <><ArrowPathIcon className="w-4 h-4" /><span>Συγχρονισμός</span></>
          }
        </button>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-gray-50 px-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Συγχρονισμός Υπεύθυνου Φακέλου
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-50 rounded-lg flex-shrink-0">
            <UserIcon className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-800 mb-1">
              Συγχρονισμός Υπεύθυνου Agent
            </h2>
            <p className="text-sm text-gray-500">
              Διαβάζει το πεδίο <span className="font-semibold text-gray-700">Υπεύθυνος Φακέλου</span> από το Sheet
              και αναθέτει τον αντίστοιχο agent σε κάθε υπόθεση.
            </p>
          </div>
        </div>
        <ResultBanner result={agentsResult} type="success" />
        <ResultBanner result={agentsError} type="error" />
        <button
          onClick={handleSyncAgents}
          disabled={loadingAgents}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loadingAgents
            ? <><Spinner color="blue" /><span>Συγχρονισμός...</span></>
            : <><ArrowPathIcon className="w-4 h-4" /><span>Συγχρονισμός Agents</span></>
          }
        </button>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-gray-50 px-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Ανάθεση Pipeline ανά Τύπο Υπηρεσίας
          </span>
        </div>
      </div>

      {/* Program Assignment Section */}
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-50 rounded-lg flex-shrink-0">
              <TagIcon className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-1">
                Ανάθεση Pipeline ανά Τύπο Υπηρεσίας
              </h2>
              <p className="text-sm text-gray-500">
                Φορτώστε όλους τους τύπους υπηρεσιών και αναθέστε κάθε έναν στο σωστό pipeline
                (ΕΣΠΑ / ΔΥΠΑ / Μικροπιστώσεις). Ενημερώνει όλες τις σχετικές υποθέσεις.
              </p>
            </div>
          </div>
          <button
            onClick={handleLoadServiceTypes}
            disabled={loadingServiceTypes}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {loadingServiceTypes ? <Spinner /> : <ArrowPathIcon className="w-4 h-4" />}
            {loadingServiceTypes ? 'Φόρτωση...' : 'Φόρτωση Τύπων'}
          </button>
        </div>

        <ResultBanner result={assignResult} type="success" />
        <ResultBanner result={assignError} type="error" />

        {serviceTypes && serviceTypes.length > 0 && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Τύπος Υπηρεσίας</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Υποθέσεις</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-52">Pipeline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {serviceTypes.map((row, i) => {
                    const key = row.service_type ?? ''
                    const current = programAssignments[key] ?? row.program_category
                    const changed = current !== row.program_category
                    const PROGRAM_COLORS = {
                      'ΕΣΠΑ': 'bg-blue-100 text-blue-800',
                      'ΔΥΠΑ': 'bg-green-100 text-green-800',
                      'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ': 'bg-purple-100 text-purple-800',
                    }
                    return (
                      <tr key={i} className={changed ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-2.5 font-medium text-gray-800">
                          {row.service_type || <span className="text-gray-400 italic">(χωρίς τύπο)</span>}
                          {changed && <span className="ml-2 text-xs text-amber-600 font-semibold">● αλλαγή</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                            {row.total}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={current}
                            onChange={e => setProgramAssignments(prev => ({ ...prev, [key]: e.target.value }))}
                            className={`text-xs font-semibold px-2 py-1 rounded-lg border-0 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-500 outline-none ${PROGRAM_COLORS[current] || 'bg-gray-100 text-gray-700'}`}
                          >
                            <option value="ΕΣΠΑ">ΕΣΠΑ</option>
                            <option value="ΔΥΠΑ">ΔΥΠΑ / ΟΑΕΔ</option>
                            <option value="ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ">Μικροπιστώσεις</option>
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {Object.entries(programAssignments).filter(([k, v]) => {
                  const orig = serviceTypes.find(r => (r.service_type ?? '') === k)?.program_category
                  return orig && v !== orig
                }).length} αλλαγές εκκρεμούν
              </p>
              <button
                onClick={handleAssignPrograms}
                disabled={loadingAssign}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {loadingAssign ? <><Spinner /><span>Αποθήκευση...</span></> : <><TagIcon className="w-4 h-4" /><span>Αποθήκευση Αναθέσεων</span></>}
              </button>
            </div>
          </div>
        )}

        {serviceTypes && serviceTypes.length === 0 && (
          <div className="text-center py-6 text-sm text-gray-400">Δεν βρέθηκαν τύποι υπηρεσιών.</div>
        )}
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
        <div className="relative flex justify-center">
          <span className="bg-gray-50 px-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">Εφάπαξ Συγχρονισμοί</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Ενημέρωση πεδίων από Google Sheet</h2>
        <p className="text-sm text-gray-500">Εφάπαξ ενημέρωση υφιστάμενων υποθέσεων. Δεν δημιουργεί νέες εγγραφές.</p>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[220px] border rounded-lg p-4 space-y-2">
            <div className="text-sm font-semibold text-gray-800">Ύψος Επένδυσης (€)</div>
            <p className="text-xs text-gray-500">Ενημερώνει το πεδίο <strong>Ύψος Επένδυσης</strong> από τη στήλη «ΥΨΟΣ ΕΠΕΝΔΥΣΗΣ» του Sheet.</p>
            {investmentResult && <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1">{investmentResult}</p>}
            <button onClick={handleSyncInvestment} disabled={loadingInvestment}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {loadingInvestment ? <><Spinner /><span>Συγχρ...</span></> : <><ArrowPathIcon className="w-3.5 h-3.5" /><span>Εκτέλεση</span></>}
            </button>
          </div>
          <div className="flex-1 min-w-[220px] border rounded-lg p-4 space-y-2">
            <div className="text-sm font-semibold text-gray-800">Ημ/νία Πώλησης</div>
            <p className="text-xs text-gray-500">Ενημερώνει το πεδίο <strong>Ημ. Πώλησης</strong> από τη στήλη «ΗΜ.ΝΙΑ ΠΩΛΗΣΗΣ» (παλαιότερη ημερομηνία ανά υπόθεση).</p>
            {saleDatesResult && <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1">{saleDatesResult}</p>}
            <button onClick={handleSyncSaleDates} disabled={loadingSaleDates}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {loadingSaleDates ? <><Spinner /><span>Συγχρ...</span></> : <><ArrowPathIcon className="w-3.5 h-3.5" /><span>Εκτέλεση</span></>}
            </button>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
        <div className="relative flex justify-center">
          <span className="bg-gray-50 px-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">🏠 Εισαγωγή ΑΝΑΚΑΙΝΙΖΩ</span>
        </div>
      </div>

      {/* ΑΝΑΚΑΙΝΙΖΩ Import Section */}
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-50 rounded-lg flex-shrink-0">
            <CloudArrowDownIcon className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-800 mb-1">Εισαγωγή από Google Sheet ΑΝΑΚΑΙΝΙΖΩ</h2>
            <p className="text-sm text-gray-500">
              Διαβάζει το sheet <span className="font-semibold text-gray-700">ΑΝΑΚΑΙΝΙΣΕΙΣ</span> και δημιουργεί ή ενημερώνει υποθέσεις ΑΝΑΚΑΙΝΙΖΩ,
              συμπεριλαμβανομένων εγγράφων ακινήτου, στοιχείων χρήσης και κατάστασης.
            </p>
          </div>
        </div>

        {anaImportResult && (
          <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{anaImportResult}</span>
          </div>
        )}
        {anaImportError && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{anaImportError}</span>
          </div>
        )}

        {/* Preview results */}
        {anaPreviewData && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Αυτόματη εισαγωγή" value={anaPreviewData.auto_count} color="green" />
              <StatCard label="Διπλότυπα (επιλογή)" value={anaPreviewData.duplicate_groups?.length ?? 0} color="yellow" />
              <StatCard label="Ακυρωμένες (skip)" value={anaPreviewData.cancelled_count} color="gray" />
            </div>

            {/* Duplicate groups — checkboxes */}
            {anaPreviewData.duplicate_groups?.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-amber-700">
                  ⚠️ Διπλότυπα ονόματα — επιλέξτε ποιες εγγραφές να εισαχθούν:
                </p>
                {anaPreviewData.duplicate_groups.map(group => (
                  <div key={group.client_name} className="border border-amber-200 rounded-xl bg-amber-50 overflow-hidden">
                    <div className="px-4 py-2 bg-amber-100 border-b border-amber-200">
                      <span className="text-sm font-bold text-amber-900">{group.client_name}</span>
                    </div>
                    <div className="divide-y divide-amber-100">
                      {group.rows.map(row => (
                        <label key={row.sheet_row} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-amber-100 transition-colors">
                          <input
                            type="checkbox"
                            className="mt-0.5 w-4 h-4 accent-blue-600 flex-shrink-0"
                            checked={!!selectedDupRows[row.sheet_row]}
                            onChange={e => setSelectedDupRows(prev => ({ ...prev, [row.sheet_row]: e.target.checked }))}
                          />
                          <div className="flex-1 min-w-0 text-xs text-gray-700 space-y-0.5">
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                              {row.property_prefecture && <span>📍 {row.property_prefecture}</span>}
                              {row.property_sqm && <span>📐 {row.property_sqm} τ.μ.</span>}
                              {row.property_usage && <span>🏠 {row.property_usage}</span>}
                              {row.property_age && <span>📅 {row.property_age}</span>}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-gray-500">
                              {row.phone && <span>📞 {row.phone}</span>}
                              {row.status && <span className="font-medium text-blue-600">{row.status}</span>}
                              <span className="text-gray-400">Γραμμή {row.sheet_row}</span>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Column mapping diagnostic */}
        {anaHeadersData && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 space-y-2">
            <div className="text-xs font-bold text-yellow-800 uppercase tracking-wide mb-2">
              Στήλες Sheet (διάγνωση)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-yellow-100">
                    <th className="px-2 py-1 text-left font-bold text-yellow-900 border border-yellow-200">Col #</th>
                    <th className="px-2 py-1 text-left font-bold text-yellow-900 border border-yellow-200">Επικεφαλίδα</th>
                    {anaHeadersData.sample_rows.map((_, i) => (
                      <th key={i} className="px-2 py-1 text-left font-bold text-yellow-900 border border-yellow-200">Γραμμή {i + 2}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {anaHeadersData.headers.map(({ col, header }) => (
                    <tr key={col} className="hover:bg-yellow-100">
                      <td className="px-2 py-1 border border-yellow-200 font-mono font-bold text-yellow-700">{col}</td>
                      <td className="px-2 py-1 border border-yellow-200 font-semibold text-gray-800">{header || <span className="text-gray-400">(κενό)</span>}</td>
                      {anaHeadersData.sample_rows.map((row, i) => (
                        <td key={i} className="px-2 py-1 border border-yellow-200 text-gray-600 max-w-[160px] truncate">
                          {row[col]?.value || <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleAnaHeaders}
            disabled={loadingAnaHeaders}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-yellow-100 text-yellow-800 text-sm font-medium hover:bg-yellow-200 disabled:opacity-50 transition-colors border border-yellow-300"
          >
            {loadingAnaHeaders
              ? <><Spinner /><span>Φόρτωση...</span></>
              : <><TableCellsIcon className="w-4 h-4" /><span>Διάγνωση Στηλών</span></>
            }
          </button>
          <button
            onClick={handleAnaPreview}
            disabled={loadingAnaPreview}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors border"
          >
            {loadingAnaPreview
              ? <><Spinner /><span>Φόρτωση...</span></>
              : <><InformationCircleIcon className="w-4 h-4" /><span>Προεπισκόπηση</span></>
            }
          </button>
          <button
            onClick={handleAnaImport}
            disabled={loadingAnaImport}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loadingAnaImport
              ? <><Spinner color="blue" /><span>Εισαγωγή...</span></>
              : <><CloudArrowDownIcon className="w-4 h-4" /><span>Εισαγωγή ΑΝΑΚΑΙΝΙΖΩ</span></>
            }
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Η εισαγωγή είναι ασφαλής — υπάρχουσες υποθέσεις ενημερώνονται, δεν διαγράφονται. Εγγραφές με χρήση ΜΙΣΘΩΜΕΝΟ/ΙΔΙΟΚΑΤΟΙΚΗΣΗ παραλείπονται αυτόματα.
        </p>
      </div>
    </div>
  )
}
