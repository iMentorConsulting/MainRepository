import { useState, useEffect } from 'react'
import { getPendingItemTemplates, createPendingItemTemplate, updatePendingItemTemplate, deletePendingItemTemplate } from '../api'
import { ClipboardDocumentListIcon, PlusIcon, TrashIcon, XMarkIcon, PencilIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const PROG_CATS = ['ΕΣΠΑ', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ']
const PROG_COLORS = {
  ΕΣΠΑ: 'bg-blue-100 text-blue-800 border-blue-200',
  ΔΥΠΑ: 'bg-green-100 text-green-800 border-green-200',
  ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ: 'bg-purple-100 text-purple-800 border-purple-200',
}

export default function PendingTemplatesPanel({ onClose }) {
  const [activeProgram, setActiveProgram] = useState('ΕΣΠΑ')
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')

  useEffect(() => { loadTemplates() }, [activeProgram])

  const loadTemplates = async () => {
    setLoading(true)
    try { setTemplates(await getPendingItemTemplates(activeProgram)) }
    catch { toast.error('Σφάλμα φόρτωσης') }
    finally { setLoading(false) }
  }

  const handleAdd = async () => {
    if (!newText.trim()) return
    setAdding(true)
    try {
      const t = await createPendingItemTemplate({ program_category: activeProgram, item_text: newText.trim(), sort_order: templates.length })
      setTemplates(prev => [...prev, t])
      setNewText('')
    } catch { toast.error('Σφάλμα προσθήκης') }
    finally { setAdding(false) }
  }

  const handleSaveEdit = async (id) => {
    if (!editText.trim()) return
    try {
      const t = await updatePendingItemTemplate(id, { item_text: editText.trim() })
      setTemplates(prev => prev.map(x => x.id === id ? t : x))
      setEditingId(null)
    } catch { toast.error('Σφάλμα ενημέρωσης') }
  }

  const handleDelete = async (id) => {
    if (!confirm('Διαγραφή εκκρεμότητας από τον κατάλογο;')) return
    try {
      await deletePendingItemTemplate(id)
      setTemplates(prev => prev.filter(x => x.id !== id))
    } catch { toast.error('Σφάλμα διαγραφής') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-xl">
              <ClipboardDocumentListIcon className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Κατάλογος Εκκρεμοτήτων</h2>
              <p className="text-xs text-gray-400 mt-0.5">Ορίστε τις εκκρεμότητες ανά τύπο προγράμματος</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 px-6 pt-4 pb-2 border-b bg-gray-50/50">
          {PROG_CATS.map(prog => (
            <button key={prog} onClick={() => setActiveProgram(prog)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${activeProgram === prog ? PROG_COLORS[prog] : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'}`}
            >{prog}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Δεν υπάρχουν εκκρεμότητες για {activeProgram}.<br />Προσθέστε παρακάτω.</p>
          ) : templates.map((t, idx) => (
            <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border bg-gray-50 group hover:bg-white hover:shadow-sm transition-all">
              <span className="text-xs font-bold text-gray-400 w-5 text-center">{idx + 1}</span>
              {editingId === t.id ? (
                <>
                  <input autoFocus className="flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    value={editText} onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(t.id); if (e.key === 'Escape') setEditingId(null) }}
                  />
                  <button onClick={() => handleSaveEdit(t.id)} className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600">Αποθήκευση</button>
                  <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1.5 text-gray-500 hover:text-gray-700">Ακύρωση</button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-800 font-medium">{t.item_text}</span>
                  <button onClick={() => { setEditingId(t.id); setEditText(t.item_text) }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-all" title="Επεξεργασία">
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(t.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all" title="Διαγραφή">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t bg-gray-50/50">
          <div className="flex gap-2">
            <input className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
              placeholder={`Νέα εκκρεμότητα για ${activeProgram}...`}
              value={newText} onChange={e => setNewText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button onClick={handleAdd} disabled={adding || !newText.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-40 transition-colors whitespace-nowrap">
              <PlusIcon className="w-4 h-4" />
              {adding ? 'Προσθήκη...' : 'Προσθήκη'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
