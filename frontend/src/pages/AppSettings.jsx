import { useEffect, useState } from 'react'
import api, { getLicense } from '../api'
import toast from 'react-hot-toast'
import { Cog6ToothIcon, EnvelopeIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

function Label({ children }) {
  return <label className="block text-sm font-medium text-gray-700 mb-1.5">{children}</label>
}

function Input({ label, ...props }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
        {...props}
      />
    </div>
  )
}

export default function AppSettings() {
  const [form, setForm] = useState({
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    notification_email: '',
  })
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [license, setLicense] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    getLicense().then(r => setLicense(r.data)).catch(() => {})
    api.get('/portal/settings')
      .then(r => {
        const { smtp_host, smtp_port, smtp_user, smtp_pass, notification_email } = r.data
        setForm({ smtp_host: smtp_host || '', smtp_port: smtp_port || 587, smtp_user: smtp_user || '', smtp_pass: smtp_pass || '', notification_email: notification_email || '' })
      })
      .catch(() => toast.error('Failed to load settings.'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      // Load current settings first to avoid overwriting other fields
      const current = await api.get('/portal/settings')
      await api.put('/portal/settings', { ...current.data, ...form })
      toast.success('Ρυθμίσεις αποθηκεύτηκαν.')
    } catch {
      toast.error('Αποτυχία αποθήκευσης.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <Cog6ToothIcon className="w-7 h-7 text-[#1e3a5f]" />
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Ρυθμίσεις</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* SMTP / Email */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
          <div>
            <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wider text-[#1e3a5f]">Email & Notifications</h3>
            <p className="text-xs text-gray-400 mt-1">Configure the email account that sends portal links and receives guest notifications.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="SMTP Host" value={form.smtp_host} onChange={e => set('smtp_host', e.target.value)} placeholder="smtp.gmail.com" />
            <Input label="SMTP Port" type="number" value={form.smtp_port} onChange={e => set('smtp_port', +e.target.value)} placeholder="587" />
            <Input label="Email (username)" type="email" value={form.smtp_user} onChange={e => set('smtp_user', e.target.value)} placeholder="villa@gmail.com" />
            <div>
              <Label>App Password</Label>
              <div className="relative">
                <input
                  type={showSmtpPass ? 'text' : 'password'}
                  value={form.smtp_pass}
                  onChange={e => set('smtp_pass', e.target.value)}
                  placeholder="Gmail App Password (16 chars)"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowSmtpPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                >
                  {showSmtpPass ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>
          <Input
            label="Notification Email (receives alerts when guests send messages or requests)"
            type="email"
            value={form.notification_email}
            onChange={e => set('notification_email', e.target.value)}
            placeholder="Same as above, or a different address"
          />
          <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
            <strong>Gmail setup:</strong> Use smtp.gmail.com · port 587 · your Gmail address · a{' '}
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline">
              Gmail App Password
            </a>{' '}
            (not your regular password). Enable 2FA first.
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#1e3a5f] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#16305a] transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a5f] focus-visible:ring-offset-2"
          >
            {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
          </button>
        </div>
      </form>

      {/* Email Scan — guest data from OTA emails */}
      <EmailScanSection />

      {/* License */}
      {license && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wider text-[#1e3a5f]">Άδεια Λογισμικού</h3>
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Serial Number</span>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(license.license_key); toast.success('Serial αντιγράφηκε') }}
                className="text-xs text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                aria-label="Αντιγραφή serial number"
              >
                Αντιγραφή
              </button>
            </div>
            <p className="font-mono text-base font-bold text-[#1e3a5f] tracking-widest select-all">{license.license_key}</p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-500">
              <span>Λογισμικό: <strong className="text-gray-700">{license.software_name}</strong></span>
              <span>Έκδοση: <strong className="text-gray-700">v{license.software_version}</strong></span>
              <span>Εγκατάσταση: <strong className="text-gray-700">{license.tenant}</strong></span>
              <span>Ημ/νία: <strong className="text-gray-700">{license.generated_at}</strong></span>
            </div>
          </div>
          <p className="text-xs text-gray-400">Αυτός ο αριθμός αδείας είναι μοναδικός για την εγκατάστασή σας. Διατηρήστε τον για τους σκοπούς τεκμηρίωσης και ΕΣΠΑ.</p>
        </div>
      )}
    </div>
  )
}

function EmailScanSection() {
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({ imap_host: '', imap_port: 993, imap_user: '', imap_pass: '' })
  const [showPass, setShowPass] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  useEffect(() => {
    api.get('/email-scan/status').then(r => {
      setStatus(r.data)
      if (r.data.imap_host) setForm(f => ({ ...f, imap_host: r.data.imap_host, imap_user: r.data.imap_user || '' }))
    }).catch(() => {})
  }, [])

  const handleConnect = async (e) => {
    e.preventDefault()
    setConnecting(true)
    try {
      await api.post('/email-scan/connect', form)
      setStatus({ connected: true, imap_host: form.imap_host, imap_user: form.imap_user })
      toast.success('Email συνδέθηκε επιτυχώς!')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Αποτυχία σύνδεσης')
    } finally {
      setConnecting(false)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    setLastResult(null)
    try {
      const r = await api.post('/email-scan/scan')
      setLastResult(r.data)
      toast.success(`Σάρωση ολοκληρώθηκε — ${r.data.updated} κρατήσεις ενημερώθηκαν`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα σάρωσης')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <EnvelopeIcon className="w-5 h-5 text-[#1e3a5f]" />
        <div>
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wider text-[#1e3a5f]">Αυτόματη Εισαγωγή Στοιχείων Επισκεπτών</h3>
          <p className="text-xs text-gray-400 mt-0.5">Σαρώνει τα email από Airbnb, Booking.com, VRBO και εξάγει αυτόματα ονόματα, email και τηλέφωνα επισκεπτών.</p>
        </div>
      </div>

      {status?.connected && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-medium text-green-800">✅ Συνδεδεμένο</p>
            <p className="text-xs text-green-600">{status.imap_user} · {status.imap_host}</p>
          </div>
          <button onClick={handleScan} disabled={scanning}
            className="flex items-center gap-1.5 text-sm font-medium bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
            <ArrowPathIcon className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Σάρωση…' : 'Σάρωση Τώρα'}
          </button>
        </div>
      )}

      {lastResult && (
        <div className="text-xs text-gray-600 bg-gray-50 rounded-xl px-4 py-3">
          Ενημερώθηκαν: <strong>{lastResult.updated}</strong> κρατήσεις · Παρακάμφθηκαν: {lastResult.skipped}
          {lastResult.errors?.length > 0 && <span className="text-red-500 ml-2">· {lastResult.errors.length} σφάλματα</span>}
        </div>
      )}

      <form onSubmit={handleConnect} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="IMAP Host" value={form.imap_host} onChange={e => setForm(f => ({ ...f, imap_host: e.target.value }))} placeholder="mail.yourdomain.gr ή imap.gmail.com" />
          <Input label="IMAP Port" type="number" value={form.imap_port} onChange={e => setForm(f => ({ ...f, imap_port: +e.target.value }))} placeholder="993" />
          <Input label="Email" type="email" value={form.imap_user} onChange={e => setForm(f => ({ ...f, imap_user: e.target.value }))} placeholder="villa@gmail.com" />
          <div>
            <Label>App Password</Label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={form.imap_pass}
                onChange={e => setForm(f => ({ ...f, imap_pass: e.target.value }))}
                placeholder="Gmail App Password (16 chars)"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] pr-16" />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-1">
          <p><strong>Gmail / Google Workspace:</strong> imap.gmail.com · port 993 · App Password (όχι κανονικός κωδικός)</p>
          <p><strong>Custom domain (π.χ. info@yourdomain.gr):</strong> mail.yourdomain.gr · port 993 · κανονικός κωδικός email</p>
          <p className="text-blue-500">Αν δεν ξέρετε τον IMAP server, ρωτήστε τον πάροχο hosting σας (π.χ. Papaki, cPanel).</p>
        </div>
        <button type="submit" disabled={connecting}
          className="bg-[#1e3a5f] text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-[#16305a] disabled:opacity-50 transition-colors">
          {connecting ? 'Σύνδεση…' : status?.connected ? 'Ενημέρωση Στοιχείων' : 'Σύνδεση Email'}
        </button>
      </form>
    </div>
  )
}
