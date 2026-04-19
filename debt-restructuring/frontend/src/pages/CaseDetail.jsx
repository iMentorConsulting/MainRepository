import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { format, formatDistanceToNow } from 'date-fns'
import { el } from 'date-fns/locale'
import {
  ArrowLeftIcon, PencilIcon, LinkIcon, CheckCircleIcon,
  PhoneIcon, EyeIcon, EyeSlashIcon, ChevronDownIcon,
} from '@heroicons/react/24/outline'
import * as api from '../api'
import { fmt, creditorDisplayName } from '../utils/calculations'

const STATUS_LABELS = {
  draft: { label: 'Πρόχειρο', cls: 'bg-gray-100 text-gray-700' },
  submitted: { label: 'Υποβλήθηκε', cls: 'bg-blue-100 text-blue-700' },
  in_review: { label: 'Υπό Εξέταση', cls: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Ολοκληρώθηκε', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Ακυρώθηκε', cls: 'bg-red-100 text-red-700' },
}

const CONTACT_STAGES = [
  { key: 'Νέα Ανάλυση', icon: '📋', cls: 'bg-gray-100 text-gray-700' },
  { key: 'Εστάλη Σύνδεσμος', icon: '🔗', cls: 'bg-blue-100 text-blue-700' },
  { key: 'Θετική Ανταπόκριση', icon: '✅', cls: 'bg-green-100 text-green-700' },
  { key: 'Σε Διαπραγμάτευση', icon: '💬', cls: 'bg-yellow-100 text-yellow-700' },
  { key: 'Έκλεισε', icon: '🏆', cls: 'bg-emerald-100 text-emerald-800' },
  { key: 'Δεν Ενδιαφέρεται', icon: '❌', cls: 'bg-red-100 text-red-700' },
]

function buildViberMessage(type, name, url) {
  switch (type) {
    case 'initial':
      return `✅ *Η ανάλυσή σας είναι έτοιμη!*\n\nΑγαπητέ/ή *${name}*,\n\n📊 Η άντληση στοιχείων από τον *Εξωδικαστικό Μηχανισμό* ολοκληρώθηκε και έχουμε ετοιμάσει την πλήρη ανάλυση ρύθμισης των οφειλών σας.\n\n🔗 *Δείτε την ανάλυσή σας εδώ:*\n${url}\n\n🔑 Χρησιμοποιήστε το *ΑΦΜ σας* ως κωδικό πρόσβασης.\n\nΕίμαστε στη διάθεσή σας για οποιαδήποτε ερώτηση! 🤝\n*i-Mentor Consulting*`
    case 'reminder1':
      return `🔔 *1η Υπενθύμιση — Ανάλυση Οφειλών*\n\nΑγαπητέ/ή *${name}*,\n\nΗ ανάλυση ρύθμισης των οφειλών σας *σας περιμένει* ακόμα! 😊\n\n👉 *Δείτε την εδώ:*\n${url}\n\n🔑 Είσοδος με το *ΑΦΜ σας*.\n\nΕίμαστε εδώ για οποιαδήποτε ερώτηση!\n*i-Mentor Consulting*`
    case 'reminder2':
      return `⏰ *2η Υπενθύμιση — Μην χάσετε την ευκαιρία!*\n\nΑγαπητέ/ή *${name}*,\n\n❗ Ο Εξωδικαστικός Μηχανισμός έχει *συγκεκριμένα χρονικά πλαίσια* και η ανάλυσή σας εξακολουθεί να σας περιμένει.\n\n📋 *Δείτε άμεσα:*\n${url}\n\n📞 Επικοινωνήστε μαζί μας για τα επόμενα βήματα.\n*i-Mentor Consulting*`
    case 'final':
      return `🚨 *ΤΕΛΕΥΤΑΙΑ ΕΥΚΑΙΡΙΑ — Απαιτείται Άμεση Ενέργεια!*\n\nΑγαπητέ/ή *${name}*,\n\n⚠️ Η *προθεσμία* για τον Εξωδικαστικό Μηχανισμό πλησιάζει. Αυτή είναι η τελευταία μας υπενθύμιση.\n\n❗ *Μην χάσετε αυτή την ευκαιρία ρύθμισης των οφειλών σας!*\n\n👉 ${url}\n\n📞 *Επικοινωνήστε μαζί μας ΣΗΜΕΡΑ* στο 2810 363007\n*i-Mentor Consulting*`
    default:
      return ''
  }
}

