'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Link2, Copy, CheckCircle2, Rocket, Send } from 'lucide-react'
import { DypaForm, DypaFormValue, DypaBusinessInfo, DypaProgramInfo } from '@/components/dypa/dypa-form'

export default function DypaAssignmentPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'

  const [value, setValue] = useState<DypaFormValue | null>(null)
  const [business, setBusiness] = useState<DypaBusinessInfo | null>(null)
  const [program, setProgram] = useState<DypaProgramInfo | null>(null)
  const [saving, setSaving] = useState(false)
  const [link, setLink] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [linkLoading, setLinkLoading] = useState(false)
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [linkNotice, setLinkNotice] = useState('')

  async function load() {
    const res = await fetch(`/api/cases/dypa/${id}`)
    if (!res.ok) return
    const data = await res.json()
    setValue(data)
    if (data.clientCase) {
      const b = data.clientCase.business
      setBusiness(b ? { ...b, mainActivity: b.activities?.[0]?.firmActDescr || null } : null)
      setProgram(data.clientCase.program || null)
      setContactEmail(b?.email || '')
      setContactPhone(b?.phone || '')
    }
  }

  useEffect(() => { load() }, [id])

  async function patch(p: Record<string, any>) {
    setValue(v => v ? { ...v, ...p } : v)
    await fetch(`/api/cases/dypa/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
  }

  async function submitTaxisnet(taxisnetUsername: string, taxisnetPassword: string) {
    await fetch(`/api/cases/dypa/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taxisnetUsername, taxisnetPassword }) })
    load()
  }

  async function acceptTerms() {
    await fetch(`/api/cases/dypa/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acceptTerms: true }) })
    load()
  }

  async function finalAccept(businessClaimsPaid: boolean) {
    setSaving(true)
    await fetch(`/api/cases/dypa/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finalAccept: true, businessClaimsPaid }) })
    setSaving(false)
    load()
  }

  async function setHireStartDate(date: string) {
    await fetch(`/api/cases/dypa/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hireStartDate: date }) })
    load()
  }

  async function confirmPayment() {
    await fetch(`/api/cases/dypa/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initialFeeStatus: 'PAID' }) })
    load()
  }

  async function generateLink() {
    setLinkLoading(true)
    setLinkNotice('')
    try {
      const res = await fetch(`/api/cases/dypa/${id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactEmail, contactPhone }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setLink(data.url)
        setLinkNotice(contactEmail || contactPhone
          ? 'Ο σύνδεσμος δημιουργήθηκε. Η πρόσκληση αποστέλλεται στην επιχείρηση.'
          : 'Ο σύνδεσμος δημιουργήθηκε. Συμπληρώστε email/κινητό για αποστολή πρόσκλησης.')
      } else {
        setLinkNotice(data.error || 'Σφάλμα κατά τη δημιουργία του συνδέσμου.')
      }
    } catch {
      setLinkNotice('Σφάλμα δικτύου κατά τη δημιουργία του συνδέσμου.')
    } finally {
      setLinkLoading(false)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(link)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  if (!value) return <div className="max-w-3xl mx-auto py-16 text-center text-slate-400 text-sm">Φόρτωση...</div>

  const businessName = business?.onomasia || business?.afm || ''

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/matches" className="text-gray-400 hover:text-gray-600"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Rocket size={22} className="text-indigo-600" /> Πρόσληψη Ανέργου με Επιδότηση ΔΥΠΑ
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {businessName && <>Ανάθεση για <strong>{businessName}</strong>{program?.title ? <> · {program.title}</> : null}</>}
          </p>
        </div>
      </div>

      <Card className="border-indigo-200 bg-indigo-50/40">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-indigo-900">
            <Link2 size={16} />
            Καταχωρίστε email/κινητό της επιχείρησης για να σταλεί πρόσκληση (από I-MENTOR &amp; το λογιστικό γραφείο) να συμπληρώσει η ίδια τη φόρμα και να κάνει την πληρωμή.
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <input className="rounded-lg border border-indigo-200 px-3 py-2 text-sm" placeholder="Email επιχείρησης"
              value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
            <input className="rounded-lg border border-indigo-200 px-3 py-2 text-sm" placeholder="Κινητό επιχείρησης"
              value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={generateLink} loading={linkLoading}>
              <Send size={14} className="mr-1" /> Δημιουργία &amp; Αποστολή Συνδέσμου
            </Button>
          </div>
          {linkNotice && <p className="text-xs text-indigo-700">{linkNotice}</p>}
          {link && (
            <div className="flex items-center gap-2 bg-white rounded-lg border border-indigo-200 px-3 py-2">
              <input readOnly value={link} className="flex-1 text-xs text-slate-700 outline-none" />
              <button onClick={copyLink} className="text-indigo-600 hover:text-indigo-800">
                {linkCopied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
              </button>
            </div>
          )}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            Υπενθύμιση: αν η διαδικασία προχωρήσει, θα χρειαστούν οι κωδικοί Taxisnet της επιχείρησης. Μπορείτε να τους καταχωρίσετε τώρα (παρακάτω, αποθηκεύονται κρυπτογραφημένα) ή να περιμένετε μέχρι μετά την πληρωμή της επιχείρησης.
          </div>
        </CardContent>
      </Card>

      <DypaForm
        value={value}
        business={business}
        program={program}
        onPatch={patch}
        onSubmitTaxisnet={submitTaxisnet}
        onAcceptTerms={acceptTerms}
        onFinalAccept={finalAccept}
        onSetHireStartDate={setHireStartDate}
        pricing={(value as any).pricing}
        canSetHireDate
        canConfirmPayment={isAdmin}
        onConfirmPayment={confirmPayment}
        showTaxisnet
        saving={saving}
      />
    </div>
  )
}
