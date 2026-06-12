'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

export function NewCaseModal({ open, onClose, onCreated, initialBusinessId, initialProgramId }: {
  open: boolean; onClose: () => void; onCreated: (c: any) => void
  initialBusinessId?: string; initialProgramId?: string
}) {
  const [businesses, setBusinesses] = useState<any[]>([])
  const [programs, setPrograms] = useState<any[]>([])
  const [form, setForm] = useState({
    businessId: initialBusinessId || '',
    programId: initialProgramId || '',
    requestType: 'TAKE_OVER',
    title: '',
    description: '',
    priority: 'NORMAL',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(f => ({ ...f, businessId: initialBusinessId || f.businessId, programId: initialProgramId || f.programId }))
    if (!initialBusinessId) {
      fetch('/api/businesses?limit=100').then(r => r.json()).then(d => setBusinesses(d.businesses || []))
    }
    fetch('/api/programs').then(r => r.json()).then(d => setPrograms(d.programs || []))
  }, [open, initialBusinessId, initialProgramId])

  async function handleSubmit() {
    if (!form.businessId || !form.title) {
      alert('Επιχείρηση και τίτλος είναι υποχρεωτικά')
      return
    }
    setSaving(true)
    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const created = await res.json()
      onCreated(created)
      setForm({ businessId: initialBusinessId || '', programId: initialProgramId || '', requestType: 'TAKE_OVER', title: '', description: '', priority: 'NORMAL' })
    } else {
      const err = await res.json()
      alert(err.error || 'Σφάλμα')
    }
    setSaving(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="Νέα Ανάθεση στην I-MENTOR" size="lg">
      <div className="space-y-4">
        {!initialBusinessId && (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Επιχείρηση *</label>
            <select
              value={form.businessId}
              onChange={e => setForm(p => ({ ...p, businessId: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Επιλέξτε επιχείρηση...</option>
              {businesses.map(b => <option key={b.id} value={b.id}>{b.onomasia || b.afm} ({b.afm})</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Πρόγραμμα</label>
          <select
            value={form.programId}
            onChange={e => setForm(p => ({ ...p, programId: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Χωρίς πρόγραμμα</option>
            {programs.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Τύπος Αιτήματος *</label>
          <select
            value={form.requestType}
            onChange={e => setForm(p => ({ ...p, requestType: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="TAKE_OVER">Ανάληψη Πελάτη</option>
            <option value="CONTACT_CLIENT">Επικοινωνία με Πελάτη</option>
            <option value="APPLICATION_SUPPORT">Υποστήριξη Αίτησης</option>
            <option value="OTHER">Άλλο</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Τίτλος *</label>
          <input
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="π.χ. Ανέλαβε αυτόν τον πελάτη για ΕΣΠΑ"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Περιγραφή</label>
          <textarea
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={5}
            placeholder="Αναλυτικά τι χρειάζεται να γίνει..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Προτεραιότητα</label>
          <select
            value={form.priority}
            onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="LOW">Χαμηλή</option>
            <option value="NORMAL">Κανονική</option>
            <option value="HIGH">Υψηλή</option>
            <option value="URGENT">Επείγον</option>
          </select>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleSubmit} loading={saving}>Υποβολή</Button>
          <Button variant="outline" onClick={onClose}>Ακύρωση</Button>
        </div>
      </div>
    </Modal>
  )
}
