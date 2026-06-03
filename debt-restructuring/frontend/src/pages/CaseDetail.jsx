import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { format, formatDistanceToNow } from 'date-fns'
import { el } from 'date-fns/locale'
import {
  ArrowLeftIcon, PencilIcon, LinkIcon, CheckCircleIcon,
  PhoneIcon, EyeIcon, EyeSlashIcon, ChevronDownIcon, EnvelopeIcon,
  BanknotesIcon, ChartBarSquareIcon, ClipboardDocumentCheckIcon, ChartBarIcon,
} from '@heroicons/react/24/outline'
import * as api from '../api'
import { fmt, creditorDisplayName } from '../utils/calculations'
import { buildEmailHtml, wrapEmailDocument, buildResultsEmailHtml } from '../utils/reportGenerators'

const STATUS_LABELS = {
  draft:     { label: 'Άντληση Στοιχείων',      cls: 'bg-gray-100 text-gray-700' },
  submitted: { label: 'Οριστικοποίηση Αίτησης', cls: 'bg-blue-100 text-blue-700' },
  in_review: { label: 'Πρόταση Ρύθμισης',       cls: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Αποδοχή Ρύθμισης',       cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Απορρίψη Ρύθμισης',      cls: 'bg-red-100 text-red-700' },
}

const CONTACT_STAGES = [
  { key: 'Νέα Ανάλυση', icon: '📋', cls: 'bg-gray-100 text-gray-700' },
  { key: 'Εστάλη Σύνδεσμος', icon: '🔗', cls: 'bg-blue-100 text-blue-700' },
  { key: 'Θετική Ανταπόκριση', icon: '✅', cls: 'bg-green-100 text-green-700' },
  { key: 'Σε Διαπραγμάτευση', icon: '💬', cls: 'bg-yellow-100 text-yellow-700' },
  { key: 'Έκλεισε', icon: '🏆', cls: 'bg-emerald-100 text-emerald-800' },
  { key: 'Δεν Ενδιαφέρεται', icon: '❌', cls: 'bg-red-100 text-red-700' },
]

const IBANS_TEXT = `\n\n🏦 *Τραπεζικοί Λογαριασμοί:*\nΠειραιώς: GR4501714330006433164381388\nEurobank: GR5802601680000060201330648\nAlpha Bank: GR2401407750775002330002138\nΔικαιούχος: *I MENTOR IKE*`

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
    subRows: [],
    stepRows: [],
    withdrawn: false,
  }))
}

function emptySubRow(n) {
  return { label: `Μέρος ${n}`, actualWriteoff: 0, actualRemaining: 0, actualMonthlyPay: 0, actualMonths: 0, rfCode: '', notes: '', stepRows: [] }
}

function recomputeParentFromSubRows(cred) {
  const sr = cred.subRows || []
  if (sr.length === 0) return cred
  return {
    ...cred,
    actualWriteoff: sr.reduce((s, r) => s + (r.actualWriteoff || 0), 0),
    actualRemaining: sr.reduce((s, r) => s + (r.actualRemaining || 0), 0),
    actualMonthlyPay: sr.reduce((s, r) => s + (r.actualMonthlyPay || 0), 0),
  }
}

function recomputeFromStepRows(cred) {
  const sr = cred.stepRows || []
  if (sr.length === 0) return cred
  return {
    ...cred,
    actualMonthlyPay: sr[0]?.monthlyPay || 0,
    actualMonths: sr.reduce((s, r) => s + (r.months || 0), 0),
  }
}

function autoStepLabel(stepRows) {
  const prevMonths = (stepRows || []).reduce((s, r) => s + (r.months || 0), 0)
  const n = (stepRows || []).length + 1
  const startYear = Math.floor(prevMonths / 12) + 1
  return `Βήμα ${n} (από το ${startYear}ο έτος)`
}

