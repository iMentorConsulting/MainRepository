'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CheckCircle, XCircle, Mail, Settings } from 'lucide-react'

export default function SettingsPage() {
  const [smtpTest, setSmtpTest] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle')
  const [smtpError, setSmtpError] = useState('')

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
