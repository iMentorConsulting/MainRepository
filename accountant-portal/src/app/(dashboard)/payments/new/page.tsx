'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Banknote } from 'lucide-react'
import Link from 'next/link'

function formatEur(cents: number) {
  return (cents / 100).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })
}

export default function NewPaymentPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'ADMIN'

  const [businesses, setBusinesses] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [programs, setPrograms] = useState<any[]>([])
  const [irisSettings, setIrisSettings] = useState<{ iban: string; merchantName: string; referencePrefix: string } | null>(null)

  const [form, setForm] = useState({
    businessId: '',
    serviceId: '',
    programId: '',
    description: '',
    customAmount: '',
    sendNow: false,
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [businessSearch, setBusinessSearch] = useState('')

  const selectedService = services.find(s => s.id === form.serviceId)
  const selectedBusiness = businesses.find(b => b.id === form.businessId)
  const effectiveAmount = isAdmin && form.customAmount
    ? Math.round(parseFloat(form.customAmount) * 100)
    : selectedService?.price || 0

  useEffect(() => {
    fetch('/api/payments/services').then(r => r.json()).then(d => setServices(Array.isArray(d) ? d : []))
    fetch('/api/programs').then(r => r.json()).then(d => setPrograms(d.programs || []))
    if (isAdmin) {
      fetch('/api/settings/iris').then(r => r.json()).then(d => setIrisSettings(d)).catch(() => null)
    }
  }, [isAdmin])

  useEffect(() => {
    const params = new URLSearchParams({ limit: '50' })
    if (businessSearch) params.set('search', businessSearch)
    fetch(`/api/businesses?${params.toString()}`)
      .then(r => r.json())
      .then(d => setBusinesses(d.businesses || []))
  }, [businessSearch])

  const filteredBusinesses = businesses

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.businessId) { setError('Επιλέξτε επιχείρηση'); return }
    if (!form.serviceId) { setError('Επιλέξτε υπηρεσία'); return }

    setSaving(true)
    const payload: any = {
      businessId: form.businessId,
      serviceId: form.serviceId,
      programId: form.programId || null,
      description: form.description || null,
    }
    if (isAdmin && form.customAmount) {
      payload.customAmount = form.customAmount
    }

    const res = await fetch('/api/payments/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.json()
      setError(err.error || 'Σφάλμα δημιουργίας αιτήματος')
      setSaving(false)
      return
    }

    const created = await res.json()

    // Optionally send email immediately
    if (form.sendNow && selectedBusiness?.email) {
      await fetch(`/api/payments/requests/${created.id}/send`, { method: 'POST' })
    }

    router.push('/payments')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/payments">
          <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Νέο Αίτημα Πληρωμής</h1>
          <p className="text-gray-500 text-sm mt-0.5">Δημιουργία αιτήματος πληρωμής μέσω IRIS</p>
        </div>
      </div>

      {/* IRIS Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <Banknote size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 space-y-1">
          <p className="font-semibold">Πληρωμή μέσω IRIS</p>
          <p>Το σύστημα θα δημιουργήσει αυτόματα μοναδικό αριθμό αναφοράς και σύνδεσμο IRIS για τον πελάτη. Η πληρωμή επιβεβαιώνεται χειροκίνητα μετά από τραπεζική μεταφορά.</p>
          {irisSettings?.iban && (
            <p className="font-mono text-xs mt-1">IBAN: {irisSettings.iban}</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        {/* Business */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Επιχείρηση *</label>
          <input
            type="text"
            placeholder="Αναζήτηση ονομασίας ή ΑΦΜ..."
            value={businessSearch}
            onChange={e => setBusinessSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={form.businessId}
            onChange={e => setForm(p => ({ ...p, businessId: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            size={5}
          >
            <option value="">-- Επιλέξτε --</option>
            {filteredBusinesses.map(b => (
              <option key={b.id} value={b.id}>
                {b.onomasia || b.afm} ({b.afm}){b.email ? ' ✓' : ' (χωρίς email)'}
              </option>
            ))}
          </select>
          {selectedBusiness && (
            <div className="mt-1 text-xs text-gray-500">
              {selectedBusiness.email
                ? <span className="text-green-700">Email: {selectedBusiness.email}</span>
                : <span className="text-yellow-600">Δεν υπάρχει email — δεν θα είναι δυνατή η αποστολή</span>
              }
            </div>
          )}
        </div>

        {/* Service */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Υπηρεσία *</label>
          <select
            value={form.serviceId}
            onChange={e => setForm(p => ({ ...p, serviceId: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Επιλέξτε υπηρεσία...</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} — {formatEur(s.price)}
              </option>
            ))}
          </select>
          {selectedService?.description && (
            <p className="mt-1 text-xs text-gray-500">{selectedService.description}</p>
          )}
        </div>

        {/* Custom amount (admin only) */}
        {isAdmin && (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Προσαρμοσμένο ποσό (€) <span className="font-normal text-gray-400">— προαιρετικό, μόνο admin</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.customAmount}
              onChange={e => setForm(p => ({ ...p, customAmount: e.target.value }))}
              placeholder={selectedService ? (selectedService.price / 100).toFixed(2) : '0.00'}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Program */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            Πρόγραμμα <span className="font-normal text-gray-400">— προαιρετικό</span>
          </label>
          <select
            value={form.programId}
            onChange={e => setForm(p => ({ ...p, programId: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Χωρίς πρόγραμμα</option>
            {programs.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            Σημειώσεις / Περιγραφή <span className="font-normal text-gray-400">— προαιρετικό</span>
          </label>
          <textarea
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            placeholder="Π.χ. για υποβολή ΕΣΠΑ Ψηφιακός Μετασχηματισμός..."
          />
        </div>

        {/* Send immediately */}
        {selectedBusiness?.email && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sendNow"
              checked={form.sendNow}
              onChange={e => setForm(p => ({ ...p, sendNow: e.target.checked }))}
              className="rounded border-gray-300"
            />
            <label htmlFor="sendNow" className="text-sm text-gray-700">
              Αποστολή email IRIS στον πελάτη αμέσως μετά τη δημιουργία
            </label>
          </div>
        )}

        {/* Preview */}
        {selectedService && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <Banknote size={16} />
              Προεπισκόπηση Αιτήματος IRIS
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="text-gray-500">Επιχείρηση:</div>
              <div className="font-medium">{selectedBusiness?.onomasia || '—'}</div>
              <div className="text-gray-500">Υπηρεσία:</div>
              <div className="font-medium">{selectedService.name}</div>
              <div className="text-gray-500">Ποσό:</div>
              <div className="font-bold text-green-700">{formatEur(effectiveAmount)}</div>
              <div className="text-gray-500">Αποστολή:</div>
              <div>{form.sendNow && selectedBusiness?.email ? `Email IRIS στο ${selectedBusiness.email}` : 'Χειροκίνητα (αντιγραφή link IRIS)'}</div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={saving}>
            Δημιουργία Αιτήματος IRIS
          </Button>
          <Link href="/payments">
            <Button type="button" variant="outline">Ακύρωση</Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
