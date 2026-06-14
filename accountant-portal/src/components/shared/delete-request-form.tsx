'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle, Trash2 } from 'lucide-react'

export function DeleteRequestForm() {
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!confirm('Είστε σίγουροι ότι θέλετε να υποβάλετε αίτημα διαγραφής; Θα ειδοποιηθεί ο διαχειριστής και τα δεδομένα σας θα διαγραφούν εντός 30 ημερών.')) return
    setSending(true)
    setError('')
    const res = await fetch('/api/account/delete-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setSending(false)
    if (res.ok) setSent(true)
    else setError('Σφάλμα αποστολής. Δοκιμάστε ξανά.')
  }

  if (sent) return (
    <div className="flex items-center gap-2 text-green-700 text-sm">
      <CheckCircle size={16} />
      Το αίτημά σας ελήφθη. Θα επικοινωνήσουμε μαζί σας εντός 30 ημερών.
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-gray-500">
        Υποβάλετε αίτημα διαγραφής του λογαριασμού και όλων των συσχετισμένων δεδομένων σας από το σύστημα, σύμφωνα με το Άρθρο 17 του ΓΚΠΔ (Δικαίωμα στη Λήθη). Ο διαχειριστής θα σας απαντήσει εντός 30 ημερών.
      </p>
      <Input
        label="Αιτία / Σχόλιο (προαιρετικό)"
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="π.χ. Δεν χρησιμοποιώ πλέον την υπηρεσία"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" variant="destructive" loading={sending}>
        <Trash2 size={15} className="mr-2" />
        Υποβολή Αιτήματος Διαγραφής
      </Button>
    </form>
  )
}
