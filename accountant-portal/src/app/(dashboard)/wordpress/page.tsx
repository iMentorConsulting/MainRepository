'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, ExternalLink, RefreshCw, Globe, Code2, Copy, Pencil } from 'lucide-react'

const CATEGORY_LABELS: Record<string, string> = {
  ESPA: 'ΕΣΠΑ',
  DYPA: 'ΔΥΠΑ',
  MICROCREDITS: 'Μικροπιστώσεις',
  EXTRAJUDICIAL: 'Εξωδικαστικός',
  RENOVATION: 'Ανακαίνιση',
  OTHER: 'Άλλο',
}
const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS)

// Built-in available placeholder tokens
const BUILTIN_TOKENS: { token: string; field: string; description: string }[] = [
  { token: '{{TITLE}}', field: 'title', description: 'Τίτλος προγράμματος' },
  { token: '{{DESCRIPTION}}', field: 'description', description: 'Περιγραφή' },
  { token: '{{SUBSIDY_RANGE}}', field: 'subsidyRange', description: 'Εύρος επιδότησης π.χ. 40%–70%' },
  { token: '{{MIN_SUBSIDY}}', field: 'minSubsidyPct', description: 'Ελάχιστη επιδότηση %' },
  { token: '{{MAX_SUBSIDY}}', field: 'maxSubsidyPct', description: 'Μέγιστη επιδότηση %' },
  { token: '{{INVESTMENT_RANGE}}', field: 'investmentRange', description: 'Εύρος επένδυσης π.χ. €30.000–€400.000' },
  { token: '{{MIN_INVESTMENT}}', field: 'minInvestment', description: 'Ελάχιστη επένδυση' },
  { token: '{{MAX_INVESTMENT}}', field: 'maxInvestment', description: 'Μέγιστη επένδυση' },
  { token: '{{OTHER_REQUIREMENTS}}', field: 'otherRequirements', description: 'Λοιπές προϋποθέσεις' },
  { token: '{{WEBSITE_URL}}', field: 'websiteUrl', description: 'URL επίσημης σελίδας' },
  { token: '{{TOTAL_BUDGET}}', field: 'totalBudget', description: 'Συνολικός προϋπολογισμός' },
  { token: '{{IMPLEMENTATION_MONTHS}}', field: 'implementationMonths', description: 'Μήνες υλοποίησης' },
  { token: '{{END_DATE}}', field: 'endDate', description: 'Ημερομηνία λήξης' },
  { token: '{{HERO_IMAGE}}', field: 'heroImageUrl', description: 'URL εικόνας hero' },
  { token: '{{MONTHLY_AMOUNT}}', field: 'monthlyAmount', description: 'Μηνιαία επιχορήγηση (ΔΥΠΑ)' },
  { token: '{{SUBSIDY_MONTHS}}', field: 'subsidyMonths', description: 'Μήνες επιχορήγησης (ΔΥΠΑ)' },
  { token: '{{TOTAL_BENEFIT}}', field: 'totalBenefit', description: 'Συνολικό όφελος ανά πρόσληψη (ΔΥΠΑ)' },
  { token: '{{BENEFICIARIES}}', field: 'beneficiaries', description: 'Ωφελούμενοι άνεργοι (ΔΥΠΑ)' },
  { token: '{{REGIONS}}', field: 'regions', description: 'Περιοχή ισχύος' },
]

interface WpTemplate {
  id: string
  name: string
  wpPageId: number | null
  htmlTemplate: string | null
  seoTitlePattern: string | null
  metaDescPattern: string | null
  wpMenuParentTitle: string | null
  wpMenuName: string | null
  categories: string[]
  placeholders: Record<string, string>
  active: boolean
}

interface WpPage {
  id: number
  title: string
  link: string
}

