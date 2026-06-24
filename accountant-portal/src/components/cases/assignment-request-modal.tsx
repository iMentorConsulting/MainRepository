'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

const PROGRAM_TITLE_OPTIONS = ['ΕΣΠΑ', 'ΔΥΠΑ', 'ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ', 'ΑΝΑΚΑΙΝΙΖΩ', 'Άλλο']

export function AssignmentRequestModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (r: any) => void
}) {
  const [email, setEmail] = useState('')
  const [programTitle, setProgramTitle] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!email.trim()) {
      alert('Παρακαλούμε συμπληρώστε το email του πελάτη')
      return
    }
    setSaving(true)
    const res = await fetch('/api/assignment-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, programTitle, note }),
    })
    setSaving(false)
    if (res.ok) {
      const created = await res.json()
      onCreated(created)
      setEmail(''); setProgramTitle(''); setNote('')
    } else {
      const err = await res.json()
      alert(err.error || 'Σφάλμα αποστολής αιτήματος')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Αίτημα Ανάθεσης από το Case Management">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Ζητήστε από το Case Management να αναλάβει έναν πελάτη που δεν είναι ακόμα ανατεθειμένη υπόθεση
          (π.χ. απάντησε σε email/Viber ενημέρωση). Θα εντοπίσουν τον πελάτη με βάση το email και θα ενημερωθείτε
          μόλις δημιουργηθεί η υπόθεση.
        </p>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Email πελάτη *</label>
          <input
            type="email"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="client@example.com"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Πρόγραμμα</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={programTitle}
            onChange={e => setProgramTitle(e.target.value)}
          >
            <option value="">— Επιλέξτε —</option>
            {PROGRAM_TITLE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Σημείωση</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Αναλυτικά τι χρειάζεται να γίνει ή να γνωρίζουμε..."
          />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Ακύρωση</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Αποστολή...' : 'Αποστολή Αιτήματος'}</Button>
        </div>
      </div>
    </Modal>
  )
}
