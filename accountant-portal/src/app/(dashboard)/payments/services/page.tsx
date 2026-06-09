'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/table'
import { Modal } from '@/components/ui/modal'
import { Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

function formatEur(cents: number) {
  return (cents / 100).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })
}

const emptyForm = { name: '', description: '', price: '', currency: 'eur', active: true }

export default function ServicesPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'ADMIN'

  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (session && !isAdmin) router.replace('/payments')
  }, [session, isAdmin])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/payments/services')
    const data = await res.json()
    setServices(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(service: any) {
    setEditing(service)
    setForm({
      name: service.name,
      description: service.description || '',
      price: (service.price / 100).toFixed(2),
      currency: service.currency,
      active: service.active,
    })
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    setError('')
    if (!form.name.trim()) { setError('Το όνομα είναι υποχρεωτικό'); return }
    if (!form.price || isNaN(parseFloat(form.price)) || parseFloat(form.price) <= 0) {
      setError('Εισάγετε έγκυρη τιμή'); return
    }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: form.price,
      currency: form.currency,
      active: form.active,
    }

    const res = editing
      ? await fetch(`/api/payments/services/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/payments/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

    if (!res.ok) {
      const err = await res.json()
      setError(err.error || 'Σφάλμα αποθήκευσης')
      setSaving(false)
      return
    }

    const saved = await res.json()
    if (editing) {
      setServices(prev => prev.map(s => s.id === saved.id ? saved : s))
      showToast('Η υπηρεσία ενημερώθηκε.')
    } else {
      setServices(prev => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)))
      showToast('Η υπηρεσία δημιουργήθηκε.')
    }
    setSaving(false)
    setShowModal(false)
  }

  async function handleDelete(service: any) {
    if (!confirm(`Διαγραφή υπηρεσίας "${service.name}";`)) return
    const res = await fetch(`/api/payments/services/${service.id}`, { method: 'DELETE' })
    if (res.ok) {
      const data = await res.json()
      if (data.success) {
        setServices(prev => prev.filter(s => s.id !== service.id))
        showToast('Η υπηρεσία διαγράφηκε.')
      } else {
        // Was deactivated (had payment requests)
        setServices(prev => prev.map(s => s.id === data.id ? data : s))
        showToast('Η υπηρεσία απενεργοποιήθηκε (υπάρχουν συνδεδεμένες πληρωμές).')
      }
    }
  }

  if (!isAdmin) return null

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium bg-green-600">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/payments">
            <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ArrowLeft size={18} className="text-gray-600" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Υπηρεσίες</h1>
            <p className="text-gray-500 text-sm mt-0.5">Διαχείριση τιμοκαταλόγου υπηρεσιών</p>
          </div>
        </div>
        <Button onClick={openNew}>
          <Plus size={16} className="mr-2" />
          Νέα Υπηρεσία
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <Th>Όνομα</Th>
                <Th>Περιγραφή</Th>
                <Th>Τιμή</Th>
                <Th>Νόμισμα</Th>
                <Th>Κατάσταση</Th>
                <Th>Ενέργειες</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {services.length === 0 ? (
                <TableRow>
                  <Td colSpan={6} className="text-center text-gray-400 py-8">
                    Δεν υπάρχουν υπηρεσίες. Δημιουργήστε την πρώτη!
                  </Td>
                </TableRow>
              ) : (
                services.map(s => (
                  <TableRow key={s.id}>
                    <Td className="font-medium text-sm">{s.name}</Td>
                    <Td className="text-sm text-gray-500 max-w-xs truncate">{s.description || '—'}</Td>
                    <Td className="text-sm font-semibold">{formatEur(s.price)}</Td>
                    <Td className="text-sm uppercase text-gray-500">{s.currency}</Td>
                    <Td>
                      <Badge variant={s.active ? 'success' : 'secondary'}>
                        {s.active ? 'Ενεργή' : 'Ανενεργή'}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                          title="Επεξεργασία"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-500"
                          title="Διαγραφή"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Επεξεργασία Υπηρεσίας' : 'Νέα Υπηρεσία'}
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Όνομα *</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="π.χ. Υποβολή ΕΣΠΑ"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Περιγραφή</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="Προαιρετική περιγραφή..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Τιμή (€) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="200.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Νόμισμα</label>
              <select
                value={form.currency}
                onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="eur">EUR (€)</option>
                <option value="usd">USD ($)</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={form.active}
              onChange={e => setForm(p => ({ ...p, active: e.target.checked }))}
              className="rounded border-gray-300"
            />
            <label htmlFor="active" className="text-sm text-gray-700">Ενεργή υπηρεσία</label>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} loading={saving}>
              {editing ? 'Αποθήκευση' : 'Δημιουργία'}
            </Button>
            <Button variant="outline" onClick={() => setShowModal(false)}>Ακύρωση</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
