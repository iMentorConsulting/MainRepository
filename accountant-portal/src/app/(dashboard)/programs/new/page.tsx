'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { RegionMultiSelect } from '@/components/programs/region-multi-select'
import { HeroImageUpload } from '@/components/programs/hero-image-upload'
import { VideoUrlsInput } from '@/components/programs/video-urls-input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Plus, X, FileUp } from 'lucide-react'
import Link from 'next/link'

const schema = z.object({
  title: z.string().min(3, 'Απαιτείται τίτλος'),
  category: z.enum(['ESPA', 'DYPA', 'MICROCREDITS', 'EXTRAJUDICIAL', 'RENOVATION', 'OTHER']),
  description: z.string().optional(),
  minInvestment: z.coerce.number().optional(),
  maxInvestment: z.coerce.number().optional(),
  minSubsidyPct: z.coerce.number().optional(),
  maxSubsidyPct: z.coerce.number().optional(),
  minInterestRate: z.coerce.number().optional(),
  maxInterestRate: z.coerce.number().optional(),
  otherRequirements: z.string().optional(),
  websiteUrl: z.string().optional(),
  heroImageUrl: z.string().optional(),
  minRegdate: z.string().optional(),
  maxRegdate: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  active: z.boolean().default(true),
  internalNotes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

function TagInput({ label, values, onChange, placeholder, bulkImport, pdfImport }: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  bulkImport?: boolean
  pdfImport?: boolean
}) {
  const [input, setInput] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function add() {
    const v = input.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setInput('')
  }

  function importBulk() {
    const parsed = bulkText
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean)
    if (parsed.length === 0) return
    const merged = [...values]
    for (const p of parsed) if (!merged.includes(p)) merged.push(p)
    onChange(merged)
    setBulkText('')
    setBulkOpen(false)
  }

  async function handlePdfFile(file: File | null) {
    if (!file) return
    setPdfLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/programs/parse-kad-pdf', { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok) {
        const merged = [...values]
        for (const code of data.kadRules || []) if (!merged.includes(code)) merged.push(code)
        onChange(merged)
        alert(`Βρέθηκαν ${data.unique} μοναδικοί ΚΑΔ στο PDF και προστέθηκαν στη λίστα.`)
      } else {
        alert(data.error || 'Σφάλμα ανάγνωσης PDF')
      }
    } catch {
      alert('Σφάλμα ανάγνωσης PDF')
    } finally {
      setPdfLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="flex gap-1.5">
          {pdfImport && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={e => handlePdfFile(e.target.files?.[0] || null)}
              />
              <Button type="button" variant="outline" size="sm" loading={pdfLoading} onClick={() => fileInputRef.current?.click()}>
                <FileUp size={12} className="mr-1" />
                Εισαγωγή από PDF
              </Button>
            </>
          )}
          {bulkImport && (
            <Button type="button" variant="outline" size="sm" onClick={() => setBulkOpen(!bulkOpen)}>
              <FileUp size={12} className="mr-1" />
              Μαζική Εισαγωγή
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map(v => (
          <span key={v} className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
            {v}
            <button type="button" onClick={() => onChange(values.filter(x => x !== v))}>
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus size={14} />
        </Button>
      </div>
      {bulkImport && bulkOpen && (
        <div className="space-y-2 p-3 rounded-lg border border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500">
            Επικολλήστε λίστα τιμών χωρισμένες με κόμμα, ελληνικό ερωτηματικό ή νέα γραμμή.
          </p>
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            rows={4}
            placeholder={`π.χ.\n${placeholder || ''}`}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={importBulk}>Προσθήκη στη Λίστα</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setBulkOpen(false); setBulkText('') }}>Ακύρωση</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function NewProgramPage() {
  const router = useRouter()
  const [kadRules, setKadRules] = useState<string[]>([])
  const [regionRules, setRegionRules] = useState<string[]>([])
  const [zipCodeRules, setZipCodeRules] = useState<string[]>([])
  const [heroImage, setHeroImage] = useState('')
  const [videoUrls, setVideoUrls] = useState<string[]>([])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { active: true, category: 'ESPA' }
  })

  async function onSubmit(data: FormData) {
    const res = await fetch('/api/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, heroImageUrl: heroImage || data.heroImageUrl, kadRules, regionRules, zipCodeRules, videoUrls }),
    })
    if (res.ok) {
      const created = await res.json()
      router.push(`/programs/${created.id}`)
    } else {
      const err = await res.json()
      alert(err.error || 'Σφάλμα δημιουργίας')
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/programs">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Νέο Πρόγραμμα</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Βασικά Στοιχεία</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input label="Τίτλος Προγράμματος *" {...register('title')} error={errors.title?.message} />
            <Select
              label="Κατηγορία *"
              {...register('category')}
              options={[
                { value: 'ESPA', label: 'ΕΣΠΑ' },
                { value: 'DYPA', label: 'ΔΥΠΑ' },
                { value: 'MICROCREDITS', label: 'Μικροπιστώσεις' },
                { value: 'OTHER', label: 'Άλλο' },
              ]}
            />
            <Textarea label="Περιγραφή" {...register('description')} rows={4} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Ποσό Επένδυσης Από (€)" type="number" {...register('minInvestment')} />
              <Input label="Ποσό Επένδυσης Έως (€)" type="number" {...register('maxInvestment')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Επιχορήγηση Από (%)" type="number" step="0.1" {...register('minSubsidyPct')} placeholder="π.χ. 25" />
              <Input label="Επιχορήγηση Έως (%)" type="number" step="0.1" {...register('maxSubsidyPct')} placeholder="π.χ. 70" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Επιτόκιο Από (%) — για δάνεια/μικροπιστώσεις" type="number" step="0.01" {...register('minInterestRate')} placeholder="π.χ. 3.5" />
              <Input label="Επιτόκιο Έως (%)" type="number" step="0.01" {...register('maxInterestRate')} placeholder="π.χ. 6.0" />
            </div>
            <Textarea label="Άλλες Προϋποθέσεις Προγράμματος" {...register('otherRequirements')} rows={3} placeholder="π.χ. ελάχιστος κύκλος εργασιών, υποχρεωτική απασχόληση προσωπικού κ.λπ." />
            <Input label="Σελίδα Προγράμματος στο Website μας (URL)" {...register('websiteUrl')} placeholder="https://www.i-mentor.gr/programs/..." />
            <HeroImageUpload value={heroImage} onChange={setHeroImage} />
            <VideoUrlsInput values={videoUrls} onChange={setVideoUrls} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Ημ/νία Έναρξης" type="date" {...register('startDate')} />
              <Input label="Ημ/νία Λήξης" type="date" {...register('endDate')} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" {...register('active')} id="active" defaultChecked className="rounded" />
              <label htmlFor="active" className="text-sm text-gray-700">Ενεργό πρόγραμμα</label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Κριτήρια Επιλεξιμότητας</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <TagInput
              label="Κανόνες ΚΑΔ"
              values={kadRules}
              onChange={setKadRules}
              placeholder="π.χ. 47 ή 47.11.10.01"
              bulkImport
              pdfImport
            />
            <RegionMultiSelect
              label="Κανόνες Περιοχής (Περιφέρειες)"
              values={regionRules}
              onChange={setRegionRules}
            />
            <TagInput
              label="Κανόνες ΤΚ"
              values={zipCodeRules}
              onChange={setZipCodeRules}
              placeholder="π.χ. 104 (prefix) ή 10431"
              bulkImport
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Ελάχιστη Ημ. Ίδρυσης" type="date" {...register('minRegdate')} />
              <Input label="Μέγιστη Ημ. Ίδρυσης" type="date" {...register('maxRegdate')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Εσωτερικές Σημειώσεις</CardTitle></CardHeader>
          <CardContent>
            <Textarea {...register('internalNotes')} rows={3} placeholder="Εσωτερικές πληροφορίες..." />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" loading={isSubmitting}>Δημιουργία Προγράμματος</Button>
          <Link href="/programs"><Button variant="outline">Ακύρωση</Button></Link>
        </div>
      </form>
    </div>
  )
}
