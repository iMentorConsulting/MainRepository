import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { format, formatDistanceToNow } from 'date-fns'
import { el } from 'date-fns/locale'
import {
  ArrowLeftIcon, PencilIcon, LinkIcon, CheckCircleIcon,
  PhoneIcon, EyeIcon, EyeSlashIcon, ChevronDownIcon, EnvelopeIcon,
} from '@heroicons/react/24/outline'
import * as api from '../api'
import { fmt, creditorDisplayName } from '../utils/calculations'
import { buildEmailHtml, wrapEmailDocument, buildResultsEmailHtml } from '../utils/reportGenerators'

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

const IBANS_TEXT = `\n\n🏦 *Τραπεζικοί Λογαριασμοί:*\nΠειραιώς: GR45 0171 4330 0064 3316 4381 388\nEurobank: GR58 0260 1680 0000 6020 1330 648\nAlpha Bank: GR24 0140 7750 7750 0233 0002 138\nΔικαιούχος: *I MENTOR IKE*`

function buildOfferBlock(offer) {
  if (!offer || (!offer.application_fee && !offer.success_fee)) return ''
  const lines = [`\n\n💼 *Οικονομική Προσφορά:*`]
  if (offer.application_fee) lines.push(`• Αίτηση & Διαδικασία: *${Number(offer.application_fee).toLocaleString('el-GR')}€* + ΦΠΑ`)
  if (offer.success_fee) lines.push(`• Success Fee (αποδοχή): *${Number(offer.success_fee).toLocaleString('el-GR')}€* + ΦΠΑ`)
  return lines.join('\n')
}

function buildViberMessage(type, name, url, offer = null, includeOffer = false) {
  const offerSection = includeOffer ? buildOfferBlock(offer) + IBANS_TEXT : ''
  switch (type) {
    case 'initial':
      return `Αγαπητέ/ή *${name}*,\n\nΗ ανάλυση των στοιχείων σας στον *Εξωδικαστικό Μηχανισμό Ρύθμισης Οφειλών* ολοκληρώθηκε.\n\nΜπορείτε να δείτε την πλήρη ανάλυσή μας στον παρακάτω σύνδεσμο, χρησιμοποιώντας τον *ΑΦΜ* σας ως κωδικό πρόσβασης:\n\n${url}${offerSection}\n\nΓια οποιαδήποτε ερώτηση είμαστε στη διάθεσή σας.\n\n*i-Mentor Consulting*\nΤ: *2810 363007*`
    case 'reminder1':
      return `Αγαπητέ/ή *${name}*,\n\nΣας υπενθυμίζουμε ότι η ανάλυση ρύθμισης οφειλών σας είναι διαθέσιμη.\n\nΠαρακαλούμε επισκεφθείτε τον σύνδεσμο χρησιμοποιώντας τον *ΑΦΜ* σας:\n\n${url}${offerSection}\n\nΕίμαστε στη διάθεσή σας.\n\n*i-Mentor Consulting*\nΤ: *2810 363007*`
    case 'reminder2':
      return `Αγαπητέ/ή *${name}*,\n\n*Δεύτερη υπενθύμιση* σχετικά με την ανάλυση ρύθμισης οφειλών σας. Ο Εξωδικαστικός Μηχανισμός έχει αυστηρά χρονικά πλαίσια.\n\nΠαρακαλούμε επισκεφθείτε τον σύνδεσμο ή επικοινωνήστε μαζί μας *άμεσα*:\n\n${url}${offerSection}\n\n*i-Mentor Consulting*\nΤ: *2810 363007*`
    case 'final':
      return `Αγαπητέ/ή *${name}*,\n\n*Τελευταία υπενθύμιση.* Η προθεσμία για τον Εξωδικαστικό Μηχανισμό πλησιάζει και η ανάλυσή σας παραμένει αναπάντητη.\n\nΠαρακαλούμε επικοινωνήστε μαζί μας *ΑΜΕΣΑ* ή επισκεφθείτε τον σύνδεσμο:\n\n${url}${offerSection}\n\n*i-Mentor Consulting*\nΤ: *2810 363007*`
    default:
      return ''
  }
}

