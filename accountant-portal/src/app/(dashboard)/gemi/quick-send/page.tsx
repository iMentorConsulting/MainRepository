'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Send, Search, X, CheckSquare, Square } from 'lucide-react'

type Channel = 'EMAIL' | 'VIBER' | 'EMAIL_AND_VIBER'

interface GemiBusiness {
  id: string
  onomasia: string | null
  afm: string
  email: string | null
  phone: string | null
  postalAreaDescription: string | null
  category: string | null
}

interface Program {
  id: string
  title: string
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function QuickSendPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = (session?.user as any)?.role === 'ADMIN'

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GemiBusiness[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [channel, setChannel] = useState<Channel>('EMAIL')
  const [programId, setProgramId] = useState('')
  const [programs, setPrograms] = useState<Program[]>([])

  const [subject, setSubject] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [messageTemplate, setMessageTemplate] = useState('')

  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    if (status === 'loading') return
    if (!isAdmin) { router.push('/'); return }
    fetch('/api/programs')
      .then(r => r.json())
      .then(d => setPrograms(Array.isArray(d) ? d : d.programs ?? []))
      .catch(() => {})
  }, [isAdmin, router, status])

  useEffect(() => {
    if (!debouncedQuery.trim()) { setResults([]); return }
    setSearching(true)
    fetch(`/api/gemi/businesses?search=${encodeURIComponent(debouncedQuery.trim())}&limit=20`)
      .then(r => r.json())
      .then(d => setResults(d.businesses ?? []))
      .catch(() => setResults([]))
      .finally(() => setSearching(false))
  }, [debouncedQuery])

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  function removeSelected(id: string) {
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  async function handleSend() {
    if (selected.size === 0) { setToast({ msg: 'Επιλέξτε τουλάχιστον μία επιχείρηση.', ok: false }); return }
    if (channel !== 'VIBER' && !htmlContent.trim()) { setToast({ msg: 'Απαιτείται περιεχόμενο email.', ok: false }); return }
    if (channel !== 'EMAIL' && !messageTemplate.trim()) { setToast({ msg: 'Απαιτείται μήνυμα Viber.', ok: false }); return }

    setSending(true)
    setToast(null)

    const title = `Γρήγορη Αποστολή ${new Date().toLocaleDateString('el-GR')} — ${channel}`
    const res = await fetch('/api/gemi/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        channel,
        subject: subject || null,
        htmlContent: htmlContent || null,
        messageTemplate: messageTemplate || null,
        programId: programId || null,
        targetGemiIds: Array.from(selected),
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setToast({ msg: `Σφάλμα δημιουργίας: ${err.error || 'Άγνωστο σφάλμα'}`, ok: false })
      setSending(false)
      return
    }

    const campaign = await res.json()

    // Send immediately
    const sendRes = await fetch(`/api/gemi/campaigns/${campaign.id}/send`, { method: 'POST' })
    if (sendRes.ok) {
      setToast({ msg: `✓ Εστάλη σε ${selected.size} επιχειρήσεις! Καμπάνια: ${campaign.id}`, ok: true })
      setSelected(new Set())
    } else {
      const err = await sendRes.json().catch(() => ({}))
      setToast({ msg: `Η καμπάνια δημιουργήθηκε (${campaign.id}) αλλά η αποστολή απέτυχε: ${err.error || 'Σφάλμα'}`, ok: false })
    }
    setSending(false)
  }

  // Get display info for selected IDs from results
  const selectedBusinesses = results.filter(b => selected.has(b.id))
  const selectedOnlyIds = Array.from(selected).filter(id => !results.find(b => b.id === id))

  if (status === 'loading') return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Γρήγορη Αποστολή</h1>
          <p className="text-sm text-gray-500 mt-0.5">Επιλέξτε επιχειρήσεις ΓΕΜΗ και στείλτε άμεσα email ή Viber.</p>
        </div>
      </div>

      {toast && (
        <div className={`px-4 py-3 rounded-lg text-sm flex items-start justify-between gap-3 ${toast.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}

      {/* Search section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
          <Search size={14} />Αναζήτηση &amp; Επιλογή Επιχειρήσεων
        </h2>
        <div className="relative">
          <Input
            placeholder="Αναζήτηση με επωνυμία ή ΑΦΜ..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Αναζήτηση...</span>}
        </div>

        {results.length > 0 && (
          <ul className="border border-gray-200 rounded-lg divide-y max-h-72 overflow-y-auto">
            {results.map(b => {
              const isSelected = selected.has(b.id)
              return (
                <li
                  key={b.id}
                  onClick={() => toggleSelect(b.id)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors text-sm ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                >
                  <span className="text-indigo-600 flex-shrink-0">
                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} className="text-gray-400" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-gray-900 truncate block">{b.onomasia || b.afm}</span>
                    <span className="text-xs text-gray-400">ΑΦΜ: {b.afm}{b.postalAreaDescription ? ` · ${b.postalAreaDescription}` : ''}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {b.email && <Badge variant="secondary" className="text-xs">Email</Badge>}
                    {b.phone && <Badge variant="secondary" className="text-xs">Viber</Badge>}
                    {b.category && <Badge variant="info" className="text-xs">{b.category}</Badge>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {selected.size > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Επιλεγμένες ({selected.size}):</p>
            <div className="flex flex-wrap gap-2">
              {selectedBusinesses.map(b => (
                <span key={b.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  {b.onomasia || b.afm}
                  <button onClick={() => removeSelected(b.id)} className="hover:text-red-600"><X size={11} /></button>
                </span>
              ))}
              {selectedOnlyIds.length > 0 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  +{selectedOnlyIds.length} ακόμα
                </span>
              )}
            </div>
            <button onClick={() => setSelected(new Set())} className="text-xs text-red-500 hover:underline">Εκκαθάριση επιλογής</button>
          </div>
        )}
      </div>

      {/* Campaign settings */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
          <Send size={14} />Ρυθμίσεις Αποστολής
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Κανάλι</label>
            <Select value={channel} onChange={e => setChannel(e.target.value as Channel)}>
              <option value="EMAIL">Email</option>
              <option value="VIBER">Viber</option>
              <option value="EMAIL_AND_VIBER">Email &amp; Viber</option>
            </Select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Πρόγραμμα (προαιρετικό)</label>
            <Select value={programId} onChange={e => setProgramId(e.target.value)}>
              <option value="">— Χωρίς πρόγραμμα —</option>
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </Select>
          </div>
        </div>

        {(channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER') && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Θέμα Email</label>
              <Input placeholder="Θέμα μηνύματος..." value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Περιεχόμενο Email (HTML)</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                rows={8}
                placeholder="<p>Καλημέρα {{onomasia}},</p><p>...</p>"
                value={htmlContent}
                onChange={e => setHtmlContent(e.target.value)}
              />
            </div>
          </div>
        )}

        {(channel === 'VIBER' || channel === 'EMAIL_AND_VIBER') && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Μήνυμα Viber</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              rows={4}
              placeholder="Κείμενο μηνύματος Viber..."
              value={messageTemplate}
              onChange={e => setMessageTemplate(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Button onClick={handleSend} loading={sending} disabled={selected.size === 0}>
          <Send size={15} className="mr-2" />
          Αποστολή σε {selected.size} επιχειρήσεις
        </Button>
        {selected.size === 0 && <p className="text-xs text-gray-400">Επιλέξτε επιχειρήσεις για να ενεργοποιηθεί η αποστολή.</p>}
      </div>
    </div>
  )
}
