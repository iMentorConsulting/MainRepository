import { useState, useEffect } from 'react'
import api from '../api'
import toast from 'react-hot-toast'
import {
  CloudArrowUpIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  XCircleIcon,
  CircleStackIcon,
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
  const [downloadingId, setDownloadingId] = useState(null)

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

  const handleDownload = async (log) => {
    setDownloadingId(log.id)
    try {
      const res = await api.get(`/api/cm/backup/download/${log.id}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = log.file_name || `backup-${log.id}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error('Σφάλμα κατά τη λήψη backup')
    } finally {
      setDownloadingId(null)
    }
  }

  const lastSuccess = status?.logs?.find(l => l.status === 'success' && l.has_data)
  const scheduleHour = status?.schedule_hour ?? 2
  const scheduleLabel = `Κάθε μέρα στις ${String(scheduleHour).padStart(2, '0')}:00`
  const storedCount = status?.logs?.filter(l => l.status === 'success' && l.has_data).length ?? 0

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Αντίγραφα Ασφαλείας</h1>
        <p className="text-sm text-gray-500 mt-1">Διαχείριση αυτόματων και χειροκίνητων backup του συστήματος</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
          <CircleStackIcon className="w-8 h-8 text-blue-500 shrink-0" />
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Αποθήκευση</div>
            <div className="text-sm font-semibold mt-0.5 text-blue-700">
              {loadingStatus ? '...' : `Βάση Δεδομένων (${storedCount}/30)`}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
          <CloudArrowUpIcon className="w-8 h-8 text-green-400 shrink-0" />
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
          disabled={backingUp}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <CloudArrowUpIcon className="w-4 h-4" />
          {backingUp ? 'Εκτέλεση...' : 'Backup Τώρα'}
        </button>

        <button
          onClick={handleExportJson}
          disabled={exporting}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          {exporting ? 'Εξαγωγή...' : 'Εξαγωγή JSON (Άμεσα)'}
        </button>
      </div>

      {/* Logs table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">Ιστορικό Backup</h2>
          <p className="text-xs text-gray-500 mt-0.5">Τελευταίες 30 εγγραφές — διατηρούνται τα 30 πιο πρόσφατα αντίγραφα</p>
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
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Κατάσταση</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Μέγεθος</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Λήψη</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {status.logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(log.created_at)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {log.trigger === 'auto' ? 'Αυτόματο' : 'Χειροκίνητο'}
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
                      {log.has_data ? (
                        <button
                          onClick={() => handleDownload(log)}
                          disabled={downloadingId === log.id}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium disabled:opacity-50"
                        >
                          <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                          {downloadingId === log.id ? '...' : 'Λήψη'}
                        </button>
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
