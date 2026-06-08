import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ArrowLeftIcon, DocumentTextIcon, CloudArrowUpIcon, SparklesIcon, CheckCircleIcon, ExclamationTriangleIcon, BanknotesIcon, ClipboardDocumentListIcon, CalculatorIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import { computeOffer, loadPricingConfig, scoreBreakdown, DEFAULT_PRICING_CONFIG } from '../utils/pricing'
import { patchOffer, notifyPricingApproval } from '../api'
import DebtTable, { emptyDebt } from '../components/DebtTable'
import IncomePanel from '../components/IncomePanel'
import ResultsPanel from '../components/ResultsPanel'
import PlanParamsModal from '../components/PlanParamsModal'
import * as api from '../api'
import { calculateAll, creditorDisplayName, fmt, buildForecastText } from '../utils/calculations'
import { PARAMS_B } from '../utils/calculationParams'
import { buildPlanHtml, wrapPlanDocument } from '../utils/reportGenerators'

const EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA', 'HARIS']

const STATUS_OPTIONS = [
  { value: 'draft',     label: 'Άντληση Στοιχείων' },
  { value: 'submitted', label: 'Οριστικοποίηση Αίτησης' },
  { value: 'in_review', label: 'Πρόταση Ρύθμισης' },
  { value: 'completed', label: 'Αποδοχή Ρύθμισης' },
  { value: 'cancelled', label: 'Απορρίψη Ρύθμισης' },
]

function defaultIncome() {
  return {
    debtorType: 'Φυσικό Πρόσωπο',
    // FP sub-type — 'Μισθωτός' | 'Επιτηδευματίας'
    fpSubType: 'Μισθωτός',
    spouseIncome: 0,
    // FP income — 3-year net income: Μισθωτός (Ε1 εκκαθαριστικό) / Επιτηδευματίας (ΕΓΔΙΧ ατομικό εισόδημα)
    fp_income_t1: 0, fp_income_t2: 0, fp_income_t3: 0,
    // FP Επιτηδευματίας: KE 3-year (T used for floor check) — from ΕΓΔΙΧ
    fp_ke_t1: 0, fp_ke_t2: 0, fp_ke_t3: 0,
    debtorAge: 0,
    householdValue: 0,
    householdSize: 1,
    enfiaCost: 0,
    medicalCost: 0,
    rentCost: 0,
    studentRentCost: 0,
    extraLivingCost: 0,
    alimonyCost: 0,
    savings: 0,
    // legacy single-year field (backward compat)
    annualIncome: 0,
    // LE fields — 3-year data (ΚΥΑ 7712925/2025)
    ke_t1: 0, ke_t2: 0, ke_t3: 0,
    kerdh_t1: null, kerdh_t2: null, kerdh_t3: null,
    leEnfia: 0,
    deposits: 0,
    investments: 0,
    // legacy fields kept for backward compat with old cases
    turnover: 0,
    netProfits: null,
    ebitda: 0,
    // Vulnerable debtor — Άρθρο 66 ν. 5072/2023
    isVulnerable: false,
  }
}

