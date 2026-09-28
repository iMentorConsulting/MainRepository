import { useState, useEffect } from 'react'
import api from '../api'
import toast from 'react-hot-toast'
import {
  CloudArrowUpIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  XCircleIcon,
  CircleStackIcon,
  ArrowPathIcon,
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

  // Lead status restore state
  const [snapshots, setSnapshots] = useState(null)
  const [loadingSnapshots, setLoadingSnapshots] = useState(false)
  const [selectedBackupId, setSelectedBackupId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const loadStatus = async () => {
    try {
      const res = await api.get('/api/cm/backup/status')
      setStatus(res.data)
    } catch {
      toast.error('Αδυναμία φόρτωσης κατάστασης backup')
    } finally {
      setLoadingStatus(false)
    }
  }

  useEffect(() => { loadStatus() }, [])

  const handleBackupNow = async () => {
    setBackingUp(true)
    try {
      const res = await api.post('/api/cm/backup/now')
      toast.success(res.data.message || 'Το backup ξεκίνησε')
      setTimeout(() => loadStatus(), 4000)
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
      a.download = `CaseMngt-backup_${today}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Το αρχείο εξάγεται...')
      await loadStatus()
    } catch {
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
    } catch {
      toast.error('Σφάλμα κατά τη λήψη backup')
    } finally {
      setDownloadingId(null)
    }
  }

  const loadSnapshots = async () => {
    setLoadingSnapshots(true)
    try {
      const res = await api.get('/api/cm/backup/lead-status-snapshots')
      setSnapshots(res.data)
      // Auto-select the most recent backup (first in list)
      if (res.data && res.data.length > 0) {
        setSelectedBackupId(res.data[0].id)
        setPreview(null)
      }
    } catch {
      toast.error('Αδυναμία φόρτωσης snapshots')
    } finally {
      setLoadingSnapshots(false)
    }
  }

  const handlePreview = async () => {
    if (!selectedBackupId) return
    setPreview(null)
    setLoadingPreview(true)
    try {
      const res = await api.post(`/api/cm/backup/restore-lead-statuses/${selectedBackupId}?apply=false`)
      setPreview(res.data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα κατά την προεπισκόπηση')
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleApply = async () => {
    if (!selectedBackupId || !preview) return
    if (!window.confirm(`Επαναφορά ${preview.would_restore_count} leads στο παλιό status; Η ενέργεια δεν αναιρείται.`)) return
    setRestoring(true)
    try {
      const res = await api.post(`/api/cm/backup/restore-lead-statuses/${selectedBackupId}?apply=true`)
      toast.success(`Επαναφέρθηκαν ${res.data.restored_count} leads`)
      setPreview(res.data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα κατά την επαναφορά')
    } finally {
      setRestoring(false)
    }
  }

  const lastSuccess = status?.logs?.find(l => l.status === 'success' && l.has_data)
  const scheduleHour = status?.schedule_hour ?? 2
  const scheduleLabel = `Κάθε μέρα στις ${String(scheduleHour).padStart(2, '0')}:00`
  const storedCount = status?.logs?.filter(l => l.status === 'success' && l.has_data).length ?? 0
  const driveOk = status?.drive_configured

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Αντίγραφα Ασφαλείας</h1>
        <p className="text-sm text-gray-500 mt-1">Διαχείριση αυτόματων και χειροκίνητων backup του συστήματος</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* DB storage */}
        <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
          <CircleStackIcon className="w-8 h-8 text-blue-500 shrink-0" />
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Αποθήκευση DB</div>
            <div className="text-sm font-semibold mt-0.5 text-blue-700">
              {loadingStatus ? '...' : `${storedCount}/30 αντίγραφα`}
            </div>
          </div>
        </div>

        {/* Google Drive */}
        <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
          {driveOk
            ? <CheckCircleIcon className="w-8 h-8 text-green-500 shrink-0" />
            : <XCircleIcon className="w-8 h-8 text-red-400 shrink-0" />
          }
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Google Drive</div>
            {loadingStatus ? (
              <div className="text-sm font-semibold mt-0.5 text-gray-400">...</div>
            ) : driveOk ? (
              <a
                href={status.drive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold mt-0.5 text-green-700 hover:underline block"
              >
                Άνοιγμα φακέλου ↗
              </a>
            ) : (
              <div className="text-sm font-semibold mt-0.5 text-red-600">Μη ρυθμισμένο</div>
            )}
          </div>
        </div>

        {/* Schedule */}
        <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
          <CloudArrowUpIcon className="w-8 h-8 text-purple-400 shrink-0" />
          <div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Επόμενο Αυτόματο</div>
            <div className="text-sm font-semibold mt-0.5 text-gray-800">
              {loadingStatus ? '...' : scheduleLabel}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {loadingStatus ? '' : lastSuccess ? `Τελευταίο: ${formatDate(lastSuccess.created_at)}` : 'Δεν υπάρχει ακόμα'}
            </div>
          </div>
        </div>
      </div>

      {/* Drive not configured warning */}
      {!loadingStatus && !driveOk && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <XCircleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">Το Google Drive δεν έχει ρυθμιστεί</p>
            <p>Ορίστε τις παρακάτω μεταβλητές περιβάλλοντος στο Railway και μοιραστείτε τον φάκελο με το service account:</p>
            <ul className="mt-2 space-y-1 font-mono text-xs bg-amber-100 rounded p-2">
              <li><span className="font-bold">GOOGLE_SERVICE_ACCOUNT_JSON</span> — JSON key του service account</li>
              <li><span className="font-bold">GOOGLE_DRIVE_FOLDER_ID</span> — ID φακέλου Drive (π.χ. 1OTfm8IER...)</li>
            </ul>
          </div>
        </div>
      )}

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

      {/* Lead Status Restore */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Επαναφορά Status Leads από Backup</h2>
            <p className="text-xs text-gray-500 mt-0.5">Συγκρίνει CANCEL / DEAL / HOT / ACTIVE / CALL leads από backup με τα σημερινά και επαναφέρει όσα άλλαξαν λανθασμένα</p>
          </div>
          <button onClick={loadSnapshots} disabled={loadingSnapshots}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium">
            <ArrowPathIcon className={`w-4 h-4 ${loadingSnapshots ? 'animate-spin' : ''}`} />
            {snapshots ? 'Ανανέωση' : 'Φόρτωση Backups'}
          </button>
        </div>

        {snapshots && (
          <div className="p-5 space-y-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Επιλογή Backup (πριν το πρόβλημα)</label>
                <select value={selectedBackupId || ''} onChange={e => { setSelectedBackupId(Number(e.target.value)); setPreview(null) }}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">— Επιλέξτε backup —</option>
                  {snapshots.map(s => (
                    <option key={s.id} value={s.id}>
                      {formatDate(s.created_at)} — {s.total_leads} leads ({s.deal_leads} DEAL, {s.cancel_leads} CANCEL)
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={handlePreview} disabled={!selectedBackupId || loadingPreview}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40">
                <ArrowPathIcon className={`w-4 h-4 ${loadingPreview ? 'animate-spin' : ''}`} />
                {loadingPreview ? 'Φόρτωση...' : 'Προεπισκόπηση'}
              </button>
            </div>

            {preview && (
              <div className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <span className="text-orange-700 font-semibold">⚠ {preview.applied ? preview.restored_count : preview.would_restore_count} leads θα αλλάξουν status</span>
                  {preview.deleted_count > 0 && <span className="text-red-600">🗑 {preview.deleted_count} leads διαγράφηκαν (δεν μπορούν να επαναφερθούν)</span>}
                </div>

                {!preview.applied && preview.would_restore_count > 0 && (
                  <button onClick={handleApply} disabled={restoring}
                    className="px-5 py-2 bg-red-600 text-white text-sm rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50">
                    {restoring ? 'Επαναφορά...' : `✅ Εφαρμογή Επαναφοράς (${preview.would_restore_count} leads)`}
                  </button>
                )}
                {preview.applied && <p className="text-green-700 font-semibold text-sm">✅ Επαναφορά ολοκληρώθηκε — {preview.restored_count} leads ενημερώθηκαν</p>}

                {/* Changes table */}
                {preview.changes.filter(c => c.action !== 'cannot_restore').length > 0 && (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-500">ID</th>
                          <th className="px-3 py-2 text-left text-gray-500">Όνομα</th>
                          <th className="px-3 py-2 text-left text-gray-500">ΑΦΜ</th>
                          <th className="px-3 py-2 text-left text-gray-500">Πρόγραμμα</th>
                          <th className="px-3 py-2 text-left text-gray-500">Backup Status</th>
                          <th className="px-3 py-2 text-left text-gray-500">Τρέχον Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.changes.filter(c => c.action !== 'cannot_restore').map(c => (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-500">{c.id}</td>
                            <td className="px-3 py-1.5 font-medium text-gray-800">{c.name || '—'}</td>
                            <td className="px-3 py-1.5 text-gray-600">{c.afm || '—'}</td>
                            <td className="px-3 py-1.5 text-gray-600 max-w-[180px] truncate">{c.program || '—'}</td>
                            <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 bg-green-100 text-green-800 rounded font-semibold">{c.backup_status}</span></td>
                            <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 bg-red-100 text-red-800 rounded font-semibold">{c.current_status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Deleted leads */}
                {preview.deleted_count > 0 && (
                  <details className="text-xs text-gray-500">
                    <summary className="cursor-pointer font-medium text-red-600">🗑 {preview.deleted_count} leads που διαγράφηκαν από dedup (δεν επαναφέρονται αυτόματα)</summary>
                    <div className="mt-2 space-y-0.5 pl-3">
                      {preview.changes.filter(c => c.action === 'cannot_restore').map(c => (
                        <div key={c.id}>#{c.id} {c.name} — {c.afm} — {c.backup_status}</div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Logs table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">Ιστορικό Backup</h2>
          <p className="text-xs text-gray-500 mt-0.5">Διατηρούνται τα 30 πιο πρόσφατα αντίγραφα</p>
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
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Drive</th>
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
                      {log.drive_file_id ? (
                        <a
                          href={`https://drive.google.com/file/d/${log.drive_file_id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-green-600 hover:text-green-800 text-xs font-medium"
                        >
                          ✓ Drive ↗
                        </a>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
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
                        <span className="text-gray-300 text-xs">—</span>
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
