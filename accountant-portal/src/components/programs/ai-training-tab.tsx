'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileUp, Plus, Save, Sparkles, Trash2 } from 'lucide-react'

interface Announcement {
  id: string
  title: string
  detailUrl: string
}

interface FundedAction {
  title: string
  description: string
}

interface ExpenseCategory {
  code: string
  category: string
  expense: string
  limit: string
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
  subsidyNote: string | null
  minInterestRate: number | null
  maxInterestRate: number | null
  otherRequirements: string[]
  totalBudgetEur: number | null
  implementationMonths: number | null
  startDate: string | null
  endDate: string | null
  requireTags: string[]
  excludeTags: string[]
  keyPoints: string[]
  fundedActions: FundedAction[]
  expenseCategories: ExpenseCategory[]
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

function NumberedListEditor({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  function update(i: number, text: string) {
    onChange(value.map((v, idx) => idx === i ? text : v))
  }
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {value.map((v, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="text-sm text-gray-500 mt-2 w-5 shrink-0">{i + 1}.</span>
          <textarea
            rows={2}
            className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={v}
            onChange={e => update(i, e.target.value)}
          />
          <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-600 mt-2">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, ''])}>
        <Plus size={14} className="mr-1.5" /> Προσθήκη Προϋπόθεσης
      </Button>
    </div>
  )
}

function FundedActionsEditor({ value, onChange }: { value: FundedAction[]; onChange: (v: FundedAction[]) => void }) {
  function update(i: number, patch: Partial<FundedAction>) {
    onChange(value.map((a, idx) => idx === i ? { ...a, ...patch } : a))
  }
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-600">Χρηματοδοτούμενες Ενέργειες</label>
      {value.map((a, i) => (
        <div key={i} className="flex gap-2 items-start border border-gray-200 rounded-lg p-2">
          <div className="flex-1 space-y-1">
            <input className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" placeholder="Τίτλος" value={a.title} onChange={e => update(i, { title: e.target.value })} />
            <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" placeholder="Περιγραφή" value={a.description} onChange={e => update(i, { description: e.target.value })} />
          </div>
          <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-600 mt-1">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { title: '', description: '' }])}>
        <Plus size={14} className="mr-1.5" /> Προσθήκη Ενέργειας
      </Button>
    </div>
  )
}

function ExpenseCategoriesEditor({ value, onChange }: { value: ExpenseCategory[]; onChange: (v: ExpenseCategory[]) => void }) {
  function update(i: number, patch: Partial<ExpenseCategory>) {
    onChange(value.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  }
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-600">Επιλέξιμες Κατηγορίες Δαπανών</label>
      {value.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">Κωδικός</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">Κατηγορία</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">Δαπάνη</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">Όριο</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {value.map((c, i) => (
                <tr key={i} className="border-t border-gray-200">
                  <td className="p-1"><input className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm" value={c.code} onChange={e => update(i, { code: e.target.value })} /></td>
                  <td className="p-1"><input className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm" value={c.category} onChange={e => update(i, { category: e.target.value })} /></td>
                  <td className="p-1"><input className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm" value={c.expense} onChange={e => update(i, { expense: e.target.value })} /></td>
                  <td className="p-1"><input className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm" value={c.limit} onChange={e => update(i, { limit: e.target.value })} /></td>
                  <td className="p-1">
                    <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { code: '', category: '', expense: '', limit: '' }])}>
        <Plus size={14} className="mr-1.5" /> Προσθήκη Γραμμής
      </Button>
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
  const [programs, setPrograms] = useState<{ id: string; title: string }[]>([])
  const [targetProgramId, setTargetProgramId] = useState('')
  const [applyMsg, setApplyMsg] = useState('')

  useEffect(() => {
    fetch('/api/programs')
      .then(r => r.ok ? r.json() : { programs: [] })
      .then(d => setPrograms((d.programs || []).map((p: any) => ({ id: p.id, title: p.title }))))
      .catch(() => {})
  }, [])

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

  async function applyToProgram() {
    if (!fields || !targetProgramId) return
    setApplyMsg('')
    const payload = {
      ...fields,
      otherRequirements: fields.otherRequirements.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    }
    const res = await fetch(`/api/programs/${targetProgramId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setApplyMsg(res.ok ? 'Εφαρμόστηκε στο πρόγραμμα' : 'Σφάλμα εφαρμογής στο πρόγραμμα')
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
              <TextField label="Συνολικός Π/Υ Δημόσιας Δαπάνης (€)" value={fields.totalBudgetEur} onChange={v => updateField('totalBudgetEur', v === '' ? null : Number(v))} type="number" />
              <TextField label="Διάρκεια Υλοποίησης (μήνες)" value={fields.implementationMonths} onChange={v => updateField('implementationMonths', v === '' ? null : Number(v))} type="number" />
              <ListField label="Απαιτούμενες Ετικέτες" value={fields.requireTags} onChange={v => updateField('requireTags', v)} />
              <ListField label="Αποκλειόμενες Ετικέτες" value={fields.excludeTags} onChange={v => updateField('excludeTags', v)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Σχόλιο Ποσοστού Επιχορήγησης</label>
              <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" placeholder="π.χ. bonus 5% ταχείας υλοποίησης υπό προϋποθέσεις" value={fields.subsidyNote || ''} onChange={e => updateField('subsidyNote', e.target.value)} />
            </div>

            <NumberedListEditor label="Λοιπές Προϋποθέσεις" value={fields.otherRequirements} onChange={v => updateField('otherRequirements', v)} />

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Βασικά Σημεία</label>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={fields.keyPoints.join('\n')}
                onChange={e => updateField('keyPoints', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
              />
            </div>

            <FundedActionsEditor value={fields.fundedActions} onChange={v => updateField('fundedActions', v)} />
            <ExpenseCategoriesEditor value={fields.expenseCategories} onChange={v => updateField('expenseCategories', v)} />

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Button type="button" variant="outline" onClick={saveExample} disabled={saved}>
                <Save size={14} className="mr-1.5" /> {saved ? 'Αποθηκεύτηκε ως παράδειγμα' : 'Αποθήκευση ως παράδειγμα'}
              </Button>

              <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={targetProgramId} onChange={e => setTargetProgramId(e.target.value)}>
                <option value="">— Εφαρμογή σε πρόγραμμα —</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <Button type="button" variant="outline" onClick={applyToProgram} disabled={!targetProgramId}>
                Εφαρμογή στο Πρόγραμμα
              </Button>
              {applyMsg && <span className="text-sm text-gray-600">{applyMsg}</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