function MoneyInput({ label, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        className="input"
        placeholder="0"
        value={value > 0 ? value.toLocaleString('el-GR') : ''}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, '')
          onChange(raw ? parseInt(raw) : 0)
        }}
      />
    </div>
  )
}

export default function CaseDetail({ currentEmployee }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actuals, setActuals] = useState({
    actualWriteOff: 0, actualRemaining: 0,
    actualMonthlyPay: 0, actualDurationMonths: 0, actualNotes: '',
  })
  const [savingActuals, setSavingActuals] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [viberMenuOpen, setViberMenuOpen] = useState(false)
  const [stageUpdating, setStageUpdating] = useState(false)
  const [portalUpdating, setPortalUpdating] = useState(false)
  const viberRef = useRef(null)

  useEffect(() => {
    const handleClick = (e) => { if (viberRef.current && !viberRef.current.contains(e.target)) setViberMenuOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.getCase(id)
      setCaseData(res.data)
      if (res.data.actual_results) {
        setActuals({ actualWriteOff: 0, actualRemaining: 0, actualMonthlyPay: 0, actualDurationMonths: 0, actualNotes: '', ...res.data.actual_results })
      }
    } catch { toast.error('Σφάλμα φόρτωσης') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  const handleSaveActuals = async () => {
    setSavingActuals(true)
    try {
      await api.saveActualResults(id, { actual_results: actuals })
      toast.success('Πραγματικά αποτελέσματα αποθηκεύτηκαν ✓')
      load()
    } catch { toast.error('Σφάλμα αποθήκευσης') }
    finally { setSavingActuals(false) }
  }

  const handleStatusChange = async (newStatus) => {
    setStatusUpdating(true)
    try {
      await api.updateCase(id, { status: newStatus })
      toast.success('Κατάσταση ενημερώθηκε')
      load()
    } catch { toast.error('Σφάλμα') }
    finally { setStatusUpdating(false) }
  }

  const handlePortalToggle = async () => {
    if (!caseData) return
    setPortalUpdating(true)
    try {
      const newVal = !caseData.portal_active
      await api.updateCase(id, { portal_active: newVal })
      toast.success(newVal ? 'Portal ενεργοποιήθηκε' : 'Portal απενεργοποιήθηκε')
      load()
    } catch { toast.error('Σφάλμα') }
    finally { setPortalUpdating(false) }
  }

  const handleContactStage = async (stage) => {
    setStageUpdating(true)
    try {
      await api.updateCase(id, { contact_stage: stage })
      setCaseData((prev) => ({ ...prev, contact_stage: stage }))
      toast.success('Στάδιο ενημερώθηκε')
    } catch { toast.error('Σφάλμα') }
    finally { setStageUpdating(false) }
  }

  const sendViber = async (type) => {
    if (!caseData) return
    setViberMenuOpen(false)
    const url = `${window.location.origin}/preview/${caseData.share_token}`
    const msg = buildViberMessage(type, caseData.client_name, url)
    try { await navigator.clipboard.writeText(msg) } catch {}

    const phone = (caseData.client_phone || '').replace(/\s+/g, '').replace(/^0/, '+30').replace(/^\+?30/, '+30')
    if (phone) window.open(`viber://chat?number=${phone}`, '_blank')

    const isInitial = type === 'initial'
    const newStage = isInitial ? 'Εστάλη Σύνδεσμος' : caseData.contact_stage
    try {
      const res = await api.updateContact(id, {
        contact_stage: isInitial && caseData.contact_stage === 'Νέα Ανάλυση' ? newStage : undefined,
        increment_reminder: !isInitial,
      })
      setCaseData(res.data)
    } catch {}

    toast.success('✅ Μήνυμα αντιγράφηκε! Κάντε Paste στο Viber.')
  }

  const copyShareLink = () => {
    if (!caseData) return
    const url = `${window.location.origin}/preview/${caseData.share_token}`
    navigator.clipboard.writeText(url).then(() => toast.success('Σύνδεσμος αντιγράφηκε!')).catch(() => toast.error('Αδύνατη αντιγραφή'))
  }

  if (loading) return <div className="p-10 text-center text-gray-400">Φόρτωση…</div>
  if (!caseData) return <div className="p-10 text-center text-red-500">Η υπόθεση δεν βρέθηκε</div>

  const est = caseData.estimates || {}
  const act = caseData.actual_results
  const st = STATUS_LABELS[caseData.status] || STATUS_LABELS.draft
  const finalPlan = est.finalPlan || []
  const portalActive = caseData.portal_active !== false
  const currentStage = CONTACT_STAGES.find((s) => s.key === caseData.contact_stage) || CONTACT_STAGES[0]

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-blue-800">{caseData.client_name}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
              <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">{caseData.employee}</span>
              <span className="text-xs text-gray-500">{caseData.created_at ? format(new Date(caseData.created_at), 'dd/MM/yyyy', { locale: el }) : '—'}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          {/* Portal toggle */}
          <button
            onClick={handlePortalToggle}
            disabled={portalUpdating}
            title={portalActive ? 'Portal ενεργό — κλικ για απενεργοποίηση' : 'Portal ανενεργό — κλικ για ενεργοποίηση'}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
              portalActive
                ? 'bg-green-50 border-green-400 text-green-700 hover:bg-green-100'
                : 'bg-red-50 border-red-300 text-red-600 hover:bg-red-100'
            }`}
          >
            {portalActive ? <EyeIcon className="w-3.5 h-3.5" /> : <EyeSlashIcon className="w-3.5 h-3.5" />}
            Portal {portalActive ? 'ON' : 'OFF'}
          </button>

          {/* Copy link */}
          <button onClick={copyShareLink} className="btn-secondary gap-2 text-sm">
            <LinkIcon className="w-4 h-4" /> Σύνδεσμος
          </button>

          {/* Viber button + dropdown */}
          <div className="relative" ref={viberRef}>
            <button
              onClick={() => setViberMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition-colors"
            >
              <PhoneIcon className="w-4 h-4" />
              Viber
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
            {viberMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 z-50 w-56 overflow-hidden">
                <div className="px-3 py-2 bg-purple-50 border-b border-purple-100 text-xs font-bold text-purple-700">
                  Αποστολή μέσω Viber
                </div>
                {[
                  { type: 'initial', label: '📤 Αποστολή Ανάλυσης', sub: 'Πρώτη επαφή' },
                  { type: 'reminder1', label: '🔔 1η Υπενθύμιση', sub: 'Φιλική' },
                  { type: 'reminder2', label: '🔔 2η Υπενθύμιση', sub: 'Πιο επείγουσα' },
                  { type: 'final', label: '⚠️ Τελευταία Ευκαιρία', sub: 'Urgent' },
                ].map(({ type, label, sub }) => (
                  <button
                    key={type}
                    onClick={() => sendViber(type)}
                    className="w-full text-left px-4 py-2.5 hover:bg-purple-50 transition-colors border-b border-gray-50 last:border-0"
                  >
                    <div className="text-sm font-semibold text-gray-800">{label}</div>
                    <div className="text-xs text-gray-400">{sub}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => navigate(`/cases/${id}/edit`)} className="btn-secondary gap-2 text-sm">
            <PencilIcon className="w-4 h-4" /> Επεξεργασία
          </button>
        </div>
      </div>

      {/* Status changer */}
      <div className="card mb-5 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-600">Κατάσταση:</span>
        {Object.entries(STATUS_LABELS).map(([key, { label, cls }]) => (
          <button
            key={key}
            disabled={caseData.status === key || statusUpdating}
            onClick={() => handleStatusChange(key)}
            className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${caseData.status === key ? cls + ' ring-2 ring-offset-1 ring-blue-400' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Sales pipeline / contact stage */}
      <div className="card mb-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-700">📊 Pipeline Πωλήσεων</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${currentStage.cls}`}>
              {currentStage.icon} {currentStage.key}
            </span>
          </div>
          {caseData.last_contacted_at && (
            <span className="text-xs text-gray-400">
              Τελευταία επαφή: {formatDistanceToNow(new Date(caseData.last_contacted_at), { locale: el, addSuffix: true })}
              {caseData.reminder_count > 0 && ` · ${caseData.reminder_count} υπενθύμιση${caseData.reminder_count > 1 ? 'εις' : ''}`}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {CONTACT_STAGES.map((s) => (
            <button
              key={s.key}
              disabled={stageUpdating || caseData.contact_stage === s.key}
              onClick={() => handleContactStage(s.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                caseData.contact_stage === s.key
                  ? s.cls + ' ring-2 ring-offset-1 ring-blue-400'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {s.icon} {s.key}
            </button>
          ))}
        </div>
      </div>

      {/* Client info */}
      <div className="card mb-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><div className="label">Τύπος</div><div className="font-semibold">{caseData.debtor_type}</div></div>
        <div><div className="label">Τηλέφωνο</div><div>{caseData.client_phone || '—'}</div></div>
        <div><div className="label">Email</div><div>{caseData.client_email || '—'}</div></div>
        <div><div className="label">Σημειώσεις</div><div className="text-gray-500 italic">{caseData.notes || '—'}</div></div>
      </div>

      {/* Estimated results */}
      <h2 className="section-title">📊 Εκτιμώμενα Αποτελέσματα</h2>
      <div className="card mb-5">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="kpi-card"><div className="kpi-label">Συνολική Οφειλή</div><div className="kpi-value">{est.sumDebt ? fmt(est.sumDebt) : '—'}</div></div>
          <div className="kpi-card">
            <div className="kpi-label">Εκτ. Διαγραφή</div>
            <div className="kpi-value text-orange-600">{est.sumWr ? fmt(est.sumWr) : '—'}</div>
            {est.sumWrPct > 0 && <div className="text-xs text-orange-500">({est.sumWrPct}%)</div>}
          </div>
          <div className="kpi-card"><div className="kpi-label">Εκτ. Εναπομένουσα</div><div className="kpi-value">{est.totalRemaining ? fmt(est.totalRemaining) : '—'}</div></div>
          <div className="kpi-card"><div className="kpi-label">Εκτ. Μηνιαία Δόση</div><div className="kpi-value text-green-700">{est.totalMonthlyPay ? fmt(est.totalMonthlyPay) : '—'}</div></div>
          <div className="kpi-card"><div className="kpi-label">Μηνιαίο Διαθέσιμο</div><div className="kpi-value text-blue-600">{est.dispMonthly ? fmt(est.dispMonthly) : '—'}</div></div>
        </div>

        {finalPlan.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b-2 border-blue-100">
                  <th className="th text-left">Πιστωτής</th>
                  <th className="th">Αρχική</th>
                  <th className="th">Διαγραφή</th>
                  <th className="th">Εναπομένουσα</th>
                  <th className="th">Δόσεις</th>
                  <th className="th">Μηνιαία</th>
                </tr>
              </thead>
              <tbody>
                {finalPlan.map((p, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="td text-left font-semibold">{creditorDisplayName(p.type, p.creditorName)}</td>
                    <td className="td font-mono">{fmt(p.amount)}</td>
                    <td className="td font-mono text-orange-600">{p.writeoff > 0 ? `${fmt(p.writeoff)} (${p.writeoffPct}%)` : '—'}</td>
                    <td className="td font-mono">{fmt(p.newAmt)}</td>
                    <td className="td">{p.months}</td>
                    <td className="td font-mono font-bold text-blue-800">{fmt(p.payShown)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Actual results entry */}
      <h2 className="section-title">✅ Πραγματικά Αποτελέσματα Ρύθμισης</h2>
      <div className="card mb-5">
        {act && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex items-center gap-2 text-sm text-green-800">
            <CheckCircleIcon className="w-5 h-5 shrink-0" />
            Τα πραγματικά αποτελέσματα έχουν καταχωρηθεί.
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <MoneyInput label="Πραγματική Διαγραφή (€)" value={actuals.actualWriteOff} onChange={(v) => setActuals({ ...actuals, actualWriteOff: v })} />
          <MoneyInput label="Πραγματική Εναπομένουσα (€)" value={actuals.actualRemaining} onChange={(v) => setActuals({ ...actuals, actualRemaining: v })} />
          <MoneyInput label="Πραγματική Μηνιαία Δόση (€)" value={actuals.actualMonthlyPay} onChange={(v) => setActuals({ ...actuals, actualMonthlyPay: v })} />
          <MoneyInput label="Πραγματική Διάρκεια (μήνες)" value={actuals.actualDurationMonths} onChange={(v) => setActuals({ ...actuals, actualDurationMonths: v })} />
          <div className="md:col-span-4">
            <label className="label">Σημειώσεις αποτελέσματος</label>
            <input className="input" placeholder="π.χ. Τράπεζα δέχτηκε μερική πρόταση…" value={actuals.actualNotes} onChange={(e) => setActuals({ ...actuals, actualNotes: e.target.value })} />
          </div>
        </div>
        <button onClick={handleSaveActuals} disabled={savingActuals} className="btn-primary gap-2">
          <CheckCircleIcon className="w-4 h-4" />
          {savingActuals ? 'Αποθήκευση…' : 'Αποθήκευση Αποτελεσμάτων'}
        </button>
      </div>

      {/* Comparison */}
      {act && est.sumDebt > 0 && (
        <>
          <h2 className="section-title">📈 Σύγκριση Εκτίμησης vs Πραγματικού</h2>
          <div className="card mb-5">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-blue-100">
                  <th className="th text-left">Δείκτης</th>
                  <th className="th">Εκτίμηση</th>
                  <th className="th">Πραγματικό</th>
                  <th className="th">Διαφορά</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Διαγραφή', est: est.sumWr, act: act.actualWriteOff },
                  { label: 'Εναπομένουσα Οφειλή', est: est.totalRemaining, act: act.actualRemaining },
                  { label: 'Μηνιαία Δόση', est: est.totalMonthlyPay, act: act.actualMonthlyPay },
                ].map((row) => {
                  const diff = (row.act || 0) - (row.est || 0)
                  const pct = row.est > 0 ? Math.round(Math.abs(diff) / row.est * 100) : 0
                  const positive = diff >= 0
                  return (
                    <tr key={row.label} className="border-b border-gray-100">
                      <td className="td text-left font-semibold">{row.label}</td>
                      <td className="td font-mono text-gray-600">{row.est ? fmt(row.est) : '—'}</td>
                      <td className="td font-mono font-bold">{row.act ? fmt(row.act) : '—'}</td>
                      <td className="td">
                        {row.est > 0 && row.act > 0 && (
                          <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {positive ? '▲' : '▼'} {pct}%
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {act.actualNotes && (
              <div className="mt-3 bg-gray-50 rounded-lg px-4 py-2 text-sm text-gray-600 italic">
                💬 {act.actualNotes}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
