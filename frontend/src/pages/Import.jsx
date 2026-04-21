import { useState } from 'react'
import {
  TableCellsIcon,
  CloudArrowDownIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  DocumentArrowDownIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { previewSheet, importFromSheet, syncPaidFromSheet, syncAgentsFromSheet } from '../api'

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

export default function Import() {
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

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
        <InformationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Πώς λειτουργεί:</span>{' '}
          Πρώτα εκτελέστε <span className="font-medium">Προεπισκόπηση</span> για να δείτε ποιες
          υποθέσεις θα εισαχθούν. Στη συνέχεια πατήστε <span className="font-medium">Εισαγωγή</span>{' '}
          για να ολοκληρωθεί η διαδικασία. Οι ήδη εισηγμένες υποθέσεις (με βάση το ΑΦΜ) παραλείπονται.
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
    </div>
  )
}
