'use client'
import { useState, useEffect } from 'react'
import { X, Send, ChevronDown, ChevronUp } from 'lucide-react'
type CampaignTemplate = {
  id: string
  label: string
  description: string
  subject: string
  bodyWithAccountant: string
  bodyDirect: string
}

interface QuickSendModalProps {
  businesses: { id: string; onomasia?: string | null; afm: string }[]
  onClose: () => void
  onSent?: (sent: number, failed: number) => void
}

const CHANNELS = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'VIBER', label: 'Viber' },
  { value: 'EMAIL_AND_VIBER', label: 'Email + Viber' },
] as const

type Channel = 'EMAIL' | 'VIBER' | 'EMAIL_AND_VIBER'

export function QuickSendModal({ businesses, onClose, onSent }: QuickSendModalProps) {
  const [channel, setChannel] = useState<Channel>('EMAIL')
  const [mode, setMode] = useState<'withAccountant' | 'direct'>('withAccountant')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null)
  const [validationError, setValidationError] = useState('')
  const [showTemplates, setShowTemplates] = useState(true)
  const [matchedPrograms, setMatchedPrograms] = useState<{ id: string; title: string }[]>([])
  const [programId, setProgramId] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(null)

  useEffect(() => {
    const ids = businesses.map(b => b.id).join(',')
    if (!ids) return
    fetch(`/api/quick-send/programs?businessIds=${ids}`)
      .then(r => r.json())
      .then(d => setMatchedPrograms(d.programs || []))
      .catch(() => {})
  }, [businesses])

  const isViber = channel === 'VIBER'
  const isEmail = channel === 'EMAIL'
  const isBoth = channel === 'EMAIL_AND_VIBER'
  const [emailTemplates, setEmailTemplates] = useState<CampaignTemplate[]>([])
  const [viberTemplates, setViberTemplates] = useState<CampaignTemplate[]>([])

  useEffect(() => {
    fetch('/api/templates?channel=EMAIL').then(r => r.json()).then(d => setEmailTemplates(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/templates?channel=VIBER').then(r => r.json()).then(d => setViberTemplates(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const templates = (isViber || isBoth) ? viberTemplates : emailTemplates

  // The "{{accountant_office}} & " prefix only makes sense when referencing
  // the accountant; drop it for "Απευθείας I-MENTOR".
  function subjectForMode(subject: string, m: 'withAccountant' | 'direct') {
    return m === 'direct' ? subject.replace(/^\{\{accountant_office\}\}\s*&\s*/, '') : subject
  }

  function applyTemplate(tpl: CampaignTemplate) {
    setSubject(subjectForMode(tpl.subject, mode))
    setMessage(mode === 'withAccountant' ? tpl.bodyWithAccountant : tpl.bodyDirect)
    setSelectedTemplate(tpl)
    setShowTemplates(false)
  }

  // When switching between "Με αναφορά λογιστή" / "Απευθείας I-MENTOR" after a
  // template has been picked, re-render the message body in the new mode.
  function handleModeChange(m: 'withAccountant' | 'direct') {
    setMode(m)
    if (selectedTemplate) {
      setMessage(m === 'withAccountant' ? selectedTemplate.bodyWithAccountant : selectedTemplate.bodyDirect)
      setSubject(subjectForMode(selectedTemplate.subject, m))
    }
  }

  async function handleSend() {
    if (!message.trim()) return
    if (!programId) {
      const requiresProgram = ['{{program_title}}', '{{program_description}}', '{{match_reason}}', '{{extra_criteria}}', '{{program_deadline}}'].some(v => message.includes(v))
      if (requiresProgram) {
        setValidationError('Το μήνυμα περιέχει {{program_title}}, {{match_reason}}, {{extra_criteria}} ή {{program_deadline}} αλλά δεν έχει επιλεγεί Πρόγραμμα αναφοράς. Επιλέξτε πρόγραμμα ή αφαιρέστε αυτές τις μεταβλητές από το μήνυμα.')
        return
      }
    }
    setValidationError('')
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/quick-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessIds: businesses.map(b => b.id),
          channel,
          subject,
          messageTemplate: message,
          programId: programId || undefined,
        }),
      })
      const data = await res.json()
      setResult({ sent: data.sent ?? 0, failed: data.failed ?? 0 })
      onSent?.(data.sent ?? 0, data.failed ?? 0)
      if ((data.sent ?? 0) > 0) {
        setTimeout(onClose, 2500)
      }
    } catch {
      setResult({ sent: 0, failed: businesses.length })
    } finally {
      setSending(false)
    }
  }

  const recipientLabel = businesses.length === 1
    ? (businesses[0].onomasia || businesses[0].afm)
    : `${businesses.length} επιχειρήσεις`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Γρήγορη Αποστολή</h2>
            <p className="text-xs text-slate-500 mt-0.5">Προς: {recipientLabel}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* Channel */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Κανάλι αποστολής</label>
            <div className="flex gap-2">
              {CHANNELS.map(ch => (
                <button
                  key={ch.value}
                  onClick={() => setChannel(ch.value)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    channel === ch.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2">
            {(['withAccountant', 'direct'] as const).map(m => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  mode === m ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}
              >
                {m === 'withAccountant' ? 'Με αναφορά λογιστή' : 'Απευθείας I-MENTOR'}
              </button>
            ))}
          </div>

          {/* Matched program selector */}
          {matchedPrograms.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Πρόγραμμα αναφοράς
                <span className="text-slate-400 font-normal ml-1">(συμπληρώνει το {'{{program_title}}'} και {'{{match_reason}}'})</span>
              </label>
              <select
                value={programId}
                onChange={e => { setProgramId(e.target.value); setValidationError('') }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
              >
                <option value="">— Χωρίς συγκεκριμένο πρόγραμμα —</option>
                {matchedPrograms.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Template picker — primary action */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">✨ Επιλέξτε έτοιμο πρότυπο μηνύματος</span>
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="text-xs text-indigo-500 hover:text-indigo-700"
              >
                {showTemplates ? 'Σύμπτυξη ▲' : 'Εμφάνιση ▼'}
              </button>
            </div>
            {showTemplates && (
              <div className="grid grid-cols-1 gap-2">
                {templates.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl)}
                    className="text-left p-3 rounded-xl border border-indigo-200 bg-white hover:border-indigo-400 hover:bg-indigo-50 transition-all"
                  >
                    <div className="text-xs font-semibold text-slate-800">{tpl.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{tpl.description}</div>
                  </button>
                ))}
              </div>
            )}
            {!showTemplates && message && (
              <p className="text-xs text-indigo-600 italic">Πρότυπο επιλεγμένο ✓ — επεξεργαστείτε παρακάτω αν θέλετε</p>
            )}
          </div>

          {/* Subject (email) */}
          {(isEmail || isBoth) && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Θέμα email</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="π.χ. Νέα επιδότηση για την επιχείρησή σας"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          )}

          {/* Message */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Μήνυμα
              <span className="text-slate-400 font-normal ml-2">
                Διαθέσιμες μεταβλητές: {'{{business_name}}'} {'{{afm}}'} {'{{accountant_name}}'} {'{{accountant_office}}'} {'{{kad_description}}'}
                {!isEmail && ' · *bold* για Viber'}
              </span>
            </label>
            <textarea
              value={message}
              onChange={e => { setMessage(e.target.value); setValidationError('') }}
              rows={10}
              placeholder="Γράψτε το μήνυμά σας ή επιλέξτε πρότυπο παραπάνω..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none font-mono"
            />
          </div>

          {validationError && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              {validationError}
            </div>
          )}

          {result && result.sent > 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Εστάλη σε {result.sent} επιχειρήσεις{result.failed > 0 ? ` · ${result.failed} αποτυχίες` : ''}
            </div>
          )}
          {result && result.sent === 0 && (
            <div className="text-sm text-red-700 bg-red-50 rounded-lg px-4 py-3">
              Αποτυχία αποστολής. Ελέγξτε τις ρυθμίσεις email/Viber και τα στοιχεία επικοινωνίας των επιχειρήσεων.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-4 flex gap-3 justify-between items-center border-t border-slate-100 flex-shrink-0">
          <p className="text-xs text-slate-400">
            {businesses.length} {businesses.length === 1 ? 'παραλήπτης' : 'παραλήπτες'} επιλεγμένοι
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
              Ακύρωση
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-all"
            >
              {sending ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : <Send size={15} />}
              {sending ? 'Αποστολή...' : `Αποστολή σε ${businesses.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
