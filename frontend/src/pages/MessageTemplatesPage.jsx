import { useState, useEffect, useCallback } from 'react'
import { getMessageTemplates, getAllMessageTemplates, createMessageTemplate, updateMessageTemplate, deleteMessageTemplate, getAuth } from '../api'
import { PlusIcon, TrashIcon, CheckIcon, ArrowsUpDownIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const PROGRAMS = ['ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', 'ΕΣΠΑ', 'ΔΥΠΑ', 'ΔΥΠΑ-ΠΡΟΣΛΗΨΗΣ', 'ΑΝΑΚΑΙΝΙΖΩ']

function TemplateCard({ template, onSaved, onDeleted, isAdmin }) {
  const [form, setForm] = useState({
    label: template.label,
    text: template.text,
    programs: template.programs || [],
    sort_order: template.sort_order ?? 0,
    enabled: template.enabled ?? true,
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const set = (key, val) => { setForm(f => ({ ...f, [key]: val })); setDirty(true) }
  const toggleProg = (p) => set('programs', form.programs.includes(p) ? form.programs.filter(x => x !== p) : [...form.programs, p])

  const save = async () => {
    if (!form.label.trim() || !form.text.trim()) { toast.error('Συμπλήρωσε τίτλο και κείμενο'); return }
    setSaving(true)
    try {
      const payload = { ...form, programs: form.programs.length > 0 ? form.programs : null }
      const saved = await updateMessageTemplate(template.id, payload)
      onSaved(saved)
      setDirty(false)
      toast.success('Αποθηκεύτηκε')
    } catch { toast.error('Σφάλμα αποθήκευσης') } finally { setSaving(false) }
  }

  const del = async () => {
    if (!confirm(`Διαγραφή "${template.label}";`)) return
    await deleteMessageTemplate(template.id)
    onDeleted(template.id)
    toast.success('Διαγράφηκε')
  }

  return (
    <div className={`bg-white border rounded-xl p-4 space-y-3 transition-shadow ${dirty ? 'border-blue-400 shadow-md' : 'border-gray-200'}`}>
      <div className="flex items-center gap-3">
        <input
          value={form.label}
          onChange={e => set('label', e.target.value)}
          placeholder="Τίτλος προτύπου (π.χ. 👋 Πρώτη επικοινωνία)"
          className="flex-1 font-semibold border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
        <input
          type="number"
          value={form.sort_order}
          onChange={e => set('sort_order', Number(e.target.value))}
          title="Σειρά εμφάνισης"
          className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:border-blue-400 focus:outline-none"
        />
        <ArrowsUpDownIcon className="w-4 h-4 text-gray-300" title="Σειρά" />
      </div>

      <textarea
        value={form.text}
        onChange={e => set('text', e.target.value)}
        rows={4}
        placeholder="Κείμενο μηνύματος…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none resize-y"
      />

      <div>
        <div className="text-xs text-gray-400 mb-1.5">Εμφάνιση μόνο για προγράμματα (άδειο = όλα):</div>
        <div className="flex flex-wrap gap-1.5">
          {PROGRAMS.map(p => (
            <button key={p} type="button" onClick={() => toggleProg(p)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${form.programs.includes(p) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
          <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} className="rounded" />
          Ενεργό
        </label>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={del} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
              <TrashIcon className="w-3.5 h-3.5" />
              Διαγραφή
            </button>
          )}
          {dirty && (
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
              <CheckIcon className="w-3.5 h-3.5" />
              {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function NewTemplateCard({ nextOrder, onCreated, onCancel }) {
  const [form, setForm] = useState({ label: '', text: '', programs: [], sort_order: nextOrder, enabled: true })
  const [saving, setSaving] = useState(false)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const toggleProg = (p) => set('programs', form.programs.includes(p) ? form.programs.filter(x => x !== p) : [...form.programs, p])

  const save = async () => {
    if (!form.label.trim() || !form.text.trim()) { toast.error('Συμπλήρωσε τίτλο και κείμενο'); return }
    setSaving(true)
    try {
      const payload = { ...form, programs: form.programs.length > 0 ? form.programs : null }
      const saved = await createMessageTemplate(payload)
      onCreated(saved)
      toast.success('Δημιουργήθηκε')
    } catch { toast.error('Σφάλμα δημιουργίας') } finally { setSaving(false) }
  }

  return (
    <div className="bg-blue-50 border-2 border-blue-300 border-dashed rounded-xl p-4 space-y-3">
      <div className="text-sm font-semibold text-blue-700">Νέο Πρότυπο</div>
      <div className="flex items-center gap-3">
        <input
          value={form.label}
          onChange={e => set('label', e.target.value)}
          placeholder="Τίτλος (π.χ. 👋 Πρώτη επικοινωνία)"
          autoFocus
          className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white"
        />
        <input type="number" value={form.sort_order} onChange={e => set('sort_order', Number(e.target.value))}
          className="w-16 border border-blue-200 rounded-lg px-2 py-2 text-sm text-center bg-white focus:outline-none" />
      </div>
      <textarea value={form.text} onChange={e => set('text', e.target.value)}
        rows={4} placeholder="Κείμενο μηνύματος…"
        className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-y bg-white" />
      <div className="flex flex-wrap gap-1.5">
        {PROGRAMS.map(p => (
          <button key={p} type="button" onClick={() => toggleProg(p)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${form.programs.includes(p) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'}`}>
            {p}
          </button>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">Άκυρο</button>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
          <CheckIcon className="w-3.5 h-3.5" />
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
      </div>
    </div>
  )
}

export default function MessageTemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const auth = getAuth()
  const isAdmin = auth?.user?.role === 'admin'

  useEffect(() => {
    const fetch = getAllMessageTemplates
    fetch()
      .then(data => setTemplates(data.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)))
      .catch(() => toast.error('Σφάλμα φόρτωσης'))
      .finally(() => setLoading(false))
  }, [isAdmin])

  const onSaved = useCallback((saved) => {
    setTemplates(prev => prev.map(t => t.id === saved.id ? saved : t)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id))
  }, [])

  const onDeleted = useCallback((id) => {
    setTemplates(prev => prev.filter(t => t.id !== id))
  }, [])

  const onCreated = useCallback((saved) => {
    setTemplates(prev => [...prev, saved].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id))
    setAdding(false)
  }, [])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Πρότυπα Μηνυμάτων</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin ? 'Επεξεργαστείτε τα πρότυπα που εμφανίζονται στο modal αποστολής Leads.' : 'Έτοιμα πρότυπα μηνυμάτων για αποστολή σε leads.'}
          </p>
        </div>
        {isAdmin && !adding && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <PlusIcon className="w-4 h-4" />
            Νέο Πρότυπο
          </button>
        )}
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Φόρτωση…</div>}

      <div className="space-y-4">
        {isAdmin && adding && (
          <NewTemplateCard
            nextOrder={templates.length}
            onCreated={onCreated}
            onCancel={() => setAdding(false)}
          />
        )}
        {templates.map(t => (
          <TemplateCard
            key={t.id}
            template={t}
            onSaved={onSaved}
            onDeleted={onDeleted}
            readOnly={false}
            isAdmin={isAdmin}
          />
        ))}
        {!loading && templates.length === 0 && !adding && (
          <div className="text-center py-12 text-gray-400 text-sm">Δεν υπάρχουν πρότυπα ακόμη.</div>
        )}
      </div>
    </div>
  )
}
