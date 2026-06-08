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
import { ArrowLeft, Send, FileText } from 'lucide-react'
import Link from 'next/link'

const schema = z.object({
  title: z.string().min(2, 'Απαιτείται τίτλος'),
  channel: z.enum(['EMAIL', 'VIBER']),
  programId: z.string().optional(),
  messageTemplate: z.string().min(10, 'Απαιτείται μήνυμα'),
})
type FormData = z.infer<typeof schema>

export default function NewCampaignPage() {
  const router = useRouter()
  const [programs, setPrograms] = useState<any[]>([])
  const [template, setTemplate] = useState('')
  const [viberMode, setViberMode] = useState<'withAccountant' | 'direct'>('withAccountant')
  const [emailMode, setEmailMode] = useState<'withAccountant' | 'direct'>('withAccountant')
  const [savingDraft, setSavingDraft] = useState(false)
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState('')

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { channel: 'EMAIL' }
  })

  useEffect(() => {
    fetch('/api/programs').then(r => r.json()).then(d => setPrograms(d.programs || []))
  }, [])

  useEffect(() => { setValue('messageTemplate', template) }, [template])

  function buildPreview() {
    const rendered = template
      .replace(/\{\{business_name\}\}/g, 'ΠΑΡΑΔΕΙΓΜΑ ΑΕ')
      .replace(/\{\{afm\}\}/g, '123456789')
      .replace(/\{\{accountant_name\}\}/g, 'Γιώργος Παπαδόπουλος')
      .replace(/\{\{accountant_office\}\}/g, 'Λογιστικό Γραφείο Παπαδόπουλος')
      .replace(/\{\{program_title\}\}/g, 'ΕΣΠΑ 2024')
      .replace(/\{\{kad_description\}\}/g, '47.11 - Λιανικό εμπόριο')
      .replace(/\{\{match_reason\}\}/g, '• Επιλέξιμος ΚΑΔ: 47.11 - Λιανικό εμπόριο\n• Επιλέξιμη περιοχή: Αττική')
      .replace(/\{\{unsubscribe_link\}\}/g, 'https://portal.i-mentor.gr/unsubscribe/TOKEN')
    setPreview(rendered)
  }

  async function saveCampaign(status: 'DRAFT' | 'SENT') {
    const title = watch('title')
    const channel = watch('channel')
    const programId = watch('programId')
    const messageTemplate = watch('messageTemplate')

    if (!title || !channel || !messageTemplate) {
      alert('Συμπληρώστε τα υποχρεωτικά πεδία')
      return
    }

    if (status === 'DRAFT') setSavingDraft(true)
    else setSending(true)

    try {
      const body = { title, channel, programId: programId || undefined, messageTemplate, status }
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
    } catch (e) {
      alert('Σφάλμα δικτύου')
    } finally {
      setSavingDraft(false)
      setSending(false)
    }
  }

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
            <Input label="Τίτλος *" {...register('title')} error={errors.title?.message} />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Κανάλι *"
                {...register('channel')}
                options={[
                  { value: 'EMAIL', label: 'Email' },
                  { value: 'VIBER', label: 'Viber' },
                ]}
              />
              <Select
                label="Πρόγραμμα"
                {...register('programId')}
                options={programs.map(p => ({ value: p.id, label: p.title }))}
                placeholder="Χωρίς πρόγραμμα"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Έτοιμα Templates</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {watch('channel') === 'VIBER' ? (
              <>
                <p className="text-sm text-gray-500">
                  Σύντομα, εξατομικευμένα μηνύματα Viber με έμφαση (π.χ. <span className="font-mono">*{'{{business_name}}'}*</span> εμφανίζεται έντονα).
                  Επιλέξτε αν η επικοινωνία γίνεται μέσω του λογιστικού γραφείου ή απευθείας από την I-MENTOR
                  (π.χ. για δικές μας επαφές χωρίς συνεργαζόμενο λογιστή).
                </p>
                <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setViberMode('withAccountant')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viberMode === 'withAccountant' ? 'bg-white text-blue-700 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Μέσω Λογιστικού Γραφείου
                  </button>
                  <button
                    type="button"
                    onClick={() => setViberMode('direct')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viberMode === 'direct' ? 'bg-white text-blue-700 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Απευθείας από I-MENTOR
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {VIBER_CAMPAIGN_TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplate(viberMode === 'withAccountant' ? t.bodyWithAccountant : t.bodyDirect)}
                      className="text-left p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                        <FileText size={14} className="text-blue-600" />
                        {t.label}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{t.description}</p>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500">
                  Επιλέξτε ένα έτοιμο, εξατομικευμένο template ως αφετηρία. Δείχνει στον πελάτη τι ελέγξαμε
                  (κριτήρια επιλεξιμότητας). Επιλέξτε αν η επικοινωνία γίνεται μέσω του λογιστικού γραφείου ή
                  απευθείας από την I-MENTOR (π.χ. για δικές μας επαφές χωρίς συνεργαζόμενο λογιστή).
                </p>
                <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setEmailMode('withAccountant')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${emailMode === 'withAccountant' ? 'bg-white text-blue-700 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Μέσω Λογιστικού Γραφείου
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailMode('direct')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${emailMode === 'direct' ? 'bg-white text-blue-700 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Απευθείας από I-MENTOR
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CAMPAIGN_TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplate(emailMode === 'withAccountant' ? t.bodyWithAccountant : t.bodyDirect)}
                      className="text-left p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                        <FileText size={14} className="text-blue-600" />
                        {t.label}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{t.description}</p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Μήνυμα / Template</CardTitle></CardHeader>
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
