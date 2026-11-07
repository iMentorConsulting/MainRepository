'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TemplateEditor } from '@/components/campaigns/template-editor'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'

const schema = z.object({
  title: z.string().min(2, 'Απαιτείται τίτλος'),
  channel: z.enum(['EMAIL', 'VIBER']),
  programId: z.string().optional(),
  messageTemplate: z.string().min(10, 'Απαιτείται μήνυμα'),
})
type FormData = z.infer<typeof schema>

export default function EditCampaignPage() {
  const { id } = useParams()
  const router = useRouter()
  const [programs, setPrograms] = useState<any[]>([])
  const [template, setTemplate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [campaign, setCampaign] = useState<any>(null)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    fetch('/api/programs').then(r => r.json()).then(d => setPrograms(d.programs || []))
  }, [])

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then(r => r.json())
      .then(data => {
        setCampaign(data)
        reset({
          title: data.title,
          channel: data.channel,
          programId: data.programId || '',
          messageTemplate: data.messageTemplate,
        })
        setTemplate(data.messageTemplate || '')
      })
      .finally(() => setLoading(false))
  }, [id, reset])

  useEffect(() => { setValue('messageTemplate', template) }, [template, setValue])

  async function save() {
    const title = watch('title')
    const channel = watch('channel')
    const programId = watch('programId')
    const messageTemplate = watch('messageTemplate')

    if (!title || !channel || !messageTemplate) {
      alert('Συμπληρώστε τα υποχρεωτικά πεδία')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, channel, programId: programId || null, messageTemplate }),
      })
      if (res.ok) {
        router.push(`/campaigns/${id}`)
      } else {
        alert('Σφάλμα αποθήκευσης')
      }
    } catch (e) {
      alert('Σφάλμα δικτύου')
    } finally {
      setSaving(false)
    }
  }

  async function deleteCampaign() {
    if (!confirm('Σίγουρα θέλετε να διαγράψετε αυτή την καμπάνια;')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/campaigns')
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Σφάλμα διαγραφής')
      }
    } catch (e) {
      alert('Σφάλμα δικτύου')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
    </div>
  )
  if (!campaign) return <div className="text-center text-gray-500">Δεν βρέθηκε καμπάνια</div>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/campaigns/${id}`}>
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Επεξεργασία Καμπάνιας</h1>
      </div>

      {campaign.status !== 'DRAFT' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          Αυτή η καμπάνια έχει ήδη απεσταλεί ή προγραμματιστεί. Μπορείτε να επεξεργαστείτε τα στοιχεία της, αλλά η διαγραφή είναι διαθέσιμη μόνο για πρόχειρες καμπάνιες.
        </div>
      )}

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
          <CardHeader><CardTitle>Μήνυμα / Template</CardTitle></CardHeader>
          <CardContent>
            <TemplateEditor
              value={template}
              onChange={setTemplate}
              error={errors.messageTemplate?.message}
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" loading={deleting} onClick={deleteCampaign} disabled={campaign.status !== 'DRAFT'}>
            <Trash2 size={16} className="mr-2" />
            Διαγραφή
          </Button>
          <Button loading={saving} onClick={save}>
            <Save size={16} className="mr-2" />
            Αποθήκευση Αλλαγών
          </Button>
        </div>
      </div>
    </div>
  )
}
