'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Plus, X } from 'lucide-react'
import Link from 'next/link'

const schema = z.object({
  title: z.string().min(3, 'Απαιτείται τίτλος'),
  category: z.enum(['ESPA', 'DYPA', 'MICROLOANS', 'LOAN', 'OTHER']),
  description: z.string().optional(),
  minRegdate: z.string().optional(),
  maxRegdate: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  active: z.boolean().default(true),
  internalNotes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

function TagInput({ label, values, onChange, placeholder }: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const [input, setInput] = useState('')
  function add() {
    const v = input.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setInput('')
  }
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
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
    </div>
  )
}

export default function NewProgramPage() {
  const router = useRouter()
  const [kadRules, setKadRules] = useState<string[]>([])
  const [regionRules, setRegionRules] = useState<string[]>([])
  const [zipCodeRules, setZipCodeRules] = useState<string[]>([])
  const [legalStatusRules, setLegalStatusRules] = useState<string[]>([])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { active: true, category: 'ESPA' }
  })

  async function onSubmit(data: FormData) {
    const res = await fetch('/api/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, kadRules, regionRules, zipCodeRules, legalStatusRules }),
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
                { value: 'MICROLOANS', label: 'Μικροδάνεια' },
                { value: 'LOAN', label: 'Δάνεια' },
                { value: 'OTHER', label: 'Άλλο' },
              ]}
            />
            <Textarea label="Περιγραφή" {...register('description')} rows={4} />
            <div className="grid grid-cols-2 gap-4">
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
            />
            <TagInput
              label="Κανόνες Περιοχής"
              values={regionRules}
              onChange={setRegionRules}
              placeholder="π.χ. Αθήνα, Αττική"
            />
            <TagInput
              label="Κανόνες ΤΚ"
              values={zipCodeRules}
              onChange={setZipCodeRules}
              placeholder="π.χ. 104 (prefix) ή 10431"
            />
            <TagInput
              label="Νομική Μορφή"
              values={legalStatusRules}
              onChange={setLegalStatusRules}
              placeholder="π.χ. ΑΕ, ΕΠΕ, ΙΚΕ"
            />
            <div className="grid grid-cols-2 gap-4">
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
