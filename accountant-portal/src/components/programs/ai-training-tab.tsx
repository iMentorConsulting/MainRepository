'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileUp, Save, Sparkles } from 'lucide-react'

interface Announcement {
  id: string
  title: string
  detailUrl: string
}

interface ExtractedFields {
  kadRules: string[]
  regionRules: string[]
  zipCodeRules: string[]
  excludedLegalForms: string[]
  minRegdate: string | null
  maxRegdate: string | null
  minInvestment: number | null
  maxInvestment: number | null
  minSubsidyPct: number | null
  maxSubsidyPct: number | null
  minInterestRate: number | null
  maxInterestRate: number | null
  otherRequirements: string | null
  startDate: string | null
  endDate: string | null
  requireTags: string[]
  excludeTags: string[]
  keyPoints: string[]
}

function ListField({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <textarea
        rows={2}
        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        value={value.join(', ')}
        onChange={e => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
      />
    </div>
  )
}

function TextField({ label, value, onChange, type = 'text' }: { label: string; value: string | number | null; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <input
        type={type}
        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

export function AiTrainingTab() {
  const [mode, setMode] = useState<'upload' | 'announcement'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [announcementId, setAnnouncementId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [fields, setFields] = useState<ExtractedFields | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (mode !== 'announcement') return
    fetch('/api/espa-announcements?limit=100')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => setAnnouncements(d.items || d || []))
      .catch(() => {})
  }, [mode])

  function updateField<K extends keyof ExtractedFields>(key: K, value: ExtractedFields[K]) {
    if (!fields) return
    setFields({ ...fields, [key]: value })
    setSaved(false)
  }

  async function runExtraction() {
    setLoading(true)
    setError('')
    setFields(null)
    setSaved(false)
    try {
      let res: Response
      if (mode === 'upload') {
        if (!file) { setError('Επιλέξτε αρχείο PDF'); setLoading(false); return }
        const formData = new FormData()
        formData.append('file', file)
        res = await fetch('/api/ai-extraction/extract', { method: 'POST', body: formData })
      } else {
        if (!announcementId) { setError('Επιλέξτε ανακοίνωση'); setLoading(false); return }
        res = await fetch('/api/ai-extraction/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ announcementId }),
        })
      }
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Σφάλμα εξαγωγής'); return }
      setSourceText(data.sourceText)
      setSourceUrl(data.sourceUrl)
      setFields(data.result)
    } catch {
      setError('Σφάλμα εξαγωγής')
    } finally {
      setLoading(false)
    }
  }

  async function saveExample() {
    if (!fields) return
    const res = await fetch('/api/ai-extraction/examples', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceText, sourceUrl, extractedJson: fields }),
    })
    if (res.ok) setSaved(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles size={18} /> AI Εκπαίδευση Εξαγωγής</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button type="button" variant={mode === 'upload' ? 'default' : 'outline'} size="sm" onClick={() => setMode('upload')}>Ανέβασμα PDF</Button>
          <Button type="button" variant={mode === 'announcement' ? 'default' : 'outline'} size="sm" onClick={() => setMode('announcement')}>Από Ανακοίνωση</Button>
        </div>

        {mode === 'upload' ? (
          <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
        ) : (
          <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={announcementId} onChange={e => setAnnouncementId(e.target.value)}>
            <option value="">— Επιλέξτε ανακοίνωση —</option>
            {announcements.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        )}

        <Button type="button" loading={loading} onClick={runExtraction}>
          <FileUp size={14} className="mr-1.5" /> Εξαγωγή
        </Button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {fields && (
          <div className="space-y-3 border-t pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ListField label="ΚΑΔ" value={fields.kadRules} onChange={v => updateField('kadRules', v)} />
              <ListField label="Περιφέρειες" value={fields.regionRules} onChange={v => updateField('regionRules', v)} />
              <ListField label="Ταχ. Κώδικες" value={fields.zipCodeRules} onChange={v => updateField('zipCodeRules', v)} />
              <ListField label="Εξαιρούμενες Νομικές Μορφές" value={fields.excludedLegalForms} onChange={v => updateField('excludedLegalForms', v)} />
              <TextField label="Ελάχ. Ημ. Ίδρυσης" value={fields.minRegdate} onChange={v => updateField('minRegdate', v)} type="date" />
              <TextField label="Μέγ. Ημ. Ίδρυσης" value={fields.maxRegdate} onChange={v => updateField('maxRegdate', v)} type="date" />
              <TextField label="Ελάχ. Επένδυση" value={fields.minInvestment} onChange={v => updateField('minInvestment', v === '' ? null : Number(v))} type="number" />
              <TextField label="Μέγ. Επένδυση" value={fields.maxInvestment} onChange={v => updateField('maxInvestment', v === '' ? null : Number(v))} type="number" />
              <TextField label="Έναρξη Υποβολών" value={fields.startDate} onChange={v => updateField('startDate', v)} type="date" />
              <TextField label="Λήξη Υποβολών" value={fields.endDate} onChange={v => updateField('endDate', v)} type="date" />
              <ListField label="Απαιτούμενες Ετικέτες" value={fields.requireTags} onChange={v => updateField('requireTags', v)} />
              <ListField label="Αποκλειόμενες Ετικέτες" value={fields.excludeTags} onChange={v => updateField('excludeTags', v)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Λοιπές Προϋποθέσεις</label>
              <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={fields.otherRequirements || ''} onChange={e => updateField('otherRequirements', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Βασικά Σημεία</label>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={fields.keyPoints.join('\n')}
                onChange={e => updateField('keyPoints', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
              />
            </div>

            <Button type="button" variant="outline" onClick={saveExample} disabled={saved}>
              <Save size={14} className="mr-1.5" /> {saved ? 'Αποθηκεύτηκε ως παράδειγμα' : 'Αποθήκευση ως παράδειγμα'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
