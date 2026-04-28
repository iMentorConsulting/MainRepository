import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ArrowLeftIcon, DocumentTextIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline'
import DebtTable, { emptyDebt } from '../components/DebtTable'
import IncomePanel from '../components/IncomePanel'
import ResultsPanel from '../components/ResultsPanel'
import PlanParamsModal from '../components/PlanParamsModal'
import * as api from '../api'
import { calculateAll, creditorDisplayName, fmt, buildForecastText } from '../utils/calculations'
import { buildPlanHtml, wrapPlanDocument } from '../utils/reportGenerators'

const EMPLOYEES = ['STELLA', 'VALLIA', 'SOFIA', 'HARIS']

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Πρόχειρο' },
  { value: 'submitted', label: 'Υποβλήθηκε' },
  { value: 'in_review', label: 'Υπό Εξέταση' },
  { value: 'completed', label: 'Ολοκληρώθηκε' },
  { value: 'cancelled', label: 'Ακυρώθηκε' },
]

function defaultIncome() {
  return {
    debtorType: 'Φυσικό Πρόσωπο',
    // FP fields
    annualIncome: 0,
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
    // LE fields
    turnover: 0,
    netProfits: null,
    leEnfia: 0,
    deposits: 0,
    // legacy fields kept for backward compat
    ebitda: 0,
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

  return {
    clientName: client.name || '—',
    clientPhone: client.phone || '—',
    clientEmail: client.email || '—',
    debtorType: income.debtorType,
    annualIncome: income.annualIncome || 0,
    totalExpenses: calc.totalExpenses || 0,
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
      setCalc(calculateAll(debts, assets, income))
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
            totalRemaining: calc.totalRemaining,
            totalMonthlyPay: calc.totalMonthlyPay,
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
      <h2 className="section-title">💼 Οικονομική Προσφορά</h2>
      <div className="card mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Ποσό Αίτησης & Διαδικασίας <span className="text-gray-400 font-normal">(χωρίς ΦΠΑ)</span></label>
            <div className="flex items-center gap-2">
              <input
                className="input"
                type="number"
                min="0"
                placeholder="0"
                value={commercialOffer.application_fee || ''}
                onChange={(e) => setCommercialOffer({ ...commercialOffer, application_fee: +e.target.value })}
              />
              <span className="text-sm text-gray-500 whitespace-nowrap">€ + ΦΠΑ</span>
            </div>
          </div>
          <div>
            <label className="label">Success Fee <span className="text-gray-400 font-normal">(σε αποδοχή αποτελέσματος, χωρίς ΦΠΑ)</span></label>
            <div className="flex items-center gap-2">
              <input
                className="input"
                type="number"
                min="0"
                placeholder="0"
                value={commercialOffer.success_fee || ''}
                onChange={(e) => setCommercialOffer({ ...commercialOffer, success_fee: +e.target.value })}
              />
              <span className="text-sm text-gray-500 whitespace-nowrap">€ + ΦΠΑ</span>
            </div>
          </div>
        </div>
      </div>

      {/* Debts */}
      <h2 className="section-title">📋 Οφειλές</h2>
      <div className="card mb-5">
        <DebtTable debts={debts} onChange={setDebts} calculations={calc} />
      </div>

      {/* Income & Assets */}
      <h2 className="section-title">🧾 Παράμετροι Εισοδήματος & Περιουσία</h2>
      <div className="card mb-5">
        <IncomePanel income={income} onChange={setIncome} assets={assets} onAssetsChange={setAssets} />
      </div>

      {/* Results */}
      {calc && calc.sumDebt > 0 && (
        <>
          <h2 className="section-title">📊 Αποτελέσματα Υπολογισμού</h2>
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
