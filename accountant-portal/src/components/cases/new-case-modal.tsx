'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

export function NewCaseModal({ open, onClose, onCreated, initialBusinessId, initialProgramId }: {
  open: boolean; onClose: () => void; onCreated: (c: any) => void
  initialBusinessId?: string; initialProgramId?: string
}) {
  const [businesses, setBusinesses] = useState<any[]>([])
  const [matchedPrograms, setMatchedPrograms] = useState<{ id: string; title: string }[]>([])
  const [caseTypes, setCaseTypes] = useState<{ id: string; label: string; active: boolean }[]>([])
  const [form, setForm] = useState({
    businessId: initialBusinessId || '',
    programId: initialProgramId || '',
    caseType: '',
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
    fetch('/api/admin/case-types').then(r => r.json()).then((d: any) => {
      const active = (Array.isArray(d) ? d : []).filter((t: any) => t.active)
      setCaseTypes(active)
      setForm(f => ({ ...f, caseType: f.caseType || active[0]?.label || '' }))
    }).catch(() => {})
  }, [open, initialBusinessId, initialProgramId])

  // Program dropdown is restricted to the selected business's (non-rejected) matches
  useEffect(() => {
    if (!open || !form.businessId) { setMatchedPrograms([]); return }
    fetch(`/api/businesses/${form.businessId}`)
      .then(r => r.json())
      .then(b => {
        const programs = (b.programMatches || [])
          .filter((m: any) => m.status !== 'REJECTED' && m.program)
          .map((m: any) => ({ id: m.program.id, title: m.program.title }))
        setMatchedPrograms(programs)
        setForm(f => programs.some((p: any) => p.id === f.programId) ? f : { ...f, programId: '' })
      })
      .catch(() => setMatchedPrograms([]))
  }, [open, form.businessId])

  async function handleSubmit() {
    if (!form.businessId) {
      alert('Επιλέξτε επιχείρηση')
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
      setForm({ businessId: initialBusinessId || '', programId: initialProgramId || '', caseType: caseTypes[0]?.label || '', description: '', priority: 'NORMAL' })
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
            disabled={!form.businessId}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">Χωρίς πρόγραμμα</option>
            {matchedPrograms.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            {form.businessId
              ? (matchedPrograms.length ? 'Εμφανίζονται μόνο τα προγράμματα που κάνουν match με την επιχείρηση.' : 'Η επιχείρηση δεν έχει ενεργά matches με προγράμματα.')
              : 'Επιλέξτε πρώτα επιχείρηση.'}
          </p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Τύπος Αιτήματος *</label>
          <select
            value={form.caseType}
            onChange={e => setForm(p => ({ ...p, caseType: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {caseTypes.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Είναι κάτι που πρέπει να γνωρίζουμε για τον πελάτη ή την Επιχείρησή του;</label>
          <textarea
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={5}
            placeholder="Αναλυτικά τι χρειάζεται να γίνει ή να γνωρίζουμε..."
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
