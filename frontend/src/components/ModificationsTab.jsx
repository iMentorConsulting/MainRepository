import { useState } from 'react'
import { createCaseModification, updateCaseModification, deleteCaseModification } from '../api'
import { PlusIcon, TrashIcon, PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const today = () => new Date().toISOString().split('T')[0]

const fmtDate = (s) =>
  s ? new Date(s + 'T12:00:00').toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

const EMPTY = { modification_date: today(), title: '', justification: '', approval_date: '' }

function EditRow({ mod, caseId, onSaved, onCancel }) {
  const [form, setForm] = useState({
    modification_date: mod.modification_date || today(),
    title: mod.title || '',
    justification: mod.justification || '',
    approval_date: mod.approval_date || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.title.trim() || !form.modification_date) return
    setSaving(true)
    try {
      const payload = {
        modification_date: form.modification_date,
        title: form.title.trim(),
        justification: form.justification.trim() || null,
        approval_date: form.approval_date || null,
      }
      const result = mod.id
        ? await updateCaseModification(caseId, mod.id, payload)
        : await createCaseModification(caseId, payload)
      onSaved(result, !mod.id)
    } catch { toast.error('Σφάλμα αποθήκευσης') } finally { setSaving(false) }
  }

  return (
    <tr className="bg-blue-50">
      <td className="px-3 py-2">
        <input type="date" className="input text-sm w-36" value={form.modification_date}
          onChange={e => setForm(p => ({ ...p, modification_date: e.target.value }))} />
      </td>
      <td className="px-3 py-2">
        <input className="input text-sm w-full" placeholder="Τίτλος τροποποίησης" value={form.title}
          onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
      </td>
      <td className="px-3 py-2">
        <input className="input text-sm w-full" placeholder="Αιτιολογία (προαιρετικό)" value={form.justification}
          onChange={e => setForm(p => ({ ...p, justification: e.target.value }))} />
      </td>
      <td className="px-3 py-2">
        <input type="date" className="input text-sm w-36" value={form.approval_date}
          onChange={e => setForm(p => ({ ...p, approval_date: e.target.value }))} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <button onClick={handleSave} disabled={saving || !form.title.trim()}
          className="p-1 text-green-600 hover:text-green-800 disabled:opacity-40 mr-1">
          <CheckIcon className="w-4 h-4" />
        </button>
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </td>
    </tr>
  )
}

export default function ModificationsTab({ caseId, caseData, onRefresh }) {
  const mods = caseData?.modifications || []
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [localMods, setLocalMods] = useState(null)

  const displayed = localMods !== null ? localMods : mods

  const handleSaved = (result, isNew) => {
    if (isNew) {
      setLocalMods(prev => [...(prev || mods), result])
      setAdding(false)
    } else {
      setLocalMods(prev => (prev || mods).map(m => m.id === result.id ? result : m))
      setEditingId(null)
    }
    toast.success(isNew ? 'Τροποποίηση καταχωρήθηκε' : 'Ενημερώθηκε')
    onRefresh()
  }

  const handleDelete = async (id) => {
    if (!confirm('Διαγραφή τροποποίησης;')) return
    try {
      await deleteCaseModification(caseId, id)
      setLocalMods(prev => (prev || mods).filter(m => m.id !== id))
      toast.success('Διαγράφηκε')
      onRefresh()
    } catch { toast.error('Σφάλμα διαγραφής') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Αιτήματα Τροποποιήσεων</h3>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="btn-primary flex items-center gap-1 text-sm">
            <PlusIcon className="w-4 h-4" /> Νέα Τροποποίηση
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {displayed.length === 0 && !adding ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            Δεν υπάρχουν καταχωρημένες τροποποιήσεις
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Ημ/νία Τροπ.', 'Τίτλος', 'Αιτιολογία', 'Ημ/νία Έγκρισης', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {adding && (
                  <EditRow mod={EMPTY} caseId={caseId} onSaved={handleSaved} onCancel={() => setAdding(false)} />
                )}
                {displayed.map(m => (
                  editingId === m.id ? (
                    <EditRow key={m.id} mod={m} caseId={caseId} onSaved={handleSaved} onCancel={() => setEditingId(null)} />
                  ) : (
                    <tr key={m.id} className="hover:bg-gray-50 group">
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(m.modification_date)}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{m.title}</td>
                      <td className="px-3 py-2 text-gray-500">{m.justification || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                        {m.approval_date
                          ? <span className="text-green-700 font-medium">{fmtDate(m.approval_date)}</span>
                          : <span className="text-orange-500 text-xs">Εκκρεμεί</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingId(m.id)} className="p-1 text-gray-400 hover:text-blue-500 mr-1">
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(m.id)} className="p-1 text-gray-300 hover:text-red-500">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
