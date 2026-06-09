'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LogoUploader } from '@/components/shared/logo-uploader'
import { CheckCircle, XCircle, Mail, Settings, Image as ImageIcon, Shield, Download, Trash2, Lock, Building2 } from 'lucide-react'
import Link from 'next/link'

function DeleteRequestForm() {
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

export default function SettingsPage() {
  const { data: session } = useSession()

  const [smtpTest, setSmtpTest] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle')
  const [smtpError, setSmtpError] = useState('')
  const [imentorLogoUrl, setImentorLogoUrl] = useState<string | null>(null)
  const [logoSaving, setLogoSaving] = useState(false)
  const [logoSaved, setLogoSaved] = useState(false)

  const [aadeUser, setAadeUser] = useState('')
  const [aadePass, setAadePass] = useState('')
  const [aadeCallerAfm, setAadeCallerAfm] = useState('')
  const [aadePassSet, setAadePassSet] = useState(false)
  const [aadeSaving, setAadeSaving] = useState(false)
  const [aadeSaved, setAadeSaved] = useState(false)
  const [aadeError, setAadeError] = useState('')

  useEffect(() => {
    fetch('/api/settings/logo').then(r => r.json()).then(d => setImentorLogoUrl(d.imentorLogoUrl || null))
    if (session?.user?.role === 'ADMIN') {
      fetch('/api/settings/aade').then(r => r.json()).then(d => {
        setAadeUser(d.aadeUser || '')
        setAadeCallerAfm(d.aadeCallerAfm || '')
        setAadePassSet(d.aadePassSet || false)
      })
    }
  }, [session])

  async function saveImentorLogo(dataUrl: string | null) {
    setImentorLogoUrl(dataUrl)
    setLogoSaving(true)
    setLogoSaved(false)
    try {
      await fetch('/api/settings/logo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imentorLogoUrl: dataUrl }),
      })
      setLogoSaved(true)
    } finally {
      setLogoSaving(false)
    }
  }

  async function saveAade(e: React.FormEvent) {
    e.preventDefault()
    setAadeSaving(true)
    setAadeSaved(false)
    setAadeError('')
    const res = await fetch('/api/settings/aade', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aadeUser, aadePass, aadeCallerAfm }),
    })
    setAadeSaving(false)
    if (res.ok) {
      const d = await res.json()
      setAadePassSet(d.aadePassSet)
      setAadePass('')
      setAadeSaved(true)
    } else {
      setAadeError('Σφάλμα αποθήκευσης')
    }
  }

  async function testSmtp() {
    setSmtpTest('loading')
    setSmtpError('')
    const res = await fetch('/api/settings/smtp-test', { method: 'POST' })
    if (res.ok) {
      setSmtpTest('ok')
    } else {
      const data = await res.json().catch(() => ({}))
      setSmtpError(data.error || '')
      setSmtpTest('fail')
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ρυθμίσεις</h1>
        <p className="text-gray-500 mt-1">Διαχείριση παραμέτρων I-MENTOR Portal</p>
      </div>

      {session?.user?.role === 'ACCOUNTANT' && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Building2 size={16} className="text-indigo-500 flex-shrink-0" />
              <span>Για επεξεργασία στοιχείων γραφείου και λογότυπου, επισκεφθείτε την ενότητα </span>
              <Link href={`/accountants/${(session.user as any)?.accountantId}`} className="text-indigo-600 hover:underline font-medium">Το Γραφείο μου →</Link>
            </div>
          </CardContent>
        </Card>
      )}

      {session?.user?.role === 'ADMIN' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield size={18} className="text-blue-600" />
              Διαπιστευτήρια ΑΑΔΕ / TAXISnet (GSIS)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              Τα διαπιστευτήρια αυτά χρησιμοποιούνται για αναζήτηση επιχειρήσεων μέσω της Υπηρεσίας Αναζήτησης Βασικών Στοιχείων Μητρώου Επιχειρήσεων της ΑΑΔΕ.
              Δημιουργήστε <strong>Ειδικό Κωδικό</strong> στο TAXISnet για την εφαρμογή «Αναζήτηση Βασικών Στοιχείων Μητρώου Επιχειρήσεων».
            </p>
            <form onSubmit={saveAade} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="TAXISnet Username (Όνομα Χρήστη)"
                  value={aadeUser}
                  onChange={e => setAadeUser(e.target.value)}
                  placeholder="π.χ. WW1089396U158"
                  helperText="Το 'Όνομα Χρήστη στο TAXISnet' του Ειδικού Κωδικού"
                />
                <Input
                  label="ΑΦΜ Εκκαλούντος"
                  value={aadeCallerAfm}
                  onChange={e => setAadeCallerAfm(e.target.value)}
                  placeholder="π.χ. 110739500"
                  helperText="Το ΑΦΜ με το οποίο εκδόθηκε ο κωδικός"
                />
              </div>
              <Input
                label={aadePassSet ? 'Νέος Κωδικός Πρόσβασης TAXISnet (αφήστε κενό για να διατηρήσετε τον υπάρχοντα)' : 'Κωδικός Πρόσβασης TAXISnet'}
                type="password"
                value={aadePass}
                onChange={e => setAadePass(e.target.value)}
                placeholder={aadePassSet ? '••••••••' : 'Εισάγετε κωδικό TAXISnet'}
                helperText={aadePassSet ? '✓ Κωδικός έχει ήδη αποθηκευτεί' : 'Ο κωδικός αποθηκεύεται κρυπτογραφημένα'}
              />
              {aadeError && <p className="text-sm text-red-600">{aadeError}</p>}
              <div className="flex items-center gap-3">
                <Button type="submit" loading={aadeSaving}>
                  Αποθήκευση Διαπιστευτηρίων
                </Button>
                {aadeSaved && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle size={14} /> Αποθηκεύτηκε!</span>}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {session?.user?.role === 'ADMIN' && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail size={18} />
            SMTP Email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="SMTP Host" defaultValue={process.env.SMTP_HOST || ''} disabled helperText="Ρυθμίζεται μέσω .env" />
            <Input label="SMTP Port" defaultValue="587" disabled />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="SMTP User" defaultValue="" disabled helperText="Ρυθμίζεται μέσω .env" />
            <Input label="From Address" defaultValue="noreply@i-mentor.gr" disabled />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={testSmtp} loading={smtpTest === 'loading'}>
              Δοκιμή Σύνδεσης SMTP
            </Button>
            {smtpTest === 'ok' && (
              <span className="flex items-center gap-1 text-green-600 text-sm"><CheckCircle size={16} />Επιτυχία!</span>
            )}
            {smtpTest === 'fail' && (
              <span className="flex items-center gap-1 text-red-600 text-sm">
                <XCircle size={16} />
                Αποτυχία σύνδεσης{smtpError ? `: ${smtpError}` : ''}
              </span>
            )}
          </div>
        </CardContent>
      </Card>}

      {session?.user?.role === 'ADMIN' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon size={18} />
              Λογότυπο I-MENTOR
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">
              Το λογότυπο εμφανίζεται στο πάνω μέρος των email καμπανιών προς τους πελάτες, αντί του κειμένου «iMENTOR CONSULTING».
            </p>
            <LogoUploader label="Λογότυπο I-MENTOR (PNG, transparent)" value={imentorLogoUrl} onChange={saveImentorLogo} />
            {logoSaving && <span className="text-xs text-gray-400">Αποθήκευση...</span>}
            {!logoSaving && logoSaved && <span className="text-xs text-green-600">Αποθηκεύτηκε ✓</span>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download size={18} className="text-blue-600" />
            Εξαγωγή Δεδομένων (GDPR Άρθρο 20)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-500">
            Κατεβάστε όλα τα δεδομένα επιχειρήσεων που διαχειρίζεστε σε μορφή Excel. Αυτό το αρχείο περιλαμβάνει ΑΦΜ, στοιχεία επικοινωνίας, ΚΑΔ και ιστορικό καμπανιών.
          </p>
          <Button variant="outline" onClick={() => window.open('/api/export/businesses', '_blank')}>
            <Download size={16} className="mr-2" />
            Εξαγωγή Επιχειρήσεων (.xlsx)
          </Button>
        </CardContent>
      </Card>

      <Card className="border-red-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <Trash2 size={18} />
            Αίτημα Διαγραφής Λογαριασμού (GDPR Άρθρο 17)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteRequestForm />
        </CardContent>
      </Card>

      {session?.user?.role === 'ADMIN' && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings size={18} />
            Γενικές Ρυθμίσεις
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-gray-500">Εφαρμογή</dt>
              <dd className="font-medium">I-MENTOR Portal</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-gray-500">Έκδοση</dt>
              <dd>0.1.0</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-gray-500">GDPR Unsubscribe</dt>
              <dd className="text-green-600">Ενεργό</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-gray-500">Audit Logging</dt>
              <dd className="text-green-600">Ενεργό</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Νομικά / Ασφάλεια</dt>
              <dd className="flex gap-3">
                <Link href="/security" className="text-blue-600 hover:underline flex items-center gap-1"><Lock size={12} />Ασφάλεια</Link>
                <Link href="/privacy" className="text-blue-600 hover:underline">Απόρρητο</Link>
                <Link href="/terms" className="text-blue-600 hover:underline">Όροι</Link>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>}
    </div>
  )
}