const fmtDec2 = (n) => Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'

function MoneyCell({ value, onChange }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      className="input text-center text-sm"
      placeholder="0"
      value={value > 0 ? value.toLocaleString('el-GR') : ''}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, '')
        onChange(raw ? parseInt(raw) : 0)
      }}
    />
  )
}

function MoneyCellDec({ value, onChange }) {
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      className="input text-center text-sm"
      placeholder="0.00"
      value={value || ''}
      onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : 0)}
    />
  )
}

function buildEmptyCreditors(finalPlan) {
  return (finalPlan || []).map((p) => ({
    creditor: creditorDisplayName(p.type, p.creditorName),
    type: p.type,
    originalAmount: p.amount || 0,
    actualWriteoff: 0,
    actualRemaining: 0,
    actualMonthlyPay: 0,
    actualMonths: 0,
    rfCode: '',
    notes: '',
  }))
}

function ViberPreviewModal({ msgType, msgLabel, caseName, url, offer, onSend, onClose, sending }) {
  const [includeOffer, setIncludeOffer] = useState(false)
  const [message, setMessage] = useState(() => buildViberMessage(msgType, caseName, url, offer, false))

  const toggleOffer = (checked) => {
    setIncludeOffer(checked)
    setMessage(buildViberMessage(msgType, caseName, url, offer, checked))
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="font-black text-purple-700 text-base">📤 {msgLabel}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
        </div>
        <div className="p-5">
          <label className="label mb-1">Προεπισκόπηση μηνύματος <span className="text-gray-400 font-normal">(επεξεργάσιμο)</span></label>
          <textarea
            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm font-mono leading-relaxed focus:outline-none focus:border-purple-400 resize-none"
            rows={12}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-purple-600"
              checked={includeOffer}
              onChange={(e) => toggleOffer(e.target.checked)}
            />
            <span className="text-sm font-semibold text-gray-700">Συμπερίληψη Οικονομικής Προσφοράς & IBAN</span>
          </label>
        </div>
        <div className="flex gap-2 justify-end px-5 pb-5">
          <button onClick={onClose} className="btn-secondary text-sm">Ακύρωση</button>
          <button
            onClick={() => onSend(message, msgType)}
            disabled={sending}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
          >
            {sending ? 'Αποστολή…' : '📤 Αποστολή Viber'}
          </button>
        </div>
      </div>
    </div>
  )
}

