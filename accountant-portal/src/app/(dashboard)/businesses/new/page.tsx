'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AfmLookup } from '@/components/businesses/afm-lookup'
import { KadTable } from '@/components/businesses/kad-table'
import { ArrowLeft, Upload } from 'lucide-react'
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

export default function NewBusinessPage() {
  const router = useRouter()
  const [activities, setActivities] = useState<any[]>([])
  const [importMode, setImportMode] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema)
  })

  function handleAfmResult(data: any) {
    let onomasia = data.onomasia || ''
    let legalStatusDescr = data.legalStatusDescr || ''

    // Natural persons (sole proprietors) come back from GSIS as
    // "ΕΠΩΝΥΜΟ ΟΝΟΜΑ ΠΑΤΡΩΝΥΜΟ" with no legal status — trim the patronymic
    // and label them as ΑΤΟΜΙΚΗ
    if (!legalStatusDescr) {
      const parts = onomasia.trim().split(/\s+/)
      if (parts.length >= 3) {
        onomasia = parts.slice(0, 2).join(' ')
      }
      legalStatusDescr = 'ΑΤΟΜΙΚΗ'
    }

    setValue('afm', data.afm)
    setValue('onomasia', onomasia)
    setValue('commercialTitle', data.commercialTitle)
    setValue('legalStatusDescr', legalStatusDescr)
    setValue('regdate', data.regdate)
    setValue('postalAddress', data.postalAddress)
    setValue('postalAddressNo', data.postalAddressNo)
    setValue('postalZipCode', data.postalZipCode)
    setValue('postalAreaDescription', data.postalAreaDescription)
    setValue('doyDescr', data.doyDescr)
    setActivities(data.activities || [])
  }

  async function onSubmit(data: FormData) {
    const res = await fetch('/api/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, activities }),
    })
    if (res.ok) {
      const created = await res.json()
      router.push(`/businesses/${created.id}`)
    } else {
      const err = await res.json()
      alert(err.error || 'Σφάλμα δημιουργίας')
    }
  }

  async function handleImport() {
    if (!importFile) return
    setImporting(true)
    const formData = new FormData()
    formData.append('file', importFile)
    const res = await fetch('/api/businesses/import', { method: 'POST', body: formData })
    const result = await res.json()
    if (res.ok) {
      alert(`Εισαγωγή ολοκληρώθηκε: ${result.created} επιχειρήσεις δημιουργήθηκαν`)
      router.push('/businesses')
    } else {
      alert(result.error || 'Σφάλμα εισαγωγής')
    }
    setImporting(false)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/businesses">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Νέα Επιχείρηση</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setImportMode(!importMode)}
        >
          <Upload size={14} className="mr-1" />
          {importMode ? 'Χειροκίνητη Εισαγωγή' : 'Μαζική Εισαγωγή Excel'}
        </Button>
      </div>

      {importMode ? (
        <Card>
          <CardHeader><CardTitle>Μαζική Εισαγωγή από Excel/CSV</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              Ανεβάστε αρχείο Excel ή CSV με στήλη "afm" για μαζική εισαγωγή.
              Τα στοιχεία θα αντληθούν αυτόματα από GSIS.
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={e => setImportFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {importFile && (
              <div className="text-sm text-gray-700">Αρχείο: {importFile.name}</div>
            )}
            <Button onClick={handleImport} loading={importing} disabled={!importFile}>
              Εισαγωγή
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <AfmLookup onResult={handleAfmResult} />

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Βασικά Στοιχεία</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="ΑΦΜ *"
                    {...register('afm')}
                    error={errors.afm?.message}
                    placeholder="9 ψηφία"
                    maxLength={9}
                  />
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

            {activities.length > 0 && (
              <Card>
                <CardHeader><CardTitle>ΚΑΔ Δραστηριοτήτων</CardTitle></CardHeader>
                <CardContent>
                  <KadTable activities={activities} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle>Σημειώσεις</CardTitle></CardHeader>
              <CardContent>
                <Textarea {...register('notes')} rows={3} placeholder="Εσωτερικές σημειώσεις..." />
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button type="submit" loading={isSubmitting}>Αποθήκευση</Button>
              <Link href="/businesses"><Button variant="outline">Ακύρωση</Button></Link>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
