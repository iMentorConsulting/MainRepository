import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import * as api from '../api'
import { buildWinbackTemplates, WINBACK_DAYS } from '../utils/winbackTemplates'

const EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA']
const DAY_MS = 1000 * 60 * 60 * 24

const eur = (n) => `${Number(n || 0).toLocaleString('el-GR')}€`
const round10 = (n) => Math.max(10, Math.round(n / 10) * 10)
const origFees = (c) => ({
  app: c.commercial_offer?.application_fee || c.commercial_offer?.system_app || 0,
  suc: c.commercial_offer?.success_fee || c.commercial_offer?.system_suc || 0,
})
const daysSince = (c) => {
  const ref = c.stage_changed_at || c.updated_at
  return ref ? Math.floor((Date.now() - new Date(ref)) / DAY_MS) : null
}

// ── One opportunity the consultant decides on ───────────────────────────────
function OpportunityCard({ c, onSubmit, onDismiss }) {
  const orig = origFees(c)
  const [open, setOpen] = useState(false)
  const [app, setApp] = useState(round10(orig.app * 0.7))
  const [suc, setSuc] = useState(round10(orig.suc * 0.7))
  const [tpl, setTpl] = useState(0)
  const [body, setBody] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // Templates built with the amounts the consultant chose
  const templates = useMemo(() => buildWinbackTemplates({
    ...c, commercial_offer: { ...c.commercial_offer, winback_app: Number(app) || 0, winback_suc: Number(suc) || 0, winback_offer_valid_until: undefined },
  }), [c, app, suc])

  const openForm = () => { setBody(templates[0].text); setTpl(0); setOpen(true) }
  const pickTemplate = (i) => { setTpl(i); setBody(templates[i].text) }
  // Re-render the chosen template when the amounts change, unless the text was edited by hand
  const prevTemplates = useRef(templates)
  useEffect(() => {
    const old = prevTemplates.current
    prevTemplates.current = templates
    setBody(prev => (!prev || old.some(t => t.text === prev)) ? templates[tpl].text : prev)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates])

  const days = daysSince(c)
  const totalDebt = (c.debts || []).reduce((s, d) => s + (Number(d.amount) || 0), 0)

  const submit = async () => {
    if (!(Number(app) > 0) || !(Number(suc) > 0)) { toast.error('Συμπλήρωσε τιμές Αίτησης και Success'); return }
    if (!body.trim()) { toast.error('Το μήνυμα είναι κενό'); return }
    setBusy(true)
    try { await onSubmit(c, { app: Number(app), suc: Number(suc), note, message: body }) }
    finally { setBusy(false) }
  }

  return (
    <div className="bg-white border border-violet-200 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <a href={`/cases/${c.id}`} target="_blank" rel="noopener noreferrer"
             className="font-bold text-gray-800 hover:underline hover:text-violet-700">{c.client_name} ↗</a>
          <div className="text-xs text-gray-500">
            {c.employee}{days != null && <> · {days} ημέρες σε «{c.contact_stage}»</>}
            {totalDebt > 0 && <> · οφειλές {eur(totalDebt)}</>}
          </div>
        </div>
        <div className="text-xs text-gray-500 text-right">
          Αρχική τιμή<br /><span className="font-semibold text-gray-700">{eur(orig.app)} + {eur(orig.suc)}</span>
        </div>
        {!open && (
          <div className="flex gap-2">
            <button onClick={openForm} className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg">
              ✏️ Προετοιμασία προσφοράς
            </button>
            <button onClick={() => { if (confirm(`Να μην γίνει win-back για ${c.client_name};`)) onDismiss(c) }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold px-3 py-1.5 rounded-lg">
              Δεν ενδείκνυται
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-violet-100 pt-3 space-y-3">
          <div className="flex flex-wrap gap-4">
            <label className="text-xs text-gray-500">Αίτηση (€)
              <input type="number" value={app} onChange={e => setApp(e.target.value === '' ? '' : Number(e.target.value))}
                className="block w-24 mt-1 text-center font-black text-violet-700 border border-violet-200 rounded px-1 py-1" />
            </label>
            <label className="text-xs text-gray-500">Success fee (€)
              <input type="number" value={suc} onChange={e => setSuc(e.target.value === '' ? '' : Number(e.target.value))}
                className="block w-24 mt-1 text-center font-black text-violet-700 border border-violet-200 rounded px-1 py-1" />
            </label>
            <p className="text-xs text-gray-400 self-end">Προτείνεται −30% (στρογγυλοποίηση στα 10€). Ο διαχειριστής εγκρίνει τις τελικές τιμές.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map((t, i) => (
              <button key={t.id} onClick={() => pickTemplate(i)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${tpl === i ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={12}
            className="w-full text-sm font-mono bg-gray-50 border border-gray-200 rounded-xl p-3 resize-y focus:outline-none focus:ring-2 focus:ring-violet-300" />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Σημείωση προς διαχειριστή (προαιρετικό)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setOpen(false)} className="text-xs text-gray-500 px-3 py-2 rounded-lg border border-gray-200">Άκυρο</button>
            <button onClick={submit} disabled={busy}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-black px-5 py-2 rounded-lg">
              {busy ? '⏳…' : '📤 Αποστολή στον Διαχειριστή'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, hint, count, children }) {
  if (!count) return null
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-black text-violet-800">{title}</h2>
        <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{count}</span>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export default function Winback({ currentEmployee }) {
  const isAdmin = currentEmployee === 'HARIS'
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [consultant, setConsultant] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.listCases(isAdmin ? {} : { employee: currentEmployee })
      setCases(res.data)
    } catch { toast.error('Σφάλμα φόρτωσης') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const patchOffer = (id, offer) => setCases(prev => prev.map(x => x.id === id ? { ...x, commercial_offer: offer } : x))

  const mine = cases.filter(c => !isAdmin || !consultant || c.employee === consultant)
  const ws = (c) => c.commercial_offer?.winback_status
  const opportunities = mine.filter(c => {
    const o = c.commercial_offer || {}
    if (o.winback_requested || ws(c) === 'approved' || ws(c) === 'sent' || ws(c) === 'dismissed') return false
    if (c.contact_stage !== 'Δεν Ενδιαφέρεται') return false
    const d = daysSince(c)
    return d != null && d >= WINBACK_DAYS
  }).sort((a, b) => (daysSince(b) ?? 0) - (daysSince(a) ?? 0))
  const submitted = mine.filter(c => c.commercial_offer?.winback_requested)
  const approved = mine.filter(c => ws(c) === 'approved' && !c.commercial_offer?.winback_requested)
  const sent = mine.filter(c => ws(c) === 'sent' && !c.commercial_offer?.winback_requested)

  const handleSubmit = async (c, { app, suc, note, message }) => {
    try {
      const res = await api.requestWinback(c.id, {
        employee: currentEmployee, winback_app: app, winback_suc: suc, note, message,
      })
      patchOffer(c.id, res.data.commercial_offer)
      toast.success('Στάλθηκε στον διαχειριστή')
    } catch (e) { toast.error(e?.response?.data?.detail || 'Σφάλμα αποστολής') }
  }
  const handleDismiss = async (c) => {
    try {
      const res = await api.approveWinback(c.id, false)
      patchOffer(c.id, res.data.commercial_offer)
    } catch { toast.error('Σφάλμα') }
  }
  const handleCancel = async (c) => {
    if (!confirm('Ανάκληση της πρότασης προς τον διαχειριστή;')) return
    try {
      const res = await api.cancelWinbackRequest(c.id)
      patchOffer(c.id, res.data.commercial_offer)
    } catch { toast.error('Σφάλμα') }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-violet-800 flex items-center gap-2">
            <SparklesIcon className="w-6 h-6" /> Win-back Πελατών
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Πελάτες «Δεν Ενδιαφέρεται» {WINBACK_DAYS}+ ημέρες. Επιλέξτε τιμή και μήνυμα και στείλτε την πρόταση στον διαχειριστή για αποστολή στον πελάτη.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <select value={consultant} onChange={e => setConsultant(e.target.value)} className="input w-auto text-sm">
              <option value="">Όλοι οι σύμβουλοι</option>
              {EMPLOYEES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          )}
          <button onClick={load} className="btn-secondary p-2" title="Ανανέωση">
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">Φόρτωση…</div>
      ) : (
        <>
          {opportunities.length + submitted.length + approved.length + sent.length === 0 && (
            <div className="card p-10 text-center text-gray-400">Δεν υπάρχουν ευκαιρίες win-back αυτή τη στιγμή. 🎉</div>
          )}

          <Section title="🆕 Νέες ευκαιρίες — περιμένουν την απόφασή σας" count={opportunities.length}>
            <div className="space-y-3">
              {opportunities.map(c => <OpportunityCard key={c.id} c={c} onSubmit={handleSubmit} onDismiss={handleDismiss} />)}
            </div>
          </Section>

          <Section title="📨 Στάλθηκαν στον διαχειριστή" hint="αναμονή έγκρισης & αποστολής" count={submitted.length}>
            <div className="space-y-2">
              {submitted.map(c => (
                <div key={c.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-bold text-gray-800">{c.client_name}</div>
                    <div className="text-xs text-gray-500">{c.employee} · πρόταση από {c.commercial_offer.winback_requested_by}</div>
                  </div>
                  <div className="font-black text-violet-700 text-sm">
                    {eur(c.commercial_offer.winback_app_suggested)} + {eur(c.commercial_offer.winback_suc_suggested)}
                  </div>
                  <button onClick={() => handleCancel(c)} className="text-xs text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg font-bold">
                    Ανάκληση
                  </button>
                </div>
              ))}
            </div>
          </Section>

          <Section title="✅ Εγκρίθηκαν" hint="έτοιμα για αποστολή από τον διαχειριστή" count={approved.length}>
            <div className="space-y-2">
              {approved.map(c => (
                <div key={c.id} className="bg-green-50 border border-green-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 font-bold text-gray-800">{c.client_name} <span className="text-xs font-normal text-gray-500">· {c.employee}</span></div>
                  <div className="font-black text-green-700 text-sm">{eur(c.commercial_offer.winback_app)} + {eur(c.commercial_offer.winback_suc)}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="💎 Εστάλησαν στον πελάτη" count={sent.length}>
            <div className="space-y-1.5">
              {sent.map(c => (
                <div key={c.id} className="bg-white border border-violet-100 rounded-lg px-3 py-2 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-semibold text-gray-800 flex-1">{c.client_name} <span className="text-xs font-normal text-gray-500">· {c.employee}</span></span>
                  <span className="font-black text-violet-700">{eur(c.commercial_offer.winback_app)} + {eur(c.commercial_offer.winback_suc)}</span>
                  {c.commercial_offer.winback_offer_valid_until && (
                    <span className="text-xs text-gray-400">έως {format(new Date(c.commercial_offer.winback_offer_valid_until), 'dd/MM/yyyy')}</span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
