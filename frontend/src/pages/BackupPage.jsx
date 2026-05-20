import { useState, useEffect } from 'react'
import api from '../api'
import toast from 'react-hot-toast'
import {
  CloudArrowUpIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'

function formatBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('el-GR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function BackupPage() {
  const [status, setStatus] = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [backingUp, setBackingUp] = useState(false)
  const [exporting, setExporting] = useState(false)

  const loadStatus = async () => {
    try {
      const res = await api.get('/api/cm/backup/status')
      setStatus(res.data)
    } catch (err) {
      toast.error('Αδυναμία φόρτωσης κατάστασης backup')
    } finally {
      setLoadingStatus(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const handleBackupNow = async () => {
    setBackingUp(true)
    try {
      const res = await api.post('/api/cm/backup/now')
      toast.success(res.data.message || 'Το backup ξεκίνησε')
      setTimeout(() => loadStatus(), 3000)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα κατά το backup')
    } finally {
      setBackingUp(false)
    }
  }

  const handleExportJson = async () => {
    setExporting(true)
    try {
      const res = await api.get('/api/cm/backup/export-json', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      const today = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `imentor-backup-${today}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Το αρχείο εξάγεται...')
      await loadStatus()
    } catch (err) {
      toast.error('Σφάλμα κατά την εξαγωγή JSON')
    } finally {
      setExporting(false)
    }
  }

  const lastSuccess = status?.logs?.find(l => l.status === 'success')
  const scheduleHour = status?.schedule_hour ?? 2
  const scheduleLabel = `Κάθε μέρα στις ${String(scheduleHour).padStart(2, '0')}:00`

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Αντίγραφα Ασφαλείας</h1>
        <p className="text-sm text-gray-500 mt-1">Διαχείριση αυτόματων και χειροκίνητων backup του συστήματος</p>
      </div>

      {/* Drive not configured warning */}
      {status && !status.drive_configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <XCircleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">Το Google Drive δεν έχει ρυθμιστεί</p>
            <p>Για να ενεργοποιήσετε τα αυτόματα backup στο Drive, ορίστε τις παρακάτω μεταβλητές περιβάλλοντος:</p>
            <ul className="mt-2 space-y-1 font-mono text-xs bg-amber-100 rounded p-2">
              <li><span className="font-bold">GOOGLE_DRIVE_CREDENTIALS</span> — Περιεχόμενο JSON του service account key</li>
              <li><span className="font-bold">GOOGLE_DRIVE_FOLDER_ID</span> — ID του φακέλου Google Drive για τα backup</li>
              <li><span className="font-bold">BACKUP_SCHEDULE_HOUR</span> — Ώρα εκτέλεσης (προεπιλογή: 2)</li>
            </ul>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
          {status?.drive_configured ? (
            <CheckCircleIcon className="w-8 h-8 text-green-500 shrink-0" />
          ) : (
            <XCircleIcon className="w-8 h-8 text-red-400 shrink-0" />
          )}
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Google Drive</div>
            <div className={`text-sm font-semibold mt-0.5 ${status?.drive_configured ? 'text-green-700' : 'text-red-600'}`}>
              {loadingStatus ? '...' : status?.drive_configured ? 'Ρυθμισμένο' : 'Μη ρυθμισμένο'}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
          <CloudArrowUpIcon className="w-8 h-8 text-blue-400 shrink-0" />
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Τελευταίο Backup</div>
            <div className="text-sm font-semibold mt-0.5 text-gray-800">
              {loadingStatus ? '...' : lastSuccess ? formatDate(lastSuccess.created_at) : 'Δεν υπάρχει'}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
          <ArrowDownTrayIcon className="w-8 h-8 text-purple-400 shrink-0" />
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Επόμενο Αυτόματο</div>
            <div className="text-sm font-semibold mt-0.5 text-gray-800">
              {loadingStatus ? '...' : scheduleLabel}
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleBackupNow}
          disabled={backingUp || !status?.drive_configured}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <CloudArrowUpIcon className="w-4 h-4" />
          {backingUp ? 'Εκτέλεση...' : 'Backup Τώρα (Drive)'}
        </button>

        <button
          onClick={handleExportJson}
          disabled={exporting}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          {exporting ? 'Εξαγωγή...' : 'Εξαγωγή JSON'}
        </button>
      </div>

      {/* Logs table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">Ιστορικό Backup</h2>
          <p className="text-xs text-gray-500 mt-0.5">Τελευταίες 30 εγγραφές</p>
        </div>

        {loadingStatus ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Φόρτωση...</div>
        ) : !status?.logs?.length ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Δεν υπάρχουν αρχεία καταγραφής</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ημερομηνία/Ώρα</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Τύπος</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Προορισμός</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Κατάσταση</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Μέγεθος</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Drive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {status.logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(log.created_at)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {log.trigger === 'auto' ? 'Αυτόματο' : 'Χειροκίνητο'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {log.destination === 'drive' ? 'Google Drive' : 'Εξαγωγή JSON'}
                    </td>
                    <td className="px-4 py-3">
                      {log.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          <CheckCircleIcon className="w-3.5 h-3.5" /> Επιτυχία
                        </span>
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                            <XCircleIcon className="w-3.5 h-3.5" /> Αποτυχία
                          </span>
                          {log.error_message && (
                            <p className="text-xs text-red-600 mt-1 max-w-xs break-words">{log.error_message}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatBytes(log.size_bytes)}</td>
                    <td className="px-4 py-3">
                      {log.drive_file_id ? (
                        <a
                          href={`https://drive.google.com/file/d/${log.drive_file_id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs"
                        >
                          Άνοιγμα
                        </a>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
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
