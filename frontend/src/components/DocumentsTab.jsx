import { useState, useRef } from 'react'
import api, { createDocument, updateDocument, deleteDocument, uploadConsultantDocument } from '../api'
import { TrashIcon, PlusIcon, DocumentIcon, ArrowDownTrayIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

async function downloadDocument(caseId, docId, filename) {
  try {
    const res = await api.get(`/api/cm/cases/${caseId}/documents/${docId}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url; a.download = filename || 'document'; a.click()
    URL.revokeObjectURL(url)
  } catch { toast.error('Δεν βρέθηκε το αρχείο') }
}

const DOC_STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-600',
  reviewed: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}
const DOC_STATUS_LABELS = { pending: 'Εκκρεμεί', reviewed: 'Ελέγχθηκε', approved: 'Εγκρίθηκε', rejected: 'Απορρίφθηκε' }

const SOURCE_LABELS = {
  consultant: { label: 'Σύμβουλος', color: 'bg-blue-100 text-blue-700' },
  portal_general: { label: 'Πελάτης - Αποστολή', color: 'bg-green-100 text-green-700' },
  portal_pending_item: { label: 'Πελάτης - Εκκρεμή', color: 'bg-purple-100 text-purple-700' },
}

function NotesCell({ caseId, docId, initialValue, onRefresh }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialValue || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (value === (initialValue || '')) { setEditing(false); return }
    setSaving(true)
    try {
      await updateDocument(caseId, docId, { notes: value })
      onRefresh()
    } catch { toast.error('Σφάλμα αποθήκευσης') }
    finally { setSaving(false); setEditing(false) }
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="w-full border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setValue(initialValue || ''); setEditing(false) } }}
        disabled={saving}
        placeholder="Σχόλιο συμβούλου..."
      />
    )
  }
  return (
    <div
      onClick={() => setEditing(true)}
      className="cursor-pointer text-xs text-gray-500 hover:text-blue-600 hover:underline min-w-[80px] min-h-[20px] truncate"
      title={value || 'Κλικ για προσθήκη σχολίου'}
    >
      {value || <span className="text-gray-300 italic">+ σχόλιο</span>}
    </div>
  )
}

export default function DocumentsTab({ caseId, caseData, onRefresh }) {
  const docs = caseData?.documents || []
  const [form, setForm] = useState({ name: '', document_type: '', status: 'pending', notes: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [uploadType, setUploadType] = useState('')
  const fileRef = useRef(null)
  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })) })

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await createDocument(caseId, form)
      toast.success('Έγγραφο προστέθηκε')
      setForm({ name: '', document_type: '', status: 'pending', notes: '' })
      onRefresh()
    } catch { toast.error('Σφάλμα προσθήκης') } finally { setSaving(false) }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!uploadName) setUploadName(file.name)
    setUploading(true)
    try {
      await uploadConsultantDocument(caseId, file, uploadName || file.name, uploadType)
      toast.success('Αρχείο ανέβηκε')
      setUploadName(''); setUploadType('')
      if (fileRef.current) fileRef.current.value = ''
      onRefresh()
    } catch { toast.error('Σφάλμα ανεβάσματος') } finally { setUploading(false) }
  }

  const handleStatusChange = async (docId, status) => {
    try { await updateDocument(caseId, docId, { status }); onRefresh() }
    catch { toast.error('Σφάλμα ενημέρωσης') }
  }

  const handleDelete = async (id) => {
    if (!confirm('Διαγραφή εγγράφου;')) return
    try { await deleteDocument(caseId, id); toast.success('Διαγράφηκε'); onRefresh() }
    catch { toast.error('Σφάλμα διαγραφής') }
  }

  return (
    <div className="space-y-5">
      {/* Upload file form */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><PaperClipIcon className="w-4 h-4" />Ανέβασμα Αρχείου (Σύμβουλος)</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-40"><label className="label">Όνομα αρχείου</label><input className="input" placeholder="Αφήστε κενό για αυτόματο" value={uploadName} onChange={e => setUploadName(e.target.value)} /></div>
          <div className="w-40"><label className="label">Τύπος</label><input className="input" placeholder="π.χ. Τιμολόγιο" value={uploadType} onChange={e => setUploadType(e.target.value)} /></div>
          <div>
            <label className="label">Αρχείο *</label>
            <label className={`btn-primary flex items-center gap-2 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <PaperClipIcon className="w-4 h-4" />{uploading ? 'Ανέβασμα...' : 'Επιλογή Αρχείου'}
              <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
          </div>
        </div>
      </div>

      {/* Add metadata-only form */}
      <form onSubmit={handleAdd} className="bg-white rounded-xl border p-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><PlusIcon className="w-4 h-4" />Νέα Καταχώρηση (χωρίς αρχείο)</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className="label">Όνομα *</label><input className="input" required {...f('name')} /></div>
          <div><label className="label">Τύπος</label><input className="input" placeholder="π.χ. Τιμολόγιο" {...f('document_type')} /></div>
          <div>
            <label className="label">Κατάσταση</label>
            <select className="input" {...f('status')}>
              {Object.entries(DOC_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label className="label">Σχόλιο</label><input className="input" {...f('notes')} /></div>
        </div>
        <button type="submit" disabled={saving} className="btn-primary mt-3">{saving ? 'Αποθήκευση...' : 'Προσθήκη'}</button>
      </form>

      {/* Document list */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {docs.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <DocumentIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Δεν υπάρχουν έγγραφα</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Όνομα', 'Τύπος', 'Κατάσταση', 'Πηγή', 'Σχόλιο Συμβούλου', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map(d => {
                const src = SOURCE_LABELS[d.upload_source] || (d.uploaded_by_client ? SOURCE_LABELS.portal_general : SOURCE_LABELS.consultant)
                return (
                  <tr key={d.id} className={`hover:bg-gray-50 ${d.uploaded_by_client ? 'bg-green-50/40' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px]">
                      <div className="truncate" title={d.name}>{d.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{d.document_type || '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={d.status}
                        onChange={e => handleStatusChange(d.id, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${DOC_STATUS_COLORS[d.status]}`}
                      >
                        {Object.entries(DOC_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${src.color}`}>{src.label}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <NotesCell caseId={caseId} docId={d.id} initialValue={d.notes} onRefresh={onRefresh} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {d.has_file_data ? (
                          <button onClick={() => downloadDocument(caseId, d.id, d.name)} className="text-gray-300 hover:text-blue-500" title="Λήψη">
                            <ArrowDownTrayIcon className="w-4 h-4" />
                          </button>
                        ) : d.uploaded_by_client ? (
                          <span title="Αρχείο από παλιά έκδοση" className="text-xs text-amber-500">⚠</span>
                        ) : null}
                        <button onClick={() => handleDelete(d.id)} className="text-gray-300 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