function buildEmailTextPreview(caseData, { includeTable, includeDisclaimer, includeOffer }) {
  const est = caseData.estimates || {}
  const offer = caseData.commercial_offer || {}
  const finalPlan = est.finalPlan || []
  const lines = []
  lines.push(`Αγαπητέ/ή ${caseData.client_name},`)
  lines.push('')
  lines.push('Η ομάδα της i-Mentor Consulting ολοκλήρωσε την ανάλυση και παρουσιάζει τα αποτελέσματα της Θεωρητικής Προσομοίωσης Εξωδικαστικού Μηχανισμού.')
  lines.push('')
  if (includeTable && finalPlan.length > 0) {
    const hasStepUp = finalPlan.some((p) => p.c1 != null && p.c2 != null && p.c1 !== p.c2)
    lines.push('─── ΕΚΤΙΜΩΜΕΝΟ ΑΠΟΤΕΛΕΣΜΑ ΡΥΘΜΙΣΗΣ ───')
    finalPlan.forEach((p) => {
      const name = creditorDisplayName(p.type, p.creditorName)
      const wr = p.writeoff || 0
      const pct = p.amount > 0 ? Math.round((wr / p.amount) * 100) : 0
      lines.push(`${name}`)
      if (hasStepUp && p.c1 != null && p.c2 != null && p.c1 !== p.c2) {
        lines.push(`  Οφειλή: ${(p.amount||0).toLocaleString('el-GR')} | Διαγραφή: ${wr.toLocaleString('el-GR')}${pct ? ` (${pct}%)` : ''} | Υπόλοιπο: ${(p.newAmt||0).toLocaleString('el-GR')}`)
        lines.push(`  Δόση Έτη 1-3: ${(p.c1||0).toLocaleString('el-GR')}€/μήνα | Δόση Έτη 4+: ${(p.c2||0).toLocaleString('el-GR')}€/μήνα`)
      } else {
        lines.push(`  Οφειλή: ${(p.amount||0).toLocaleString('el-GR')} | Διαγραφή: ${wr.toLocaleString('el-GR')}${pct ? ` (${pct}%)` : ''} | Υπόλοιπο: ${(p.newAmt||0).toLocaleString('el-GR')} | Δόση: ${(p.payShown||0).toLocaleString('el-GR')}/μήνα`)
      }
    })
    lines.push('')
    const totalC1 = finalPlan.reduce((s, p) => s + (p.c1 ?? p.payShown ?? 0), 0)
    if (hasStepUp) {
      lines.push(`Σύνολα: Οφειλή ${(est.sumDebt||0).toLocaleString('el-GR')} | Διαγραφή ${(est.sumWr||0).toLocaleString('el-GR')} | Δόση Έτη 1-3: ${totalC1.toLocaleString('el-GR')}€ | Δόση Έτη 4+: ${(est.totalMonthlyPay||0).toLocaleString('el-GR')}€/μήνα`)
    } else {
      lines.push(`Σύνολα: Οφειλή ${(est.sumDebt||0).toLocaleString('el-GR')} | Διαγραφή ${(est.sumWr||0).toLocaleString('el-GR')} | Δόση ${(est.totalMonthlyPay||0).toLocaleString('el-GR')}/μήνα`)
    }
    lines.push('')
  }
  if (includeDisclaimer) {
    lines.push('⚠️ ΣΗΜΑΝΤΙΚΗ ΕΠΙΣΗΜΑΝΣΗ:')
    lines.push('Τα παραπάνω αποτελέσματα αποτελούν θεωρητική εκτίμηση βάσει των στοιχείων που δηλώθηκαν και του αλγορίθμου του Εξωδικαστικού Μηχανισμού. Δεν αποτελούν δέσμευση ούτε εγγύηση αποτελέσματος.')
    lines.push('')
  }
  lines.push('─── ΓΙΑΤΙ Η i-MENTOR ───')
  lines.push('Ενώ οι περισσότεροι σύμβουλοι σταματούν στην καταχώρηση της αίτησης, εμείς ανεβάζουμε επιπρόσθετα ένα τεκμηριωμένο σχέδιο αναδιάρθρωσης προσαρμοσμένο στους πιστωτές.')
  lines.push('Στόχος μας: Η πρόταση που καταθέτουμε στους πιστωτές στοχεύει να είναι καλύτερη από το θεωρητικό αποτέλεσμα — διεκδικώντας ευνοϊκότερες διαγραφές και χαμηλότερες δόσεις για εσάς.')
  lines.push('')
  if (includeOffer && (offer.application_fee || offer.success_fee)) {
    lines.push('─── ΟΙΚΟΝΟΜΙΚΗ ΠΡΟΣΦΟΡΑ ───')
    if (offer.application_fee) {
      const g = Math.round(Number(offer.application_fee) * 1.24)
      lines.push(`• Αίτηση & Διαδικασία: ${Number(offer.application_fee).toLocaleString('el-GR')}€ + ΦΠΑ 24% = ${g.toLocaleString('el-GR')}€`)
    }
    if (offer.success_fee) {
      const g = Math.round(Number(offer.success_fee) * 1.24)
      lines.push(`• Success Fee (αποδοχή): ${Number(offer.success_fee).toLocaleString('el-GR')}€ + ΦΠΑ 24% = ${g.toLocaleString('el-GR')}€`)
    }
    lines.push('')
    lines.push('Τραπεζικοί Λογαριασμοί:')
    lines.push('  Πειραιώς:   GR45 0171 4330 0064 3316 4381 388')
    lines.push('  Eurobank:   GR58 0260 1680 0000 6020 1330 648')
    lines.push('  Alpha Bank: GR24 0140 7750 7750 0233 0002 138')
    lines.push('  Δικαιούχος: I MENTOR IKE')
    lines.push('')
  }
  lines.push('Με εκτίμηση,')
  lines.push('Η ομάδα της i-Mentor Consulting')
  lines.push('Τ: 2810 363007 | info@i-mentor.gr | www.i-mentor.gr')
  return lines.join('\n')
}