function collectPlanData(debts, assets, income, calc, client) {
  const grouped = {}
  ;(calc.finalPlan || []).forEach((p) => {
    const name = creditorDisplayName(p.type, p.creditorName)
    if (!grouped[name]) {
      grouped[name] = { creditor: name, type: p.type, amount: 0, writeoff: 0, remaining: 0, months: 0, monthlyPay: 0, c1: 0, c2: 0, writeoffC: 0, remainingC: 0, c1C: 0, c2C: 0 }
    }
    const g = grouped[name]
    g.amount += p.amount
    g.writeoff += p.writeoff || 0
    g.remaining += p.newAmt || 0
    g.months = Math.max(g.months, p.months || 0)
    g.monthlyPay += p.payShown || 0
    g.c1 += p.c1 ?? p.payShown ?? 0
    g.c2 += p.c2 ?? p.payShown ?? 0
    g.writeoffC += p.writeoffC ?? p.writeoff ?? 0
    g.remainingC += p.newAmtC ?? p.newAmt ?? 0
    g.c1C += p.c1C ?? p.c1 ?? p.payShown ?? 0
    g.c2C += p.c2C ?? p.c2 ?? p.payShown ?? 0
  })

  const creditors = Object.values(grouped)
  const rows = calc.rows || []
  const mortgagedProperties = rows.filter((r) => r.mort && r.prop > 0).map((r, i) => ({
    label: `Ενυπόθηκο ακίνητο ${i + 1} (${creditorDisplayName(r.type, r.creditorName)})`,
    type: 'Ενυπόθηκο Ακίνητο',
    value: r.prop,
  }))
  const otherProps = (assets || []).filter((a) => a.value > 0).map((a) => ({
    label: a.description || a.type,
    type: a.type,
    value: a.value,
  }))
  const realEstateAssets = [...mortgagedProperties, ...otherProps]
  const totalRealEstateValue = realEstateAssets.reduce((a, x) => a + x.value, 0)

  const householdLabel = (() => {
    const opts = [
      [6448,'Ένας ενήλικας'],[10866,'Δύο ενήλικες'],[9096,'Ένας ενήλικας με 1 τέκνο'],
      [13514,'Δύο ενήλικες με 1 τέκνο'],[16162,'Δύο ενήλικες με 2 τέκνα'],
      [18659,'Δύο ενήλικες με 2 τέκνα + εξαρτ.'],[18810,'Δύο ενήλικες με 3 τέκνα'],
      [21307,'Δύο ενήλικες με 3 τέκνα + εξαρτ.'],[21458,'Δύο ενήλικες με 4 τέκνα'],
    ]
    const found = opts.find((o) => o[0] === income.householdValue)
    return found ? found[1] : '—'
  })()

  const bankDebt = rows.filter((r) => r.type === 'Τράπεζα').reduce((a, r) => a + r.amount, 0)
  const taxDebt = rows.filter((r) => r.type === 'Εφορία').reduce((a, r) => a + r.amount, 0)
  const insDebt = rows.filter((r) => r.type === 'Ασφαλιστικά Ταμεία').reduce((a, r) => a + r.amount, 0)
  const nonErasableTotal = debts.reduce((s, d) => s + (d.pubCategories?.nonErasableBasic || 0), 0)

  return {
    clientName: client.name || '—',
    clientPhone: client.phone || '—',
    clientEmail: client.email || '—',
    debtorType: income.debtorType,
    annualIncome: calc.annualIncome || income.annualIncome || 0,
    totalExpenses: calc.totalExpenses || 0,
    incomeData: income,
    householdValue: income.householdValue || 0,
    householdLabel,
    enfia: income.enfiaCost || 0,
    medical: income.medicalCost || 0,
    rent: income.rentCost || 0,
    studentRent: income.studentRentCost || 0,
    extraLiving: income.extraLivingCost || 0,
    alimony: income.alimonyCost || 0,
    dispAnnual: calc.dispAnnual || 0,
    dispMonthly: calc.dispMonthly || 0,
    isVulnerable: !!(income.isVulnerable) && income.debtorType !== 'Νομικό Πρόσωπο',
    creditors,
    totalDebt: calc.sumDebt || 0,
    totalWriteOff: calc.sumWr || 0,
    totalRemaining: calc.totalRemaining || 0,
    totalMonthlyPay: calc.totalMonthlyPay || 0,
    totalWriteOffC: calc.sumWrC,
    totalRemainingC: calc.totalRemainingC,
    totalMonthlyPayC: calc.totalMonthlyPayC,
    totalC1: calc.totalC1,
    totalC1C: calc.totalC1C,
    realEstateAssets,
    totalRealEstateValue,
    bankDebt,
    taxDebt,
    insDebt,
    nonErasableTotal,
  }
}

