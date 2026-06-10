'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'

const schema = z.object({
  afm: z.string().length(9, 'ΑΦΜ πρέπει να έχει 9 ψηφία'),
  onomasia: z.string().optional(),
  commercialTitle: z.string().optional(),
  legalStatusDescr: z.string().optional(),
  regdate: z.string().optional(),
  postalAddress: z.string().optional(),
  postalAddressNo: z.string().optional(),
  postalZipCode: z.string().optional(),
  postalAreaDescription: z.string().optional(),
  doyDescr: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  viberPhone: z.string().optional(),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Activity {
  id?: string
  firmActCode: string
  firmActDescr: string
  firmActKind: number | null
  firmActKindDescr: string
}

export default function EditBusinessPage() {
  const { id } = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [tagsText, setTagsText] = useState('')
  const [excludedFromCampaigns, setExcludedFromCampaigns] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    fetch(`/api/businesses/${id}`)
      .then(r => r.json())
      .then(data => {
        reset({
          afm: data.afm,
          onomasia: data.onomasia || '',
          commercialTitle: data.commercialTitle || '',
          legalStatusDescr: data.legalStatusDescr || '',
          regdate: data.regdate || '',
          postalAddress: data.postalAddress || '',
          postalAddressNo: data.postalAddressNo || '',
          postalZipCode: data.postalZipCode || '',
          postalAreaDescription: data.postalAreaDescription || '',
          doyDescr: data.doyDescr || '',
          email: data.email || '',
          phone: data.phone || '',
          viberPhone: data.viberPhone || '',
          notes: data.notes || '',
        })
        setActivities((data.activities || []).map((a: any) => ({
          id: a.id,
          firmActCode: a.firmActCode || '',
          firmActDescr: a.firmActDescr || '',
          firmActKind: a.firmActKind ?? null,
          firmActKindDescr: a.firmActKindDescr || '',
        })))
        setTagsText((data.tags || []).join(', '))
        setExcludedFromCampaigns(!!data.excludedFromCampaigns)
      })
      .finally(() => setLoading(false))
  }, [id, reset])

  function addActivity() {
    setActivities(prev => [...prev, { firmActCode: '', firmActDescr: '', firmActKind: null, firmActKindDescr: '' }])
  }

  function updateActivity(index: number, field: keyof Activity, value: string) {
    setActivities(prev => prev.map((a, i) => {
      if (i !== index) return a
      if (field === 'firmActKind') {
        return { ...a, firmActKind: value === '' ? null : parseInt(value) }
      }
      return { ...a, [field]: value }
    }))
  }

  function removeActivity(index: number) {
    setActivities(prev => prev.filter((_, i) => i !== index))
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      const tags = tagsText.split(',').map(t => t.trim()).filter(Boolean)
      const res = await fetch(`/api/businesses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          tags,
          excludedFromCampaigns,
          activities: activities.filter(a => a.firmActCode.trim()),
        }),
      })
      if (res.ok) {
        router.push(`/businesses/${id}`)
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Σφάλμα αποθήκευσης')
      }
    } catch (e) {
      alert('Σφάλμα δικτύου')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/businesses/${id}`}>
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Επεξεργασία Επιχείρησης</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Βασικά Στοιχεία</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="ΑΦΜ *" {...register('afm')} error={errors.afm?.message} maxLength={9} />
              <Input label="Νομική Μορφή" {...register('legalStatusDescr')} />
            </div>
            <Input label="Επωνυμία" {...register('onomasia')} />
            <Input label="Εμπορικός Τίτλος" {...register('commercialTitle')} />
            <Input label="Ημερομηνία Ίδρυσης" {...register('regdate')} type="date" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Διεύθυνση & Επικοινωνία</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Input label="Οδός" {...register('postalAddress')} />
              </div>
              <Input label="Αριθμός" {...register('postalAddressNo')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="ΤΚ" {...register('postalZipCode')} />
              <Input label="Πόλη/Περιοχή" {...register('postalAreaDescription')} />
            </div>
            <Input label="ΔΟΥ" {...register('doyDescr')} />
            <div className="grid grid-cols-3 gap-4">
              <Input label="Email" type="email" {...register('email')} error={errors.email?.message} />
              <Input label="Τηλέφωνο" {...register('phone')} />
              <Input label="Viber" {...register('viberPhone')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>ΚΑΔ Δραστηριοτήτων</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addActivity}>
                <Plus size={14} className="mr-1" />Προσθήκη ΚΑΔ
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {activities.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Δεν υπάρχουν ΚΑΔ. Προσθέστε με το κουμπί παραπάνω.</p>
            ) : (
              activities.map((act, i) => (
                <div key={act.id || i} className="grid grid-cols-12 gap-2 items-start border border-gray-100 rounded-lg p-3">
                  <div className="col-span-2">
                    <Input label="Κωδικός" value={act.firmActCode} onChange={e => updateActivity(i, 'firmActCode', e.target.value)} />
                  </div>
                  <div className="col-span-5">
                    <Input label="Περιγραφή" value={act.firmActDescr} onChange={e => updateActivity(i, 'firmActDescr', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <Input
                      label="Τύπος (1=Κύρια)"
                      value={act.firmActKind === null ? '' : String(act.firmActKind)}
                      onChange={e => updateActivity(i, 'firmActKind', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input label="Περιγραφή Τύπου" value={act.firmActKindDescr} onChange={e => updateActivity(i, 'firmActKindDescr', e.target.value)} />
                  </div>
                  <div className="col-span-1 pt-6">
                    <button type="button" onClick={() => removeActivity(i)} className="text-red-400 hover:text-red-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tags & Εξαιρέσεις</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tags (διαχωρισμένα με κόμμα)</label>
              <Input
                value={tagsText}
                onChange={e => setTagsText(e.target.value)}
                placeholder="π.χ. vip, unsubscribed, εστίαση"
                helperText='Προσθέστε το tag "unsubscribed" για να σημειωθεί η επιχείρηση ως αποεγγεγραμμένη από επικοινωνίες'
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={excludedFromCampaigns}
                onChange={e => setExcludedFromCampaigns(e.target.checked)}
                className="rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span className={excludedFromCampaigns ? 'text-red-600 font-medium' : 'text-gray-600'}>
                Εξαίρεση από καμπάνιες (η επιχείρηση δεν θα λαμβάνει ποτέ email/Viber καμπάνιες)
              </span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Σημειώσεις</CardTitle></CardHeader>
          <CardContent>
            <Textarea {...register('notes')} rows={3} placeholder="Εσωτερικές σημειώσεις..." />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" loading={isSubmitting || saving}>
            <Save size={16} className="mr-2" />
            Αποθήκευση
          </Button>
          <Link href={`/businesses/${id}`}><Button variant="outline" type="button">Ακύρωση</Button></Link>
        </div>
      </form>
    </div>
  )
}
