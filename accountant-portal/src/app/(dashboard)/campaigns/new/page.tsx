'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { ArrowLeft, ArrowRight, Mail, Users, Send, Sparkles, MessageCircle, CheckCircle2, Search, X } from 'lucide-react'
import Link from 'next/link'

// ── Step tracker ──────────────────────────────────────────────────────────────
function Steps({ current }: { current: number }) {
  const labels = ['Τι θέλετε;', 'Για ποιους;', 'Το μήνυμα', 'Αποστολή']
  return (
    <div className="flex items-center gap-0 mb-8">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className={`flex items-center gap-2 ${i < current ? 'text-green-600' : i === current ? 'text-indigo-700' : 'text-gray-300'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0
              ${i < current ? 'bg-green-100 border-green-400' : i === current ? 'bg-indigo-100 border-indigo-500' : 'bg-gray-50 border-gray-200'}`}>
              {i < current ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${i === current ? 'text-indigo-700' : ''}`}>{label}</span>
          </div>
          {i < labels.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 ${i < current ? 'bg-green-300' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Step 0: Choose path ───────────────────────────────────────────────────────
function StepChoosePath({ onDiy, onWithIMentor }: { onDiy: () => void; onWithIMentor: () => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">Πώς θέλετε να ξεκινήσουμε;</h2>
        <p className="text-sm text-gray-500 mt-1">Διαλέξτε αυτό που σας βολεύει περισσότερο</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button onClick={onDiy}
          className="text-left p-6 rounded-2xl border-2 border-indigo-100 hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-200 transition-colors">
            <Send size={22} className="text-indigo-600" />
          </div>
          <h3 className="font-bold text-gray-900 mb-1">Θα το κάνω μόνος μου</h3>
          <p className="text-sm text-gray-500">Βήμα-βήμα, απλά και γρήγορα. Δεν χρειάζεται τεχνική γνώση.</p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm text-indigo-600 font-medium">Ξεκινήστε <ArrowRight size={14} /></span>
        </button>

        <button onClick={onWithIMentor}
          className="text-left p-6 rounded-2xl border-2 border-purple-100 hover:border-purple-400 hover:bg-purple-50 transition-all group">
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-200 transition-colors">
            <Sparkles size={22} className="text-purple-600" />
          </div>
          <h3 className="font-bold text-gray-900 mb-1">Να το κάνουμε παρέα με την I-MENTOR</h3>
          <p className="text-sm text-gray-500">Στέλνουμε εμείς για λογαριασμό σας, απλά μας πείτε σε ποιους.</p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm text-purple-600 font-medium">Ζητήστε βοήθεια <ArrowRight size={14} /></span>
        </button>
      </div>
    </div>
  )
}

// ── Step 1: Pick program ──────────────────────────────────────────────────────
function StepProgram({ programs, selected, onSelect, channel, onChannelChange, onNext, onBack }: {
  programs: any[]; selected: string; onSelect: (v: string) => void;
  channel: 'EMAIL' | 'VIBER' | 'EMAIL_AND_VIBER'; onChannelChange: (v: 'EMAIL' | 'VIBER' | 'EMAIL_AND_VIBER') => void;
  onNext: () => void; onBack: () => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Για ποιο πρόγραμμα;</h2>
        <p className="text-sm text-gray-500 mt-1">Διαλέξτε το πρόγραμμα που θέλετε να ενημερώσετε τους πελάτες σας.</p>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Πώς θέλετε να σταλεί το μήνυμα;</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'EMAIL', label: 'Email', icon: Mail },
            { value: 'VIBER', label: 'Viber', icon: MessageCircle },
            { value: 'EMAIL_AND_VIBER', label: 'Viber + Email', icon: Send },
          ].map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" onClick={() => onChannelChange(value as any)}
              className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all ${channel === value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-indigo-200'}`}>
              <Icon size={16} />
              <span className="text-xs font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button onClick={() => onSelect('')}
          className={`text-left p-4 rounded-xl border-2 transition-all ${!selected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${!selected ? 'bg-indigo-100' : 'bg-gray-100'}`}>
              <Mail size={16} className={!selected ? 'text-indigo-600' : 'text-gray-400'} />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-800">Γενική ενημέρωση</p>
              <p className="text-xs text-gray-400">Χωρίς συγκεκριμένο πρόγραμμα</p>
            </div>
          </div>
        </button>
        {programs.map(p => {
          const matchCount = p._count?.matches ?? 0
          return (
            <button key={p.id} onClick={() => onSelect(p.id)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${selected === p.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${selected === p.id ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                  <CheckCircle2 size={16} className={selected === p.id ? 'text-indigo-600' : 'text-gray-300'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-800" title={p.title}>{p.title}</p>
                  <p className="text-xs text-gray-400">{p.category}</p>
                </div>
                {matchCount > 0 && (
                  <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${selected === p.id ? 'bg-indigo-200 text-indigo-700' : 'bg-green-100 text-green-700'}`}>
                    {matchCount} match{matchCount !== 1 ? 'es' : ''}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack}><ArrowLeft size={15} className="mr-1" />Πίσω</Button>
        <Button onClick={onNext}>Συνέχεια <ArrowRight size={15} className="ml-1" /></Button>
      </div>
    </div>
  )
}

// ── Step 2: Pick template ─────────────────────────────────────────────────────
function StepTemplate({ channel, onSelect, onBack }: { channel: 'EMAIL' | 'VIBER' | 'EMAIL_AND_VIBER'; onSelect: (t: any) => void; onBack: () => void }) {
  const [templates, setTemplates] = useState<any[]>([])
  useEffect(() => {
    fetch(`/api/templates?channel=${channel === 'EMAIL' ? 'EMAIL' : 'VIBER'}`)
      .then(r => r.json())
      .then(d => setTemplates(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [channel])
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Τι είδους μήνυμα;</h2>
        <p className="text-sm text-gray-500 mt-1">Διαλέξτε ένα έτοιμο μήνυμα, θα το δείτε πριν αποσταλεί.</p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {templates.map(t => (
          <button key={t.id} onClick={() => onSelect(t)}
            className="text-left p-4 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-200">
                <Mail size={16} className="text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-800">{t.label}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{t.description}</p>
              </div>
              <ArrowRight size={16} className="ml-auto text-gray-300 group-hover:text-indigo-500 flex-shrink-0 mt-1" />
            </div>
          </button>
        ))}
      </div>
      <Button variant="outline" onClick={onBack}><ArrowLeft size={15} className="mr-1" />Πίσω</Button>
    </div>
  )
}

// ── Step 3: Preview & send ────────────────────────────────────────────────────
function StepSend({ template, messageBody, onMessageChange, programId, programs, onBack, onSend, sending, onSaveDraft, savingDraft }: {
  template: any; messageBody: string; onMessageChange: (v: string) => void; programId: string; programs: any[];
  onBack: () => void; onSend: (ids: string[]) => void; sending: boolean;
  onSaveDraft: () => void; savingDraft: boolean;
}) {
  const program = programs.find(p => p.id === programId)
  const [allRecipients, setAllRecipients] = useState<any[]>([])
  const [accountants, setAccountants] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadingRecipients, setLoadingRecipients] = useState(true)

  // Filter state
  const [search, setSearch] = useState('')
  const [selAccountants, setSelAccountants] = useState<string[]>([])
  const [noAccountantFilter, setNoAccountantFilter] = useState(false)
  const [campaignFilter, setCampaignFilter] = useState<'all' | 'sent' | 'not-sent'>('all')

  useEffect(() => {
    const url = programId
      ? `/api/campaigns/recipients?programId=${programId}`
      : '/api/campaigns/recipients'
    fetch(url)
      .then(r => r.json())
      .then(data => {
        const businesses = data.businesses ?? data // backwards compat
        setAllRecipients(businesses)
        setAccountants(data.accountants ?? [])
        setSelected(new Set(businesses.map((b: any) => b.id)))
      })
      .finally(() => setLoadingRecipients(false))
  }, [programId])

  // Client-side filtered view
  const visible = useMemo(() => {
    let list = allRecipients
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(b => (b.onomasia || '').toLowerCase().includes(q) || (b.afm || '').includes(q))
    }
    if (noAccountantFilter) {
      list = list.filter(b => !b.accountantId)
    } else if (selAccountants.length > 0) {
      list = list.filter(b => b.accountantId && selAccountants.includes(b.accountantId))
    }
    if (campaignFilter === 'sent') list = list.filter(b => b.sentCampaign)
    if (campaignFilter === 'not-sent') list = list.filter(b => !b.sentCampaign)
    return list
  }, [allRecipients, search, selAccountants, noAccountantFilter, campaignFilter])

  const visibleIds = useMemo(() => new Set(visible.map(b => b.id)), [visible])
  const allVisibleSelected = visible.length > 0 && visible.every(b => selected.has(b.id))

  function toggleVisible() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) visible.forEach(b => next.delete(b.id))
      else visible.forEach(b => next.add(b.id))
      return next
    })
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAccountant(id: string) {
    setNoAccountantFilter(false)
    setSelAccountants(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleNoAccountant() {
    setSelAccountants([])
    setNoAccountantFilter(prev => !prev)
  }

  const selectedList = allRecipients.filter(b => selected.has(b.id))
  const noContactCount = selectedList.filter(b => !b.email && !b.phone).length
  const canSend = selected.size > 0 && noContactCount < selected.size

  const activeFilterCount = (search.trim() ? 1 : 0) + selAccountants.length + (noAccountantFilter ? 1 : 0) + (campaignFilter !== 'all' ? 1 : 0)

  const preview = (messageBody || '')
    .replace(/\{\{business_name\}\}/g, 'ΠΑΡΑΔΕΙΓΜΑ ΑΕ')
    .replace(/\{\{afm\}\}/g, '123456789')
    .replace(/\{\{accountant_name\}\}/g, 'Γιώργος Παπαδόπουλος')
    .replace(/\{\{accountant_office\}\}/g, 'Λογιστικό Γραφείο Παπαδόπουλος')
    .replace(/\{\{program_title\}\}/g, program?.title || 'ΕΣΠΑ 2024')
    .replace(/\{\{kad_description\}\}/g, '47.11 - Λιανικό εμπόριο')
    .replace(/\{\{match_reason\}\}/g, '• Επιλέξιμος ΚΑΔ: 47.11\n• Επιλέξιμη περιοχή: Αττική')
    .replace(/\{\{unsubscribe_link\}\}/g, '#')

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Σε ποιους να σταλεί;</h2>
        <p className="text-sm text-gray-500 mt-1">Φιλτράρετε και επιλέξτε τους παραλήπτες που θέλετε.</p>
      </div>

      {/* ── Filter bar ── */}
      {!loadingRecipients && allRecipients.length > 0 && (
        <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Αναζήτηση επιχείρησης (όνομα ή ΑΦΜ)…"
              className="w-full text-sm pl-8 pr-8 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Campaign-received filter */}
          {programId && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Έχει λάβει καμπάνια για αυτό το πρόγραμμα;</p>
              <div className="flex gap-1.5">
                {[
                  { value: 'all', label: 'Όλοι' },
                  { value: 'not-sent', label: 'Όχι' },
                  { value: 'sent', label: 'Ναι' },
                ].map(o => (
                  <button key={o.value} onClick={() => setCampaignFilter(o.value as any)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${campaignFilter === o.value ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Accountant filter — admin only */}
          {accountants.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Λογιστής</p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                <button onClick={toggleNoAccountant}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${noAccountantFilter ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400'}`}>
                  Χωρίς λογιστή
                </button>
                {accountants.map(a => (
                  <button key={a.id} onClick={() => toggleAccountant(a.id)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${selAccountants.includes(a.id) ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'}`}>
                    {a.officeName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeFilterCount > 0 && (
            <button onClick={() => { setSearch(''); setSelAccountants([]); setNoAccountantFilter(false); setCampaignFilter('all') }}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <X size={11} />Καθαρισμός φίλτρων ({activeFilterCount})
            </button>
          )}
        </div>
      )}

      {/* ── Recipients list ── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleVisible}
              className="w-4 h-4 rounded accent-indigo-600"
            />
            <span className="text-sm font-semibold text-gray-700">
              {loadingRecipients
                ? 'Φόρτωση...'
                : activeFilterCount > 0
                  ? `${visible.filter(b => selected.has(b.id)).length} από ${visible.length} εμφανιζόμενους επιλεγμένοι (σύνολο: ${selected.size})`
                  : `${selected.size} από ${allRecipients.length} παραλήπτες επιλεγμένοι`}
            </span>
          </label>
          {program && (
            <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full font-medium truncate max-w-[160px]" title={program.title}>
              {program.title}
            </span>
          )}
        </div>

        {loadingRecipients ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            {activeFilterCount > 0 ? 'Κανένας παραλήπτης δεν ταιριάζει με τα φίλτρα.' : `Δεν βρέθηκαν επιλέξιμοι παραλήπτες.${programId ? ' Τρέξτε ξανά το matching για αυτό το πρόγραμμα.' : ''}`}
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
            {visible.map(b => (
              <label key={b.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${!selected.has(b.id) ? 'opacity-50' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.has(b.id)}
                  onChange={() => toggle(b.id)}
                  className="w-4 h-4 rounded accent-indigo-600 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate block">{b.onomasia || b.afm}</span>
                  <span className="text-xs text-gray-400">
                    {b.email || b.phone || '—'}
                    {b.postalAreaDescription ? ` · ${b.postalAreaDescription}` : ''}
                    {b.accountant?.officeName ? ` · ${b.accountant.officeName}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {b.sentCampaign && programId && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">ήδη λήφθηκε</span>
                  )}
                  {!b.email && !b.phone && (
                    <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">χωρίς email</span>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {selected.size === 0 && allRecipients.length > 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          Δεν έχετε επιλέξει κανέναν παραλήπτη. Επιλέξτε τουλάχιστον έναν για να αποστείλετε.
        </div>
      )}
      {noContactCount > 0 && selected.size > 0 && (
        <div className={`text-sm rounded-lg px-4 py-3 border ${noContactCount === selected.size ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          {noContactCount === selected.size ? (
            <>
              <strong>⛔ Αδύνατη αποστολή:</strong> Κανένας από τους {selected.size} επιλεγμένους παραλήπτες δεν έχει email ή τηλέφωνο. Μεταβείτε στις{' '}
              <a href="/businesses" className="underline font-semibold">Επιχειρήσεις</a> → Εμπλουτισμός Στοιχείων και προσθέστε email/τηλέφωνα πρώτα.
            </>
          ) : (
            <>
              <strong>⚠️ Προσοχή:</strong> {noContactCount} από τους επιλεγμένους παραλήπτες δεν έχουν email ή τηλέφωνο και θα παραληφθούν κατά την αποστολή.{' '}
              <a href="/businesses" className="underline font-semibold">Εμπλουτίστε τα στοιχεία τους</a> για πλήρη κάλυψη.
            </>
          )}
        </div>
      )}

      {/* Message: edit & preview */}
      <details className="group" open>
        <summary className="cursor-pointer text-sm text-indigo-600 font-medium select-none list-none flex items-center gap-1">
          <span className="group-open:hidden">▶ Μήνυμα & προεπισκόπηση</span>
          <span className="hidden group-open:inline">▼ Μήνυμα & προεπισκόπηση</span>
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
              Επεξεργασία μηνύματος
            </label>
            <textarea
              value={messageBody}
              onChange={e => onMessageChange(e.target.value)}
              rows={10}
              className="w-full text-sm border border-gray-200 rounded-xl p-3 font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Μπορείτε να αλλάξετε το κείμενο, αλλά μην αλλάξετε τα πεδία μέσα σε διπλά άγκιστρα (π.χ. <code className="bg-gray-100 px-1 rounded">{'{{business_name}}'}</code>), καθώς αυτά αντικαθίστανται αυτόματα ανά παραλήπτη.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wide">Προεπισκόπηση</div>
            {template?.subject && (
              <div className="text-xs text-gray-500 mb-3 pb-3 border-b border-gray-200">
                <span className="font-semibold">Θέμα: </span>
                {template.subject
                  .replace(/\{\{accountant_office\}\}/g, 'Λογιστικό Γραφείο Παπαδόπουλος')
                  .replace(/\{\{program_title\}\}/g, program?.title || 'ΕΣΠΑ 2024')}
              </div>
            )}
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{preview}</p>
          </div>
        </div>
      </details>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button variant="outline" onClick={onBack}><ArrowLeft size={15} className="mr-1" />Πίσω</Button>
        <Button variant="outline" loading={savingDraft} onClick={onSaveDraft}>
          Αποθήκευση Πρόχειρου
        </Button>
        <Button
          loading={sending}
          disabled={!canSend}
          onClick={() => onSend(Array.from(selected))}
        >
          <Send size={15} className="mr-2" />
          Αποστολή σε {selected.size - noContactCount} παραλήπτ{(selected.size - noContactCount) === 1 ? 'η' : 'ες'}
          {noContactCount > 0 && ` (${noContactCount} χωρίς στοιχεία)`}
        </Button>
      </div>
    </div>
  )
}

// ── With I-MENTOR path ────────────────────────────────────────────────────────
function StepWithIMentor({ onBack, session }: { onBack: () => void; session: any }) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState('')
  const [done, setDone] = useState(false)

  async function sendRequest() {
    setSending(true)
    const body = `Παρακαλώ βοηθήστε με να στείλω καμπάνια στους πελάτες μου.${note ? `\n\nΣημείωση: ${note}` : ''}`
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: 'Βοήθεια με αποστολή καμπάνιας', body }),
    })
    setSending(false)
    if (res.ok) {
      const conv = await res.json()
      router.push(`/chat/${conv.id}`)
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Sparkles size={28} className="text-purple-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Η I-MENTOR θα στείλει για λογαριασμό σας!</h2>
        <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
          Ανοίγουμε μια συνομιλία με την ομάδα I-MENTOR. Θα σας βοηθήσουν να στείλετε την πρώτη σας καμπάνια, εντελώς δωρεάν.
        </p>
      </div>

      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-purple-900">Θέλετε να προσθέσετε κάτι; (προαιρετικό)</p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          placeholder="π.χ. Έχω πελάτες στη Θεσσαλονίκη, θέλω να τους ενημερώσω για το ΕΣΠΑ..."
          className="w-full text-sm border border-purple-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white resize-none"
        />
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}><ArrowLeft size={15} className="mr-1" />Πίσω</Button>
        <Button loading={sending} onClick={sendRequest} className="bg-purple-600 hover:bg-purple-700">
          <MessageCircle size={15} className="mr-2" />
          Ζητήστε βοήθεια από I-MENTOR
        </Button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NewCampaignPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const [programs, setPrograms] = useState<any[]>([])
  const [step, setStep] = useState(0)
  const [path, setPath] = useState<'diy' | 'imentor' | null>(null)

  useEffect(() => {
    const p = searchParams.get('path')
    if (p === 'diy')     { setPath('diy');     setStep(1) }
    if (p === 'imentor') { setPath('imentor'); setStep(1) }
  }, [])
  const [programId, setProgramId] = useState('')
  const [channel, setChannel] = useState<'EMAIL' | 'VIBER' | 'EMAIL_AND_VIBER'>('EMAIL')
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)
  const [messageBody, setMessageBody] = useState('')
  const [sending, setSending] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)

  useEffect(() => {
    fetch('/api/programs').then(r => r.json()).then(d => setPrograms((d.programs || []).filter((p: any) => (p._count?.matches ?? 0) > 0)))
  }, [])

  async function saveCampaign(status: 'DRAFT' | 'SENT', selectedIds?: string[]) {
    if (!selectedTemplate) return
    if (status === 'DRAFT') setSavingDraft(true)
    else setSending(true)

    try {
      const body = {
        title: selectedTemplate.label,
        channel,
        subject: selectedTemplate.subject,
        programId: programId || undefined,
        messageTemplate: messageBody,
        status: 'DRAFT',
      }
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { alert('Σφάλμα αποθήκευσης'); return }

      const created = await res.json()

      if (status === 'SENT') {
        const sendRes = await fetch(`/api/campaigns/${created.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessIds: selectedIds }),
        })
        if (!sendRes.ok) {
          const err = await sendRes.json().catch(() => ({}))
          alert(err.error || 'Σφάλμα κατά την έναρξη αποστολής')
          router.push(`/campaigns/${created.id}`)
          return
        }
        router.push(`/campaigns/${created.id}?sending=1`)
        return
      }

      router.push(`/campaigns/${created.id}`)
    } finally {
      setSavingDraft(false)
      setSending(false)
    }
  }

  const diyStep = path === 'diy' ? step - 1 : 0 // step 1=program, 2=template, 3=send

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/campaigns">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Νέα Καμπάνια</h1>
      </div>

      {path === 'diy' && <Steps current={step - 1} />}

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        {step === 0 && (
          <StepChoosePath
            onDiy={() => { setPath('diy'); setStep(1) }}
            onWithIMentor={() => { setPath('imentor'); setStep(1) }}
          />
        )}

        {path === 'imentor' && step === 1 && (
          <StepWithIMentor onBack={() => { setPath(null); setStep(0) }} session={session} />
        )}

        {path === 'diy' && step === 1 && (
          <StepProgram
            programs={programs}
            selected={programId}
            onSelect={setProgramId}
            channel={channel}
            onChannelChange={setChannel}
            onNext={() => setStep(2)}
            onBack={() => { setPath(null); setStep(0) }}
          />
        )}

        {path === 'diy' && step === 2 && (
          <StepTemplate
            channel={channel}
            onSelect={t => { setSelectedTemplate(t); setMessageBody(t.bodyWithAccountant); setStep(3) }}
            onBack={() => setStep(1)}
          />
        )}

        {path === 'diy' && step === 3 && (
          <StepSend
            template={selectedTemplate}
            messageBody={messageBody}
            onMessageChange={setMessageBody}
            programId={programId}
            programs={programs}
            onBack={() => setStep(2)}
            onSend={(ids) => saveCampaign('SENT', ids)}
            sending={sending}
            onSaveDraft={() => saveCampaign('DRAFT')}
            savingDraft={savingDraft}
          />
        )}
      </div>
    </div>
  )
}
