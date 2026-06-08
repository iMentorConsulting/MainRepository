'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LogoUploader } from '@/components/shared/logo-uploader'
import { CheckCircle, XCircle, Mail, Settings, Image as ImageIcon } from 'lucide-react'

export default function SettingsPage() {
  const { data: session } = useSession()
  const [smtpTest, setSmtpTest] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle')
  const [smtpError, setSmtpError] = useState('')
  const [imentorLogoUrl, setImentorLogoUrl] = useState<string | null>(null)
  const [logoSaving, setLogoSaving] = useState(false)
  const [logoSaved, setLogoSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings/logo').then(r => r.json()).then(d => setImentorLogoUrl(d.imentorLogoUrl || null))
  }, [])

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
        <h1 className="text-2xl font-bold text-gray-900">Ρυθμίσεις Συστήματος</h1>
        <p className="text-gray-500 mt-1">Διαχείριση παραμέτρων I-MENTOR Portal</p>
      </div>

      <Card>
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
      </Card>

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
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Audit Logging</dt>
              <dd className="text-green-600">Ενεργό</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
