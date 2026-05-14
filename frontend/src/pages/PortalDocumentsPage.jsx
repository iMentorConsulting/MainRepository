import { useState, useEffect, useRef } from 'react'
import api from '../api'
import {
  ArrowUpTrayIcon, DocumentIcon, TrashIcon, PencilIcon,
  ArrowPathIcon, CheckIcon, XMarkIcon, ArrowDownTrayIcon,
  FolderOpenIcon, FunnelIcon,
} from '@heroicons/react/24/outline'

const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_MB = 15

function fileType(mime) {
  return mime === 'application/pdf' ? 'PDF' : 'Word'
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('el-GR', {
    timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function FileBadge({ mime }) {
  const type = fileType(mime)
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${type === 'PDF' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
      {type}
    </span>
  )
}

// ─── Upload / Replace Form ───────────────────────────────────────────────────
function UploadForm({ serviceTypes, replaceFor, onDone, onCancel }) {
  const fileRef = useRef()
  const [serviceType, setServiceType] = useState(replaceFor?.service_type || '')
  const [desc, setDesc] = useState(replaceFor?.client_description || '')
  const [instructions, setInstructions] = useState(replaceFor?.client_instructions || '')
  const [notes, setNotes] = useState(replaceFor?.internal_notes || '')
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    if (!ALLOWED_MIME.includes(f.type)) { setError('Επιτρεπτές μορφές: PDF, DOC, DOCX'); return }
    if (f.size > MAX_MB * 1024 * 1024) { setError(`Μέγιστο μέγεθος ${MAX_MB}MB`); return }
    setError('')
    setSelectedFile(f)
  }

  async function submit() {
    if (!replaceFor && !selectedFile) { setError('Επιλέξτε αρχείο'); return }
    if (!serviceType.trim()) { setError('Επιλέξτε υπηρεσία'); return }
    if (!desc.trim()) { setError('Η περιγραφή είναι υποχρεωτική'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      if (selectedFile) fd.append('file', selectedFile)
      fd.append('service_type', serviceType.trim())
      fd.append('client_description', desc.trim())
      if (instructions.trim()) fd.append('client_instructions', instructions.trim())
      if (notes.trim()) fd.append('internal_notes', notes.trim())
      if (replaceFor) {
        await api.post(`/api/cm/portal-documents/${replaceFor.id}/replace`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      } else {
        await api.post('/api/cm/portal-documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      onDone()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Σφάλμα ανεβάσματος')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
      <p className="text-sm font-semibold text-blue-800">
        {replaceFor ? `Αντικατάσταση: ${replaceFor.original_filename}` : 'Νέο Έγγραφο'}
      </p>

      {/* Service type selector */}
      {!replaceFor && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Υπηρεσία <span className="text-red-500">*</span></label>
          <select value={serviceType} onChange={e => setServiceType(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
            <option value="">— Επιλέξτε υπηρεσία —</option>
            {serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* File picker */}
      <div onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-blue-300 rounded-lg p-5 text-center cursor-pointer hover:bg-blue-100 transition-colors">
        <ArrowUpTrayIcon className="w-8 h-8 text-blue-400 mx-auto mb-2" />
        {selectedFile
          ? <p className="text-sm font-medium text-blue-700">{selectedFile.name}</p>
          : <p className="text-sm text-gray-500">
              {replaceFor ? 'Κάντε κλικ για επιλογή νέου αρχείου (αν θέλετε να αλλάξετε)' : 'Κάντε κλικ για επιλογή PDF / DOC / DOCX'}
            </p>
        }
        <input ref={fileRef} type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden" onChange={handleFile} />
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Περιγραφή για πελάτη <span className="text-red-500">*</span></label>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="π.χ. Εγκριτική Απόφαση ΕΣΠΑ"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Οδηγίες για πελάτη</label>
          <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2}
            placeholder="π.χ. Παρακαλείστε να διαβάσετε το έγγραφο και να μας ενημερώσετε..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            🔒 Εσωτερικές σημειώσεις <span className="text-gray-400">(δεν εμφανίζονται στον πελάτη)</span>
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Σχόλια για εσωτερική χρήση..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={uploading}
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

// ─── Edit meta form ──────────────────────────────────────────────────────────
function EditMetaForm({ file, onSave, onCancel }) {
  const [desc, setDesc] = useState(file.client_description)
  const [instructions, setInstructions] = useState(file.client_instructions || '')
  const [notes, setNotes] = useState(file.internal_notes || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('client_description', desc)
      fd.append('client_instructions', instructions)
      fd.append('internal_notes', notes)
      await api.put(`/api/cm/portal-documents/${file.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
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
        <label className="text-xs font-medium text-gray-600 block mb-1">Οδηγίες για πελάτη</label>
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">🔒 Εσωτερικές σημειώσεις</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          <CheckIcon className="w-4 h-4" /> Αποθήκευση
        </button>
        <button onClick={onCancel} className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function PortalDocumentsPage() {
  const [allFiles, setAllFiles] = useState([])
  const [serviceTypes, setServiceTypes] = useState([])
  const [filterService, setFilterService] = useState('Όλες')
  const [filterType, setFilterType] = useState('Όλα')
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [replaceFor, setReplaceFor] = useState(null)
  const [editingId, setEditingId] = useState(null)

  async function load() {
    try {
      const [files, types] = await Promise.all([
        api.get('/api/cm/portal-documents').then(r => r.data),
        api.get('/api/cm/portal-documents/service-types').then(r => r.data),
      ])
      setAllFiles(files)
      setServiceTypes(types)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(file) {
    if (!confirm(`Διαγραφή "${file.original_filename}" από "${file.service_type}";`)) return
    try {
      await api.delete(`/api/cm/portal-documents/${file.id}`)
      setAllFiles(f => f.filter(x => x.id !== file.id))
    } catch (e) {
      alert(e?.response?.data?.detail || 'Σφάλμα διαγραφής')
    }
  }

  async function handleDownload(file) {
    const res = await api.get(`/api/cm/portal-documents/${file.id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = file.original_filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Filters
  const filtered = allFiles.filter(f => {
    if (filterService !== 'Όλες' && f.service_type !== filterService) return false
    if (filterType !== 'Όλα' && fileType(f.mime_type) !== filterType) return false
    return true
  })

  // Group by service_type for display
  const grouped = filtered.reduce((acc, f) => {
    if (!acc[f.service_type]) acc[f.service_type] = []
    acc[f.service_type].push(f)
    return acc
  }, {})

  // Services that appear in the filtered list
  const activeServices = Object.keys(grouped).sort()

  // Services with at least 1 doc (for the filter dropdown)
  const servicesWithDocs = [...new Set(allFiles.map(f => f.service_type))].sort()

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <div className="text-center">
        <FolderOpenIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Φόρτωση...</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FolderOpenIcon className="w-6 h-6 text-blue-500" />
            Έγγραφα Portal
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Κεντρική διαχείριση εγγράφων ανά υπηρεσία — εμφανίζονται αυτόματα στο portal όλων των πελατών της κάθε υπηρεσίας
          </p>
        </div>
        {!showUpload && !replaceFor && (
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-sm">
            <ArrowUpTrayIcon className="w-4 h-4" /> Νέο Έγγραφο
          </button>
        )}
      </div>

      {/* Upload / Replace form */}
      {(showUpload || replaceFor) && (
        <UploadForm
          serviceTypes={serviceTypes}
          replaceFor={replaceFor}
          onDone={() => { setShowUpload(false); setReplaceFor(null); load() }}
          onCancel={() => { setShowUpload(false); setReplaceFor(null) }}
        />
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <FunnelIcon className="w-4 h-4 text-gray-400 shrink-0" />

        {/* Service type filter */}
        <select value={filterService} onChange={e => setFilterService(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
          <option value="Όλες">Όλες οι υπηρεσίες</option>
          {servicesWithDocs.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* File type filter */}
        {['Όλα', 'PDF', 'Word'].map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${filterType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {t}
          </button>
        ))}

        <span className="text-xs text-gray-400 ml-auto">{filtered.length} έγγραφα</span>
      </div>

      {/* Empty state */}
      {allFiles.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <FolderOpenIcon className="w-14 h-14 mx-auto mb-3 opacity-20" />
          <p className="text-base font-medium">Δεν υπάρχουν έγγραφα ακόμα</p>
          <p className="text-sm mt-1">Ανεβάστε το πρώτο έγγραφο για μια υπηρεσία</p>
        </div>
      )}

      {/* Grouped by service type */}
      {activeServices.map(service => (
        <div key={service} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Service header */}
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpenIcon className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-gray-800">{service}</span>
              <span className="text-xs text-gray-400 bg-gray-200 rounded-full px-2 py-0.5">{grouped[service].length}</span>
            </div>
          </div>

          {/* Files */}
          <div className="divide-y divide-gray-50">
            {grouped[service].map(file => (
              <div key={file.id}>
                {editingId === file.id ? (
                  <div className="p-4">
                    <EditMetaForm
                      file={file}
                      onSave={() => { setEditingId(null); load() }}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                ) : (
                  <div className="px-5 py-4 hover:bg-gray-50 transition-colors group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <DocumentIcon className="w-8 h-8 text-gray-200 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <FileBadge mime={file.mime_type} />
                            <span className="text-sm font-semibold text-gray-800">{file.client_description}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{file.original_filename} · {fmtDate(file.uploaded_at)}</p>
                          {file.client_instructions && (
                            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1 mt-1.5">
                              📋 <span className="font-medium">Οδηγίες:</span> {file.client_instructions}
                            </p>
                          )}
                          {file.internal_notes && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 mt-1">
                              🔒 {file.internal_notes}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleDownload(file)}
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
                        <button onClick={() => handleDelete(file)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Διαγραφή">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
