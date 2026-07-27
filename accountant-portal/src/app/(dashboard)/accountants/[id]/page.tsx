'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LogoUploader } from '@/components/shared/logo-uploader'
import { ArrowLeft, Building2, Trash2, Mail, Send, RotateCcw, CheckCircle, Clock } from 'lucide-react'
import { DeleteRequestForm } from '@/components/shared/delete-request-form'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

const schema = z.object({
  officeName: z.string().min(2),
  contactPerson: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  active: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

export default function AccountantDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [accountant, setAccountant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [onboarding, setOnboarding] = useState<any[]>([])
  const [onboardingLoading, setOnboardingLoading] = useState(false)
  const [onboardingMsg, setOnboardingMsg] = useState('')
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema)
  })

  useEffect(() => {
    fetch(`/api/accountants/${id}`)
      .then(async r => {
        if (!r.ok) { setAccountant(null); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        setAccountant(data)
        setLogoUrl(data.logoUrl || null)
        reset({
          officeName: data.officeName,
          contactPerson: data.contactPerson,
          email: data.email,
          phone: data.phone || '',
          address: data.address || '',
          notes: data.notes || '',
          active: data.active,
        })
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!isAdmin || !id) return
    fetch(`/api/admin/onboarding/trigger?accountantId=${id}`)
      .then(r => r.json())
      .then(data => { if (data.scheduled) setOnboarding(data.scheduled) })
      .catch(() => {})
  }, [id, isAdmin])

  async function triggerOnboarding(step?: number) {
    setOnboardingLoading(true)
    setOnboardingMsg('')
    const body: any = { accountantId: id }
    if (typeof step === 'number') body.step = step
    try {
      const res = await fetch('/api/admin/onboarding/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.scheduled) setOnboarding(data.scheduled)
      setOnboardingMsg(
        typeof step === 'number'
          ? `Email ${step} ${data.sent ? 'εστάλη!' : 'απέτυχε — ' + (data.error || 'άγνωστο σφάλμα')}`
          : `Η σειρά ενεργοποιήθηκε για ${data.accountant} — Email 1 εστάλη άμεσα.`
      )
    } catch {
      setOnboardingMsg('Σφάλμα αποστολής')
    } finally {
      setOnboardingLoading(false)
    }
  }

  async function onSubmit(data: FormData) {
    const res = await fetch(`/api/accountants/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, logoUrl }),
    })
    if (res.ok) {
      if (isAdmin) router.push('/accountants')
      else alert('Τα στοιχεία αποθηκεύτηκαν!')
    } else {
      alert('Σφάλμα αποθήκευσης. Δοκιμάστε ξανά.')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
    </div>
  )

  if (!accountant) return <div className="text-center text-gray-500">Δεν βρέθηκε λογιστής</div>

  const ownBusiness = accountant.businesses?.find((b: any) => b.afm === accountant.afm)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/accountants">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{accountant.officeName}</h1>
          <p className="text-gray-500">{accountant.contactPerson}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Επεξεργασία Στοιχείων</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input label="Επωνυμία *" {...register('officeName')} error={errors.officeName?.message} />
                <Input label="Υπεύθυνος *" {...register('contactPerson')} error={errors.contactPerson?.message} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Email *" type="email" {...register('email')} error={errors.email?.message} disabled={!isAdmin} />
                  <Input label="Τηλέφωνο" {...register('phone')} />
                </div>
                <LogoUploader
                  label="Λογότυπο γραφείου (PNG, transparent)"
                  value={logoUrl}
                  onChange={setLogoUrl}
                  helperText="Εμφανίζεται στο πάνω μέρος των email καμπανιών προς τους πελάτες σας. Συνιστάται PNG με διαφανές φόντο, έως 1MB."
                />
                <Input label="Διεύθυνση" {...register('address')} />
                <Textarea label="Σημειώσεις" {...register('notes')} rows={3} disabled={!isAdmin} />
                <div className="flex items-center gap-2">
                  <input type="checkbox" {...register('active')} id="active" className="rounded" disabled={!isAdmin} />
                  <label htmlFor="active" className="text-sm text-gray-700">Ενεργός</label>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="submit" loading={isSubmitting}>Αποθήκευση</Button>
                  <Link href={isAdmin ? '/accountants' : '/dashboard'}><Button variant="outline">Ακύρωση</Button></Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {(accountant.afm || ownBusiness) && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Building2 size={18} className="text-indigo-500" />Στοιχεία ΑΑΔΕ Γραφείου</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">ΑΦΜ</span><span className="font-medium">{accountant.afm || '—'}</span></div>
                {ownBusiness ? (
                  <>
                    <div className="flex justify-between"><span className="text-gray-500">Επωνυμία</span><span className="font-medium text-right">{ownBusiness.onomasia || '—'}</span></div>
                    {ownBusiness.commercialTitle && ownBusiness.commercialTitle !== ownBusiness.onomasia && (
                      <div className="flex justify-between"><span className="text-gray-500">Διακριτικός τίτλος</span><span className="font-medium text-right">{ownBusiness.commercialTitle}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-gray-500">Νομική μορφή</span><span className="font-medium text-right">{ownBusiness.legalStatusDescr || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Ημ/νία έναρξης</span><span className="font-medium">{ownBusiness.regdate || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Ημ/νία διακοπής</span><span className="font-medium">{ownBusiness.stopDate || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Κατάσταση</span><span className="font-medium">{ownBusiness.deactivationFlagDescr || ownBusiness.firmFlagDescr || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Διεύθυνση</span><span className="font-medium text-right">{[ownBusiness.postalAddress, ownBusiness.postalAddressNo].filter(Boolean).join(' ') || '—'}{ownBusiness.postalZipCode || ownBusiness.postalAreaDescription ? `, ${ownBusiness.postalZipCode || ''} ${ownBusiness.postalAreaDescription || ''}` : ''}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">ΔΟΥ</span><span className="font-medium">{ownBusiness.doyDescr || '—'}</span></div>
                    {ownBusiness.activities?.length > 0 && (
                      <div>
                        <span className="text-gray-500">Δραστηριότητες ΚΑΔ</span>
                        <ul className="mt-1 ml-4 list-disc space-y-0.5">
                          {ownBusiness.activities.map((a: any, i: number) => (
                            <li key={i}>{a.firmActCode} — {a.firmActDescr || ''} {a.firmActKindDescr ? `(${a.firmActKindDescr})` : ''}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-400 text-xs">Τα στοιχεία ΑΑΔΕ θα εμφανιστούν μόλις εγκριθεί ο λογαριασμός.</p>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Στατιστικά</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Επιχειρήσεις</span>
                <span className="font-semibold">{accountant.businesses?.length ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Χρήστες</span>
                <span className="font-semibold">{accountant.users?.length ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Κατάσταση</span>
                <Badge variant={accountant.active ? 'success' : 'secondary'}>
                  {accountant.active ? 'Ενεργός' : 'Ανενεργός'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {isAdmin && (
            <Card className="border-indigo-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-indigo-700">
                  <Mail size={18} />
                  Onboarding Emails
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Χρησιμοποιήστε αυτά τα κουμπιά για να δοκιμάσετε τη σειρά email πριν την ενεργοποιήσετε globally με <code className="bg-gray-100 px-1 rounded text-xs">ONBOARDING_EMAILS_ENABLED=true</code>.
                </p>

                {/* Send individual steps */}
                <div className="space-y-1.5">
                  {[
                    { step: 1, label: 'Email 1 — Καλωσόρισμα & import' },
                    { step: 2, label: 'Email 2 — Προμήθειες & υπηρεσίες' },
                    { step: 3, label: 'Email 3 — Ταιριάσματα & υπενθύμιση' },
                    { step: 4, label: 'Email 4 — Ραντεβού AnyDesk' },
                  ].map(({ step, label }) => (
                    <button
                      key={step}
                      onClick={() => triggerOnboarding(step)}
                      disabled={onboardingLoading}
                      className="w-full flex items-center justify-between text-left px-3 py-2 text-xs rounded-lg border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      <span className="text-gray-700">{label}</span>
                      <Send size={12} className="text-indigo-500 shrink-0" />
                    </button>
                  ))}
                </div>

                <hr className="border-gray-100" />

                <button
                  onClick={() => triggerOnboarding()}
                  disabled={onboardingLoading}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <RotateCcw size={13} />
                  Ενεργοποίηση σειράς + άμεση αποστολή Email 1
                </button>

                {onboardingMsg && (
                  <p className={`text-xs rounded-lg px-3 py-2 ${onboardingMsg.includes('απέτυχε') || onboardingMsg.includes('Σφάλμα') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {onboardingMsg}
                  </p>
                )}

                {onboarding.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {onboarding.map((e: any) => (
                      <div key={e.step} className="flex items-center justify-between text-xs text-gray-500">
                        <span>Email {e.step}</span>
                        <span className="flex items-center gap-1">
                          {e.sentAt
                            ? <><CheckCircle size={11} className="text-green-500" /> Εστάλη</>
                            : <><Clock size={11} className="text-amber-500" /> {new Date(e.scheduledFor).toLocaleDateString('el-GR')}</>
                          }
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!isAdmin && (
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
          )}
        </div>
      </div>

    </div>
  )
}
