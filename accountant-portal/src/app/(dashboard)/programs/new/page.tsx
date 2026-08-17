'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { ArrowLeft, Plus, X, FileUp, Paperclip } from 'lucide-react'
import Link from 'next/link'
import { parseRegionsFromApplicationArea, parseBudgetRange, parseSubmissionPeriod } from '@/lib/espa-parse'
import { detectRegionsInText } from '@/lib/greek-regions'
import { LEGAL_FORMS } from '@/lib/legal-forms'

// Empty-string number inputs must become undefined before z.coerce.number()
// runs — otherwise Number('') coerces to NaN, .optional() does NOT catch NaN
// (only undefined), and the whole form fails validation silently.
const optionalNumber = z.preprocess(
  v => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number().optional()
)

const schema = z.object({
  title: z.string().min(3, 'Απαιτείται τίτλος'),
  category: z.enum(['ESPA', 'DYPA', 'MICROCREDITS', 'EXTRAJUDICIAL', 'RENOVATION', 'OTHER']),
  description: z.string().optional(),
  minInvestment: optionalNumber,
  maxInvestment: optionalNumber,
  minSubsidyPct: optionalNumber,
  maxSubsidyPct: optionalNumber,
  minInterestRate: optionalNumber,
  maxInterestRate: optionalNumber,
  otherRequirements: z.string().optional(),
  websiteUrl: z.string().optional(),
  heroImageUrl: z.string().optional(),
  minRegdate: z.string().optional(),
  maxRegdate: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  active: z.boolean().default(true),
  leadIntake: z.boolean().default(false),
  internalNotes: z.string().optional(),
  pricingNote: z.string().optional(),
  ermisInstructions: z.string().optional(),
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
  const searchParams = useSearchParams()
  const fromAnnouncementId = searchParams.get('fromAnnouncementId')
  const fromDypaAnnouncementId = searchParams.get('fromDypaAnnouncementId')
  const [kadRules, setKadRules] = useState<string[]>([])
  const [regionRules, setRegionRules] = useState<string[]>([])
  const [zipCodeRules, setZipCodeRules] = useState<string[]>([])
  const [excludedLegalForms, setExcludedLegalForms] = useState<string[]>([])
  const [heroImage, setHeroImage] = useState('')
  const [videoUrls, setVideoUrls] = useState<string[]>([])
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([])
  const [attachmentNames, setAttachmentNames] = useState<string[]>([])
  const [loadingAnnouncement, setLoadingAnnouncement] = useState(!!fromAnnouncementId || !!fromDypaAnnouncementId)
  const [aiExtractionStatus, setAiExtractionStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { active: true, category: fromDypaAnnouncementId ? 'DYPA' : 'ESPA' }
  })

  // Calls the trained AI extraction tool (the same engine behind the "AI
  // Εκπαίδευση" tab) on the announcement so this form gets the model's
  // structured read instead of a fixed regex guess. Returns true if it
  // produced usable fields, so callers can fall back to the simple parser.
  async function applyAiExtraction(announcementId: string): Promise<boolean> {
    setAiExtractionStatus('running')
    try {
      const res = await fetch('/api/ai-extraction/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcementId }),
      })
      if (!res.ok) { setAiExtractionStatus('failed'); return false }
      const { result } = await res.json()
      if (!result) { setAiExtractionStatus('failed'); return false }

      if (result.minInvestment != null) setValue('minInvestment', result.minInvestment as any)
      if (result.maxInvestment != null) setValue('maxInvestment', result.maxInvestment as any)
      if (result.minSubsidyPct != null) setValue('minSubsidyPct', result.minSubsidyPct as any)
      if (result.maxSubsidyPct != null) setValue('maxSubsidyPct', result.maxSubsidyPct as any)
      if (result.minInterestRate != null) setValue('minInterestRate', result.minInterestRate as any)
      if (result.maxInterestRate != null) setValue('maxInterestRate', result.maxInterestRate as any)
      if (result.minRegdate) setValue('minRegdate', result.minRegdate)
      if (result.maxRegdate) setValue('maxRegdate', result.maxRegdate)
      if (result.startDate) setValue('startDate', result.startDate)
      if (result.endDate) setValue('endDate', result.endDate)
      if (result.otherRequirements?.length) setValue('otherRequirements', result.otherRequirements.join('\n'))
      if (result.kadRules?.length) setKadRules(result.kadRules)
      if (result.regionRules?.length) setRegionRules(result.regionRules)
      if (result.zipCodeRules?.length) setZipCodeRules(result.zipCodeRules)
      if (result.excludedLegalForms?.length) setExcludedLegalForms(result.excludedLegalForms)

      // Fields the AI extracts that don't have a dedicated form input yet —
      // kept rather than discarded, in the admin-only internal notes.
      const noteParts: string[] = []
      if (result.keyPoints?.length) noteParts.push(`Σημαντικά σημεία (AI):\n${result.keyPoints.map((p: string) => `- ${p}`).join('\n')}`)
      if (result.fundedActions?.length) noteParts.push(`Χρηματοδοτούμενες ενέργειες:\n${result.fundedActions.map((a: any) => `- ${a.title}: ${a.description}`).join('\n')}`)
      if (result.expenseCategories?.length) noteParts.push(`Κατηγορίες δαπανών:\n${result.expenseCategories.map((c: any) => `- ${c.code} | ${c.category} | ${c.expense} | ${c.limit}`).join('\n')}`)
      if (result.subsidyNote) noteParts.push(`Σχόλιο επιχορήγησης: ${result.subsidyNote}`)
      if (result.totalBudgetEur != null) noteParts.push(`Συνολικός προϋπολογισμός προγράμματος: ${result.totalBudgetEur.toLocaleString('el-GR')} €`)
      if (result.implementationMonths != null) noteParts.push(`Διάρκεια υλοποίησης: ${result.implementationMonths} μήνες`)
      if (noteParts.length) setValue('internalNotes', noteParts.join('\n\n'))

      setAiExtractionStatus('done')
      return true
    } catch {
      setAiExtractionStatus('failed')
      return false
    }
  }

  useEffect(() => {
    if (!fromAnnouncementId) return
    ;(async () => {
      let a: any = null
      try {
        const res = await fetch(`/api/espa-announcements/${fromAnnouncementId}`)
        a = res.ok ? await res.json() : null
      } catch {}
      if (!a) { setLoadingAnnouncement(false); return }

      setValue('title', a.title || '')
      setValue('websiteUrl', a.detailUrl || '')
      if (a.description) setValue('description', a.description)
      if (a.attachmentUrls?.length) {
        setAttachmentUrls(a.attachmentUrls)
        setAttachmentNames(a.attachmentNames || [])
      }

      const aiSucceeded = await applyAiExtraction(fromAnnouncementId)
      if (!aiSucceeded) {
        // Fallback to the fixed regex parser if AI extraction errored, hit
        // its rate limit, or ANTHROPIC_API_KEY isn't configured.
        const { min, max } = parseBudgetRange(a.budget)
        if (min !== undefined) setValue('minInvestment', min as any)
        if (max !== undefined) setValue('maxInvestment', max as any)

        const { startDate, endDate } = parseSubmissionPeriod(a.submissionPeriod)
        if (startDate) setValue('startDate', startDate)
        if (endDate) setValue('endDate', endDate)

        const regions = parseRegionsFromApplicationArea(a.applicationArea)
        if (regions.length > 0) setRegionRules(regions)
      }
      setLoadingAnnouncement(false)
    })()
  }, [fromAnnouncementId, setValue])

  useEffect(() => {
    if (!fromDypaAnnouncementId) return
    ;(async () => {
      let a: any = null
      try {
        const res = await fetch(`/api/dypa-announcements/${fromDypaAnnouncementId}`)
        a = res.ok ? await res.json() : null
      } catch {}
      if (!a) { setLoadingAnnouncement(false); return }

      setValue('title', a.title || '')
      setValue('websiteUrl', a.detailUrl || '')
      if (a.description) setValue('description', a.description)
      if (a.attachmentUrls?.length) {
        setAttachmentUrls(a.attachmentUrls)
        setAttachmentNames(a.attachmentNames || [])
      }

      const aiSucceeded = await applyAiExtraction(fromDypaAnnouncementId)
      if (!aiSucceeded) {
        const regions = detectRegionsInText(`${a.title || ''} ${a.description || ''}`)
        if (regions.length > 0) setRegionRules(regions)
      }
      setLoadingAnnouncement(false)
    })()
  }, [fromDypaAnnouncementId, setValue])

  async function onSubmit(data: FormData) {
    const res = await fetch('/api/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, heroImageUrl: heroImage || data.heroImageUrl, kadRules, regionRules, zipCodeRules, excludedLegalForms, videoUrls, attachmentUrls, attachmentNames }),
    })
    if (res.ok) {
      const created = await res.json()
      if (fromAnnouncementId) {
        try {
          await fetch(`/api/espa-announcements/${fromAnnouncementId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviewStatus: 'CONVERTED', convertedProgramId: created.id }),
          })
        } catch {}
      }
      if (fromDypaAnnouncementId) {
        try {
          await fetch(`/api/dypa-announcements/${fromDypaAnnouncementId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviewStatus: 'CONVERTED', convertedProgramId: created.id }),
          })
        } catch {}
      }
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

      {(fromAnnouncementId || fromDypaAnnouncementId) && aiExtractionStatus !== 'idle' && (
        <div className={`text-sm rounded-lg px-4 py-2.5 ${
          aiExtractionStatus === 'running' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
          aiExtractionStatus === 'done' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
          'bg-amber-50 text-amber-700 border border-amber-100'
        }`}>
          {aiExtractionStatus === 'running' && '✨ Εξαγωγή στοιχείων με AI σε εξέλιξη...'}
          {aiExtractionStatus === 'done' && '✨ Τα παρακάτω στοιχεία συμπληρώθηκαν αυτόματα με το εκπαιδευμένο AI. Ελέγξτε τα πριν την αποθήκευση.'}
          {aiExtractionStatus === 'failed' && '⚠ Η αυτόματη εξαγωγή με AI απέτυχε — χρησιμοποιήθηκε ο απλός βασικός parser. Ελέγξτε προσεκτικά τα πεδία.'}
        </div>
      )}

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
            {attachmentUrls.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Σχετικά Αρχεία (από ΕΣΠΑ)</label>
                <ul className="space-y-1">
                  {attachmentUrls.map((url, i) => (
                    <li key={url} className="flex items-center gap-2 text-sm">
                      <Paperclip size={13} className="text-gray-400" />
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {attachmentNames[i] || `Σχετικό αρχείο ${i + 1}`}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
            <div className="flex items-center gap-2">
              <input type="checkbox" {...register('leadIntake')} id="leadIntake" className="rounded" />
              <label htmlFor="leadIntake" className="text-sm text-gray-700">
                Εφεδρικό πρόγραμμα υποδοχής leads — χρησιμοποιείται μόνο όταν η φόρμα Bitform δεν στέλνει (ή δεν ταιριάζει) το όνομα προγράμματος. Κανονικά κάθε φόρμα δηλώνει το πρόγραμμά της ρητά.
              </label>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Εξαιρούμενες Νομικές Μορφές</label>
              <p className="text-sm text-gray-500 mb-2">
                Επιλέξτε μόνο τις μορφές που ΔΕΝ είναι επιλέξιμες για αυτό το πρόγραμμα. Αν δεν επιλέξετε καμία, το πρόγραμμα είναι ανοιχτό σε όλες τις μορφές (συμπεριλαμβανομένων ιδιωτών).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto border rounded-md p-3">
                {LEGAL_FORMS.map(f => (
                  <label key={f.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={excludedLegalForms.includes(f.value)}
                      onChange={e => {
                        if (e.target.checked) setExcludedLegalForms([...excludedLegalForms, f.value])
                        else setExcludedLegalForms(excludedLegalForms.filter(v => v !== f.value))
                      }}
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Εσωτερικές Σημειώσεις</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Textarea {...register('internalNotes')} rows={3} placeholder="Εσωτερικές πληροφορίες..." />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Κόστος για τον Ερμή (AI chat)</label>
              <p className="text-sm text-gray-500 mb-2">
                Κατά προσέγγιση κόστος/αμοιβή που θα αναφέρει ο Ερμής στον πελάτη όταν ρωτηθεί. Δεν εμφανίζεται πουθενά δημόσια εκτός από τη συνομιλία.
              </p>
              <Textarea {...register('pricingNote')} rows={2} placeholder="π.χ. Αμοιβή σύνταξης φακέλου: 800-1500€ + 5% επί εγκριθέντος προϋπολογισμού" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ειδικές οδηγίες για τον Ερμή (AI chat)</label>
              <p className="text-sm text-gray-500 mb-2">
                Οδηγίες συμπεριφοράς ειδικά για αυτό το πρόγραμμα (π.χ. τόνος, τι να τονίσει/αποφύγει). Προστίθενται απευθείας στις οδηγίες του Ερμή, δεν εμφανίζονται πουθενά δημόσια.
              </p>
              <Textarea {...register('ermisInstructions')} rows={3} placeholder="π.χ. Δώσε έμφαση στην ταχύτητα έγκρισης. Μην αναφέρεις το πρόγραμμα Χ ως εναλλακτική." />
            </div>
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
