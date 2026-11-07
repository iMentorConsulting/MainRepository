'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TemplateEditor } from '@/components/campaigns/template-editor'
import { CAMPAIGN_TEMPLATES, VIBER_CAMPAIGN_TEMPLATES } from '@/lib/campaign-templates'
import { ArrowLeft, Send, FileText, Mail, MessageCircle } from 'lucide-react'
import Link from 'next/link'

const schema = z.object({
  title: z.string().min(2, 'Απαιτείται τίτλος'),
  channel: z.enum(['EMAIL', 'VIBER', 'EMAIL_AND_VIBER']),
  subject: z.string().min(1, 'Απαιτείται θέμα μηνύματος'),
  programId: z.string().optional(),
  messageTemplate: z.string().min(10, 'Απαιτείται μήνυμα'),
})
type FormData = z.infer<typeof schema>

const CHANNEL_OPTIONS = [
  { value: 'EMAIL', label: '✉️ Email' },
  { value: 'VIBER', label: '💬 Viber' },
  { value: 'EMAIL_AND_VIBER', label: '✉️+💬 Email & Viber (ταυτόχρονα)' },
]

export default function NewCampaignPage() {
  const router = useRouter()
  const [programs, setPrograms] = useState<any[]>([])
  const [template, setTemplate] = useState('')
  const [subjectValue, setSubjectValue] = useState('')
  const [mode, setMode] = useState<'withAccountant' | 'direct'>('withAccountant')
  const [savingDraft, setSavingDraft] = useState(false)
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState('')

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { channel: 'EMAIL', subject: '', messageTemplate: '' }
  })

  const channel = watch('channel')
  const isViber = channel === 'VIBER'
  const isEmail = channel === 'EMAIL'
  const isBoth = channel === 'EMAIL_AND_VIBER'
  const showViberTemplates = isViber || isBoth
  const showEmailTemplates = isEmail || isBoth

  useEffect(() => {
    fetch('/api/programs').then(r => r.json()).then(d => setPrograms(d.programs || []))
  }, [])

  useEffect(() => { setValue('messageTemplate', template) }, [template, setValue])
  useEffect(() => { setValue('subject', subjectValue) }, [subjectValue, setValue])

  function applyTemplate(subject: string, body: string) {
    setSubjectValue(subject)
    setTemplate(body)
  }

  function buildPreview() {
    const rendered = (template + (subjectValue ? `\n\n[Θέμα: ${subjectValue}]` : ''))
      .replace(/\{\{business_name\}\}/g, 'ΠΑΡΑΔΕΙΓΜΑ ΑΕ')
      .replace(/\{\{afm\}\}/g, '123456789')
      .replace(/\{\{accountant_name\}\}/g, 'Γιώργος Παπαδόπουλος')
      .replace(/\{\{accountant_office\}\}/g, 'Λογιστικό Γραφείο Παπαδόπουλος')
      .replace(/\{\{program_title\}\}/g, 'ΕΣΠΑ 2024')
      .replace(/\{\{kad_description\}\}/g, '47.11 - Λιανικό εμπόριο')
      .replace(/\{\{match_reason\}\}/g, '• Επιλέξιμος ΚΑΔ: 47.11\n• Επιλέξιμη περιοχή: Αττική')
      .replace(/\{\{unsubscribe_link\}\}/g, 'https://portal.i-mentor.gr/unsubscribe/TOKEN')
    setPreview(rendered)
  }

  async function saveCampaign(status: 'DRAFT' | 'SENT') {
    const title = watch('title')
    const channel = watch('channel')
    const subject = watch('subject')
    const programId = watch('programId')
    const messageTemplate = watch('messageTemplate')

    if (!title || !channel || !subject || !messageTemplate) {
      alert('Συμπληρώστε τα υποχρεωτικά πεδία')
      return
    }

    if (status === 'DRAFT') setSavingDraft(true)
    else setSending(true)

    try {
      const body = { title, channel, subject, programId: programId || undefined, messageTemplate, status }
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const created = await res.json()
        if (status === 'SENT') {
          fetch(`/api/campaigns/${created.id}/send`, { method: 'POST' }).catch(() => {})
        }
        router.push(`/campaigns/${created.id}`)
      } else {
        alert('Σφάλμα αποθήκευσης')
      }
    } catch {
      alert('Σφάλμα δικτύου')
    } finally {
      setSavingDraft(false)
      setSending(false)
    }
  }

  const activeTemplates = showViberTemplates ? VIBER_CAMPAIGN_TEMPLATES : CAMPAIGN_TEMPLATES

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/campaigns">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Νέα Καμπάνια</h1>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Στοιχεία Καμπάνιας</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input label="Τίτλος Καμπάνιας (εσωτερικός) *" {...register('title')} error={errors.title?.message} />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Κανάλι Αποστολής *"
                {...register('channel')}
                options={CHANNEL_OPTIONS}
              />
              <Select
                label="Πρόγραμμα"
                {...register('programId')}
                options={programs.map(p => ({ value: p.id, label: p.title }))}
                placeholder="Χωρίς πρόγραμμα"
              />
            </div>
            {/* Subject — shown for email and combined */}
            {!isViber && (
              <div>
                <Input
                  label="Θέμα Email (Subject) *"
                  value={subjectValue}
                  onChange={e => setSubjectValue(e.target.value)}
                  placeholder="π.χ. {{accountant_office}} & I-MENTOR: Επιλέξιμοι για το «{{program_title}}»"
                  error={errors.subject?.message}
                  helperText="Υποστηρίζει placeholders όπως {{accountant_office}}, {{program_title}}"
                />
              </div>
            )}
            {isViber && (
              <p className="text-xs text-gray-400 italic">Το Viber δεν χρησιμοποιεί θέμα — το μήνυμα αποστέλλεται απευθείας.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Έτοιμα Templates</CardTitle>
              <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                <button type="button" onClick={() => setMode('withAccountant')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'withAccountant' ? 'bg-white text-blue-700 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
                  Μέσω Λογιστικού Γραφείου
                </button>
                <button type="button" onClick={() => setMode('direct')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'direct' ? 'bg-white text-blue-700 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
                  Απευθείας I-MENTOR
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500">
              Κάντε κλικ σε ένα template για να συμπληρωθούν αυτόματα το <strong>Θέμα</strong> και το <strong>Μήνυμα</strong>.
              Το θέμα περιέχει ήδη το όνομα του λογιστικού γραφείου (<code className="bg-gray-100 px-1 rounded">{'{{accountant_office}}'}</code>).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeTemplates.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(
                    t.subject,
                    mode === 'withAccountant' ? t.bodyWithAccountant : t.bodyDirect
                  )}
                  className="text-left p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    {showViberTemplates ? <MessageCircle size={14} className="text-purple-600" /> : <Mail size={14} className="text-blue-600" />}
                    {t.label}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                  <p className="text-[11px] text-gray-400 mt-1 truncate font-mono">{t.subject}</p>
                </button>
              ))}
            </div>
            {isBoth && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Επιλέξατε <strong>Email & Viber</strong>. Για βέλτιστο αποτέλεσμα, επιλέξτε Email template για το κυρίως μήνυμα — το ίδιο κείμενο αποστέλλεται και ως Viber.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Μήνυμα / Template
              {isBoth && (
                <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Mail size={11} /><MessageCircle size={11} /> Αποστέλλεται και ως Email και ως Viber
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TemplateEditor
              value={template}
              onChange={setTemplate}
              error={errors.messageTemplate?.message}
            />
            <Button variant="outline" size="sm" className="mt-3" type="button" onClick={buildPreview}>
              Προεπισκόπηση
            </Button>
            {preview && (
              <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
                <div className="text-xs text-gray-400 mb-2 font-semibold">ΠΡΟΕΠΙΣΚΟΠΗΣΗ:</div>
                {preview}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" loading={savingDraft} onClick={() => saveCampaign('DRAFT')}>
            Αποθήκευση Πρόχειρου
          </Button>
          <Button loading={sending} onClick={() => saveCampaign('SENT')}>
            <Send size={16} className="mr-2" />
            Αποστολή Καμπάνιας
          </Button>
        </div>
      </div>
    </div>
  )
}
