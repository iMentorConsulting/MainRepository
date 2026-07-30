'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
import { ArrowLeft, Plus, X, FileUp, Globe, ExternalLink, Paperclip, Link2 } from 'lucide-react'
import Link from 'next/link'
import { LEGAL_FORMS } from '@/lib/legal-forms'
import { ExpenseCategoriesEditor, type ExpenseCategory } from '@/components/programs/expense-categories-editor'

// Empty-string number inputs (e.g. an untouched/cleared "Επιτόκιο Από" field)
// must become undefined before z.coerce.number() runs — otherwise Number('')
// coerces to NaN, .optional() does NOT catch NaN (only undefined), and the
// whole form fails validation silently since no error is rendered for these
// fields — the Save button looks like it does nothing.
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
  monthlyAmount: z.string().optional(),
  subsidyMonths: z.string().optional(),
  totalBenefit: z.string().optional(),
  beneficiaries: z.string().optional(),
  regions: z.string().optional(),
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

function AddLinkOrPdf({ onAddLink, onAddPdf }: {
  onAddLink: (title: string, url: string) => void
  onAddPdf: (title: string, dataUrl: string) => void
}) {
  const [mode, setMode] = useState<'link' | 'pdf'>('link')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function addLink() {
    const t = title.trim()
    const u = url.trim()
    if (!t || !u) return
    onAddLink(t, u)
    setTitle('')
    setUrl('')
  }

  async function handlePdf(file: File | null) {
    if (!file) return
    if (!file.type.includes('pdf')) { alert('Παρακαλώ επιλέξτε αρχείο PDF.'); return }
    if (file.size > 20 * 1024 * 1024) { alert('Μέγιστο μέγεθος PDF: 20 MB.'); return }
    const t = title.trim() || file.name.replace(/\.pdf$/i, '')
    setUploading(true)
    const reader = new FileReader()
    reader.onload = e => {
      onAddPdf(t, e.target?.result as string)
      setTitle('')
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.onerror = () => { alert('Σφάλμα ανάγνωσης αρχείου.'); setUploading(false) }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('link')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'link' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'}`}
        >
          <Link2 size={13} className="inline mr-1.5" />Σύνδεσμος
        </button>
        <button
          type="button"
          onClick={() => setMode('pdf')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'pdf' ? 'bg-red-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'}`}
        >
          <Paperclip size={13} className="inline mr-1.5" />Αρχείο PDF
        </button>
      </div>

      <div className="space-y-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={mode === 'pdf' ? 'Τίτλος αρχείου (π.χ. Πρόσκληση ΕΣΠΑ 2024)' : 'Τίτλος συνδέσμου (π.χ. Επίσημη σελίδα προγράμματος)'}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {mode === 'link' ? (
          <div className="flex gap-2">
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLink())}
              placeholder="https://..."
              type="url"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <Button type="button" size="sm" onClick={addLink} disabled={!title.trim() || !url.trim()}>
              <Plus size={14} className="mr-1" />Προσθήκη
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handlePdf(e.target.files?.[0] || null)} />
            <Button type="button" size="sm" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
              <FileUp size={14} className="mr-1" />Επιλογή PDF
            </Button>
            <span className="text-xs text-gray-400">Μέγιστο 20 MB</span>
          </div>
        )}
      </div>
    </div>
  )
}

function toDateInputValue(value: any): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export default function EditProgramPage() {
  const { id } = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [kadRules, setKadRules] = useState<string[]>([])
  const [excludedKadRules, setExcludedKadRules] = useState<string[]>([])
  const [excludedLegalForms, setExcludedLegalForms] = useState<string[]>([])
  const [regionRules, setRegionRules] = useState<string[]>([])
  const [zipCodeRules, setZipCodeRules] = useState<string[]>([])
  const [heroImage, setHeroImage] = useState('')
  const [videoUrls, setVideoUrls] = useState<string[]>([])
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([])
  const [attachmentNames, setAttachmentNames] = useState<string[]>([])
  const [extraCriteriaIds, setExtraCriteriaIds] = useState<string[]>([])
  const [criteriaOptions, setCriteriaOptions] = useState<{ id: string; label: string; active: boolean }[]>([])
  const [excludeTags, setExcludeTags] = useState<string[]>([])
  const [requireTags, setRequireTags] = useState<string[]>([])
  const [tagOptions, setTagOptions] = useState<{ label: string }[]>([])
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])
  // WordPress integration
  const [wpTemplates, setWpTemplates] = useState<{ id: string; name: string; categories: string[] }[]>([])
  const [wpPageId, setWpPageId] = useState<number | null>(null)
  const [wpPageUrl, setWpPageUrl] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [wpCreating, setWpCreating] = useState(false)
  const [wpToast, setWpToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  const watchedCategory = watch('category')

  useEffect(() => {
    fetch('/api/admin/criteria')
      .then(r => r.json())
      .then(data => setCriteriaOptions(Array.isArray(data) ? data : []))
      .catch(() => {})
    fetch('/api/admin/tags')
      .then(r => r.json())
      .then(data => setTagOptions(Array.isArray(data) ? data : []))
      .catch(() => {})
    fetch('/api/wordpress/templates')
      .then(r => r.json())
      .then(data => setWpTemplates(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`/api/programs/${id}`)
      .then(r => r.json())
      .then(program => {
        setKadRules(program.kadRules || [])
        setExcludedKadRules(program.excludedKadRules || [])
        setExcludedLegalForms(program.excludedLegalForms || [])
        setRegionRules(program.regionRules || [])
        setZipCodeRules(program.zipCodeRules || [])
        setExtraCriteriaIds(program.extraCriteriaIds || [])
        setExcludeTags(program.excludeTags || [])
        setRequireTags(program.requireTags || [])
        setHeroImage(program.heroImageUrl || '')
        setVideoUrls(program.videoUrls || [])
        setAttachmentUrls(program.attachmentUrls || [])
        setAttachmentNames(program.attachmentNames || [])
        setExpenseCategories(Array.isArray(program.expenseCategories) ? program.expenseCategories : [])
        setWpPageId(program.wpPageId ?? null)
        setWpPageUrl(program.wpPageUrl ?? null)
        reset({
          title: program.title || '',
          category: program.category || 'ESPA',
          description: program.description || '',
          minInvestment: program.minInvestment ?? undefined,
          maxInvestment: program.maxInvestment ?? undefined,
          minSubsidyPct: program.minSubsidyPct ?? undefined,
          maxSubsidyPct: program.maxSubsidyPct ?? undefined,
          minInterestRate: program.minInterestRate ?? undefined,
          maxInterestRate: program.maxInterestRate ?? undefined,
          otherRequirements: program.otherRequirements || '',
          websiteUrl: program.websiteUrl || '',
          heroImageUrl: program.heroImageUrl || '',
          minRegdate: toDateInputValue(program.minRegdate),
          maxRegdate: toDateInputValue(program.maxRegdate),
          startDate: toDateInputValue(program.startDate),
          endDate: toDateInputValue(program.endDate),
          active: program.active ?? true,
          leadIntake: program.leadIntake ?? false,
          internalNotes: program.internalNotes || '',
          pricingNote: program.pricingNote || '',
          ermisInstructions: program.ermisInstructions || '',
          monthlyAmount: program.monthlyAmount || '',
          subsidyMonths: program.subsidyMonths || '',
          totalBenefit: program.totalBenefit || '',
          beneficiaries: program.beneficiaries || '',
          regions: program.regions || '',
        })
      })
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(data: FormData) {
    const res = await fetch(`/api/programs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, heroImageUrl: heroImage || data.heroImageUrl, kadRules, excludedKadRules, regionRules, zipCodeRules, excludedLegalForms, extraCriteriaIds, excludeTags, requireTags, videoUrls, attachmentUrls, attachmentNames, expenseCategories }),
    })
    if (res.ok) {
      router.push(`/programs/${id}`)
    } else {
      const err = await res.json()
      alert(err.error || 'Σφάλμα ενημέρωσης')
    }
  }

  async function createWpPage() {
    if (!selectedTemplateId) {
      setWpToast({ msg: 'Επίλεξε template πρώτα', ok: false })
      setTimeout(() => setWpToast(null), 3000)
      return
    }
    setWpCreating(true)
    try {
      const res = await fetch(`/api/programs/${id}/create-wp-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId }),
      })
      const data = await res.json()
      if (res.ok) {
        setWpPageId(data.wpPageId)
        setWpPageUrl(data.wpPageUrl)
        let msg = data.menuWarning
          ? `Σελίδα δημοσιεύτηκε! ⚠️ ${data.menuWarning}`
          : 'Η σελίδα δημοσιεύτηκε στο WordPress και προστέθηκε στο μενού!'
        if (data.tokenCount === 0) {
          msg = '⚠️ Σελίδα δημιουργήθηκε αλλά κανένα token δεν αντικαταστάθηκε — το template δεν έχει placeholders!'
        } else if (data.emptyValueTokens?.length > 0) {
          msg += ` ⚠️ Tokens με κενή τιμή: ${data.emptyValueTokens.join(', ')}`
        }
        setWpToast({ msg, ok: data.tokenCount > 0 && !data.menuWarning })
      } else {
        setWpToast({ msg: data.error ?? 'Σφάλμα δημιουργίας', ok: false })
      }
    } catch {
      setWpToast({ msg: 'Σφάλμα δικτύου', ok: false })
    } finally {
      setWpCreating(false)
      setTimeout(() => setWpToast(null), 5000)
    }
  }

  async function setWpStatus(status: 'publish' | 'private') {
    setWpCreating(true)
    try {
      const res = await fetch(`/api/programs/${id}/wp-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (res.ok) {
        setWpToast({ msg: status === 'private' ? 'Η σελίδα απενεργοποιήθηκε (private).' : 'Η σελίδα επανενεργοποιήθηκε (published).', ok: true })
      } else {
        setWpToast({ msg: data.error ?? 'Σφάλμα', ok: false })
      }
    } catch {
      setWpToast({ msg: 'Σφάλμα δικτύου', ok: false })
    } finally {
      setWpCreating(false)
      setTimeout(() => setWpToast(null), 4000)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/programs/${id}`}>
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Επεξεργασία Προγράμματος</h1>
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
              <input type="checkbox" {...register('active')} id="active" className="rounded" />
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

        {/* ΔΥΠΑ hiring fields — shown for all categories so they can be filled for DYPA programs */}
        <Card>
          <CardHeader><CardTitle>Στοιχεία Επιχορήγησης Πρόσληψης (ΔΥΠΑ)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">Συμπληρώστε για προγράμματα ΔΥΠΑ πρόσληψης. Τα πεδία αυτά χρησιμοποιούνται ως tokens στα WordPress templates.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Μηνιαία Επιχορήγηση"
                {...register('monthlyAmount')}
                placeholder="π.χ. 875€ ή έως 800€/μήνα"
              />
              <Input
                label="Μήνες Επιχορήγησης"
                {...register('subsidyMonths')}
                placeholder="π.χ. 12 ή 12+3 ή 12+12"
              />
              <Input
                label="Συνολικό Όφελος ανά Πρόσληψη"
                {...register('totalBenefit')}
                placeholder="π.χ. έως 10.500€"
              />
            </div>
            <Textarea
              label="Ωφελούμενοι Άνεργοι (ποιους μπορείτε να προσλάβετε)"
              {...register('beneficiaries')}
              rows={3}
              placeholder="π.χ. Άνεργοι 30-49 ετών εγγεγραμμένοι στον ΔΥΠΑ, μακροχρόνια άνεργοι κ.λπ."
            />
            <Input
              label="Περιοχή Ισχύος"
              {...register('regions')}
              placeholder="π.χ. Όλη η Ελλάδα ή Ανατολική Μακεδονία και Θράκη"
            />
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
            <TagInput
              label="Εξαιρούμενοι ΚΑΔ (exceptions)"
              values={excludedKadRules}
              onChange={setExcludedKadRules}
              placeholder="π.χ. 15212345"
              bulkImport
            />
            {excludedKadRules.length > 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-1.5">
                Οι παραπάνω ΚΑΔ αποκλείονται από το matching ακόμα κι αν ταιριάζουν με τους κανόνες ΚΑΔ παραπάνω.
              </p>
            )}
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
              {excludedLegalForms.filter(v => !LEGAL_FORMS.some(f => f.value === v)).length > 0 && (
                <div className="mt-3">
                  <p className="text-sm text-amber-700 mb-1.5">
                    Οι παρακάτω τιμές προστέθηκαν αυτόματα (π.χ. από εξαγωγή AI) και δεν αντιστοιχούν σε γνωστή νομική μορφή — πιθανότατα είναι λάθος ταξινόμηση (π.χ. εξαίρεση ΚΑΔ/κλάδου) και επηρεάζουν λανθασμένα το matching. Αφαιρέστε όσες δεν είναι όντως νομικές μορφές.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {excludedLegalForms.filter(v => !LEGAL_FORMS.some(f => f.value === v)).map(v => (
                      <span key={v} className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-full pl-2.5 pr-1.5 py-1">
                        {v}
                        <button
                          type="button"
                          onClick={() => setExcludedLegalForms(excludedLegalForms.filter(x => x !== v))}
                          className="hover:text-amber-950"
                          aria-label={`Αφαίρεση ${v}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Πρόσθετες Προϋποθέσεις (Manual Check)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-gray-500 mb-2">
              Επιλέξτε τις πρόσθετες προϋποθέσεις που ισχύουν για αυτό το πρόγραμμα. Θα εμφανίζονται στη σελίδα Matches για χειροκίνητο έλεγχο από τον λογιστή.
            </p>
            {criteriaOptions.length === 0 ? (
              <p className="text-sm text-gray-400">Δεν έχουν οριστεί κριτήρια. Μεταβείτε στη σελίδα "Πρόσθετα Κριτήρια".</p>
            ) : (
              criteriaOptions.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={extraCriteriaIds.includes(c.id)}
                    onChange={e => {
                      if (e.target.checked) setExtraCriteriaIds([...extraCriteriaIds, c.id])
                      else setExtraCriteriaIds(extraCriteriaIds.filter(id => id !== c.id))
                    }}
                  />
                  <span className={c.active ? '' : 'text-gray-400'}>{c.label}{!c.active ? ' (ανενεργό)' : ''}</span>
                </label>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Φίλτρα Εξαίρεσης (Tags)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-gray-500 mb-2">
              Επιχειρήσεις που φέρουν οποιοδήποτε από αυτά τα tags εξαιρούνται αυτόματα από το matching για αυτό το πρόγραμμα, ανεξάρτητα από τα υπόλοιπα κριτήρια.
            </p>
            {tagOptions.length === 0 ? (
              <p className="text-sm text-gray-400">Δεν έχουν οριστεί tags. Μεταβείτε στη σελίδα "Tags Επιχειρήσεων".</p>
            ) : (
              tagOptions.map(t => (
                <label key={t.label} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={excludeTags.includes(t.label)}
                    onChange={e => {
                      if (e.target.checked) setExcludeTags([...excludeTags, t.label])
                      else setExcludeTags(excludeTags.filter(v => v !== t.label))
                    }}
                  />
                  <span>{t.label}</span>
                </label>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Υποχρεωτικά Tags (Matching)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-gray-500 mb-2">
              Αν επιλέξετε ένα ή περισσότερα tags, μια επιχείρηση θα πρέπει να φέρει τουλάχιστον ένα από αυτά για να ταιριάζει με αυτό το πρόγραμμα, ανεξάρτητα από τα υπόλοιπα κριτήρια.
            </p>
            {tagOptions.length === 0 ? (
              <p className="text-sm text-gray-400">Δεν έχουν οριστεί tags. Μεταβείτε στη σελίδα "Tags Επιχειρήσεων".</p>
            ) : (
              tagOptions.map(t => (
                <label key={t.label} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={requireTags.includes(t.label)}
                    onChange={e => {
                      if (e.target.checked) setRequireTags([...requireTags, t.label])
                      else setRequireTags(requireTags.filter(v => v !== t.label))
                    }}
                  />
                  <span>{t.label}</span>
                </label>
              ))
            )}
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

        {/* Attachments & Links */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Paperclip size={17} />Αρχεία PDF & Σύνδεσμοι</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              Προσθέστε αρχεία PDF (ανέβασμα) ή εξωτερικούς συνδέσμους με τίτλο. Εμφανίζονται στη σελίδα του προγράμματος.
            </p>

            {/* Existing list */}
            {attachmentUrls.length > 0 && (
              <ul className="space-y-2">
                {attachmentUrls.map((url, i) => (
                  <li key={i} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-gray-50">
                    {url.startsWith('data:') ? (
                      <Paperclip size={14} className="text-red-500 flex-shrink-0" />
                    ) : (
                      <Link2 size={14} className="text-blue-500 flex-shrink-0" />
                    )}
                    <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">
                      {attachmentNames[i] || url}
                    </span>
                    {!url.startsWith('data:') && (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 flex-shrink-0">
                        <ExternalLink size={13} />
                      </a>
                    )}
                    {url.startsWith('data:') && (
                      <a href={url} download={attachmentNames[i] || 'document.pdf'} className="text-gray-500 hover:text-gray-700 flex-shrink-0 text-xs">
                        Λήψη
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const newUrls = attachmentUrls.filter((_, j) => j !== i)
                        const newNames = attachmentNames.filter((_, j) => j !== i)
                        setAttachmentUrls(newUrls)
                        setAttachmentNames(newNames)
                      }}
                      className="text-red-400 hover:text-red-600 flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Add link */}
            <AddLinkOrPdf
              onAddLink={(title, url) => {
                setAttachmentNames([...attachmentNames, title])
                setAttachmentUrls([...attachmentUrls, url])
              }}
              onAddPdf={(title, dataUrl) => {
                setAttachmentNames([...attachmentNames, title])
                setAttachmentUrls([...attachmentUrls, dataUrl])
              }}
            />
          </CardContent>
        </Card>

        {/* WordPress Integration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe size={18} className="text-blue-700" />
              Δημιουργία Σελίδας WordPress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {wpToast && (
              <div className={`px-4 py-2.5 rounded-lg text-sm font-medium text-white ${wpToast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
                {wpToast.msg}
              </div>
            )}
            {wpPageId ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                <div className="flex items-center gap-3">
                  <Globe size={16} className="text-emerald-700 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-emerald-800">Σελίδα δημοσιεύτηκε (ID: {wpPageId})</p>
                    {wpPageUrl && (
                      <a href={wpPageUrl} target="_blank" rel="noreferrer"
                        className="text-xs text-emerald-700 hover:underline flex items-center gap-1 mt-0.5">
                        {wpPageUrl} <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                    loading={wpCreating} onClick={() => setWpStatus('private')}>
                    Απενεργοποίηση (Private)
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    loading={wpCreating} onClick={() => setWpStatus('publish')}>
                    Επανενεργοποίηση
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Δεν έχει δημιουργηθεί σελίδα WordPress για αυτό το πρόγραμμα.</p>
            )}

            {wpTemplates.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                Δεν υπάρχουν templates.{' '}
                <Link href="/wordpress" className="underline">Δημιούργησε ένα εδώ</Link>.
              </p>
            ) : (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Template Elementor
                  </label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={selectedTemplateId}
                    onChange={e => setSelectedTemplateId(e.target.value)}
                  >
                    <option value="">— Επιλογή template —</option>
                    {wpTemplates
                      .filter(t => t.categories.length === 0 || t.categories.includes(watchedCategory))
                      .map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    {wpTemplates.some(t => t.categories.length > 0 && !t.categories.includes(watchedCategory)) && (
                      <optgroup label="Άλλες κατηγορίες">
                        {wpTemplates
                          .filter(t => t.categories.length > 0 && !t.categories.includes(watchedCategory))
                          .map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                </div>
                <Button
                  type="button"
                  onClick={createWpPage}
                  loading={wpCreating}
                  variant={wpPageId ? 'outline' : 'default'}
                >
                  <Globe size={15} className="mr-2" />
                  {wpPageId ? 'Αντικατάσταση Σελίδας' : 'Δημιουργία Σελίδας'}
                </Button>
              </div>
            )}
            <p className="text-xs text-gray-400">
              Δημοσιεύεται αμέσως στο i-mentor.gr και προστίθεται αυτόματα στο μενού που έχεις ορίσει στο template.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Επιλέξιμες Κατηγορίες Δαπανών</CardTitle></CardHeader>
          <CardContent>
            <ExpenseCategoriesEditor value={expenseCategories} onChange={setExpenseCategories} />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" loading={isSubmitting}>Αποθήκευση</Button>
          <Link href={`/programs/${id}`}><Button variant="outline">Ακύρωση</Button></Link>
        </div>
      </form>
    </div>
  )
}
