'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

export function NewCaseModal({ open, onClose, onCreated, initialBusinessId, initialProgramId, userRole }: {
  open: boolean; onClose: () => void; onCreated: (c: any) => void
  initialBusinessId?: string; initialProgramId?: string; userRole?: string
}) {
  const [businesses, setBusinesses] = useState<any[]>([])
  const [matchedPrograms, setMatchedPrograms] = useState<{ id: string; title: string }[]>([])
  const [caseTypes, setCaseTypes] = useState<{ id: string; label: string; active: boolean }[]>([])
  const [contact, setContact] = useState({ needsPhone: false, needsEmail: false, phone: '', email: '' })
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
        setContact({ needsPhone: !b.phone, needsEmail: !b.email, phone: '', email: '' })
      })
      .catch(() => setMatchedPrograms([]))
  }, [open, form.businessId])

  async function handleSubmit() {
    if (!form.businessId) {
      alert('Επιλέξτε επιχείρηση')
      return
    }
    if (userRole === 'ACCOUNTANT' && !form.programId) {
      alert('Παρακαλούμε επιλέξτε πρόγραμμα για να προχωρήσετε με την ανάθεση')
      return
    }
    if (contact.needsPhone && !contact.phone.trim()) {
      alert('Παρακαλούμε συμπληρώστε το τηλέφωνο επικοινωνίας')
      return
    }
    if (contact.needsEmail && !contact.email.trim()) {
      alert('Παρακαλούμε συμπληρώστε το email επικοινωνίας')
      return
    }
    setSaving(true)
    if ((contact.needsPhone && contact.phone.trim()) || (contact.needsEmail && contact.email.trim())) {
      const update: any = {}
      if (contact.needsPhone && contact.phone.trim()) update.phone = contact.phone.trim()
      if (contact.needsEmail && contact.email.trim()) update.email = contact.email.trim()
      await fetch(`/api/businesses/${form.businessId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
    }
    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const created = await res.json()
      onCreated(created)
      setForm({ businessId: initialBusinessId || '', programId: initialProgramId || '', caseType: caseTypes[0]?.label || '', description: '', priority: 'NORMAL' })
      setContact({ needsPhone: false, needsEmail: false, phone: '', email: '' })
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
        {(contact.needsPhone || contact.needsEmail) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
            <p className="text-sm text-amber-800">
              Η επιχείρηση δεν έχει καταχωρημένα στοιχεία επικοινωνίας. Συμπληρώστε τα παρακάτω ώστε να μπορούμε να επικοινωνήσουμε με τον πελάτη για την ανάθεση.
            </p>
            {contact.needsPhone && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Τηλέφωνο επικοινωνίας *</label>
                <input
                  type="tel"
                  value={contact.phone}
                  onChange={e => setContact(p => ({ ...p, phone: e.target.value }))}
                  placeholder="69xxxxxxxx"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
            {contact.needsEmail && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Email επικοινωνίας *</label>
                <input
                  type="email"
                  value={contact.email}
                  onChange={e => setContact(p => ({ ...p, email: e.target.value }))}
                  placeholder="email@example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
        )}
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
