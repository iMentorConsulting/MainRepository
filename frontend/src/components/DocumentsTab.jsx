import { useState } from 'react'
import { createDocument, updateDocument, deleteDocument } from '../api'
import { TrashIcon, PlusIcon, DocumentIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const DOC_STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-600',
  reviewed: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}
const DOC_STATUS_LABELS = { pending: 'Εκκρεμεί', reviewed: 'Ελέγχθηκε', approved: 'Εγκρίθηκε', rejected: 'Απορρίφθηκε' }

export default function DocumentsTab({ caseId, caseData, onRefresh }) {
  const docs = caseData?.documents || []
  const [form, setForm] = useState({ name: '', document_type: '', status: 'pending', notes: '' })
  const [saving, setSaving] = useState(false)
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
      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-white rounded-xl border p-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><PlusIcon className="w-4 h-4" />Νέο Έγγραφο</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className="label">Όνομα *</label><input className="input" required {...f('name')} /></div>
          <div><label className="label">Τύπος</label><input className="input" placeholder="π.χ. Τιμολόγιο" {...f('document_type')} /></div>
          <div>
            <label className="label">Κατάσταση</label>
            <select className="input" {...f('status')}>
              {Object.entries(DOC_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label className="label">Σημειώσεις</label><input className="input" {...f('notes')} /></div>
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
                {['Όνομα', 'Τύπος', 'Κατάσταση', 'Από', 'Σημειώσεις', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                  <td className="px-4 py-3 text-gray-500">{d.document_type || '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={d.status}
                      onChange={e => handleStatusChange(d.id, e.target.value)}
                      className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${DOC_STATUS_COLORS[d.status]}`}
                    >
                      {Object.entries(DOC_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{d.uploaded_by || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{d.notes || '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(d.id)} className="text-gray-300 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
