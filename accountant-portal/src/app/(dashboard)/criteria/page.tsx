'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MultiSelect } from '@/components/ui/multi-select'
import { Plus, Trash2, GripVertical, Pencil, Check, X, Upload } from 'lucide-react'

function BulkTagSection() {
  const [tag, setTag] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('tag', tag.trim())
    const res = await fetch('/api/admin/businesses/bulk-tag', { method: 'POST', body: formData })
    const data = await res.json()
    if (res.ok) {
      setResult(data)
    } else {
      setError(data.error || 'Σφάλμα')
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900">Μαζική Προσθήκη Tag με Λίστα ΑΦΜ</h2>
      <p className="text-gray-500 mt-1 text-sm">
        Ανεβάστε αρχείο CSV/XLSX με στήλη ΑΦΜ (ή λίστα ΑΦΜ, ένα ανά γραμμή) για να προσθέσετε ένα tag σε όλες τις αντίστοιχες επιχειρήσεις.
        Μπορείτε επίσης να συμπεριλάβετε στήλη <strong>TAG</strong> στο αρχείο για διαφορετικό tag ανά γραμμή (τότε το παρακάτω πεδίο Tag είναι προαιρετικό — χρησιμοποιείται μόνο ως fallback για γραμμές χωρίς TAG).
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Tag (προαιρετικό αν το αρχείο έχει στήλη TAG)</label>
          <input
            type="text"
            value={tag}
            onChange={e => setTag(e.target.value)}
            placeholder="π.χ. Οφειλές σε Δημόσιο"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Αρχείο (CSV/XLSX)</label>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="text-sm"
          />
        </div>
        <Button type="submit" disabled={loading || !file}>
          <Upload size={14} className="mr-1" /> {loading ? 'Επεξεργασία...' : 'Ανέβασμα'}
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {result && (
        <p className="mt-3 text-sm text-gray-700">
          Υποβλήθηκαν {result.submitted} ΑΦΜ, βρέθηκαν {result.matched}, ενημερώθηκαν {result.updated}.
          {result.notFound?.length > 0 && ` Δεν βρέθηκαν: ${result.notFound.join(', ')}`}
        </p>
      )}
    </div>
  )
}

interface Item {
  id: string
  label: string
  active: boolean
  order: number
  programIds?: string[]
}