export default function WordpressTemplatesPage() {
  const [templates, setTemplates] = useState<WpTemplate[]>([])
  const [wpPages, setWpPages] = useState<WpPage[]>([])
  const [loading, setLoading] = useState(true)
  const [wpPagesLoading, setWpPagesLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // New template form
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState<'clone' | 'html'>('html')
  const [formName, setFormName] = useState('')
  const [formWpPageId, setFormWpPageId] = useState('')
  const [formHtmlTemplate, setFormHtmlTemplate] = useState('')
  const [formSeoTitlePattern, setFormSeoTitlePattern] = useState('{{TITLE}} | i-Mentor Consulting')
  const [formMetaDescPattern, setFormMetaDescPattern] = useState('{{DESCRIPTION}}')
  const [formWpMenuParentTitle, setFormWpMenuParentTitle] = useState('ΕΠΙΧΟΡΗΓΗΣΕΙΣ')
  const [formWpMenuName, setFormWpMenuName] = useState('Primary Navigation (Demo)')
  const [formCategories, setFormCategories] = useState<string[]>([])
  const [formPlaceholders, setFormPlaceholders] = useState<{ token: string; field: string }[]>(
    BUILTIN_TOKENS.map(t => ({ token: t.token, field: t.field }))
  )
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  function load() {
    setLoading(true)
    fetch('/api/wordpress/templates')
      .then(r => r.json())
      .then(d => setTemplates(Array.isArray(d) ? d : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }

  function loadWpPages() {
    setWpPagesLoading(true)
    fetch('/api/wordpress/pages')
      .then(r => r.json())
      .then(d => setWpPages(Array.isArray(d) ? d : []))
      .catch(() => showToast('Αδυναμία σύνδεσης στο WordPress', false))
      .finally(() => setWpPagesLoading(false))
  }

  useEffect(() => { load() }, [])

  function resetForm() {
    setFormName('')
    setFormWpPageId('')
    setFormHtmlTemplate('')
    setFormSeoTitlePattern('{{TITLE}} | i-Mentor Consulting')
    setFormMetaDescPattern('{{DESCRIPTION}}')
    setFormWpMenuParentTitle('ΕΠΙΧΟΡΗΓΗΣΕΙΣ')
    setFormWpMenuName('Primary Navigation (Demo)')
    setFormCategories([])
    setFormPlaceholders(BUILTIN_TOKENS.map(t => ({ token: t.token, field: t.field })))
    setFormMode('html')
  }

  function openEditForm(t: WpTemplate) {
    setEditingId(t.id)
    setFormName(t.name)
    setFormMode(t.htmlTemplate ? 'html' : 'clone')
    setFormWpPageId(t.wpPageId ? String(t.wpPageId) : '')
    setFormHtmlTemplate(t.htmlTemplate ?? '')
    setFormSeoTitlePattern(t.seoTitlePattern ?? '{{TITLE}} | i-Mentor Consulting')
    setFormMetaDescPattern(t.metaDescPattern ?? '{{DESCRIPTION}}')
    setFormWpMenuParentTitle(t.wpMenuParentTitle ?? 'ΕΠΙΧΟΡΗΓΗΣΕΙΣ')
    setFormWpMenuName(t.wpMenuName ?? 'Primary Navigation (Demo)')
    setFormCategories(t.categories)
    setFormPlaceholders(
      Object.entries(t.placeholders).map(([token, field]) => ({ token, field }))
    )
    setShowForm(true)
  }

  async function duplicateTemplate(t: WpTemplate) {
    setDuplicatingId(t.id)
    try {
      const body: Record<string, unknown> = {
        name: `${t.name} (αντίγραφο)`,
        categories: t.categories,
        placeholders: t.placeholders,
        wpMenuParentTitle: t.wpMenuParentTitle,
        wpMenuName: t.wpMenuName,
      }
      if (t.htmlTemplate) {
        body.htmlTemplate = t.htmlTemplate
        body.seoTitlePattern = t.seoTitlePattern
        body.metaDescPattern = t.metaDescPattern
      } else {
        body.wpPageId = t.wpPageId
      }
      const res = await fetch('/api/wordpress/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        showToast('Αντίγραφο δημιουργήθηκε', true)
        load()
      } else {
        showToast('Σφάλμα δημιουργίας αντιγράφου', false)
      }
    } finally {
      setDuplicatingId(null)
    }
  }

  async function saveTemplate() {
    if (!formName.trim()) {
      showToast('Συμπλήρωσε όνομα template', false)
      return
    }
    if (formMode === 'clone' && !formWpPageId.trim()) {
      showToast('Συμπλήρωσε WP Page ID', false)
      return
    }
    if (formMode === 'html' && !formHtmlTemplate.trim()) {
      showToast('Συμπλήρωσε το HTML template', false)
      return
    }
    const placeholders: Record<string, string> = {}
    for (const row of formPlaceholders) {
      if (row.token.trim() && row.field.trim()) placeholders[row.token.trim()] = row.field.trim()
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: formName,
        categories: formCategories,
        placeholders,
        wpMenuParentTitle: formWpMenuParentTitle.trim() || null,
        wpMenuName: formWpMenuName.trim() || null,
      }
      if (formMode === 'clone') {
        body.wpPageId = Number(formWpPageId)
        body.htmlTemplate = null
        body.seoTitlePattern = null
        body.metaDescPattern = null
      } else {
        body.htmlTemplate = formHtmlTemplate
        body.seoTitlePattern = formSeoTitlePattern
        body.metaDescPattern = formMetaDescPattern
        body.wpPageId = null
      }

      const url = editingId ? `/api/wordpress/templates/${editingId}` : '/api/wordpress/templates'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        showToast(editingId ? 'Template ενημερώθηκε' : 'Template αποθηκεύτηκε', true)
        setShowForm(false)
        setEditingId(null)
        resetForm()
        load()
      } else {
        const d = await res.json()
        showToast(d.error ?? 'Σφάλμα αποθήκευσης', false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Να διαγραφεί αυτό το template;')) return
    setDeletingId(id)
    try {
      await fetch(`/api/wordpress/templates/${id}`, { method: 'DELETE' })
      showToast('Διαγράφηκε', true)
      load()
    } finally {
      setDeletingId(null)
    }
  }

  function toggleCategory(cat: string) {
    setFormCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  }

  function updatePlaceholderToken(idx: number, token: string) {
    setFormPlaceholders(prev => prev.map((r, i) => i === idx ? { ...r, token } : r))
  }
  function updatePlaceholderField(idx: number, field: string) {
    setFormPlaceholders(prev => prev.map((r, i) => i === idx ? { ...r, field } : r))
  }
  function addPlaceholderRow() {
    setFormPlaceholders(prev => [...prev, { token: '', field: '' }])
  }
  function removePlaceholderRow(idx: number) {
    setFormPlaceholders(prev => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe size={22} className="text-blue-700" /> WordPress Templates
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Templates Elementor για αυτόματη δημιουργία σελίδων προγραμμάτων</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadWpPages} loading={wpPagesLoading}>
            <RefreshCw size={14} className="mr-1.5" />Φόρτωση WP Σελίδων
          </Button>
          <Button onClick={() => { setEditingId(null); resetForm(); setShowForm(true); if (wpPages.length === 0) loadWpPages() }}>
            <Plus size={16} className="mr-2" />Νέο Template
          </Button>
        </div>
      </div>

      {/* WP Pages quick reference */}
      {wpPages.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-700 mb-2">Σελίδες WordPress (για αναφορά ID)</p>
          <div className="flex flex-wrap gap-2">
            {wpPages.map(p => (
              <a key={p.id} href={p.link} target="_blank" rel="noreferrer"
                className="text-xs bg-white border border-blue-200 rounded-lg px-2 py-1 text-blue-800 hover:bg-blue-100 flex items-center gap-1">
                <span className="font-mono font-bold">{p.id}</span> — {p.title}
                <ExternalLink size={10} />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* New Template Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <h2 className="font-semibold text-gray-800">{editingId ? 'Επεξεργασία Template' : 'Νέο Template'}</h2>

          {/* Mode toggle */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Τύπος template</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => setFormMode('html')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${formMode === 'html' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <Code2 size={14} />HTML Template (SEO)
              </button>
              <button
                type="button"
                onClick={() => setFormMode('clone')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-l border-gray-200 ${formMode === 'clone' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <Copy size={14} />Κλωνοποίηση WP Σελίδας
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Όνομα template</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="π.χ. ΕΣΠΑ Standard" />
            </div>
            {formMode === 'clone' && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">WP Page ID (σελίδα-πρότυπο)</label>
                {wpPages.length > 0 ? (
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={formWpPageId}
                    onChange={e => setFormWpPageId(e.target.value)}
                  >
                    <option value="">— Επιλογή σελίδας —</option>
                    {wpPages.map(p => (
                      <option key={p.id} value={String(p.id)}>{p.id} — {p.title}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={formWpPageId}
                    onChange={e => setFormWpPageId(e.target.value)}
                    placeholder="π.χ. 1234 (πάτα Φόρτωση WP Σελίδων για dropdown)"
                    type="number"
                  />
                )}
              </div>
            )}
          </div>

          {/* HTML template fields */}
          {formMode === 'html' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">HTML Template</label>
                <p className="text-xs text-gray-500 mb-2">
                  Γράψε το πλήρες HTML. Χρησιμοποίησε tokens όπως <code className="bg-gray-100 px-1 rounded">{'{{TITLE}}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{{DESCRIPTION}}'}</code> κλπ. που αντικαθίστανται αυτόματα.
                </p>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono min-h-[240px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formHtmlTemplate}
                  onChange={e => setFormHtmlTemplate(e.target.value)}
                  placeholder="<div class=&quot;program-page&quot;>&#10;  <h1>{{TITLE}}</h1>&#10;  <p>{{DESCRIPTION}}</p>&#10;</div>"
                  spellCheck={false}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">SEO Title Pattern</label>
                  <Input
                    value={formSeoTitlePattern}
                    onChange={e => setFormSeoTitlePattern(e.target.value)}
                    placeholder="{{TITLE}} | i-Mentor Consulting"
                  />
                  <p className="text-xs text-gray-400 mt-1">Χρησιμοποιείται για Yoast/RankMath title</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Meta Description Pattern</label>
                  <Input
                    value={formMetaDescPattern}
                    onChange={e => setFormMetaDescPattern(e.target.value)}
                    placeholder="{{DESCRIPTION}}"
                  />
                  <p className="text-xs text-gray-400 mt-1">Μέχρι 160 χαρακτήρες (κόβεται αυτόματα)</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Γονικό στοιχείο μενού (τίτλος)</label>
              <Input
                value={formWpMenuParentTitle}
                onChange={e => setFormWpMenuParentTitle(e.target.value)}
                placeholder="π.χ. ΕΠΙΧΟΡΗΓΗΣΕΙΣ"
              />
              <p className="text-xs text-gray-400 mt-1">
                Ακριβής τίτλος του στοιχείου μενού όπως εμφανίζεται στο WP admin.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Όνομα μενού WordPress</label>
              <Input
                value={formWpMenuName}
                onChange={e => setFormWpMenuName(e.target.value)}
                placeholder="π.χ. Primary Navigation (Demo)"
              />
              <p className="text-xs text-gray-400 mt-1">
                Ακριβές όνομα του μενού (π.χ. "Primary Navigation (Demo)"). Αφήστε κενό για αναζήτηση σε όλα τα μενού.
              </p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Κατηγορίες προγραμμάτων (προαιρετικά — για φιλτράρισμα)</label>
            <div className="flex flex-wrap gap-2">
              {ALL_CATEGORIES.map(cat => (
                <button key={cat} type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${formCategories.includes(cat) ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Placeholders (token → πεδίο προγράμματος)</label>
              <button type="button" onClick={addPlaceholderRow} className="text-xs text-blue-700 hover:underline flex items-center gap-1">
                <Plus size={12} />Προσθήκη γραμμής
              </button>
            </div>
            <div className="text-xs text-gray-500 mb-3">
              Τα tokens που βάζεις στο Elementor template αντικαθίστανται αυτόματα με τα πεδία του προγράμματος.
              Παραδείγματα built-in tokens:{' '}
              {BUILTIN_TOKENS.slice(0, 4).map(t => (
                <code key={t.token} className="bg-gray-100 px-1 rounded mx-0.5">{t.token}</code>
              ))}
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {formPlaceholders.map((row, idx) => {
                const builtin = BUILTIN_TOKENS.find(t => t.field === row.field)
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={row.token}
                      onChange={e => updatePlaceholderToken(idx, e.target.value)}
                      placeholder="{{TOKEN}}"
                      className="font-mono text-xs w-48 flex-shrink-0"
                    />
                    <span className="text-gray-400">→</span>
                    <select
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
                      value={row.field}
                      onChange={e => updatePlaceholderField(idx, e.target.value)}
                    >
                      <option value="">— Επιλογή πεδίου —</option>
                      {BUILTIN_TOKENS.map(t => (
                        <option key={t.field} value={t.field}>{t.description} ({t.field})</option>
                      ))}
                    </select>
                    {builtin && <span className="text-xs text-gray-400 w-32 truncate">{builtin.description}</span>}
                    <button type="button" onClick={() => removePlaceholderRow(idx)} className="text-gray-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={saveTemplate} loading={saving}>{editingId ? 'Ενημέρωση' : 'Αποθήκευση'}</Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); resetForm() }}>Άκυρο</Button>
          </div>
        </div>
      )}

      {/* Templates list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <Globe size={32} className="mx-auto mb-3 opacity-30" />
            <p>Δεν υπάρχουν templates. Δημιούργησε το πρώτο!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {templates.map(t => (
              <div key={t.id} className="p-5 flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{t.name}</span>
                    {t.htmlTemplate ? (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                        <Code2 size={10} />HTML
                      </span>
                    ) : (
                      <code className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">WP ID: {t.wpPageId}</code>
                    )}
                  </div>
                  {t.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {t.categories.map(c => (
                        <Badge key={c} variant="info" className="text-xs">{CATEGORY_LABELS[c] ?? c}</Badge>
                      ))}
                    </div>
                  )}
                  {Object.keys(t.placeholders).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.keys(t.placeholders).map(token => (
                        <code key={token} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{token}</code>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-blue-600 hover:bg-blue-50"
                    onClick={() => { openEditForm(t); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    title="Επεξεργασία"
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-gray-500 hover:bg-gray-100"
                    loading={duplicatingId === t.id}
                    onClick={() => duplicateTemplate(t)}
                    title="Δημιουργία αντιγράφου"
                  >
                    <Copy size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:bg-red-50"
                    loading={deletingId === t.id}
                    onClick={() => deleteTemplate(t.id)}
                    title="Διαγραφή"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