function EmailOptionsModal({ caseData, onClose }) {
  const [includeTable, setIncludeTable] = useState(true)
  const [includeDisclaimer, setIncludeDisclaimer] = useState(true)
  const [includeOffer, setIncludeOffer] = useState(false)
  const offer = caseData.commercial_offer || {}
  const est = caseData.estimates || {}

  const [previewText, setPreviewText] = useState(() =>
    buildEmailTextPreview(caseData, { includeTable: true, includeDisclaimer: true, includeOffer: false })
  )

  const rebuildPreview = (tbl, dis, off) => {
    setPreviewText(buildEmailTextPreview(caseData, { includeTable: tbl, includeDisclaimer: dis, includeOffer: off }))
  }

  const toggleTable = (v) => { setIncludeTable(v); rebuildPreview(v, includeDisclaimer, includeOffer) }
  const toggleDisclaimer = (v) => { setIncludeDisclaimer(v); rebuildPreview(includeTable, v, includeOffer) }
  const toggleOffer = (v) => { setIncludeOffer(v); rebuildPreview(includeTable, includeDisclaimer, v) }

  const portalUrl = caseData.share_token ? `${window.location.origin}/preview/${caseData.share_token}` : null

  const openHtmlEmail = () => {
    const finalPlan = est.finalPlan || []
    const creditors = finalPlan.map((p) => ({
      creditor: creditorDisplayName(p.type, p.creditorName),
      type: p.type,
      amount: p.amount || 0,
      writeoff: p.writeoff || 0,
      remaining: p.newAmt || 0,
      months: p.months || 0,
      monthlyPay: p.payShown || 0,
      c1: p.c1 ?? p.payShown ?? 0,
      c2: p.c2 ?? p.payShown ?? 0,
      writeoffC: p.writeoffC ?? p.writeoff ?? 0,
      remainingC: p.newAmtC ?? p.newAmt ?? 0,
      c1C: p.c1C ?? p.c1 ?? p.payShown ?? 0,
      c2C: p.c2C ?? p.c2 ?? p.payShown ?? 0,
    }))
    const bankDebt = finalPlan.filter(p => p.type === 'Τράπεζα').reduce((s, p) => s + (p.amount || 0), 0)
    const taxDebt = finalPlan.filter(p => p.type === 'Εφορία').reduce((s, p) => s + (p.amount || 0), 0)
    const insDebt = finalPlan.filter(p => p.type === 'Ασφαλιστικά Ταμεία').reduce((s, p) => s + (p.amount || 0), 0)
    const isVulnerable = !!(caseData.income_data?.isVulnerable) && !caseData.debtor_type?.includes('Νομικό')
    const sumWrC = est.sumWrC ?? finalPlan.reduce((s, p) => s + (p.writeoffC || 0), 0)
    const data = {
      clientName: caseData.client_name,
      clientPhone: caseData.client_phone,
      clientEmail: caseData.client_email,
      debtorType: caseData.debtor_type,
      totalDebt: est.sumDebt || 0,
      totalWriteOff: est.sumWr || 0,
      totalRemaining: est.totalRemaining || 0,
      totalMonthlyPay: est.totalMonthlyPay || 0,
      dispMonthly: est.dispMonthly || 0,
      creditors,
      bankDebt,
      taxDebt,
      insDebt,
      forecastTitle: est.forecastTitle,
      forecastSections: est.forecastSections,
      commercialOffer: includeOffer ? offer : null,
      showTable: includeTable,
      showDisclaimer: includeDisclaimer,
      portalUrl,
      hasVat: Boolean(caseData.has_vat ?? caseData.client_vat),
      isVulnerable,
      totalWriteOffC: isVulnerable ? null : sumWrC,
      totalRemainingC: isVulnerable ? null : (est.totalRemainingC ?? finalPlan.reduce((s, p) => s + (p.newAmtC || 0), 0)),
      totalMonthlyPayC: isVulnerable ? null : (est.totalMonthlyPayC ?? finalPlan.reduce((s, p) => s + (p.payShownC || 0), 0)),
      totalC1C: isVulnerable ? null : (est.totalC1C ?? finalPlan.reduce((s, p) => s + (p.c1C || 0), 0)),
      nonErasableTotal: est.nonErasableTotal || (caseData.debts || []).reduce((s, d) => s + (d.pubCategories?.nonErasableBasic || 0), 0),
      incomeData: caseData.income_data || {},
      assets: caseData.assets || [],
      dispAnnual: est.dispAnnual || 0,
      totalExpenses: est.totalExpenses || 0,
    }
    const subject = `Θεωρητική Προσομοίωση Εξωδικαστικού | ${caseData.client_name}`
    const html = buildEmailHtml(data)
    const w = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes')
    if (w) { w.document.open(); w.document.write(wrapEmailDocument(html, subject)); w.document.close() }
  }


  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="font-black text-blue-700 text-base">📧 Email Ανάλυσης</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
        </div>
        <div className="p-5">
          <label className="label mb-1">Προεπισκόπηση email <span className="text-gray-400 font-normal">(επεξεργάσιμο)</span></label>
          <textarea
            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm font-mono leading-relaxed focus:outline-none focus:border-blue-400 resize-none"
            rows={14}
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
          />
          <div className="flex flex-wrap gap-5 mt-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={includeTable} onChange={(e) => toggleTable(e.target.checked)} />
              <span className="text-sm font-semibold text-gray-700">Πίνακας Αποτελεσμάτων</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={includeDisclaimer} onChange={(e) => toggleDisclaimer(e.target.checked)} />
              <span className="text-sm font-semibold text-gray-700">Επισήμανση μη δέσμευσης</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 accent-green-600" checked={includeOffer} onChange={(e) => toggleOffer(e.target.checked)} />
              <span className="text-sm font-semibold text-gray-700">Οικονομική Προσφορά & IBAN</span>
            </label>
          </div>
          <p className="text-xs text-gray-400 mt-2">Το HTML email ανοίγει σε νέο παράθυρο έτοιμο για αντιγραφή στο Gmail / Outlook.</p>
        </div>
        <div className="flex gap-2 justify-end px-5 pb-5">
          <button onClick={onClose} className="btn-secondary text-sm">Ακύρωση</button>
          <button
            onClick={openHtmlEmail}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
          >
            📧 Πλήρες HTML
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CaseDetail({ currentEmployee }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actuals, setActuals] = useState({ creditors: [], generalNotes: '' })
  const [savingActuals, setSavingActuals] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [viberMenuOpen, setViberMenuOpen] = useState(false)
  const [viberModal, setViberModal] = useState(null) // { msgType, msgLabel }
  const [viberSending, setViberSending] = useState(false)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
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
      const fp = res.data.estimates?.finalPlan || []
      if (res.data.actual_results?.creditors?.length) {
        setActuals({ creditors: [], generalNotes: '', ...res.data.actual_results })
      } else {
        setActuals({ creditors: buildEmptyCreditors(fp), generalNotes: '' })
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

  const openViberModal = (type, label) => {
    setViberMenuOpen(false)
    setViberModal({ msgType: type, msgLabel: label })
  }

  const handleViberSend = async (message, msgType) => {
    if (!caseData) return
    setViberSending(true)
    try {
      const res = await api.sendViber(id, {
        message,
        msg_type: msgType,
        is_initial: msgType === 'initial',
        is_reminder: msgType !== 'initial',
      })
      setCaseData(res.data)
      setViberModal(null)
      toast.success('✅ Μήνυμα εστάλη μέσω Viber!')
    } catch {
      toast.error('Σφάλμα αποστολής Viber')
    } finally {
      setViberSending(false)
    }
  }

  const openResultsEmail = () => {
    if (!caseData) return
    const html = buildResultsEmailHtml({
      clientName: caseData.client_name,
      clientPhone: caseData.client_phone,
      clientEmail: caseData.client_email,
      employee: caseData.employee,
      actualResults: actuals,
    })
    const subject = `Αποτελέσματα Ρύθμισης — ${caseData.client_name}`
    const w = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes')
    if (w) { w.document.open(); w.document.write(wrapEmailDocument(html, subject)); w.document.close() }
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
              {(caseData.portal_visit_count > 0) && (
                <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full" title="Επισκέψεις στο portal">
                  👁 {caseData.portal_visit_count} επίσκεψη{caseData.portal_visit_count !== 1 ? 'εις' : ''}
                </span>
              )}
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

          {/* Staff preview — notrack */}
          {caseData.share_token && (
            <a
              href={`${window.location.origin}/preview/${caseData.share_token}?notrack=1`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary gap-2 text-sm"
              title="Προβολή portal ως σύμβουλος (δεν μετράει ως επίσκεψη πελάτη)"
            >
              <EyeIcon className="w-4 h-4" /> Portal από Σύμβουλο
            </a>
          )}

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
                    onClick={() => openViberModal(type, label)}
                    className="w-full text-left px-4 py-2.5 hover:bg-purple-50 transition-colors border-b border-gray-50 last:border-0"
                  >
                    <div className="text-sm font-semibold text-gray-800">{label}</div>
                    <div className="text-xs text-gray-400">{sub}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setEmailModalOpen(true)}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <EnvelopeIcon className="w-4 h-4" />
            Email
          </button>

          <button onClick={() => navigate(`/cases/${id}/edit`)} className="btn-secondary gap-2 text-sm">
            <PencilIcon className="w-4 h-4" /> Επεξεργασία
          </button>
        </div>
      </div>

      {/* Viber preview modal */}
      {viberModal && caseData && (
        <ViberPreviewModal
          msgType={viberModal.msgType}
          msgLabel={viberModal.msgLabel}
          caseName={caseData.client_name}
          url={`${window.location.origin}/preview/${caseData.share_token}`}
          offer={caseData.commercial_offer || {}}
          onSend={handleViberSend}
          onClose={() => setViberModal(null)}
          sending={viberSending}
        />
      )}

      {/* Email options modal */}
      {emailModalOpen && caseData && (
        <EmailOptionsModal caseData={caseData} onClose={() => setEmailModalOpen(false)} />
      )}

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

      {/* Commercial Offer */}
      {(caseData.commercial_offer?.application_fee > 0 || caseData.commercial_offer?.success_fee > 0) && (
        <div className="card mb-5 bg-blue-50 border border-blue-200">
          <div className="text-sm font-black text-blue-800 mb-3">💼 Οικονομική Προσφορά</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {caseData.commercial_offer?.application_fee > 0 && (
              <div>
                <div className="label">Αίτηση & Διαδικασία</div>
                <div className="font-bold text-blue-800 text-base">
                  {Number(caseData.commercial_offer.application_fee).toLocaleString('el-GR')}€ <span className="text-xs font-normal text-gray-500">+ ΦΠΑ</span>
                </div>
              </div>
            )}
            {caseData.commercial_offer?.success_fee > 0 && (
              <div>
                <div className="label">Success Fee (σε αποδοχή αποτελέσματος)</div>
                <div className="font-bold text-blue-800 text-base">
                  {Number(caseData.commercial_offer.success_fee).toLocaleString('el-GR')}€ <span className="text-xs font-normal text-gray-500">+ ΦΠΑ</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
        {act?.creditors?.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex items-center gap-2 text-sm text-green-800">
            <CheckCircleIcon className="w-5 h-5 shrink-0" />
            Τα πραγματικά αποτελέσματα έχουν καταχωρηθεί.
          </div>
        )}

        {actuals.creditors.length > 0 ? (
          <div className="overflow-x-auto mb-4">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b-2 border-blue-100 text-xs">
                  <th className="th text-left">Πιστωτής</th>
                  <th className="th">Αρχική Οφειλή</th>
                  <th className="th">Πραγματική Διαγραφή</th>
                  <th className="th">Εναπομένουσα</th>
                  <th className="th">Μηνιαία Δόση</th>
                  <th className="th">Δόσεις (μήνες)</th>
                  <th className="th">RF Κωδικός</th>
                  <th className="th">Σημειώσεις</th>
                </tr>
              </thead>
              <tbody>
                {actuals.creditors.map((c, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="td text-left font-semibold text-sm">{c.creditor}</td>
                    <td className="td font-mono text-sm text-gray-500">{fmt(c.originalAmount)}</td>
                    <td className="td min-w-[120px]">
                      <MoneyCell value={c.actualWriteoff} onChange={(v) => {
                        const updated = [...actuals.creditors]
                        updated[i] = { ...updated[i], actualWriteoff: v }
                        setActuals({ ...actuals, creditors: updated })
                      }} />
                    </td>
                    <td className="td min-w-[120px]">
                      <MoneyCell value={c.actualRemaining} onChange={(v) => {
                        const updated = [...actuals.creditors]
                        updated[i] = { ...updated[i], actualRemaining: v }
                        setActuals({ ...actuals, creditors: updated })
                      }} />
                    </td>
                    <td className="td min-w-[110px]">
                      <MoneyCellDec value={c.actualMonthlyPay} onChange={(v) => {
                        const updated = [...actuals.creditors]
                        updated[i] = { ...updated[i], actualMonthlyPay: v }
                        setActuals({ ...actuals, creditors: updated })
                      }} />
                    </td>
                    <td className="td min-w-[90px]">
                      <input
                        type="number" min="0" max="600"
                        className="input text-center text-sm"
                        placeholder="0"
                        value={c.actualMonths || ''}
                        onChange={(e) => {
                          const updated = [...actuals.creditors]
                          updated[i] = { ...updated[i], actualMonths: +e.target.value }
                          setActuals({ ...actuals, creditors: updated })
                        }}
                      />
                    </td>
                    <td className="td min-w-[120px]">
                      <input
                        type="text"
                        className="input text-sm"
                        placeholder="RF123..."
                        value={c.rfCode || ''}
                        onChange={(e) => {
                          const updated = [...actuals.creditors]
                          updated[i] = { ...updated[i], rfCode: e.target.value }
                          setActuals({ ...actuals, creditors: updated })
                        }}
                      />
                    </td>
                    <td className="td min-w-[160px]">
                      <input
                        type="text"
                        className="input text-sm"
                        placeholder="Σημείωση..."
                        value={c.notes || ''}
                        onChange={(e) => {
                          const updated = [...actuals.creditors]
                          updated[i] = { ...updated[i], notes: e.target.value }
                          setActuals({ ...actuals, creditors: updated })
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-blue-50 font-bold text-sm border-t-2 border-blue-200">
                  <td className="td text-left">ΣΥΝΟΛΟ</td>
                  <td className="td font-mono">{fmt(actuals.creditors.reduce((s, c) => s + (c.originalAmount || 0), 0))}</td>
                  <td className="td font-mono text-orange-600">{fmt(actuals.creditors.reduce((s, c) => s + (c.actualWriteoff || 0), 0))}</td>
                  <td className="td font-mono">{fmt(actuals.creditors.reduce((s, c) => s + (c.actualRemaining || 0), 0))}</td>
                  <td className="td font-mono text-blue-800">{fmtDec2(actuals.creditors.reduce((s, c) => s + (c.actualMonthlyPay || 0), 0))}</td>
                  <td className="td" colSpan={3}></td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-gray-400 italic mb-4">Δεν υπάρχουν πιστωτές — αποθηκεύστε πρώτα τα εκτιμώμενα αποτελέσματα.</div>
        )}

        <div className="mb-4">
          <label className="label">Γενικές Σημειώσεις Αποτελέσματος</label>
          <textarea
            className="input h-20 resize-none"
            placeholder="π.χ. Τράπεζα υπέβαλε αντιπρόταση, τελικά συμφωνήθηκε…"
            value={actuals.generalNotes || ''}
            onChange={(e) => setActuals({ ...actuals, generalNotes: e.target.value })}
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={handleSaveActuals} disabled={savingActuals} className="btn-primary gap-2">
            <CheckCircleIcon className="w-4 h-4" />
            {savingActuals ? 'Αποθήκευση…' : 'Αποθήκευση Αποτελεσμάτων'}
          </button>
          {act?.creditors?.length > 0 && (
            <button onClick={openResultsEmail} className="btn-secondary gap-2 text-sm">
              <EnvelopeIcon className="w-4 h-4" /> Email Αποτελεσμάτων
            </button>
          )}
        </div>
      </div>

      {/* Comparison */}
      {act?.creditors?.length > 0 && est.sumDebt > 0 && (
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
                {(() => {
                  const actWriteoff = act.creditors.reduce((s, c) => s + (c.actualWriteoff || 0), 0)
                  const actRemaining = act.creditors.reduce((s, c) => s + (c.actualRemaining || 0), 0)
                  const actMonthly = act.creditors.reduce((s, c) => s + (c.actualMonthlyPay || 0), 0)
                  return [
                    { label: 'Διαγραφή', estVal: est.sumWr, actVal: actWriteoff },
                    { label: 'Εναπομένουσα Οφειλή', estVal: est.totalRemaining, actVal: actRemaining },
                    { label: 'Μηνιαία Δόση', estVal: est.totalMonthlyPay, actVal: actMonthly, isDec: true },
                  ].map((row) => {
                    const diff = (row.actVal || 0) - (row.estVal || 0)
                    const pct = row.estVal > 0 ? Math.round(Math.abs(diff) / row.estVal * 100) : 0
                    const positive = diff >= 0
                    return (
                      <tr key={row.label} className="border-b border-gray-100">
                        <td className="td text-left font-semibold">{row.label}</td>
                        <td className="td font-mono text-gray-600">{row.estVal ? fmt(row.estVal) : '—'}</td>
                        <td className="td font-mono font-bold">{row.actVal ? (row.isDec ? fmtDec2(row.actVal) : fmt(row.actVal)) : '—'}</td>
                        <td className="td">
                          {row.estVal > 0 && row.actVal > 0 && (
                            <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {positive ? '▲' : '▼'} {pct}%
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
            {act.generalNotes && (
              <div className="mt-3 bg-gray-50 rounded-lg px-4 py-2 text-sm text-gray-600 italic">
                💬 {act.generalNotes}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
