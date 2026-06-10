'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TemplateEditor } from '@/components/campaigns/template-editor'
import { Mail, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react'

interface Template {
  id: string
  channel: string
  templateKey: string
  category: string
  label: string
  description: string
  subject: string
  bodyWithAccountant: string
  bodyDirect: string
  active: boolean
}

function TemplateCard({ template, onSaved }: { template: Template; onSaved: (t: Template) => void }) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState(template.subject)
  const [bodyWithAccountant, setBodyWithAccountant] = useState(template.bodyWithAccountant)
  const [bodyDirect, setBodyDirect] = useState(template.bodyDirect)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const dirty = subject !== template.subject || bodyWithAccountant !== template.bodyWithAccountant || bodyDirect !== template.bodyDirect

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/admin/templates/${template.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, bodyWithAccountant, bodyDirect }),
    })
    if (res.ok) {
      const updated = await res.json()
      onSaved(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  async function toggleActive() {
    const res = await fetch(`/api/admin/templates/${template.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !template.active }),
    })
    if (res.ok) onSaved(await res.json())
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <div className="min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">{template.label}</p>
          <p className="text-xs text-gray-500 truncate">{template.description}</p>
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
            <label className="text-sm font-medium text-gray-700 mb-1 block">Θέμα{template.channel === 'VIBER' ? ' (εσωτερική αναφορά)' : ''}</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <TemplateEditor
            label="Μήνυμα (με λογιστικό γραφείο)"
            value={bodyWithAccountant}
            onChange={setBodyWithAccountant}
          />
          <TemplateEditor
            label="Μήνυμα (απευθείας από I-MENTOR)"
            value={bodyDirect}
            onChange={setBodyDirect}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
            </Button>
            {saved && <span className="text-xs text-green-600">Αποθηκεύτηκε!</span>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TemplatesPage() {
  const { data: session } = useSession()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  if (session && session.user.role !== 'ADMIN') {
    redirect('/')
  }

  useEffect(() => {
    fetch('/api/admin/templates')
      .then(r => r.json())
      .then(data => setTemplates(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  function updateTemplate(updated: Template) {
    setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
    </div>
  )

  const channels: { key: string; label: string; icon: any }[] = [
    { key: 'EMAIL', label: 'Email', icon: Mail },
    { key: 'VIBER', label: 'Viber', icon: MessageCircle },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Πρότυπα Μηνυμάτων</h1>
        <p className="text-gray-500 mt-1">Όλα τα έτοιμα μηνύματα καμπανιών, οργανωμένα ανά κανάλι και κατηγορία. Επεξεργαστείτε τα ελεύθερα — οι αλλαγές εφαρμόζονται άμεσα στις νέες καμπάνιες.</p>
      </div>

      {channels.map(ch => {
        const chTemplates = templates.filter(t => t.channel === ch.key)
        if (chTemplates.length === 0) return null
        const categories = Array.from(new Set(chTemplates.map(t => t.category)))
        const Icon = ch.icon
        return (
          <div key={ch.key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Icon size={18} className="text-indigo-600" />
              {ch.label}
            </h2>
            {categories.map(cat => (
              <div key={cat} className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{cat}</h3>
                <div className="space-y-2">
                  {chTemplates.filter(t => t.category === cat).map(t => (
                    <TemplateCard key={t.id} template={t} onSaved={updateTemplate} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