export default function CaseForm({ currentEmployee }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(id)

  const [debts, setDebts] = useState([emptyDebt()])
  const [assets, setAssets] = useState([])
  const [income, setIncome] = useState(defaultIncome())
  const [client, setClient] = useState({ name: '', phone: '', email: '', vat: '' })
  const [employee, setEmployee] = useState(currentEmployee || '')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('draft')
  const [commercialOffer, setCommercialOffer] = useState({ application_fee: 0, success_fee: 0 })
  const [calc, setCalc] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showPlanModal, setShowPlanModal] = useState(false)

  // Load existing case
  useEffect(() => {
    if (!isEditing) return
    api.getCase(id).then((res) => {
      const c = res.data
      setDebts(c.debts?.length ? c.debts : [emptyDebt()])
      setAssets(c.assets || [])
      setIncome(c.income_data || defaultIncome())
      setClient({ name: c.client_name, phone: c.client_phone, email: c.client_email, vat: c.client_vat || '' })
      setEmployee(c.employee)
      setNotes(c.notes || '')
      setStatus(c.status)
      if (c.commercial_offer) setCommercialOffer(c.commercial_offer)
    }).catch(() => toast.error('Σφάλμα φόρτωσης υπόθεσης'))
  }, [id])

  // Recalculate on every input change
  useEffect(() => {
    const validDebts = debts.filter((d) => d.amount > 0)
    if (validDebts.length > 0) {
      const cfg = loadPricingConfig()
      setCalc(calculateAll(debts, assets, income, { ...PARAMS_B, writeoffCapPct: cfg.writeoffCapPct ?? 70 }))
    } else {
      setCalc(null)
    }
  }, [debts, assets, income])

  const handleSave = async () => {
    if (!client.name.trim()) return toast.error('Εισάγετε όνομα πελάτη')
    if (!employee) return toast.error('Επιλέξτε υπάλληλο')
    setSaving(true)
    try {
      const payload = {
        client_name: client.name,
        client_phone: client.phone,
        client_email: client.email,
        client_vat: client.vat || null,
        employee,
        status,
        debtor_type: income.debtorType,
        debts,
        assets,
        income_data: income,
        estimates: calc ? (() => {
          const forecast = buildForecastText(calc, income)
          return {
            sumDebt: calc.sumDebt,
            sumWr: calc.sumWr,
            sumWrPct: calc.sumWrPct,
            sumWrC: calc.sumWrC,
            totalRemaining: calc.totalRemaining,
            totalRemainingC: calc.totalRemainingC,
            totalMonthlyPay: calc.totalMonthlyPay,
            totalMonthlyPayC: calc.totalMonthlyPayC,
            totalC1: calc.totalC1,
            totalC1C: calc.totalC1C,
            dispMonthly: calc.dispMonthly,
            dispAnnual: calc.dispAnnual,
            ratio: calc.ratio,
            scenario: calc.scenario,
            finalPlan: calc.finalPlan,
            sumAssetsAfterExp: calc.sumAssetsAfterExp,
            isFullCoveredByAssets: calc.isFullCoveredByAssets,
            isPartialCoveredByAssets: calc.isPartialCoveredByAssets,
            annualIncome: calc.annualIncome,
            totalExpenses: calc.totalExpenses,
            rows: calc.rows,
            nonErasableTotal: debts.reduce((s, d) => s + (d.pubCategories?.nonErasableBasic || 0), 0),
            forecastTitle: forecast?.title || null,
            forecastSections: forecast?.sections || null,
          }
        })() : {},
        notes,
        commercial_offer: commercialOffer,
      }
      if (isEditing) {
        await api.updateCase(id, payload)
        toast.success('Αποθηκεύτηκε ✓')
      } else {
        const res = await api.createCase(payload)
        toast.success('Η υπόθεση δημιουργήθηκε ✓')
        navigate(`/cases/${res.data.id}`)
      }
    } catch { toast.error('Σφάλμα αποθήκευσης') }
    finally { setSaving(false) }
  }

  const openPlan = () => {
    if (!calc || calc.sumDebt === 0) return toast.error('Δεν υπάρχουν δεδομένα')
    setShowPlanModal(true)
  }

  const handleGeneratePlan = (customRows) => {
    setShowPlanModal(false)
    const data = collectPlanData(debts, assets, income, calc, client)
    const html = buildPlanHtml(data, customRows)
    const w = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes')
    if (w) { w.document.open(); w.document.write(wrapPlanDocument(html)); w.document.close() }
  }


  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {showPlanModal && calc && (
        <PlanParamsModal
          calc={calc}
          onGenerate={handleGeneratePlan}
          onClose={() => setShowPlanModal(false)}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-blue-800">
              {isEditing ? 'Επεξεργασία Υπόθεσης' : 'Νέα Υπόθεση Οφειλών'}
            </h1>
            <p className="text-gray-500 text-sm">🧮 Εισαγωγή Οφειλών & Θεωρητική Προσομοίωση</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {calc && calc.sumDebt > 0 && (
            <>
              <button onClick={openPlan} className="btn-secondary gap-2 text-sm">
                <DocumentTextIcon className="w-4 h-4" /> Σχέδιο Αναδιάρθρωσης
              </button>
            </>
          )}
          <button onClick={handleSave} disabled={saving} className="btn-primary gap-2">
            <CloudArrowUpIcon className="w-4 h-4" />
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </button>
        </div>
      </div>

      {/* Brand bar */}
      <div className="flex justify-between items-center bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 mb-5 text-sm text-blue-800">
        <b>i-Mentor Consulting</b>
        <span>www.i-mentor.gr • info@i-mentor.gr • 2810 363007</span>
      </div>

      {/* Case meta */}
      <div className="card mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="label">Ονοματεπώνυμο Πελάτη</label>
            <input className="input" placeholder="Ονοματεπώνυμο" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Τηλέφωνο</label>
            <input className="input" placeholder="Τηλέφωνο" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" placeholder="Email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} />
          </div>
          <div>
            <label className="label">ΑΦΜ Πελάτη <span className="text-gray-400 font-normal">(κλειδί πρόσβασης portal)</span></label>
            <input className="input font-mono" placeholder="9 ψηφία" maxLength={9} value={client.vat} onChange={(e) => setClient({ ...client, vat: e.target.value.replace(/\D/g, '') })} />
          </div>
          <div>
            <label className="label">Υπάλληλος</label>
            <select className="input" value={employee} onChange={(e) => setEmployee(e.target.value)}>
              <option value="">-- Επιλέξτε --</option>
              {EMPLOYEES.map((e) => <option key={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Κατάσταση Υπόθεσης</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="label">Σημειώσεις</label>
            <input className="input" placeholder="Εσωτερικές σημειώσεις…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Commercial Offer */}
      <h2 className="section-title flex items-center gap-2"><BanknotesIcon className="w-5 h-5 text-blue-600 shrink-0" /> Οικονομική Προσφορά</h2>
      <OfferSection
        debts={debts} assets={assets} income={income} setIncome={setIncome}
        commercialOffer={commercialOffer} setCommercialOffer={setCommercialOffer}
        caseId={isEditing ? id : null} employee={employee} calc={calc}
      />

      {/* Debts */}
      <h2 className="section-title flex items-center gap-2"><ClipboardDocumentListIcon className="w-5 h-5 text-blue-600 shrink-0" /> Οφειλές</h2>
      <div className="card mb-5">
        <DebtTable debts={debts} onChange={setDebts} calculations={calc} />
      </div>

      {/* Income & Assets */}
      <h2 className="section-title flex items-center gap-2"><CalculatorIcon className="w-5 h-5 text-blue-600 shrink-0" /> Παράμετροι Εισοδήματος & Περιουσία</h2>
      <div className="card mb-5">
        <IncomePanel income={income} onChange={setIncome} assets={assets} onAssetsChange={setAssets} />
      </div>

      {/* Income analysis block — FP only, shows ratio + 3-phase caps */}
      {calc && income.debtorType !== 'Νομικό Πρόσωπο' && calc.monthlyDisp1 !== undefined && (
        <div className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="font-bold text-indigo-800 mb-3 text-sm flex items-center gap-1.5"><ChartBarIcon className="w-4 h-4 shrink-0" /> ΑΝΑΛΥΣΗ ΕΙΣΟΔΗΜΑΤΟΣ — ΚΥΑ 67360 άρθρο 8Α §5</p>
          <div className="text-sm text-indigo-900 space-y-1 font-mono">
            <div className="flex justify-between">
              <span>Εισόδημα οφειλέτη (έτος Τ):</span>
              <span className="font-semibold">{fmt(calc.annualIncome)}/έτος</span>
            </div>
            {(income.spouseIncome || 0) > 0 && (
              <>
                <div className="flex justify-between">
                  <span>Εισόδημα συζύγου:</span>
                  <span className="font-semibold">{fmt(income.spouseIncome)}/έτος</span>
                </div>
                <div className="flex justify-between">
                  <span>Οικογενειακό εισόδημα:</span>
                  <span className="font-semibold">{fmt(calc.fpFamilyIncome)}/έτος</span>
                </div>
                <div className="flex justify-between text-indigo-600">
                  <span>Αναλογία οφειλέτη:</span>
                  <span>{((calc.fpRatio || 1) * 100).toFixed(1)}%</span>
                </div>
              </>
            )}
            <div className="border-t border-indigo-200 pt-1 mt-1">
              <div className="flex justify-between text-gray-600">
                <span>Σύνολο δαπανών (επιμερ. ΕΔΔ + λοιπά):</span>
                <span>{fmt(calc.totalExpenses)}/έτος</span>
              </div>
            </div>
            <div className="border-t border-indigo-200 pt-1 mt-1 space-y-0.5">
              <div className="flex justify-between font-semibold text-green-800">
                <span>Μηνιαίο διαθέσιμο — Έτος 1 (T×80%):</span>
                <span>{fmt(calc.monthlyDisp1)}/μήνα</span>
              </div>
              {income.fpSubType === 'Επιτηδευματίας' ? (
                <>
                  <div className="flex justify-between text-green-700">
                    <span>
                      Μηνιαίο διαθέσιμο — Έτη 2–4 (avg×65%):
                      {calc.monthlyDisp24 <= calc.monthlyDisp1 + 1 && (
                        <span className="ml-1 text-xs text-amber-600">→ ισχύει Έτος 1 (Year T &gt; avg2)</span>
                      )}
                    </span>
                    <span>
                      {calc.monthlyDisp24 <= calc.monthlyDisp1 + 1
                        ? <span className="text-amber-700">{fmt(calc.fpDispFromAvg * 0.65 / 12)} <span className="text-xs font-normal">(raw)</span> → {fmt(calc.monthlyDisp24)}</span>
                        : fmt(calc.monthlyDisp24)
                      }
                      /μήνα
                    </span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>
                      Μηνιαίο διαθέσιμο — Έτη 5+ (avg×100%):
                      {calc.monthlyDisp5 <= calc.monthlyDisp1 + 1 && (
                        <span className="ml-1 text-xs text-amber-600">→ ισχύει Έτος 1</span>
                      )}
                    </span>
                    <span>
                      {calc.monthlyDisp5 <= calc.monthlyDisp1 + 1
                        ? <span className="text-amber-700">{fmt(calc.fpDispFromAvg / 12)} <span className="text-xs font-normal">(raw)</span> → {fmt(calc.monthlyDisp5)}</span>
                        : fmt(calc.monthlyDisp5)
                      }
                      /μήνα
                    </span>
                  </div>
                  {calc.fpAvg2Income > 0 && (
                    <div className="flex justify-between text-xs text-indigo-500 pt-0.5">
                      <span>avg2_kpa — ΚΠΑ μέσος 2 υψηλ. ετών:</span>
                      <span>{fmt(calc.fpAvg2Income)}/έτος</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {calc.monthlyDisp24 > calc.monthlyDisp1 + 1 && (
                    <div className="flex justify-between text-green-700">
                      <span>Μηνιαίο διαθέσιμο — Έτη 2–4 (avg×65%):</span>
                      <span>{fmt(calc.monthlyDisp24)}/μήνα</span>
                    </div>
                  )}
                  {calc.monthlyDisp5 > calc.monthlyDisp1 + 1 && (
                    <div className="flex justify-between text-green-600">
                      <span>Μηνιαίο διαθέσιμο — Έτη 5+ (avg×100%):</span>
                      <span>{fmt(calc.monthlyDisp5)}/μήνα</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* flag_MAX_DOSES warning banner — ΦΕΚ Β' 2896/2021 §7.1/4 + ΚΥΑ 7712925/2025 */}
      {calc?.flagMaxDoses && (() => {
        const isFpSE = income.debtorType !== 'Νομικό Πρόσωπο' && income.fpSubType === 'Επιτηδευματίας'
        if (isFpSE && calc.fpEulogoNote) {
          return (
            <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 flex gap-3">
              <span className="text-xl shrink-0">⚡</span>
              <div>
                <p className="font-bold text-amber-800 mb-0.5">ΕΝΕΡΓΟΠΟΙΗΣΗ ΚΑΝΟΝΑ ΕΎΛΟΓΟΥ ΠΟΣΟΣΤΟΎ ΚΕΡΔΟΥΣ — ΚΥΑ 77697/2021 §7.1.4</p>
                <p className="text-sm text-amber-700">{calc.fpEulogoNote}</p>
              </div>
            </div>
          )
        }
        const lawRef = 'ΚΥΑ 7712925/2025'
        return (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 flex gap-3">
            <span className="text-xl shrink-0">⚡</span>
            <div>
              <p className="font-bold text-amber-800 mb-0.5">ΕΝΕΡΓΟΠΟΙΗΣΗ ΚΑΝΟΝΑ ΕΎΛΟΓΟΥ ΠΟΣΟΣΤΟΎ — {lawRef}</p>
              <p className="text-sm text-amber-700 mb-1">
                Το υπολογισθέν διαθέσιμο ({fmt(calc.leMoDispMonthly)}/μήνα) &lt; 10% × ΚΕ ({fmt(calc.leFloorMonthly)}/μήνα).
              </p>
              <ul className="text-sm text-amber-700 space-y-0.5">
                <li>→ Διαθέσιμο αναπροσαρμόζεται σε: <b>{fmt(calc.dispMonthly)}/μήνα</b></li>
                <li>→ Εφαρμόζεται <b>μέγιστος</b> αριθμός δόσεων: <b>240</b> για όλους τους πιστωτές</li>
                <li>→ Η δόση υπολογίζεται τοκοχρεωλυτικά για 240 μήνες</li>
              </ul>
            </div>
          </div>
        )
      })()}

      {/* Results */}
      {calc && calc.sumDebt > 0 && (
        <>
          <h2 className="section-title flex items-center gap-2"><ChartBarIcon className="w-5 h-5 text-blue-600 shrink-0" /> Αποτελέσματα Υπολογισμού</h2>
          <div className="card mb-5">
            <ResultsPanel calc={calc} incomeData={income} />
          </div>
        </>
      )}

      {/* Bottom save bar */}
      <div className="flex justify-end gap-3 mt-4 flex-wrap">
        {calc && calc.sumDebt > 0 && (
          <>
            <button onClick={openPlan} className="btn-secondary gap-2">
              <DocumentTextIcon className="w-4 h-4" /> Σχέδιο Αναδιάρθρωσης
            </button>
          </>
        )}
        <button onClick={handleSave} disabled={saving} className="btn-primary gap-2">
          <CloudArrowUpIcon className="w-4 h-4" />
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση Υπόθεσης'}
        </button>
      </div>
    </div>
  )
}

// ── OfferSection ──────────────────────────────────────────────────────────────

function OfferSection({ debts, assets, income, setIncome, commercialOffer, setCommercialOffer, caseId, employee, calc }) {
  const [cfg, setCfg] = useState(loadPricingConfig())
  useEffect(() => {
    api.getPricingConfig().then(res => {
      if (res.data && Object.keys(res.data).length > 0)
        setCfg({ ...DEFAULT_PRICING_CONFIG, ...res.data })
    }).catch(() => {})
  }, [])

  const writeoffPct = useMemo(() => {
    const sumDebt = calc?.sumDebt || 0
    const sumWr = calc?.sumWr || 0
    return sumDebt > 0 ? sumWr / sumDebt : 0
  }, [calc])

  const suggested = useMemo(
    () => computeOffer(debts, assets, income, cfg, writeoffPct),
    [debts, assets, income, cfg, writeoffPct],
  )

  const breakdown = useMemo(
    () => scoreBreakdown(debts, assets, income, cfg, writeoffPct),
    [debts, assets, income, cfg, writeoffPct],
  )

  const appFee = Number(commercialOffer.application_fee || 0)
  const sucFee = Number(commercialOffer.success_fee || 0)
  const approvalStatus = commercialOffer.approval_status

  const matchesSuggestion = appFee === suggested.application_fee && sucFee === suggested.success_fee
  const isApproved = approvalStatus === 'approved' || approvalStatus === 'auto'
  const isPending   = approvalStatus === 'pending'
  const hasCustomFee = appFee > 0 && !matchesSuggestion

  const applySuggestion = () => {
    setCommercialOffer({
      ...commercialOffer,
      application_fee: suggested.application_fee,
      success_fee: suggested.success_fee,
      system_app: suggested.application_fee,
      system_suc: suggested.success_fee,
      approval_status: 'auto',
    })
  }

  const [approvalReason, setApprovalReason] = useState('')

  const requestApproval = async () => {
    const updated = {
      ...commercialOffer,
      system_app: suggested.application_fee,
      system_suc: suggested.success_fee,
      approval_status: 'pending',
      approval_reason: approvalReason.trim(),
    }
    setCommercialOffer(updated)

    if (caseId) {
      try {
        await patchOffer(caseId, updated)
        await notifyPricingApproval(caseId, {
          employee: employee || '',
          proposed_app: appFee,
          proposed_suc: sucFee,
          system_app: suggested.application_fee,
          system_suc: suggested.success_fee,
          score: suggested._score,
          breakdown: breakdown.map(it => ({ label: it.label, value: it.value })),
          reason: approvalReason.trim(),
        })
        toast.success('Αίτηση έγκρισης εστάλη στον HARIS ✉️')
      } catch (e) {
        const detail = e?.response?.data?.detail || e?.message || ''
        toast.error(`Σφάλμα αποστολής email: ${detail}`)
      }
    } else {
      toast('Αποθηκεύστε την υπόθεση για να σταλεί η αίτηση έγκρισης στον HARIS', { icon: '📩' })
    }
  }

  const handleFeeChange = (field, val) => {
    const updated = { ...commercialOffer, [field]: +val }
    if (updated.approval_status === 'auto') updated.approval_status = undefined
    setCommercialOffer(updated)
  }

  return (
    <div className="card mb-5">
      {/* System suggestion row */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
        <div className="flex items-center gap-2 mb-2.5">
          <SparklesIcon className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Πρόταση Συστήματος</span>
          <span className="ml-1 text-xs text-blue-400">score {suggested._score}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-center">
            <div className="text-xs text-blue-500 mb-0.5">Αίτηση</div>
            <div className="text-xl font-black text-blue-800">{suggested.application_fee.toLocaleString('el-GR')} €</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-blue-500 mb-0.5">Success Fee</div>
            <div className="text-xl font-black text-blue-800">{suggested.success_fee.toLocaleString('el-GR')} €</div>
          </div>
          <div className="flex flex-wrap gap-1.5 flex-1">
            {breakdown.map((it, i) => (
              <span key={i} className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${
                it.auto ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-pink-100 text-pink-700 border-pink-200'
              }`}>
                {it.label} {it.value > 0 ? `+${it.value}` : it.value}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={applySuggestion}
            className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
          >
            Εφαρμογή
          </button>
        </div>
      </div>

      {/* Spouse toggle (only unknown factor) */}
      <div className="flex items-center gap-2 mb-4">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input type="checkbox" className="w-4 h-4 accent-blue-600"
            checked={income.withSpouse || false}
            onChange={e => setIncome({ ...income, withSpouse: e.target.checked })} />
          Σύζυγος / Συν-οφειλέτης
        </label>
        <span className="text-xs text-gray-400">(εγγυητές &amp; ακίνητα ανιχνεύονται αυτόματα)</span>
      </div>

      {/* Fee inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="label">Ποσό Αίτησης & Διαδικασίας <span className="text-gray-400 font-normal">(χωρίς ΦΠΑ)</span></label>
          <div className="flex items-center gap-2">
            <input
              className="input"
              type="number" min="0" placeholder="0"
              value={commercialOffer.application_fee || ''}
              onChange={e => handleFeeChange('application_fee', e.target.value)}
            />
            <span className="text-sm text-gray-500 whitespace-nowrap">€ + ΦΠΑ</span>
          </div>
        </div>
        <div>
          <label className="label">Success Fee <span className="text-gray-400 font-normal">(χωρίς ΦΠΑ)</span></label>
          <div className="flex items-center gap-2">
            <input
              className="input"
              type="number" min="0" placeholder="0"
              value={commercialOffer.success_fee || ''}
              onChange={e => handleFeeChange('success_fee', e.target.value)}
            />
            <span className="text-sm text-gray-500 whitespace-nowrap">€ + ΦΠΑ</span>
          </div>
        </div>
      </div>

      {/* Status badge */}
      {appFee > 0 && (
        matchesSuggestion ? (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircleIcon className="w-4 h-4 shrink-0" />
            Σύμφωνα με πρόταση συστήματος
          </div>
        ) : isPending ? (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
            Αναμένεται έγκριση HARIS
            {commercialOffer.system_app && (
              <span className="ml-auto text-xs text-amber-500">
                Σύστημα: {Number(commercialOffer.system_app).toLocaleString('el-GR')}€
              </span>
            )}
          </div>
        ) : isApproved && !matchesSuggestion ? (
          <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
            <CheckCircleIcon className="w-4 h-4 shrink-0" />
            Εγκεκριμένο ποσό από HARIS
          </div>
        ) : hasCustomFee ? (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
              Διαφέρει από πρόταση συστήματος ({suggested.application_fee.toLocaleString('el-GR')}€)
            </div>
            <textarea
              value={approvalReason}
              onChange={e => setApprovalReason(e.target.value)}
              placeholder="Αιτιολόγηση για τον HARIS (π.χ. ο πελάτης δεν μπορεί να πληρώσει περισσότερο)"
              rows={3}
              className="w-full text-sm text-gray-700 bg-white border border-amber-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-amber-300"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={requestApproval}
                className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white px-4 py-1.5 rounded-lg transition-colors"
              >
                Αποστολή Αίτησης Έγκρισης →
              </button>
            </div>
          </div>
        ) : null
      )}
    </div>
  )
}
