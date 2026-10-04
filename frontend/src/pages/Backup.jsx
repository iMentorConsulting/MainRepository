import { useState, useEffect } from 'react'
import {
  CloudArrowUpIcon, ArrowDownTrayIcon, ArrowPathIcon,
  CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon,
  ClockIcon, DocumentTextIcon, XCircleIcon,
} from '@heroicons/react/24/outline'
import {
  getBackupDriveStatus, getDriveDiagnostics, getBackupScheduleStatus,
  exportBackup, uploadBackupToDrive,
  listDriveBackups, downloadFromDrive, restoreBackup,
} from '../api'
import toast from 'react-hot-toast'

function formatBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatDriveDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' })
}

function StatusBadge({ ok, label }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
      <CheckCircleIcon className="w-3.5 h-3.5" /> {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
      <ExclamationTriangleIcon className="w-3.5 h-3.5" /> {label}
    </span>
  )
}

export default function Backup() {
  const [driveStatus, setDriveStatus] = useState(null)
  const [backups, setBackups] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [restoring, setRestoring] = useState(null) // file id being restored
  const [confirmRestore, setConfirmRestore] = useState(null) // file to confirm
  const [diagnostics, setDiagnostics] = useState(null)
  const [loadingDiag, setLoadingDiag] = useState(false)
  const [scheduleStatus, setScheduleStatus] = useState(null)

  useEffect(() => {
    getBackupDriveStatus().then(r => setDriveStatus(r.data)).catch(() => {})
    getBackupScheduleStatus().then(r => setScheduleStatus(r.data)).catch(() => {})
    loadList()
  }, [])

  function loadList() {
    setLoadingList(true)
    listDriveBackups()
      .then(r => setBackups(r.data.files || []))
      .catch(() => setBackups([]))
      .finally(() => setLoadingList(false))
  }

  async function handleDiagnostics() {
    setLoadingDiag(true)
    try {
      const r = await getDriveDiagnostics()
      setDiagnostics(r.data)
    } catch (e) {
      toast.error('Σφάλμα diagnostics')
    } finally {
      setLoadingDiag(false)
    }
  }

  async function handleExport() {
    try {
      const resp = await exportBackup()
      const url = window.URL.createObjectURL(new Blob([resp.data], { type: 'application/json' }))
      const a = document.createElement('a')
      const cd = resp.headers['content-disposition'] || ''
      const match = cd.match(/filename="(.+)"/)
      a.href = url
      a.download = match ? match[1] : 'backup.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Backup αποθηκεύτηκε τοπικά')
    } catch {
      toast.error('Σφάλμα εξαγωγής backup')
    }
  }

  async function handleUpload() {
    setUploading(true)
    try {
      const r = await uploadBackupToDrive()
      toast.success(`Ανέβηκε: ${r.data.filename}`)
      loadList()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Σφάλμα ανεβάσματος')
    } finally {
      setUploading(false)
    }
  }

  async function handleRestore(file) {
    setRestoring(file.id)
    setConfirmRestore(null)
    setDownloading(true)
    try {
      const r = await downloadFromDrive(file.id)
      setDownloading(false)
      const result = await restoreBackup(r.data)
      const counts = result.data.counts || {}
      const total = Object.values(counts).reduce((s, v) => s + v, 0)
      toast.success(`Επαναφορά ολοκληρώθηκε — ${total} εγγραφές`)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Σφάλμα επαναφοράς')
    } finally {
      setRestoring(null)
      setDownloading(false)
    }
  }

  const driveOk = driveStatus?.drive_configured

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backup & Επαναφορά</h1>
        <p className="mt-1 text-sm text-gray-500">
          Εξαγωγή δεδομένων επιχείρησης και αποθήκευση στο Google Drive
        </p>
      </div>

      {/* Drive status card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <CloudArrowUpIcon className="w-5 h-5 text-blue-500" />
            Google Drive
          </h2>
          {driveStatus && (
            <StatusBadge ok={driveOk} label={driveOk ? 'Συνδεδεμένο' : 'Μη ρυθμισμένο'} />
          )}
        </div>

        {/* Diagnostics */}
        <div>
          <button
            onClick={handleDiagnostics}
            disabled={loadingDiag}
            className="text-xs text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
          >
            {loadingDiag ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : null}
            Έλεγχος σύνδεσης Drive
          </button>
          {diagnostics && (
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs font-mono space-y-1 text-gray-700 overflow-x-auto">
              <p><span className="font-semibold">Folder ID:</span> {diagnostics.folder_id || '—'}</p>
              {diagnostics.checks && Object.entries(diagnostics.checks).map(([k, v]) => (
                <p key={k}><span className="font-semibold">{k}:</span> {JSON.stringify(v)}</p>
              ))}
              {diagnostics.accessible_drives?.length > 0 && (
                <div>
                  <p className="font-semibold mt-1">Προσβάσιμα Shared Drives:</p>
                  {diagnostics.accessible_drives.map(d => (
                    <p key={d.id} className="pl-2">• {d.name} <span className="text-gray-400">({d.id})</span></p>
                  ))}
                </div>
              )}
              {diagnostics.accessible_drives?.length === 0 && (
                <p className="text-red-600 font-semibold">
                  ⚠ Κανένα Shared Drive δεν είναι ορατό — το service account δεν είναι μέλος κανενός Shared Drive.
                  Προσθέστε το στο Shared Drive: Manage members → Add το email του service account → Content manager.
                </p>
              )}
              {diagnostics.drives_list_error && (
                <p className="text-red-500">{diagnostics.drives_list_error}</p>
              )}
            </div>
          )}
        </div>

        {driveStatus && !driveOk && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm space-y-3">
            <p className="font-medium text-amber-800 flex items-center gap-1.5">
              <InformationCircleIcon className="w-4 h-4 shrink-0" />
              Απαιτείται ρύθμιση service account για αυτόματο backup
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-amber-700">
              <li>Μεταβείτε στο <strong>Google Cloud Console</strong> → δημιουργήστε project</li>
              <li>Ενεργοποιήστε το <strong>Google Drive API</strong></li>
              <li>Δημιουργήστε <strong>Service Account</strong> → κατεβάστε JSON key</li>
              <li>Αποθηκεύστε το αρχείο ως <code className="bg-amber-100 px-1 rounded">service_account.json</code> στον φάκελο <code className="bg-amber-100 px-1 rounded">backend/</code></li>
              <li>Κάντε <strong>Share</strong> τον Drive φάκελο με το email του service account</li>
              <li>Αντιγράψτε το <strong>Folder ID</strong> από το URL του Drive φακέλου</li>
              <li>Προσθέστε στο <code className="bg-amber-100 px-1 rounded">backend/.env</code>:<br />
                <code className="block mt-1 bg-amber-100 px-2 py-1 rounded text-xs font-mono">
                  GOOGLE_SERVICE_ACCOUNT_JSON=service_account.json<br />
                  GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
                </code>
              </li>
              <li>Επανεκκινήστε τον server</li>
            </ol>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="flex items-center gap-1.5 text-xs">
                <StatusBadge ok={driveStatus.has_credentials} label="Credentials JSON" />
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <StatusBadge ok={driveStatus.has_folder_id} label="Folder ID" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={handleExport}
          className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-700 hover:text-blue-700 rounded-xl px-5 py-4 font-medium transition-colors shadow-sm"
        >
          <ArrowDownTrayIcon className="w-5 h-5" />
          Εξαγωγή τοπικά (JSON)
        </button>

        <button
          onClick={handleUpload}
          disabled={uploading || !driveOk}
          className={`flex items-center justify-center gap-2 rounded-xl px-5 py-4 font-medium transition-colors shadow-sm
            ${driveOk
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'}`}
        >
          {uploading
            ? <ArrowPathIcon className="w-5 h-5 animate-spin" />
            : <CloudArrowUpIcon className="w-5 h-5" />}
          {uploading ? 'Ανέβασμα…' : 'Αποθήκευση στο Drive'}
        </button>
      </div>

      {/* Backup list */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Αποθηκευμένα Backup</h2>
          <button
            onClick={loadList}
            disabled={loadingList}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
            Ανανέωση
          </button>
        </div>

        {loadingList ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            <ArrowPathIcon className="w-5 h-5 animate-spin mx-auto mb-2" />
            Φόρτωση…
          </div>
        ) : backups.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm space-y-1">
            <DocumentTextIcon className="w-8 h-8 mx-auto opacity-40" />
            <p>{driveOk ? 'Δεν υπάρχουν αποθηκευμένα backup' : 'Google Drive δεν είναι ρυθμισμένο'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {backups.map(f => (
              <li key={f.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                    <ClockIcon className="w-3 h-3 inline" />
                    {formatDriveDate(f.createdTime)}
                    <span>·</span>
                    {formatBytes(parseInt(f.size))}
                  </p>
                </div>
                <div className="ml-4 shrink-0">
                  {confirmRestore?.id === f.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 font-medium">Σίγουρα;</span>
                      <button
                        onClick={() => handleRestore(f)}
                        disabled={!!restoring}
                        className="flex items-center gap-1 text-xs bg-red-600 text-white rounded-lg px-3 py-1.5 hover:bg-red-700 transition-colors"
                      >
                        {restoring === f.id
                          ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                          : <CheckCircleIcon className="w-3.5 h-3.5" />}
                        Επαναφορά
                      </button>
                      <button
                        onClick={() => setConfirmRestore(null)}
                        className="text-xs text-gray-500 hover:text-gray-800 p-1.5 rounded-lg hover:bg-gray-100"
                      >
                        <XCircleIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRestore(f)}
                      disabled={!!restoring}
                      className="flex items-center gap-1.5 text-xs border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-700 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      <ArrowPathIcon className="w-3.5 h-3.5" />
                      Επαναφορά
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Scheduled backup status */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-2">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <ClockIcon className="w-5 h-5 text-gray-400" />
          Αυτόματο Backup
        </h2>
        <p className="text-xs text-gray-500">Εκτελείται καθημερινά στις 03:00 (ώρα Ελλάδος) για κάθε επιχείρηση ξεχωριστά</p>
        {scheduleStatus && scheduleStatus.status !== 'never_run' ? (
          <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${scheduleStatus.status === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {scheduleStatus.status === 'ok'
              ? <CheckCircleIcon className="w-4 h-4 shrink-0" />
              : <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />}
            <span>
              {scheduleStatus.status === 'ok'
                ? <>Τελευταίο backup: <strong>{scheduleStatus.filename}</strong> — {formatDriveDate(scheduleStatus.timestamp)}</>
                : <>Σφάλμα: {scheduleStatus.error}</>}
            </span>
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">Δεν έχει εκτελεστεί ακόμα (εκκρεμεί το πρώτο αυτόματο backup)</p>
        )}
      </div>

      {/* Info note */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 text-sm text-blue-800">
        <InformationCircleIcon className="w-5 h-5 shrink-0 mt-0.5 text-blue-500" />
        <div>
          <p className="font-medium">Απομονωμένη Επαναφορά</p>
          <p className="text-blue-600 mt-0.5">
            Η επαναφορά αφορά <strong>μόνο την επιχείρησή σας</strong> και δεν επηρεάζει άλλους χρήστες.
            Τα δεδομένα αντικαθίστανται πλήρως από το backup.
          </p>
        </div>
      </div>
    </div>
  )
}
