'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, GripVertical, Pencil, Check, X } from 'lucide-react'

interface Item {
  id: string
  label: string
  active: boolean
  order: number
}

function Section({ title, description, apiBase }: { title: string; description: string; apiBase: string }) {
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
            <li key={item.id} className="flex items-center gap-3 py-2.5">
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function CriteriaPage() {
  const { data: session } = useSession()

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
        description="Λόγοι που μπορεί να επιλέξει ο λογιστής όταν ένα match δεν είναι κατάλληλο για συγκεκριμένο πελάτη"
        apiBase="/api/admin/rejection-reasons"
      />

      <Section
        title="Tags Επιχειρήσεων"
        description="Ιδιαιτερότητες πελατών (π.χ. 'Οφειλές σε Δημόσιο', 'Άνεργος') που μπορούν να χρησιμοποιηθούν για μελλοντικά matches"
        apiBase="/api/admin/tags"
      />
    </div>
  )
}
