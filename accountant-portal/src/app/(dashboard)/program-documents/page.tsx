'use client'
import { useEffect, useState } from 'react'
import { FileText, Plus, Pencil, Trash2, Check, X } from 'lucide-react'

type DocCategory = 'SELF_SERVICE' | 'VIA_ACCOUNTANT'

interface ProgramDocument {
  id: string
  name: string
  category: DocCategory
  instructions: string | null
  order: number
}

const CATEGORY_LABELS: Record<DocCategory, string> = {
  SELF_SERVICE: 'Αυτοεξυπηρέτηση',
  VIA_ACCOUNTANT: 'Μέσω Λογιστή',
}

const CATEGORY_COLORS: Record<DocCategory, string> = {
  SELF_SERVICE: 'bg-emerald-100 text-emerald-700',
  VIA_ACCOUNTANT: 'bg-amber-100 text-amber-700',
}

function EmptyRow({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <FileText className="w-10 h-10 mb-3 opacity-40" />
      <p className="text-sm font-medium mb-4">Δεν υπάρχουν έγγραφα στο λεξικό ακόμη</p>
      <button onClick={onCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
        <Plus className="w-4 h-4" /> Προσθήκη πρώτου εγγράφου
      </button>
    </div>
  )
}

interface RowEditState {
  name: string
  category: DocCategory
  instructions: string
}

export default function ProgramDocumentsPage() {
  const [docs, setDocs] = useState<ProgramDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<RowEditState>({ name: '', category: 'SELF_SERVICE', instructions: '' })
  const [adding, setAdding] = useState(false)
  const [newDoc, setNewDoc] = useState<RowEditState>({ name: '', category: 'SELF_SERVICE', instructions: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/program-documents')
    const data = await res.json()
    setDocs(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (!newDoc.name.trim()) { setError('Το όνομα είναι υποχρεωτικό'); return }
    setSaving(true); setError(null)
    const res = await fetch('/api/admin/program-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDoc.name.trim(), category: newDoc.category, instructions: newDoc.instructions.trim() || null }),
    })
    setSaving(false)
    if (!res.ok) { setError('Σφάλμα αποθήκευσης'); return }
    setAdding(false)
    setNewDoc({ name: '', category: 'SELF_SERVICE', instructions: '' })
    await load()
  }

  async function handleSaveEdit(id: string) {
    if (!editState.name.trim()) { setError('Το όνομα είναι υποχρεωτικό'); return }
    setSaving(true); setError(null)
    const res = await fetch(`/api/admin/program-documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editState.name.trim(), category: editState.category, instructions: editState.instructions.trim() || null }),
    })
    setSaving(false)
    if (!res.ok) { setError('Σφάλμα αποθήκευσης'); return }
    setEditingId(null)
    await load()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Διαγραφή εγγράφου "${name}"; Θα αφαιρεθεί από όλα τα προγράμματα.`)) return
    await fetch(`/api/admin/program-documents/${id}`, { method: 'DELETE' })
    await load()
  }

  function startEdit(doc: ProgramDocument) {
    setEditingId(doc.id)
    setEditState({ name: doc.name, category: doc.category, instructions: doc.instructions || '' })
    setError(null)
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Λεξικό Εγγράφων</h1>
          <p className="text-sm text-slate-500 mt-1">Έγγραφα που ο Ερμής ζητάει μετά από θετικό έλεγχο επιλεξιμότητας. Αντιστοιχίζονται ανά πρόγραμμα.</p>
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setError(null) }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" /> Νέο Έγγραφο
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {/* Legend */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Αυτοεξυπηρέτηση — ο πελάτης το βγάζει μόνος του</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Μέσω Λογιστή — χρειάζεται τον λογιστή του</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Φόρτωση...</div>
        ) : docs.length === 0 && !adding ? (
          <EmptyRow onCreate={() => setAdding(true)} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Έγγραφο</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-44">Κατηγορία</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Οδηγία (προαιρετικά)</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* New row */}
              {adding && (
                <tr className="bg-indigo-50/50">
                  <td className="px-4 py-3">
                    <input
                      autoFocus
                      className="w-full border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="π.χ. Ε3 τελευταίου έτους"
                      value={newDoc.name}
                      onChange={e => setNewDoc(p => ({ ...p, name: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setAdding(false) }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                      value={newDoc.category}
                      onChange={e => setNewDoc(p => ({ ...p, category: e.target.value as DocCategory }))}
                    >
                      <option value="SELF_SERVICE">Αυτοεξυπηρέτηση</option>
                      <option value="VIA_ACCOUNTANT">Μέσω Λογιστή</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="w-full border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="π.χ. Βρίσκετε στο TAXISnet > Δηλώσεις > Εκτύπωση"
                      value={newDoc.instructions}
                      onChange={e => setNewDoc(p => ({ ...p, instructions: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setAdding(false) }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={handleCreate} disabled={saving}
                        className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setAdding(false)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {docs.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                  {editingId === doc.id ? (
                    <>
                      <td className="px-4 py-3">
                        <input
                          autoFocus
                          className="w-full border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          value={editState.name}
                          onChange={e => setEditState(p => ({ ...p, name: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(doc.id); if (e.key === 'Escape') setEditingId(null) }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                          value={editState.category}
                          onChange={e => setEditState(p => ({ ...p, category: e.target.value as DocCategory }))}
                        >
                          <option value="SELF_SERVICE">Αυτοεξυπηρέτηση</option>
                          <option value="VIA_ACCOUNTANT">Μέσω Λογιστή</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-full border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          value={editState.instructions}
                          onChange={e => setEditState(p => ({ ...p, instructions: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(doc.id); if (e.key === 'Escape') setEditingId(null) }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleSaveEdit(doc.id)} disabled={saving}
                            className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium text-slate-800">{doc.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[doc.category]}`}>
                          {CATEGORY_LABELS[doc.category]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{doc.instructions || <span className="italic opacity-50">—</span>}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => startEdit(doc)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(doc.id, doc.name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
