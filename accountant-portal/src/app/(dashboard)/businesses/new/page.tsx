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

  function handleAfmNotFound(afm: string) {
    // No GSIS record — treat as a private individual rather than a registered business
    setValue('afm', afm)
    setValue('legalStatusDescr', 'ΙΔΙΩΤΗΣ')
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
          size="sm"
          className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md"
          onClick={() => setImportMode(!importMode)}
        >
          <Upload size={14} className="mr-1.5" />
          {importMode ? '← Χειροκίνητη Εισαγωγή' : '📊 Μαζική Εισαγωγή Excel'}
        </Button>
      </div>

      {importMode ? (
        <div className="space-y-5">
          {/* Big guide card */}
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white">
            <h2 className="text-xl font-bold mb-1">📊 Μαζική Εισαγωγή Πελατών — Βήμα προς Βήμα</h2>
            <p className="text-emerald-100 text-sm">Εισάγετε εκατοντάδες πελάτες μέσα σε δευτερόλεπτα. Ακολουθήστε τα 3 βήματα:</p>
          </div>

          {/* Step 1: Download template */}
          <div className="bg-white rounded-2xl border-2 border-emerald-200 p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0 text-emerald-700 font-bold text-lg">1</div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 mb-1">Κατεβάστε το πρότυπο Excel</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Ανοίξτε το αρχείο στο Excel ή το Google Sheets. Θα βρείτε τις σωστές στήλες ήδη έτοιμες.
                </p>
                <div className="bg-gray-50 rounded-xl p-4 mb-3 font-mono text-xs overflow-x-auto">
                  <table className="border-collapse w-full">
                    <thead>
                      <tr>
                        {['afm', 'email', 'phone', 'viber_phone'].map(col => (
                          <th key={col} className="border border-gray-300 px-3 py-1.5 bg-emerald-50 text-emerald-800 text-left">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-gray-200 px-3 py-1.5 text-gray-600">123456789</td>
                        <td className="border border-gray-200 px-3 py-1.5 text-gray-400">info@example.gr</td>
                        <td className="border border-gray-200 px-3 py-1.5 text-gray-400">2810123456</td>
                        <td className="border border-gray-200 px-3 py-1.5 text-gray-400">6972123456</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-gray-500 mb-3 space-y-0.5">
                  <p>✅ <strong>afm</strong> — Μόνο αυτό είναι υποχρεωτικό! 9-ψήφιος ΑΦΜ του πελάτη</p>
                  <p>📧 <strong>email</strong> — Email επικοινωνίας (προαιρετικό)</p>
                  <p>📞 <strong>phone</strong> — Τηλέφωνο (προαιρετικό)</p>
                  <p>💬 <strong>viber_phone</strong> — Viber (προαιρετικό, για Viber καμπάνιες)</p>
                  <p className="mt-2 text-indigo-600 font-medium">⚡ Τα υπόλοιπα στοιχεία (επωνυμία, ΚΑΔ, διεύθυνση κ.λπ.) αντλούνται αυτόματα από την ΑΑΔΕ!</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const csv = 'afm,email,phone,viber_phone\n123456789,info@example.gr,2810123456,6972123456\n'
                    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'protupo-eisagogi-pelaton.csv'
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                >
                  <Upload size={16} />
                  ⬇️ Κατεβάστε Πρότυπο Excel (CSV)
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: Fill it */}
          <div className="bg-white rounded-2xl border-2 border-blue-200 p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 text-blue-700 font-bold text-lg">2</div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 mb-1">Συμπληρώστε τους ΑΦΜ των πελατών σας</h3>
                <p className="text-sm text-gray-500">
                  Βάλτε έναν ΑΦΜ σε κάθε γραμμή. Μπορείτε να βγάλετε λίστα ΑΦΜ από το λογιστικό σας πρόγραμμα (ERP/λογιστικό software)
                  και να κάνετε Αντιγραφή → Επικόλληση στο αρχείο.
                </p>
                <div className="mt-2 bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700 border border-amber-200">
                  💡 <strong>Συμβουλή:</strong> Αν έχετε Excel από λογιστικό πρόγραμμα, αρκεί να έχετε μία στήλη με επικεφαλίδα "afm" που να περιέχει τους ΑΦΜ.
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Upload */}
          <div className="bg-white rounded-2xl border-2 border-indigo-200 p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0 text-indigo-700 font-bold text-lg">3</div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 mb-1">Ανεβάστε το αρχείο και τελειώσατε!</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Επιλέξτε το αρχείο Excel ή CSV και πατήστε «Εισαγωγή». Το σύστημα θα αντλήσει αυτόματα τα στοιχεία κάθε επιχείρησης.
                </p>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-indigo-300 rounded-xl cursor-pointer hover:bg-indigo-50 transition-colors">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Upload size={28} className="text-indigo-400" />
                    <span className="text-sm font-medium text-indigo-600">{importFile ? importFile.name : 'Κάντε κλικ ή σύρετε το αρχείο εδώ'}</span>
                    <span className="text-xs text-gray-400">Υποστηρίζονται: .xlsx, .xls, .csv</span>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={e => setImportFile(e.target.files?.[0] || null)}
                  />
                </label>
                {importFile && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                    ✅ Επιλέχθηκε: <strong>{importFile.name}</strong>
                  </div>
                )}
                <Button
                  className="mt-4 w-full"
                  onClick={handleImport}
                  loading={importing}
                  disabled={!importFile}
                >
                  {importing ? '⏳ Εισαγωγή σε εξέλιξη...' : '🚀 Ξεκινήστε την Εισαγωγή'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <AfmLookup onResult={handleAfmResult} onNotFound={handleAfmNotFound} />

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
