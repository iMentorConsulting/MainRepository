'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Lock } from 'lucide-react'

export default function NewExodikastikosPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const presetBusinessId = searchParams.get('businessId') || ''
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [businesses, setBusinesses] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    businessId: presetBusinessId,
    newClient: { afm: '', onomasia: '', clientType: 'INDIVIDUAL', email: '', phone: '' },
    questionnaire: {
      hasOverdueDebt: '',
      debtToState: '',
      isMarried: '',
    },
    notes: '',
    hasSpouse: false,
    spouseFirstName: '', spouseLastName: '', spouseAfm: '',
    taxisnetUsername: '', taxisnetPassword: '',
    spouseTaxisnetUsername: '', spouseTaxisnetPassword: '',
  })

  useEffect(() => {
    if (mode !== 'existing') return
    const params = new URLSearchParams({ limit: '50' })
    if (search) params.set('search', search)
    fetch(`/api/businesses?${params.toString()}`).then(r => r.json()).then(d => setBusinesses(d.businesses || []))
  }, [mode, search])

  function set(field: string, value: any) {
    setForm(f => ({ ...f, [field]: value }))
  }
  function setQ(field: string, value: any) {
    setForm(f => ({ ...f, questionnaire: { ...f.questionnaire, [field]: value } }))
  }
  function setNew(field: string, value: any) {
    setForm(f => ({ ...f, newClient: { ...f.newClient, [field]: value } }))
  }

  async function handleSubmit() {
    if (mode === 'existing' && !form.businessId) {
      alert('Επιλέξτε πελάτη')
      return
    }
    if (mode === 'new' && (!form.newClient.afm || !form.newClient.onomasia)) {
      alert('Συμπληρώστε ΑΦΜ και ονοματεπώνυμο/επωνυμία')
      return
    }
    setSaving(true)
    const payload: any = {
      questionnaire: form.questionnaire,
      notes: form.notes,
      hasSpouse: form.hasSpouse,
      spouseFirstName: form.spouseFirstName,
      spouseLastName: form.spouseLastName,
      spouseAfm: form.spouseAfm,
      taxisnetUsername: form.taxisnetUsername,
      taxisnetPassword: form.taxisnetPassword,
      spouseTaxisnetUsername: form.spouseTaxisnetUsername,
      spouseTaxisnetPassword: form.spouseTaxisnetPassword,
    }
    if (mode === 'existing') payload.businessId = form.businessId
    else payload.newClient = form.newClient

    const res = await fetch('/api/exodikastikos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const created = await res.json()
      router.push(`/exodikastikos/${created.id}`)
    } else {
      const err = await res.json()
      alert(err.error || 'Σφάλμα')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/exodikastikos" className="text-gray-400 hover:text-gray-600"><ArrowLeft size={18} /></Link>
        <h1 className="text-2xl font-bold text-gray-900">Νέα Αίτηση Εξωδικαστικού</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>1. Πελάτης</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button variant={mode === 'existing' ? 'default' : 'outline'} onClick={() => setMode('existing')}>Υπάρχων πελάτης</Button>
            <Button variant={mode === 'new' ? 'default' : 'outline'} onClick={() => setMode('new')}>Νέος πελάτης</Button>
          </div>

          {mode === 'existing' ? (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Αναζήτηση (ΑΦΜ ή επωνυμία)</label>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Αναζήτηση..."
              />
              <select
                value={form.businessId}
                onChange={e => set('businessId', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Επιλέξτε πελάτη...</option>
                {businesses.map(b => <option key={b.id} value={b.id}>{b.onomasia || b.afm} ({b.afm}) — {b.clientType === 'INDIVIDUAL' ? 'Φυσικό Πρόσωπο' : 'Επιχείρηση'}</option>)}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Τύπος Πελάτη *</label>
                <select
                  value={form.newClient.clientType}
                  onChange={e => setNew('clientType', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="INDIVIDUAL">Φυσικό Πρόσωπο</option>
                  <option value="BUSINESS">Επιχείρηση</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">ΑΦΜ *</label>
                <input value={form.newClient.afm} onChange={e => setNew('afm', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  {form.newClient.clientType === 'INDIVIDUAL' ? 'Ονοματεπώνυμο *' : 'Επωνυμία *'}
                </label>
                <input value={form.newClient.onomasia} onChange={e => setNew('onomasia', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
                <input value={form.newClient.email} onChange={e => setNew('email', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Τηλέφωνο</label>
                <input value={form.newClient.phone} onChange={e => setNew('phone', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Βασικός Έλεγχος Επιλεξιμότητας</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Έχει ληξιπρόθεσμες οφειλές προς Δημόσιο / Τράπεζες;</label>
            <select value={form.questionnaire.hasOverdueDebt} onChange={e => setQ('hasOverdueDebt', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Επιλέξτε...</option>
              <option value="yes">Ναι</option>
              <option value="no">Όχι</option>
              <option value="unsure">Δεν είμαι σίγουρος/η</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Είναι παντρεμένος/η;</label>
            <select value={form.questionnaire.isMarried} onChange={e => {
              setQ('isMarried', e.target.value)
              set('hasSpouse', e.target.value === 'yes')
            }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Επιλέξτε...</option>
              <option value="yes">Ναι</option>
              <option value="no">Όχι</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">Στην εξέταση εξωδικαστικού απαιτείται και ο κωδικός Taxisnet του/της συζύγου.</p>
          </div>
          {form.hasSpouse && (
            <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-lg p-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Όνομα Συζύγου</label>
                <input value={form.spouseFirstName} onChange={e => set('spouseFirstName', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Επώνυμο Συζύγου</label>
                <input value={form.spouseLastName} onChange={e => set('spouseLastName', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">ΑΦΜ Συζύγου</label>
                <input value={form.spouseAfm} onChange={e => set('spouseAfm', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Σημειώσεις για την I-MENTOR</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock size={14} /> 3. Κωδικοί Taxisnet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            Οι κωδικοί Taxisnet θα χρησιμοποιηθούν αποκλειστικά για την ανάγνωση του προφίλ οφειλών στην πλατφόρμα του
            εξωδικαστικού μηχανισμού, με σκοπό τη δωρεάν εκτίμηση. Αποθηκεύονται κρυπτογραφημένα και δεν θα
            χρησιμοποιηθούν για κανέναν άλλο σκοπό.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Όνομα χρήστη Taxisnet (πελάτη)</label>
              <input value={form.taxisnetUsername} onChange={e => set('taxisnetUsername', e.target.value)} autoComplete="off"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Κωδικός Taxisnet (πελάτη)</label>
              <input type="password" value={form.taxisnetPassword} onChange={e => set('taxisnetPassword', e.target.value)} autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
          {form.hasSpouse && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Όνομα χρήστη Taxisnet (συζύγου)</label>
                <input value={form.spouseTaxisnetUsername} onChange={e => set('spouseTaxisnetUsername', e.target.value)} autoComplete="off"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Κωδικός Taxisnet (συζύγου)</label>
                <input type="password" value={form.spouseTaxisnetPassword} onChange={e => set('spouseTaxisnetPassword', e.target.value)} autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={handleSubmit} loading={saving}>Υποβολή Αίτησης</Button>
        <Link href="/exodikastikos"><Button variant="outline">Ακύρωση</Button></Link>
      </div>
    </div>
  )
}