function renderStepLabel(stepRows, idx) {
  let cum = 0
  for (let k = 0; k < idx; k++) cum += stepRows[k]?.months || 0
  const monthsThis = stepRows[idx]?.months || 0
  const sy = Math.floor(cum / 12) + 1
  const ey = Math.floor((cum + monthsThis) / 12)
  if (!monthsThis) return stepRows[idx]?.label || `Βήμα ${idx + 1}`
  if (sy === ey) return `${sy}ο έτος`
  return `${sy}ο–${ey}ο έτος`
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

const OBJECTIONS = [
  {
    q: '"Θα το σκεφτώ" / "Δεν είμαι έτοιμος"',
    a: 'Καταλαβαίνω απόλυτα. Η ανάλυση που έχετε μπροστά σας ισχύει τώρα — οι συνθήκες αλλάζουν. Τι σας κρατάει πίσω; Μήπως υπάρχει κάτι που δεν καταλαβαίνετε πλήρως και να το εξηγήσω;',
  },
  {
    q: '"Δεν έχω χρόνο για τη διαδικασία"',
    a: 'Αναλαμβάνουμε εμείς τα πάντα — αίτηση, έγγραφα, επικοινωνία με πιστωτές. Από εσάς χρειαζόμαστε ~2 ώρες συνολικά για τη συλλογή στοιχείων. Το υπόλοιπο είναι δική μας δουλειά.',
  },
  {
    q: '"Πόσο θα κοστίσει;"',
    a: 'Η αρχική ανάλυση είναι δωρεάν. Η αμοιβή μας είναι [X€] για την υποβολή + success fee μόνο αν αποδεχτούν οι πιστωτές. Δηλαδή αν δεν κερδίσετε τίποτα, δεν πληρώνετε τίποτα για αποτέλεσμα.',
  },
  {
    q: '"Έχω ακούσει ότι δεν λειτουργεί ο εξωδικαστικός"',
    a: 'Εξαρτάται ποιον ρώτησε κανείς. Σε τράπεζες και funds που έχουν κίνητρο να διακανονίσουν, τα ποσοστά αποδοχής είναι υψηλά. Αντίθετα το Δημόσιο (ΑΑΔΕ/ΕΦΚΑ) συχνά λαμβάνει αυτόματα τεκμαιρόμενη συναίνεση βάσει νόμου. Κοιτάξτε τα νούμερα στην ανάλυσή σας — αυτά βγαίνουν από τον αλγόριθμο του νόμου.',
  },
  {
    q: '"Ήδη πληρώνω ρύθμιση στην εφορία"',
    a: 'Η υπάρχουσα ρύθμιση δεν εμποδίζει τον εξωδικαστικό — μπορεί να ενσωματωθεί ή να αντικατασταθεί από ευνοϊκότερη ρύθμιση με μεγαλύτερη διάρκεια και χαμηλότερη δόση.',
  },
  {
    q: '"Φοβάμαι να ανοίξω τα χαρτιά μου"',
    a: 'Ακριβώς γι\' αυτό υπάρχουμε εμείς. Ό,τι συζητάμε είναι απόλυτα εμπιστευτικό. Η κατάθεση αίτησης δεν σημαίνει κατάσχεση — αντίθετα, η μη αντιμετώπιση οδηγεί σε κατάσχεση.',
  },
  {
    q: '"Τι γίνεται αν δεν αποδεχτούν;"',
    a: 'Το χειρότερο σενάριο είναι η απόρριψη — επιστρέφετε στην ίδια κατάσταση που είστε σήμερα, χωρίς επιβάρυνση. Στο καλύτερο, ρυθμίζετε [X]€ σε δόσεις [Y]€/μήνα. Το downside risk είναι μηδενικό.',
  },
  {
    q: '"Έχω ακούσει για άλλον σύμβουλο φθηνότερα"',
    a: 'Κατανοητό. Η διαφορά μας: ανεβάζουμε τεκμηριωμένο σχέδιο αναδιάρθρωσης στους πιστωτές — κάτι που κάνουν ελάχιστοι. Σε υποθέσεις με funds και τράπεζες αυτό έχει μετρήσιμη διαφορά στο τελικό αποτέλεσμα.',
  },
]

function ObjectionTemplates() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(null)
  return (
    <div className="card mb-5">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="text-sm font-bold text-gray-700">💬 Σενάρια Αντίρρησης Πελάτη</span>
        <span className="text-gray-400 text-lg leading-none">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {OBJECTIONS.map((o, i) => (
            <div key={i} className="border border-gray-100 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-between gap-2"
              >
                <span>❓ {o.q}</span>
                <span className="text-gray-400 shrink-0">{expanded === i ? '▲' : '▼'}</span>
              </button>
              {expanded === i && (
                <div className="px-4 pb-3 pt-1 text-sm text-gray-700 bg-blue-50 border-t border-blue-100 leading-relaxed">
                  💡 {o.a}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Σφάλμα αποστολής Viber'
      toast.error(detail, { duration: 6000 })
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
              title="Προβολή portal ως σύμβουλος — αντιγράφει ΑΦΜ αυτόματα"
              onClick={() => {
                const vat = caseData.client_vat
                if (vat) {
                  navigator.clipboard.writeText(vat)
                    .then(() => toast.success(`ΑΦΜ αντιγράφηκε: ${vat}`))
                    .catch(() => toast.info(`ΑΦΜ: ${vat}`))
                } else {
                  toast('Δεν έχει οριστεί ΑΦΜ σε αυτή την υπόθεση', { icon: 'ℹ️' })
                }
              }}
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
            <span className="text-sm font-bold text-gray-700 flex items-center gap-1.5"><ChartBarIcon className="w-4 h-4 shrink-0 text-blue-600" /> Pipeline Πωλήσεων</span>
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

      {/* Objection handling templates */}
      <ObjectionTemplates />

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
          <div className="text-sm font-black text-blue-800 mb-3 flex items-center gap-1.5"><BanknotesIcon className="w-4 h-4 shrink-0" /> Οικονομική Προσφορά</div>
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
          {caseData.commercial_offer?.winback_status === 'sent' && (
            <div className="mt-3 pt-3 border-t border-blue-200">
              <div className="flex items-center gap-2 text-xs font-bold text-violet-700 mb-1">
                <span>💎 Εστάλη Ειδική Τιμή Win-back</span>
              </div>
              <div className="flex gap-6 text-xs text-gray-600">
                <span>Αίτηση: <strong className="text-violet-700">{Number(caseData.commercial_offer.winback_app || 0).toLocaleString('el-GR')} €</strong></span>
                <span>Success fee: <strong className="text-violet-700">{Number(caseData.commercial_offer.winback_suc || 0).toLocaleString('el-GR')} €</strong></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Estimated results */}
      <h2 className="section-title flex items-center gap-2"><ChartBarIcon className="w-5 h-5 text-blue-600 shrink-0" /> Εκτιμώμενα Αποτελέσματα</h2>
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
      <h2 className="section-title flex items-center gap-2"><ClipboardDocumentCheckIcon className="w-5 h-5 text-blue-600 shrink-0" /> Πραγματικά Αποτελέσματα Ρύθμισης</h2>
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
                  <th className="th">Απόσυρση</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {actuals.creditors.flatMap((c, i) => {
                  const hasSub = (c.subRows || []).length > 0
                  const hasStep = (c.stepRows || []).length > 0
                  const setCreditor = (patch) => {
                    const updated = [...actuals.creditors]
                    updated[i] = { ...updated[i], ...patch }
                    setActuals({ ...actuals, creditors: updated })
                  }
                  const addStepRow = () => {
                    const sr = c.stepRows || []
                    const newSr = [...sr, { label: autoStepLabel(sr), monthlyPay: 0, months: 12 }]
                    const updated = [...actuals.creditors]
                    updated[i] = recomputeFromStepRows({ ...c, stepRows: newSr })
                    setActuals({ ...actuals, creditors: updated })
                  }
                  const initStepRows = () => {
                    const first = { label: 'Για το 1ο έτος', monthlyPay: c.actualMonthlyPay || 0, months: c.actualMonths || 12 }
                    const updated = [...actuals.creditors]
                    updated[i] = recomputeFromStepRows({ ...c, stepRows: [first] })
                    setActuals({ ...actuals, creditors: updated })
                  }
                  const removeStepRow = (j) => {
                    const newSr = (c.stepRows || []).filter((_, k) => k !== j)
                    const updated = [...actuals.creditors]
                    updated[i] = recomputeFromStepRows({ ...c, stepRows: newSr })
                    setActuals({ ...actuals, creditors: updated })
                  }
                  const updateStepRow = (j, patch) => {
                    const newSr = (c.stepRows || []).map((s, k) => k === j ? { ...s, ...patch } : s)
                    const updated = [...actuals.creditors]
                    updated[i] = recomputeFromStepRows({ ...c, stepRows: newSr })
                    setActuals({ ...actuals, creditors: updated })
                  }
                  const clearStepRows = () => {
                    const updated = [...actuals.creditors]
                    updated[i] = { ...c, stepRows: [] }
                    setActuals({ ...actuals, creditors: updated })
                  }
                  const addSubRow = () => {
                    const sr = c.subRows || []
                    if (sr.length >= 10) return
                    let newSr
                    if (sr.length === 0) {
                      // migrate existing parent data into first sub-row
                      newSr = [
                        { label: 'Μέρος 1', actualWriteoff: c.actualWriteoff, actualRemaining: c.actualRemaining, actualMonthlyPay: c.actualMonthlyPay, actualMonths: c.actualMonths, rfCode: c.rfCode, notes: c.notes },
                        emptySubRow(2),
                      ]
                    } else {
                      newSr = [...sr, emptySubRow(sr.length + 1)]
                    }
                    const updated = [...actuals.creditors]
                    updated[i] = recomputeParentFromSubRows({ ...c, subRows: newSr })
                    setActuals({ ...actuals, creditors: updated })
                  }
                  const removeSubRow = (j) => {
                    const newSr = (c.subRows || []).filter((_, k) => k !== j)
                    const updated = [...actuals.creditors]
                    updated[i] = recomputeParentFromSubRows({ ...c, subRows: newSr })
                    setActuals({ ...actuals, creditors: updated })
                  }
                  const updateSubRow = (j, patch) => {
                    const newSr = (c.subRows || []).map((s, k) => k === j ? { ...s, ...patch } : s)
                    const updated = [...actuals.creditors]
                    updated[i] = recomputeParentFromSubRows({ ...c, subRows: newSr })
                    setActuals({ ...actuals, creditors: updated })
                  }
                  const mergeSubRows = () => {
                    const updated = [...actuals.creditors]
                    updated[i] = { ...c, subRows: [] }
                    setActuals({ ...actuals, creditors: updated })
                  }

                  const rows = []

                  // ── Parent row ──
                  const isWithdrawn = !!c.withdrawn
                  rows.push(
                    <tr key={`c-${i}`} className={`border-b border-gray-100 ${isWithdrawn ? 'bg-red-50/60 opacity-70' : hasSub ? 'bg-gray-50' : hasStep ? 'bg-indigo-50/30' : ''}`}>
                      <td className="td text-left font-semibold text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          {c.creditor}
                          {hasSub && <span className="text-xs font-normal text-gray-400">(×{c.subRows.length})</span>}
                          {hasStep && <span className="text-xs font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">≡ {c.stepRows.length} βήματα</span>}
                          {isWithdrawn && <span className="text-xs font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">Απεσύρθη</span>}
                        </div>
                      </td>
                      <td className="td font-mono text-sm text-gray-500">{fmt(c.originalAmount)}</td>
                      {isWithdrawn ? (
                        <td className="td text-center text-xs text-gray-400 italic" colSpan={6}>Δεν συμμετείχε στον εξωδικαστικό</td>
                      ) : hasSub ? (
                        <>
                          <td className="td text-center text-sm font-mono text-orange-600">{fmt(c.actualWriteoff)}</td>
                          <td className="td text-center text-sm font-mono">{fmt(c.actualRemaining)}</td>
                          <td className="td text-center text-sm font-mono text-blue-800">{fmtDec2(c.actualMonthlyPay)}</td>
                          <td className="td text-center text-xs text-gray-400" colSpan={3}>βλ. μέρη ↓</td>
                        </>
                      ) : (
                        <>
                          <td className="td min-w-[120px]"><MoneyCell value={c.actualWriteoff} onChange={(v) => setCreditor({ actualWriteoff: v })} /></td>
                          <td className="td min-w-[120px]"><MoneyCell value={c.actualRemaining} onChange={(v) => setCreditor({ actualRemaining: v })} /></td>
                          {hasStep ? (
                            <>
                              <td className="td text-center text-xs text-indigo-600 font-semibold">{fmtDec2(c.stepRows[0]?.monthlyPay || 0)}<span className="block text-gray-400 font-normal">βήμα 1↓</span></td>
                              <td className="td text-center text-xs text-gray-500">{c.actualMonths || 0} μήν.</td>
                            </>
                          ) : (
                            <>
                              <td className="td min-w-[110px]"><MoneyCellDec value={c.actualMonthlyPay} onChange={(v) => setCreditor({ actualMonthlyPay: v })} /></td>
                              <td className="td min-w-[90px]">
                                <input type="number" min="0" max="600" className="input text-center text-sm" placeholder="0"
                                  value={c.actualMonths || ''}
                                  onChange={(e) => setCreditor({ actualMonths: +e.target.value })} />
                              </td>
                            </>
                          )}
                          <td className="td min-w-[120px]">
                            <input type="text" className="input text-sm" placeholder="RF123..."
                              value={c.rfCode || ''}
                              onChange={(e) => setCreditor({ rfCode: e.target.value })} />
                          </td>
                          <td className="td min-w-[160px]">
                            <input type="text" className="input text-sm" placeholder="Σημείωση..."
                              value={c.notes || ''}
                              onChange={(e) => setCreditor({ notes: e.target.value })} />
                          </td>
                        </>
                      )}
                      <td className="td text-center">
                        <button
                          onClick={() => setCreditor({ withdrawn: !isWithdrawn, actualWriteoff: 0, actualRemaining: 0, actualMonthlyPay: 0, actualMonths: 0, rfCode: '', notes: '', subRows: [], stepRows: [] })}
                          title={isWithdrawn ? 'Επαναφορά ως ενεργό' : 'Σήμανση ως αποσύρθηκε από εξωδικαστικό'}
                          className={`text-xs font-bold px-2 py-0.5 rounded border transition-all ${isWithdrawn ? 'bg-red-100 text-red-600 border-red-300 hover:bg-red-200' : 'text-gray-400 border-gray-200 hover:text-red-500 hover:border-red-300 hover:bg-red-50'}`}
                        >
                          {isWithdrawn ? '✕ Απεσύρθη' : '✕'}
                        </button>
                      </td>
                      <td className="td text-center">
                        {!isWithdrawn && !hasStep && (hasSub ? (
                          <button onClick={mergeSubRows} title="Ενοποίηση" className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded border border-gray-300 hover:border-gray-400">⊞</button>
                        ) : (
                          <div className="flex gap-1 justify-center">
                            <button onClick={addSubRow} title="Διαίρεση σε μέρη" className="text-xs text-blue-500 hover:text-blue-700 px-1.5 py-0.5 rounded border border-blue-300 hover:border-blue-500">+</button>
                            <button onClick={initStepRows} title="Προσθήκη step δόσεων" className="text-xs text-indigo-500 hover:text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-300 hover:border-indigo-500">≡</button>
                          </div>
                        ))}
                        {!isWithdrawn && hasStep && (
                          <button onClick={clearStepRows} title="Κατάργηση step δόσεων" className="text-xs text-indigo-400 hover:text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-200 hover:border-indigo-400">⊟</button>
                        )}
                      </td>
                    </tr>
                  )

                  // ── Step rows ──
                  if (hasStep) {
                    ;(c.stepRows || []).forEach((s, j) => {
                      const autoLabel = renderStepLabel(c.stepRows, j)
                      rows.push(
                        <tr key={`c-${i}-step-${j}`} className="border-b border-indigo-100 bg-indigo-50/50">
                          <td className="td pl-6 min-w-[180px]">
                            <div className="flex items-center gap-1 text-xs text-indigo-700">
                              <span className="text-indigo-300 mr-0.5">↳</span>
                              <input
                                type="text"
                                className="input text-xs py-0.5 px-1.5 flex-1 min-w-[120px] font-semibold text-indigo-800 bg-white border-indigo-200"
                                value={s.label || autoLabel}
                                placeholder={autoLabel}
                                onChange={(e) => updateStepRow(j, { label: e.target.value })}
                              />
                            </div>
                          </td>
                          <td className="td text-center text-xs text-gray-300">—</td>
                          <td className="td text-center text-xs text-gray-300">—</td>
                          <td className="td text-center text-xs text-gray-300">—</td>
                          <td className="td min-w-[110px]"><MoneyCellDec value={s.monthlyPay} onChange={(v) => updateStepRow(j, { monthlyPay: v })} /></td>
                          <td className="td min-w-[90px]">
                            <input type="number" min="1" max="600" className="input text-center text-sm" placeholder="μήνες"
                              value={s.months || ''}
                              onChange={(e) => updateStepRow(j, { months: +e.target.value })} />
                          </td>
                          <td className="td text-center text-xs text-indigo-400">{s.months ? `${Math.round(s.months/12*10)/10} έτη` : '—'}</td>
                          <td className="td text-center text-xs text-gray-300">—</td>
                          <td className="td text-center" colSpan={2}>
                            <button onClick={() => removeStepRow(j)} title="Διαγραφή βήματος" className="text-red-400 hover:text-red-600 font-bold text-sm leading-none">✕</button>
                          </td>
                        </tr>
                      )
                    })
                    rows.push(
                      <tr key={`c-${i}-step-add`} className="border-b border-indigo-50">
                        <td colSpan={10} className="td py-1 pl-8">
                          <button onClick={addStepRow} className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold">+ Προσθήκη βήματος</button>
                        </td>
                      </tr>
                    )
                  }

                  // ── Sub-rows ──
                  ;(c.subRows || []).forEach((s, j) => {
                    rows.push(
                      <tr key={`c-${i}-s-${j}`} className="border-b border-blue-50 bg-blue-50/40">
                        <td className="td pl-6 min-w-[130px]">
                          <div className="flex items-center gap-1 text-xs text-blue-700">
                            <span className="text-gray-300 mr-0.5">↳</span>
                            <input type="text" className="input text-xs py-0.5 px-1.5 w-20 font-semibold text-blue-800 bg-white border-blue-200"
                              value={s.label || ''}
                              onChange={(e) => updateSubRow(j, { label: e.target.value })} />
                          </div>
                        </td>
                        <td className="td text-center text-xs text-gray-300">—</td>
                        <td className="td min-w-[120px]"><MoneyCell value={s.actualWriteoff} onChange={(v) => updateSubRow(j, { actualWriteoff: v })} /></td>
                        <td className="td min-w-[120px]"><MoneyCell value={s.actualRemaining} onChange={(v) => updateSubRow(j, { actualRemaining: v })} /></td>
                        <td className="td min-w-[110px]"><MoneyCellDec value={s.actualMonthlyPay} onChange={(v) => updateSubRow(j, { actualMonthlyPay: v })} /></td>
                        <td className="td min-w-[90px]">
                          <input type="number" min="0" max="600" className="input text-center text-sm" placeholder="0"
                            value={s.actualMonths || ''}
                            onChange={(e) => updateSubRow(j, { actualMonths: +e.target.value })} />
                        </td>
                        <td className="td min-w-[120px]">
                          <input type="text" className="input text-sm" placeholder="RF123..."
                            value={s.rfCode || ''}
                            onChange={(e) => updateSubRow(j, { rfCode: e.target.value })} />
                        </td>
                        <td className="td min-w-[160px]">
                          <input type="text" className="input text-sm" placeholder="Σημείωση..."
                            value={s.notes || ''}
                            onChange={(e) => updateSubRow(j, { notes: e.target.value })} />
                        </td>
                        <td className="td text-center">
                          <button onClick={() => removeSubRow(j)} title="Διαγραφή μέρους" className="text-red-400 hover:text-red-600 font-bold text-sm leading-none">✕</button>
                        </td>
                      </tr>
                    )
                  })

                  // ── Add sub-row button ──
                  if (hasSub && c.subRows.length < 10) {
                    rows.push(
                      <tr key={`c-${i}-add`} className="border-b border-blue-50">
                        <td colSpan={10} className="td py-1 pl-8">
                          <button onClick={addSubRow} className="text-xs text-blue-500 hover:text-blue-700 font-semibold">+ Προσθήκη μέρους</button>
                        </td>
                      </tr>
                    )
                  }

                  return rows
                })}
                {/* Totals row — excluding withdrawn */}
                {(() => {
                  const active = actuals.creditors.filter(c => !c.withdrawn)
                  const withdrawn = actuals.creditors.filter(c => c.withdrawn)
                  return (
                    <>
                      <tr className="bg-blue-50 font-bold text-sm border-t-2 border-blue-200">
                        <td className="td text-left">
                          ΣΥΝΟΛΟ
                          {withdrawn.length > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400">(χωρίς αποσύρσεις)</span>}
                        </td>
                        <td className="td font-mono">{fmt(active.reduce((s, c) => s + (c.originalAmount || 0), 0))}</td>
                        <td className="td font-mono text-orange-600">{fmt(active.reduce((s, c) => s + (c.actualWriteoff || 0), 0))}</td>
                        <td className="td font-mono">{fmt(active.reduce((s, c) => s + (c.actualRemaining || 0), 0))}</td>
                        <td className="td font-mono text-blue-800">{fmtDec2(active.reduce((s, c) => s + (c.actualMonthlyPay || 0), 0))}</td>
                        <td className="td" colSpan={5}></td>
                      </tr>
                      {withdrawn.length > 0 && (
                        <tr className="bg-red-50 text-xs border-t border-red-100">
                          <td className="td text-left text-red-500 font-semibold" colSpan={2}>
                            Αποσύρθηκαν ({withdrawn.length}): {withdrawn.map(c => c.creditor).join(', ')}
                          </td>
                          <td className="td font-mono text-red-400">{fmt(withdrawn.reduce((s, c) => s + (c.originalAmount || 0), 0))}</td>
                          <td className="td text-center text-red-300" colSpan={7}>—</td>
                        </tr>
                      )}
                    </>
                  )
                })()}
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
          <h2 className="section-title flex items-center gap-2"><ChartBarSquareIcon className="w-5 h-5 text-blue-600 shrink-0" /> Σύγκριση Εκτίμησης vs Πραγματικού</h2>
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
                  // Exclude withdrawn creditors from both sides of the comparison
                  const withdrawnNames = new Set(act.creditors.filter(c => c.withdrawn).map(c => c.creditor))
                  const activeActuals = act.creditors.filter(c => !c.withdrawn)
                  const activePlan = (finalPlan || []).filter(p => !withdrawnNames.has(creditorDisplayName(p.type, p.creditorName)))
                  const actWriteoff = activeActuals.reduce((s, c) => s + (c.actualWriteoff || 0), 0)
                  const actRemaining = activeActuals.reduce((s, c) => s + (c.actualRemaining || 0), 0)
                  const actMonthly = activeActuals.reduce((s, c) => s + (c.actualMonthlyPay || 0), 0)
                  const estWriteoff = activePlan.reduce((s, p) => s + (p.writeoff || 0), 0)
                  const estRemaining = activePlan.reduce((s, p) => s + (p.newAmt || 0), 0)
                  const estMonthly = activePlan.reduce((s, p) => s + (p.payShown || 0), 0)
                  const hasWithdrawn = withdrawnNames.size > 0
                  return [
                    { label: 'Διαγραφή', estVal: hasWithdrawn ? estWriteoff : est.sumWr, actVal: actWriteoff },
                    { label: 'Εναπομένουσα Οφειλή', estVal: hasWithdrawn ? estRemaining : est.totalRemaining, actVal: actRemaining },
                    { label: 'Μηνιαία Δόση', estVal: hasWithdrawn ? estMonthly : est.totalMonthlyPay, actVal: actMonthly, isDec: true },
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
            {act.creditors.some(c => c.withdrawn) && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-xs text-red-600">
                ⚠️ Η σύγκριση αφορά μόνο τους πιστωτές που συμμετείχαν στον εξωδικαστικό. Εξαιρούνται: {act.creditors.filter(c => c.withdrawn).map(c => c.creditor).join(', ')}.
              </div>
            )}
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
