'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ArrowLeft, Send, Users, Mail, MessageCircle, FlaskConical, FileText, Tag } from 'lucide-react'
import { Suspense } from 'react'

interface GemiTemplate {
  id: string
  label: string
  subject: string
  previewText: string | null
  htmlContent: string
}

const GEMI_DISCLAIMER = `Τα στοιχεία επικοινωνίας σας αντλήθηκαν από το Γενικό Εμπορικό Μητρώο (ΓΕΜΗ) μέσω του επίσημου Open Data API του Ελληνικού Δημοσίου, υπό την άδεια ανοιχτών δεδομένων ODC-BY-1.0, η οποία επιτρέπει ρητά την εμπορική χρήση. Πρόκειται για δημόσια διαθέσιμα εταιρικά στοιχεία (gemi.gov.gr).`

type Channel = 'EMAIL' | 'VIBER' | 'EMAIL_AND_VIBER'

function ViberTestSend({ message, showToast }: { message: string; showToast: (msg: string, ok: boolean) => void }) {
  const [testPhone, setTestPhone] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState('')

  async function send() {
    if (!testPhone.trim()) { showToast('Εισάγετε αριθμό τηλεφώνου.', false); return }
    if (!message.trim()) { showToast('Απαιτείται κείμενο Viber.', false); return }
    setSending(true); setResult('')
    const res = await fetch('/api/gemi/campaigns/viber-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testPhone: testPhone.trim(), message }),
    })
    if (res.ok) {
      setResult(`✓ Εστάλη στο ${testPhone}`)
      showToast(`Δοκιμαστικό Viber εστάλη στο ${testPhone}`, true)
    } else {
      const err = await res.json().catch(() => ({}))
      setResult(`✗ ${err.error || 'Σφάλμα'}`)
      showToast(err.error || 'Σφάλμα αποστολής Viber.', false)
    }
    setSending(false)
  }

  return (
    <div className="border-t border-gray-100 pt-4 space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
        <FlaskConical size={12} />Δοκιμαστική Αποστολή Viber
      </p>
      <div className="flex gap-2">
        <input
          type="tel"
          placeholder="+30 69XXXXXXXX"
          value={testPhone}
          onChange={e => setTestPhone(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <Button variant="outline" size="sm" loading={sending} onClick={send}>
          <FlaskConical size={14} className="mr-1" />Αποστολή Viber
        </Button>
      </div>
      {result && <p className="text-xs text-gray-500">{result}</p>}
    </div>
  )
}

export default function NewGemiCampaignPage() {
  return (
    <Suspense fallback={null}>
      <NewGemiCampaignPageInner />
    </Suspense>
  )
}

function NewGemiCampaignPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [title, setTitle] = useState('')
  const [channel, setChannel] = useState<Channel>('EMAIL')
  const [programId, setProgramId] = useState(searchParams.get('programId') || '')
  const [programId2, setProgramId2] = useState('')
  const [requireBothPrograms, setRequireBothPrograms] = useState(false)
  const [programs, setPrograms] = useState<any[]>([])
  const [templates, setTemplates] = useState<GemiTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [viberMessage, setViberMessage] = useState('')

  // Filters
  const [region, setRegion] = useState('')
  const [category, setCategory] = useState('')
  const [importBatch, setImportBatch] = useState('')
  const [hasReceivedCampaign, setHasReceivedCampaign] = useState<'' | 'true' | 'false'>('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [filterOptions, setFilterOptions] = useState<{ regions: string[]; categories: string[]; importBatches: string[]; tags: string[] }>({ regions: [], categories: [], importBatches: [], tags: [] })

  // Recipients
  const [recipientCount, setRecipientCount] = useState<{ emailCount: number; viberCount: number; total: number } | null>(null)
  const [countLoading, setCountLoading] = useState(false)

  // Specific recipients (targeted test on real businesses) — overrides filters
  const [testRecipients, setTestRecipients] = useState<{ id: string; onomasia: string | null; afm: string; email: string | null }[]>([])
  const [recipientSearch, setRecipientSearch] = useState('')
  const [recipientResults, setRecipientResults] = useState<{ id: string; onomasia: string | null; afm: string; email: string | null }[]>([])
  const [recipientSearching, setRecipientSearching] = useState(false)

  // Test send
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState('')

  const [savingDraft, setSavingDraft] = useState(false)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/programs')
      .then(r => r.json())
      .then(d => setPrograms(Array.isArray(d) ? d : (d.programs || [])))
      .catch(() => {})
    fetch('/api/gemi/campaigns/filter-options')
      .then(r => r.json())
      .then(d => setFilterOptions(d))
      .catch(() => {})
    fetch('/api/gemi/templates')
      .then(r => r.json())
      .then(d => setTemplates(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  const fetchCount = useCallback(async () => {
    setCountLoading(true)
    const params = new URLSearchParams({ channel })
    if (programId) params.set('programId', programId)
    if (requireBothPrograms && programId && programId2) params.set('requireProgramId2', programId2)
    if (region) params.set('region', region)
    if (category) params.set('category', category)
    if (importBatch) params.set('importBatch', importBatch)
    if (hasReceivedCampaign) params.set('hasReceivedCampaign', hasReceivedCampaign)
    selectedTags.forEach(t => params.append('tags', t))
    const res = await fetch(`/api/gemi/campaigns/recipient-count?${params}`)
    if (res.ok) setRecipientCount(await res.json())
    setCountLoading(false)
  }, [channel, programId, programId2, requireBothPrograms, region, category, importBatch, hasReceivedCampaign, selectedTags])

  useEffect(() => { fetchCount() }, [fetchCount])

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  async function searchRecipients(q: string) {
    setRecipientSearch(q)
    if (q.trim().length < 2) { setRecipientResults([]); return }
    setRecipientSearching(true)
    try {
      const res = await fetch(`/api/gemi/businesses?search=${encodeURIComponent(q.trim())}&limit=8`)
      const data = await res.json()
      setRecipientResults((data.businesses || []).map((b: any) => ({ id: b.id, onomasia: b.onomasia, afm: b.afm, email: b.email })))
    } catch {
      setRecipientResults([])
    } finally {
      setRecipientSearching(false)
    }
  }

  // When specific recipients are selected they fully override the filters
  const effectiveTotal = testRecipients.length > 0 ? testRecipients.length : (recipientCount?.total ?? 0)

  function validate() {
    if (!title.trim()) { showToast('Ο τίτλος είναι υποχρεωτικός.', false); return false }
    if ((channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER') && !htmlContent.trim()) {
      showToast('Απαιτείται HTML περιεχόμενο email.', false); return false
    }
    if ((channel === 'VIBER' || channel === 'EMAIL_AND_VIBER') && !viberMessage.trim()) {
      showToast('Απαιτείται κείμενο Viber.', false); return false
    }
    return true
  }

  async function createCampaign(sendNow = false) {
    const res = await fetch('/api/gemi/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        channel,
        programId: programId || undefined,
        programId2: programId2 || undefined,
        requireBothPrograms: requireBothPrograms && !!programId && !!programId2 ? true : undefined,
        subject: subject.trim() || undefined,
        previewText: previewText.trim() || undefined,
        htmlContent: htmlContent.trim() || undefined,
        messageTemplate: viberMessage.trim() || undefined,
        status: 'DRAFT',
        ...(testRecipients.length > 0
          ? { targetGemiIds: testRecipients.map(r => r.id) }
          : {
              region: region || undefined,
              category: category || undefined,
              importBatch: importBatch || undefined,
              hasReceivedCampaign: hasReceivedCampaign || undefined,
              tags: selectedTags.length > 0 ? selectedTags : undefined,
            }),
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || 'Σφάλμα δημιουργίας καμπάνιας')
    }
    const campaign = await res.json()
    if (sendNow) {
      const sendRes = await fetch(`/api/gemi/campaigns/${campaign.id}/send`, { method: 'POST' })
      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({}))
        throw new Error(err?.error || 'Σφάλμα αποστολής')
      }
    }
    return campaign
  }

  async function handleSaveDraft() {
    if (!validate()) return
    setSavingDraft(true)
    try {
      const c = await createCampaign(false)
      showToast('Αποθηκεύτηκε ως πρόχειρο.', true)
      router.push(`/gemi/campaigns`)
    } catch (e: any) {
      showToast(e.message, false)
    } finally {
      setSavingDraft(false)
    }
  }

  async function handleSend() {
    if (!validate()) return
    if (!window.confirm(`Αποστολή σε ${effectiveTotal} παραλήπτες; Δεν υπάρχει αναίρεση.`)) return
    setSending(true)
    try {
      await createCampaign(true)
      showToast('Η καμπάνια απεστάλη!', true)
      router.push('/gemi/campaigns')
    } catch (e: any) {
      showToast(e.message, false)
    } finally {
      setSending(false)
    }
  }

  async function handleTestSend() {
    if (!testEmail.trim()) { showToast('Εισάγετε email δοκιμής.', false); return }
    if (!htmlContent.trim()) { showToast('Απαιτείται HTML περιεχόμενο για δοκιμαστική αποστολή.', false); return }
    setTestSending(true)
    setTestResult('')
    const res = await fetch('/api/gemi/campaigns/test-send/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testEmail: testEmail.trim(), subject: subject || title || 'ΓΕΜΗ Test', htmlContent }),
    })
    // For test send we don't need a saved campaign, use a dedicated endpoint
    const res2 = await fetch('/api/gemi/campaigns/_/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testEmail: testEmail.trim(), subject: subject || title || 'ΓΕΜΗ Test', htmlContent }),
    })
    if (res2.ok) {
      setTestResult(`✓ Δοκιμαστικό email εστάλη στο ${testEmail}`)
    } else {
      const err = await res2.json().catch(() => ({}))
      setTestResult(`✗ ${err.error || 'Σφάλμα αποστολής'}`)
    }
    setTestSending(false)
  }

  const showEmail = channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER'
  const showViber = channel === 'VIBER' || channel === 'EMAIL_AND_VIBER'

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Link href="/gemi/campaigns">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Νέα Καμπάνια ΓΕΜΗ</h1>
      </div>

      {/* Basic fields */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Βασικά Στοιχεία</h2>
        <Input
          label="Τίτλος *"
          placeholder="π.χ. Ενημέρωση ΓΕΜΗ Ιουλίου 2026"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <Select
          label="Κανάλι"
          value={channel}
          onChange={e => setChannel(e.target.value as Channel)}
          options={[
            { value: 'EMAIL', label: 'Email (Moosend)' },
            { value: 'VIBER', label: 'Viber (Chatwoot)' },
            { value: 'EMAIL_AND_VIBER', label: 'Email + Viber' },
          ]}
        />
      </div>

      {/* Recipients */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Παραλήπτες</h2>

        {/* Targeted test on specific real businesses — overrides the filters below */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
            🎯 Δοκιμή σε συγκεκριμένες επιχειρήσεις (προαιρετικό)
          </p>
          <p className="text-xs text-gray-500">
            Επιλέξτε 1-2 πραγματικές επιχειρήσεις για πλήρη δοκιμή (πραγματικά δεδομένα, Ερμής & Θέμιδα).
            Το <strong>Πρόγραμμα</strong> που επιλέγετε παρακάτω <strong>εφαρμόζεται κανονικά</strong> — οι μεταβλητές
            και η συζήτηση με τον Ερμή αφορούν αυτό το πρόγραμμα. Μόνο τα φίλτρα (Περιφέρεια, Κλάδος, Παρτίδα) αγνοούνται.
          </p>
          {testRecipients.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {testRecipients.map(r => (
                <span key={r.id} className="inline-flex items-center gap-1.5 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-full pl-3 pr-1.5 py-1 text-xs font-medium">
                  {r.onomasia || r.afm}
                  <span className="text-emerald-600 font-normal">{r.email || 'χωρίς email'}</span>
                  <button
                    onClick={() => setTestRecipients(prev => prev.filter(x => x.id !== r.id))}
                    className="w-4 h-4 rounded-full bg-emerald-200 hover:bg-emerald-300 flex items-center justify-center text-emerald-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <input
              type="text"
              value={recipientSearch}
              onChange={e => searchRecipients(e.target.value)}
              placeholder="Αναζήτηση με ΑΦΜ, επωνυμία ή email..."
              className="w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
            {recipientSearch.trim().length >= 2 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {recipientSearching ? (
                  <p className="px-3 py-2 text-xs text-gray-400">Αναζήτηση...</p>
                ) : recipientResults.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">Δεν βρέθηκαν επιχειρήσεις</p>
                ) : (
                  recipientResults.map(b => (
                    <button
                      key={b.id}
                      disabled={!b.email || testRecipients.some(x => x.id === b.id)}
                      onClick={() => {
                        setTestRecipients(prev => [...prev, b])
                        setRecipientSearch('')
                        setRecipientResults([])
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed border-b border-gray-50 last:border-0"
                    >
                      <span className="font-medium">{b.onomasia || b.afm}</span>
                      <span className="text-xs text-gray-500 ml-2">ΑΦΜ {b.afm} · {b.email || 'χωρίς email'}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <Select
          label="Πρόγραμμα (φιλτράρει στις ταυτισμένες επιχειρήσεις)"
          value={programId}
          onChange={e => setProgramId(e.target.value)}
        >
          <option value="">— Όλη η λίστα ΓΕΜΗ (χωρίς φίλτρο) —</option>
          {programs.map((p: any) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </Select>

        <Select
          label="Πρόγραμμα Β (προαιρετικό — για διπλές προσφορές, μεταβλητές {{program2_*}})"
          value={programId2}
          onChange={e => setProgramId2(e.target.value)}
        >
          <option value="">— Αυτόματο: το καλύτερο άλλο ταίριασμα κάθε παραλήπτη —</option>
          {programs.filter((p: any) => p.id !== programId).map((p: any) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </Select>

        {programId && programId2 && (
          <label className="flex items-center gap-2 text-sm text-gray-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={requireBothPrograms}
              onChange={e => setRequireBothPrograms(e.target.checked)}
              className="w-4 h-4 accent-indigo-600"
            />
            <span>
              <strong>Μόνο επιχειρήσεις που ταιριάζουν ΚΑΙ στα δύο προγράμματα</strong>
              <span className="block text-xs text-gray-500">Όσες δεν έχουν ταίριασμα και με τα δύο εξαιρούνται από τους παραλήπτες.</span>
            </span>
          </label>
        )}

        {/* Additional filters */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Φίλτρα</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Περιφέρεια"
              value={region}
              onChange={e => setRegion(e.target.value)}
            >
              <option value="">— Όλες —</option>
              {filterOptions.regions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
            <Select
              label="Κλάδος"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              <option value="">— Όλοι —</option>
              {filterOptions.categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
            <Select
              label="Παρτίδα ΓΕΜΗ"
              value={importBatch}
              onChange={e => setImportBatch(e.target.value)}
            >
              <option value="">— Όλες —</option>
              {filterOptions.importBatches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </Select>
            <Select
              label="Έχουν λάβει καμπάνια"
              value={hasReceivedCampaign}
              onChange={e => setHasReceivedCampaign(e.target.value as '' | 'true' | 'false')}
              options={[
                { value: '', label: '— Όλοι —' },
                { value: 'true', label: 'Ναι' },
                { value: 'false', label: 'Όχι' },
              ]}
            />
          </div>

          {/* Tag filter */}
          {filterOptions.tags.length > 0 && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5 flex items-center gap-1.5">
                <Tag size={13} className="text-violet-500" />
                Ετικέτες (φίλτρο)
              </label>
              <div className="flex flex-wrap gap-2">
                {filterOptions.tags.map(tag => {
                  const active = selectedTags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setSelectedTags(prev =>
                        active ? prev.filter(t => t !== tag) : [...prev, tag]
                      )}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        active
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-violet-700 border-violet-300 hover:bg-violet-50'
                      }`}
                    >
                      {tag}
                      {active && <span className="text-violet-200 text-xs leading-none">×</span>}
                    </button>
                  )
                })}
              </div>
              {selectedTags.length > 0 && (
                <p className="text-xs text-violet-600 mt-1.5">
                  Φίλτρο: επιχειρήσεις με <strong>έστω μία</strong> από τις επιλεγμένες ετικέτες.
                  <button onClick={() => setSelectedTags([])} className="ml-2 underline text-gray-400 hover:text-gray-600">Καθαρισμός</button>
                </p>
              )}
            </div>
          )}
        </div>

        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${effectiveTotal > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
          <Users size={16} className="text-blue-600 shrink-0" />
          {testRecipients.length > 0 ? (
            <span className="text-sm font-semibold text-emerald-700">
              🎯 {testRecipients.length} επιλεγμένες επιχειρήσεις (τα φίλτρα αγνοούνται)
            </span>
          ) : countLoading ? (
            <span className="text-sm text-gray-400">Υπολογισμός…</span>
          ) : recipientCount ? (
            <div className="text-sm">
              <span className="font-semibold text-blue-800">{recipientCount.total.toLocaleString('el-GR')} παραλήπτες</span>
              {recipientCount.emailCount > 0 && (
                <span className="ml-2 text-gray-500"><Mail size={12} className="inline mr-0.5" />{recipientCount.emailCount.toLocaleString('el-GR')} email</span>
              )}
              {recipientCount.viberCount > 0 && (
                <span className="ml-2 text-gray-500"><MessageCircle size={12} className="inline mr-0.5" />{recipientCount.viberCount.toLocaleString('el-GR')} Viber</span>
              )}
            </div>
          ) : null}
        </div>
        {programId && recipientCount && recipientCount.total === 0 && (
          <p className="text-xs text-amber-600">⚠️ Δεν βρέθηκαν επιχειρήσεις ταυτισμένες με αυτό το πρόγραμμα που να έχουν email/τηλέφωνο.</p>
        )}
      </div>

      {/* Email content */}
      {showEmail && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Περιεχόμενο Email</h2>

          {/* Template selector */}
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1 flex items-center gap-1">
              <FileText size={14} />Πρότυπο Email
            </label>
            <select
              value={selectedTemplateId}
              onChange={e => {
                const id = e.target.value
                setSelectedTemplateId(id)
                if (id) {
                  const tpl = templates.find(t => t.id === id)
                  if (tpl) {
                    setSubject(tpl.subject)
                    setPreviewText(tpl.previewText ?? '')
                    setHtmlContent(tpl.htmlContent)
                  }
                }
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
            >
              <option value="">— Επιλέξτε πρότυπο —</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">Δεν υπάρχουν πρότυπα. <a href="/gemi/templates" className="underline text-indigo-500">Δημιουργήστε ένα εδώ.</a></p>
            )}
          </div>

          <Input
            label="Θέμα (Subject) *"
            placeholder="π.χ. Ευκαιρία χρηματοδότησης για την επιχείρησή σας"
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Preview Text <span className="text-gray-400 font-normal">(εμφανίζεται μετά το θέμα στα εισερχόμενα)</span>
            </label>
            <input
              type="text"
              value={previewText}
              onChange={e => setPreviewText(e.target.value)}
              placeholder="π.χ. Μάθετε αν η επιχείρησή σας είναι επιλέξιμη για επιδότηση έως 50%..."
              maxLength={200}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            <div className="flex justify-between mt-1">
              <p className="text-xs text-slate-400">Συμπληρώνεται αυτόματα από το πρότυπο. Υποστηρίζει μεταβλητές {'{{business_name}}'} κ.λπ.</p>
              <span className="text-xs text-gray-400">{previewText.length}/200</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">HTML Περιεχόμενο *</label>
            <textarea
              value={htmlContent}
              onChange={e => setHtmlContent(e.target.value)}
              rows={12}
              placeholder={`<p>Αγαπητέ/ή,</p>\n<p>Σας ενημερώνουμε ότι...</p>`}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-y"
            />
            <p className="text-xs text-slate-400 mt-1">Η αποποίηση ΓΕΜΗ προστίθεται αυτόματα στο τέλος κάθε email.</p>
          </div>

          {/* Test send */}
          <div className="border-t border-gray-100 pt-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1"><FlaskConical size={12} />Δοκιμαστική Αποστολή</p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="test@example.com"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <Button
                variant="outline"
                size="sm"
                loading={testSending}
                onClick={async () => {
                  if (!testEmail.trim() || !htmlContent.trim()) {
                    showToast('Απαιτούνται email δοκιμής και HTML περιεχόμενο.', false); return
                  }
                  setTestSending(true); setTestResult('')
                  // Create a temp campaign and send test
                  const tempRes = await fetch('/api/gemi/campaigns', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      title: `[TEST] ${title || 'Draft'}`,
                      channel: 'EMAIL',
                      subject: subject || title || 'ΓΕΜΗ Test',
                      htmlContent,
                      status: 'DRAFT',
                    }),
                  })
                  if (!tempRes.ok) { showToast('Σφάλμα δημιουργίας δοκιμαστικής καμπάνιας.', false); setTestSending(false); return }
                  const temp = await tempRes.json()
                  const testRes = await fetch(`/api/gemi/campaigns/${temp.id}/test-send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ testEmail: testEmail.trim(), subject: subject || title || 'ΓΕΜΗ Test', htmlContent }),
                  })
                  if (testRes.ok) {
                    setTestResult(`✓ Εστάλη στο ${testEmail}`)
                    showToast(`Δοκιμαστικό email εστάλη στο ${testEmail}`, true)
                  } else {
                    const err = await testRes.json().catch(() => ({}))
                    setTestResult(`✗ ${err.error || 'Σφάλμα'}`)
                    showToast(err.error || 'Σφάλμα αποστολής δοκιμής.', false)
                  }
                  setTestSending(false)
                }}
              >
                <FlaskConical size={14} className="mr-1" />
                Αποστολή Δοκιμής
              </Button>
            </div>
            {testResult && <p className="text-xs text-gray-500">{testResult}</p>}
          </div>
        </div>
      )}

      {/* Viber content */}
      {showViber && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Κείμενο Viber</h2>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Μήνυμα * (έως 900 χαρακτήρες)</label>
            <textarea
              value={viberMessage}
              onChange={e => setViberMessage(e.target.value)}
              rows={5}
              maxLength={900}
              placeholder="Αγαπητέ/ή, σας ενημερώνουμε..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-y"
            />
            <div className="flex justify-between">
              <p className="text-xs text-slate-400 mt-1">Η αποποίηση ΓΕΜΗ προστίθεται αυτόματα.</p>
              <span className="text-xs text-gray-400 mt-1">{viberMessage.length}/900</span>
            </div>
          </div>

          {/* Viber test send */}
          <ViberTestSend message={viberMessage} showToast={showToast} />
        </div>
      )}

      {/* Legal disclaimer preview */}
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Αποποίηση ΓΕΜΗ — προστίθεται αυτόματα</p>
        <p className="text-xs text-amber-600 leading-relaxed">{GEMI_DISCLAIMER}</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pb-8">
        <Button variant="outline" loading={savingDraft} disabled={sending} onClick={handleSaveDraft}>
          Αποθήκευση Πρόχειρου
        </Button>
        <Button loading={sending} disabled={savingDraft || effectiveTotal === 0} onClick={handleSend} className="bg-indigo-600 hover:bg-indigo-700">
          <Send size={15} className="mr-2" />
          Αποστολή σε {effectiveTotal.toLocaleString('el-GR')} παραλήπτες
        </Button>
      </div>
    </div>
  )
}
