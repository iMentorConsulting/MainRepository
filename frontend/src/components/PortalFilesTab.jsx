import { useState, useEffect, useRef } from 'react'
import api, {
  getPortalFiles, uploadPortalAdminFile, replacePortalFile,
  updatePortalFileMeta, deletePortalFile
} from '../api'
import {
  ArrowUpTrayIcon, DocumentIcon, TrashIcon, PencilIcon,
  ArrowPathIcon, CheckIcon, XMarkIcon, ArrowDownTrayIcon
} from '@heroicons/react/24/outline'

async function downloadFile(caseId, fileId, filename) {
  const res = await api.get(`/api/cm/cases/${caseId}/portal-files/${fileId}/download`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const MAX_FILES = 10
const ALLOWED_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const FILTER_TYPES = ['Όλα', 'PDF', 'DOC', 'DOCX']

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('el-GR', { timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fileTypeLabel(mimeType) {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'application/msword') return 'DOC'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'DOCX'
  return '—'
}

function FileBadge({ mime }) {
  const type = fileTypeLabel(mime)
  const colors = {
    PDF: 'bg-red-100 text-red-700 border-red-200',
    DOC: 'bg-blue-100 text-blue-700 border-blue-200',
    DOCX: 'bg-blue-100 text-blue-700 border-blue-200',
  }
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${colors[type] || 'bg-gray-100 text-gray-600'}`}>
      {type}
    </span>
  )
}

function EditRow({ file, caseId, onSave, onCancel }) {
  const [desc, setDesc] = useState(file?.client_description || '')
  const [notes, setNotes] = useState(file?.internal_notes || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const fd = new FormData()
      if (desc !== file.client_description) fd.append('client_description', desc)
      if (notes !== (file.internal_notes || '')) fd.append('internal_notes', notes)
      await updatePortalFileMeta(caseId, file.id, fd)
      onSave()
    } catch (e) {
      alert(e?.response?.data?.detail || 'Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Περιγραφή για πελάτη</label>
        <input value={desc} onChange={e => setDesc(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Εσωτερικά σχόλια (μόνο εσωτερικά)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          <CheckIcon className="w-4 h-4" /> Αποθήκευση
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function UploadArea({ caseId, replaceFor, onDone, onCancel }) {
  const fileRef = useRef()
  const [desc, setDesc] = useState(replaceFor?.client_description || '')
  const [notes, setNotes] = useState(replaceFor?.internal_notes || '')
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    if (!ALLOWED_TYPES.includes(f.type)) { setError('Επιτρεπτές μορφές: PDF, DOC, DOCX'); return }
    if (f.size > 15 * 1024 * 1024) { setError('Μέγιστο μέγεθος 15MB'); return }
    setError('')
    setSelectedFile(f)
  }

  async function upload() {
    if (!selectedFile) { setError('Επιλέξτε αρχείο'); return }
    if (!desc.trim()) { setError('Η περιγραφή για τον πελάτη είναι υποχρεωτική'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', selectedFile)
      fd.append('client_description', desc.trim())
      if (notes.trim()) fd.append('internal_notes', notes.trim())
      if (replaceFor) {
        await replacePortalFile(caseId, replaceFor.id, fd)
      } else {
        await uploadPortalAdminFile(caseId, fd)
      }
      onDone()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Σφάλμα ανεβάσματος')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
      <p className="text-sm font-semibold text-blue-800">
        {replaceFor ? `Αντικατάσταση: ${replaceFor.original_filename}` : 'Νέο Έγγραφο'}
      </p>

      <div onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center cursor-pointer hover:bg-blue-100 transition-colors">
        <ArrowUpTrayIcon className="w-8 h-8 text-blue-400 mx-auto mb-2" />
        {selectedFile
          ? <p className="text-sm font-medium text-blue-700">{selectedFile.name} ({fmtSize(selectedFile.size)})</p>
          : <p className="text-sm text-gray-500">Κάντε κλικ για επιλογή αρχείου PDF / DOC / DOCX</p>
        }
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden" onChange={handleFile} />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Περιγραφή για πελάτη <span className="text-red-500">*</span></label>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="π.χ. Εγκριτική Απόφαση ΕΣΠΑ"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Εσωτερικά σχόλια (δεν εμφανίζονται στον πελάτη)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Σχόλια για εσωτερική χρήση..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button onClick={upload} disabled={uploading}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          <ArrowUpTrayIcon className="w-4 h-4" />
          {uploading ? 'Ανέβασμα...' : (replaceFor ? 'Αντικατάσταση' : 'Ανέβασμα')}
        </button>
        <button onClick={onCancel} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
          Ακύρωση
        </button>
      </div>
    </div>
  )
}

export default function PortalFilesTab({ caseId }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [replaceFor, setReplaceFor] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [filterType, setFilterType] = useState('Όλα')
  const [deleting, setDeleting] = useState(null)

  async function load() {
    try {
      const data = await getPortalFiles(caseId)
      setFiles(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [caseId])

  async function handleDelete(file) {
    if (!confirm(`Διαγραφή "${file.original_filename}";`)) return
    setDeleting(file.id)
    try {
      await deletePortalFile(caseId, file.id)
      setFiles(f => f.filter(x => x.id !== file.id))
    } catch (e) {
      alert(e?.response?.data?.detail || 'Σφάλμα διαγραφής')
    } finally {
      setDeleting(null)
    }
  }

  const filtered = filterType === 'Όλα' ? files : files.filter(f => fileTypeLabel(f.mime_type) === filterType)

  if (loading) return <div className="p-8 text-center text-gray-400">Φόρτωση...</div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-gray-800">Έγγραφα Portal</h3>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{files.length}/{MAX_FILES}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Type filter */}
          <div className="flex gap-1">
            {FILTER_TYPES.map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors ${filterType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {t}
              </button>
            ))}
          </div>
          {files.length < MAX_FILES && !showUpload && !replaceFor && (
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <ArrowUpTrayIcon className="w-4 h-4" /> Προσθήκη
            </button>
          )}
        </div>
      </div>

      {/* Upload form */}
      {(showUpload || replaceFor) && (
        <UploadArea
          caseId={caseId}
          replaceFor={replaceFor}
          onDone={() => { setShowUpload(false); setReplaceFor(null); load() }}
          onCancel={() => { setShowUpload(false); setReplaceFor(null) }}
        />
      )}

      {/* File list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <DocumentIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{filterType === 'Όλα' ? 'Δεν υπάρχουν έγγραφα' : `Δεν υπάρχουν έγγραφα τύπου ${filterType}`}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(file => (
            <div key={file.id} className="border border-gray-200 rounded-xl bg-white">
              {editingId === file.id ? (
                <EditRow file={file} caseId={caseId}
                  onSave={() => { setEditingId(null); load() }}
                  onCancel={() => setEditingId(null)} />
              ) : (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <DocumentIcon className="w-9 h-9 text-gray-300 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <FileBadge mime={file.mime_type} />
                          <span className="text-sm font-semibold text-gray-800 truncate">{file.client_description}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{file.original_filename} · {fmtSize(file.file_size)}</p>
                        {file.internal_notes && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-0.5 mt-1.5 inline-block">
                            🔒 {file.internal_notes}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">Ανέβηκε: {fmtDate(file.uploaded_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => downloadFile(caseId, file.id, file.original_filename)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Λήψη">
                        <ArrowDownTrayIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(file.id)}
                        className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors" title="Επεξεργασία">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setReplaceFor(file); setShowUpload(false) }}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Αντικατάσταση με νέα έκδοση">
                        <ArrowPathIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(file)} disabled={deleting === file.id}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40" title="Διαγραφή">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {files.length >= MAX_FILES && (
        <p className="text-xs text-center text-amber-600 bg-amber-50 rounded-lg py-2 px-3">
          Έχετε φτάσει το μέγιστο όριο {MAX_FILES} εγγράφων ανά υπόθεση. Διαγράψτε ένα για να προσθέσετε νέο.
        </p>
      )}
    </div>
  )
}