function Section({ title, description, apiBase, programOptions }: { title: string; description: string; apiBase: string; programOptions?: { value: string; label: string }[] }) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch(apiBase)
    const data = await res.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newLabel.trim()) return
    setAdding(true)
    const res = await fetch(apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel.trim() }),
    })
    if (res.ok) {
      setNewLabel('')
      load()
    }
    setAdding(false)
  }

  async function toggleActive(item: Item) {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, active: !i.active } : i))
    await fetch(`${apiBase}/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active }),
    })
  }

  async function saveLabel(id: string) {
    if (!editLabel.trim()) return
    await fetch(`${apiBase}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: editLabel.trim() }),
    })
    setEditingId(null)
    load()
  }

  async function deleteItem(id: string) {
    if (!confirm('Διαγραφή στοιχείου;')) return
    const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' })
    if (res.ok) setItems(prev => prev.filter(i => i.id !== id))
  }

  async function setProgramIds(item: Item, programIds: string[]) {
    const prevItems = items
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, programIds } : i))
    const res = await fetch(`${apiBase}/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programIds }),
    })
    if (!res.ok) {
      setItems(prevItems)
      alert('Η αποθήκευση απέτυχε. Δοκιμάστε ξανά.')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <p className="text-gray-500 text-sm mt-1 mb-4">{description}</p>

      <form onSubmit={addItem} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          placeholder="Νέο στοιχείο..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <Button type="submit" disabled={adding}>
          <Plus size={16} className="mr-2" />
          Προσθήκη
        </Button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <div className="animate-spin w-6 h-6 border-4 border-blue-800 border-t-transparent rounded-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center text-gray-400 py-6 text-sm">Δεν υπάρχουν στοιχεία</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map(item => (
            <li key={item.id} className="py-2.5 space-y-1.5">
              <div className="flex items-center gap-3">
                <GripVertical size={14} className="text-gray-300 flex-shrink-0" />
                {editingId === item.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      autoFocus
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button onClick={() => saveLabel(item.id)} className="p-1.5 rounded hover:bg-green-50 text-green-600"><Check size={14} /></button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <span className={`flex-1 text-sm ${item.active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{item.label}</span>
                    <Badge
                      variant={item.active ? 'success' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() => toggleActive(item)}
                    >
                      {item.active ? 'Ενεργό' : 'Ανενεργό'}
                    </Badge>
                    <button onClick={() => { setEditingId(item.id); setEditLabel(item.label) }} className="p-1.5 rounded hover:bg-blue-50 text-blue-600"><Pencil size={14} /></button>
                    <button onClick={() => deleteItem(item.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                  </>
                )}
              </div>
              {programOptions && (
                <div className="pl-6">
                  <MultiSelect
                    options={programOptions}
                    selected={item.programIds || []}
                    onChange={ids => setProgramIds(item, ids)}
                    placeholder="Όλα τα προγράμματα"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function CriteriaPage() {
  const { data: session } = useSession()
  const [programOptions, setProgramOptions] = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    fetch('/api/programs')
      .then(r => r.json())
      .then(data => {
        const programs = Array.isArray(data) ? data : data.programs || []
        setProgramOptions(programs.map((p: any) => ({ value: p.id, label: p.title })))
      })
      .catch(() => {})
  }, [])

  if (session && session.user.role !== 'ADMIN') {
    redirect('/')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Πρόσθετα Κριτήρια & Λίστες</h1>
        <p className="text-gray-500 mt-1">Διαχείριση πρόσθετων προϋποθέσεων προγραμμάτων, λόγων απόρριψης match και tags επιχειρήσεων</p>
      </div>

      <Section
        title="Πρόσθετες Προϋποθέσεις Προγραμμάτων"
        description="Κριτήρια που μπορούν να επισυναφθούν σε προγράμματα και να ελεγχθούν χειροκίνητα ανά match (π.χ. 'Πτυχίο ΑΕΙ/ΤΕΙ μετά το 2016')"
        apiBase="/api/admin/criteria"
      />

      <Section
        title="Λόγοι Απόρριψης Match"
        description="Λόγοι που μπορεί να επιλέξει ο λογιστής όταν ένα match δεν είναι κατάλληλο για συγκεκριμένο πελάτη. Αν δεν επιλεγεί κανένα πρόγραμμα, ο λόγος ισχύει για όλα τα προγράμματα."
        apiBase="/api/admin/rejection-reasons"
        programOptions={programOptions}
      />

      <Section
        title="Τύποι Αιτημάτων Υποθέσεων"
        description="Οι διαθέσιμοι τύποι αιτήματος όταν λογιστής δημιουργεί νέα ανάθεση/υπόθεση προς την I-MENTOR (π.χ. 'Ανάληψη Πελάτη', 'Επικοινωνία με Πελάτη')"
        apiBase="/api/admin/case-types"
      />

      <Section
        title="Τύποι Εγγράφων Υποθέσεων"
        description="Οι διαθέσιμοι τύποι εγγράφων για ζήτηση από τον λογιστή ή ανέβασμα σε υποθέσεις (π.χ. 'Ε3 2025', 'Βεβαίωση Έναρξης')"
        apiBase="/api/admin/case-document-types"
      />

      <Section
        title="Tags Επιχειρήσεων"
        description="Ιδιαιτερότητες πελατών (π.χ. 'Οφειλές σε Δημόσιο', 'Άνεργος') που μπορούν να χρησιμοποιηθούν για μελλοντικά matches"
        apiBase="/api/admin/tags"
      />

      <BulkTagSection />
    </div>
  )
}
