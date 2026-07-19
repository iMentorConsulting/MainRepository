'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TemplateEditor } from '@/components/campaigns/template-editor'
import { ChevronDown, ChevronUp, Plus, Trash2, Download } from 'lucide-react'

interface GemiTemplate {
  id: string
  label: string
  description: string | null
  subject: string
  previewText: string | null
  htmlContent: string
  active: boolean
}

function TemplateCard({ template, onSaved, onDeleted }: { template: GemiTemplate; onSaved: (t: GemiTemplate) => void; onDeleted: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState(template.label)
  const [description, setDescription] = useState(template.description ?? '')
  const [subject, setSubject] = useState(template.subject)
  const [previewText, setPreviewText] = useState(template.previewText ?? '')
  const [htmlContent, setHtmlContent] = useState(template.htmlContent)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const dirty = label !== template.label || description !== (template.description ?? '') || subject !== template.subject || previewText !== (template.previewText ?? '') || htmlContent !== template.htmlContent

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/gemi/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, description, subject, previewText: previewText || null, htmlContent }),
      })
      if (res.ok) {
        onSaved(await res.json())
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        const err = await res.json().catch(() => ({}))
        setSaveError(err.error ?? `Σφάλμα ${res.status}`)
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Σφάλμα δικτύου')
    }
    setSaving(false)
  }

  async function toggleActive() {
    const res = await fetch(`/api/gemi/templates/${template.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !template.active }),
    })
    if (res.ok) onSaved(await res.json())
  }

  async function remove() {
    if (!confirm(`Διαγραφή του προτύπου "${template.label}"; Η ενέργεια δεν αναιρείται.`)) return
    const res = await fetch(`/api/gemi/templates/${template.id}`, { method: 'DELETE' })
    if (res.ok) onDeleted(template.id)
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <div className="min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">{template.label}</p>
          {template.description && <p className="text-xs text-gray-500 truncate">{template.description}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge
            variant={template.active ? 'success' : 'secondary'}
            className="cursor-pointer"
            onClick={e => { e.stopPropagation(); toggleActive() }}
          >
            {template.active ? 'Ενεργό' : 'Ανενεργό'}
          </Badge>
          {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Τίτλος Προτύπου</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Περιγραφή</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Θέμα Email</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Preview Text <span className="font-normal text-gray-400">(εμφανίζεται στα εισερχόμενα μετά το θέμα)</span>
            </label>
            <input
              type="text"
              value={previewText}
              onChange={e => setPreviewText(e.target.value)}
              maxLength={200}
              placeholder="π.χ. Μάθετε αν η επιχείρησή σας είναι επιλέξιμη για επιδότηση..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <p className="text-xs text-gray-400 mt-1">Υποστηρίζει μεταβλητές {'{{business_name}}'} κ.λπ. · {previewText.length}/200</p>
          </div>
          <TemplateEditor
            label="Περιεχόμενο Email (HTML)"
            value={htmlContent}
            onChange={setHtmlContent}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
            </Button>
            {saved && <span className="text-xs text-green-600">Αποθηκεύτηκε!</span>}
            {saveError && <span className="text-xs text-red-600">{saveError}</span>}
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 ml-auto" onClick={remove}>
              <Trash2 size={14} className="mr-1.5" />
              Διαγραφή
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function NewTemplateForm({ onCreated }: { onCreated: (t: GemiTemplate) => void }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [saving, setSaving] = useState(false)

  async function create() {
    if (!label.trim() || !subject.trim()) return
    setSaving(true)
    const res = await fetch('/api/gemi/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, description, subject, previewText: previewText || null, htmlContent: '' }),
    })
    if (res.ok) {
      onCreated(await res.json())
      setOpen(false)
      setLabel(''); setDescription(''); setSubject(''); setPreviewText('')
    }
    setSaving(false)
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus size={16} className="mr-2" />Νέο Πρότυπο
      </Button>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h2 className="text-base font-bold text-gray-900">Νέο Πρότυπο Email ΓΕΜΗ</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Τίτλος *</label>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            placeholder="π.χ. Ενημέρωση Επιλεξιμότητας ΕΣΠΑ" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Θέμα Email *</label>
          <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            placeholder="π.χ. Ευκαιρία χρηματοδότησης για {{business_name}}" />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-gray-700 mb-1 block">Περιγραφή</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            Preview Text <span className="font-normal text-gray-400">(εισερχόμενα — μετά το θέμα)</span>
          </label>
          <input type="text" value={previewText} onChange={e => setPreviewText(e.target.value)}
            maxLength={200}
            placeholder="π.χ. Μάθετε αν η επιχείρησή σας είναι επιλέξιμη για επιδότηση..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={create} disabled={saving || !label.trim() || !subject.trim()}>
          {saving ? 'Δημιουργία...' : 'Δημιουργία'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Ακύρωση</Button>
      </div>
    </div>
  )
}

export default function GemiTemplatesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [templates, setTemplates] = useState<GemiTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (!session || (session.user as any)?.role !== 'ADMIN') { router.replace('/'); return }
    fetch('/api/gemi/templates')
      .then(r => r.json())
      .then(d => setTemplates(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [session, status, router])

  if (loading || status === 'loading') return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Πρότυπα Email ΓΕΜΗ</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">ΓΕΜΗ</span>
          </div>
          <p className="text-gray-500 mt-1 text-sm">
            Πρότυπα μηνυμάτων για καμπάνιες email στη δεξαμενή επιχειρήσεων ΓΕΜΗ.
            Χρησιμοποιήστε μεταβλητές για εξατομίκευση.
          </p>
        </div>
        <Button
          loading={seeding}
          variant="secondary"
          size="sm"
          onClick={async () => {
            setSeeding(true)
            const res = await fetch('/api/gemi/templates/seed-default', { method: 'POST' })
            if (res.ok) {
              const t = await res.json()
              setTemplates(prev => [t, ...prev])
            }
            setSeeding(false)
          }}
        >
          <Download size={15} className="mr-2" />Φόρτωση Προεπιλεγμένου Προτύπου
        </Button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-amber-800 mb-2">Διαθέσιμες μεταβλητές:</p>
        <div className="flex flex-wrap gap-2">
          {[
            ['{{business_name}}', 'Επωνυμία'],
            ['{{afm}}', 'ΑΦΜ'],
            ['{{accountant_name}}', 'Λογιστής'],
            ['{{accountant_office}}', 'Γραφείο'],
            ['{{program_title}}', 'Πρόγραμμα'],
            ['{{program_description}}', 'Περιγραφή Προγράμματος'],
            ['{{program_url}}', 'Σελίδα Προγράμματος'],
            ['{{program_deadline}}', 'Προθεσμία Προγράμματος'],
            ['{{program_amount}}', 'Ποσό Επένδυσης'],
            ['{{extra_criteria}}', 'Πρόσθετες Προϋποθέσεις'],
            ['{{region}}', 'Περιφέρεια Έδρας'],
            ['{{founding_date}}', 'Ημερομηνία Ίδρυσης'],
            ['{{kad_code}}', 'Κωδικός ΚΑΔ'],
            ['{{kad_description}}', 'Περιγραφή ΚΑΔ'],
            ['{{match_reason}}', 'Λόγοι Επιλεξιμότητας'],
            ['{{ermis_link}}', 'Σύνδεσμος Ερμή'],
            ['{{exodikastikos_link}}', 'Σύνδεσμος Εξωδικαστικού (ΘΕΜΙΣ)'],
            ['{{unsubscribe_link}}', 'Κατάργηση εγγραφής'],
          ].map(([key, lbl]) => (
            <span key={key} className="inline-flex items-center gap-1 text-xs bg-white border border-amber-300 text-amber-900 rounded px-2 py-1 font-mono">
              <span className="text-amber-500">{key}</span>
              <span className="text-gray-500 font-sans">— {lbl}</span>
            </span>
          ))}
        </div>
      </div>

      <NewTemplateForm onCreated={t => setTemplates(prev => [t, ...prev])} />

      {templates.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400">Δεν υπάρχουν πρότυπα ακόμα. Χρησιμοποιήστε το κουμπί &quot;Φόρτωση Προεπιλεγμένου Προτύπου&quot; παραπάνω.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-3">
          {templates.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              onSaved={updated => setTemplates(prev => prev.map(x => x.id === updated.id ? updated : x))}
              onDeleted={id => setTemplates(prev => prev.filter(x => x.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
