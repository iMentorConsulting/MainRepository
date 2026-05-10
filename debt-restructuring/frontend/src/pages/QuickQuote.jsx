import { useState, useMemo } from 'react'
import { fmt } from '../utils/calculations'

const HOUSEHOLD_OPTS = [
  { value: 6448,  label: 'Ένας ενήλικας' },
  { value: 10866, label: 'Δύο ενήλικες' },
  { value: 9096,  label: 'Ένας ενήλικας + 1 παιδί' },
  { value: 13514, label: 'Δύο ενήλικες + 1 παιδί' },
  { value: 16162, label: 'Δύο ενήλικες + 2 παιδιά' },
  { value: 18810, label: 'Δύο ενήλικες + 3 παιδιά' },
]

function numInput(val, set, label, prefix = '') {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{prefix}</span>}
        <input
          type="number" min="0"
          className={`input w-full ${prefix ? 'pl-8' : ''}`}
          value={val || ''}
          onChange={e => set(e.target.value ? Number(e.target.value) : 0)}
        />
      </div>
    </div>
  )
}

export default function QuickQuote() {
  const [debtorType, setDebtorType] = useState('fp') // fp | ep | np
  const [totalDebt, setTotalDebt] = useState(0)
  const [annualIncome, setAnnualIncome] = useState(0)
  const [householdIdx, setHouseholdIdx] = useState(0)
  const [hasProperty, setHasProperty] = useState(false)
  const [propertyValue, setPropertyValue] = useState(0)
  const [hasMortgage, setHasMortgage] = useState(false)
  const [debtComposition, setDebtComposition] = useState({ banks: 60, tax: 25, funds: 15 })

  const calc = useMemo(() => {
    if (!totalDebt || !annualIncome) return null

    const household = HOUSEHOLD_OPTS[householdIdx].value
    const disposable = Math.max(0, annualIncome - household) * 0.8
    const monthlyDisp = disposable / 12

    // Rough writeoff estimate based on debt composition
    const bankDebt = totalDebt * (debtComposition.banks / 100)
    const taxDebt = totalDebt * (debtComposition.tax / 100)
    const fundDebt = totalDebt * (debtComposition.funds / 100)

    // Rough rates (simplified — not legal calculation)
    let bankWr = bankDebt * 0.55
    let taxWr = taxDebt * 0.70
    let fundWr = fundDebt * 0.65

    // Adjust if property
    if (hasProperty && propertyValue > 0) {
      const liq = propertyValue * 0.7 * (hasMortgage ? 0.65 : 1.0)
      const assetCoverage = liq * 0.25
      bankWr = Math.max(bankWr - assetCoverage * 0.6, bankDebt * 0.25)
    }

    const totalWr = bankWr + taxWr + fundWr
    const remaining = Math.max(0, totalDebt - totalWr)
    const wrPct = Math.round((totalWr / totalDebt) * 100)

    // Monthly payment estimate (120–240 months typical)
    const months = Math.min(240, Math.max(60, Math.round(remaining / Math.max(monthlyDisp * 0.7, 1))))
    const monthlyPay = months > 0 ? remaining / months : 0

    return {
      disposable, monthlyDisp,
      totalWr, remaining, wrPct,
      months, monthlyPay,
      bankWr, taxWr, fundWr,
    }
  }, [totalDebt, annualIncome, householdIdx, hasProperty, propertyValue, hasMortgage, debtComposition])

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-blue-800">⚡ Γρήγορη Ανάλυση Τηλεφώνου</h1>
        <p className="text-gray-500 text-sm mt-1">Γρήγορη εκτίμηση κατά τη διάρκεια κλήσης — χωρίς αποθήκευση</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* LEFT: Inputs */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-bold text-gray-700 mb-3 text-sm">Βασικά Στοιχεία</h2>

            <div className="mb-3">
              <label className="label">Τύπος οφειλέτη</label>
              <div className="flex gap-2">
                {[['fp','Φυσικό Πρόσωπο'],['ep','Επιτηδευματίας'],['np','Νομικό Πρόσωπο']].map(([v,l]) => (
                  <button key={v} onClick={() => setDebtorType(v)}
                    className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors ${debtorType === v ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {numInput(totalDebt, setTotalDebt, 'Συνολική Οφειλή (€)', '€')}
            {numInput(annualIncome, setAnnualIncome, debtorType === 'np' ? 'Κύκλος Εργασιών / EBITDA (€)' : 'Ετήσιο Εισόδημα (€)', '€')}

            {debtorType !== 'np' && (
              <div>
                <label className="label">Σύνθεση νοικοκυριού</label>
                <select className="input w-full text-sm" value={householdIdx} onChange={e => setHouseholdIdx(Number(e.target.value))}>
                  {HOUSEHOLD_OPTS.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="font-bold text-gray-700 mb-3 text-sm">Σύνθεση Οφειλών (%)</h2>
            <div className="space-y-2">
              {[['banks','Τράπεζες/Funds'],['tax','ΑΑΔΕ'],['funds','ΕΦΚΑ']].map(([k,l]) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-28">{l}</span>
                  <input type="range" min="0" max="100" value={debtComposition[k]}
                    onChange={e => setDebtComposition(p => ({...p, [k]: Number(e.target.value)}))}
                    className="flex-1" />
                  <span className="text-xs font-bold text-gray-700 w-8 text-right">{debtComposition[k]}%</span>
                </div>
              ))}
              <div className={`text-xs text-right font-semibold ${(debtComposition.banks + debtComposition.tax + debtComposition.funds) !== 100 ? 'text-red-500' : 'text-green-600'}`}>
                Σύνολο: {debtComposition.banks + debtComposition.tax + debtComposition.funds}%
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="font-bold text-gray-700 mb-3 text-sm">Περιουσιακά Στοιχεία</h2>
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input type="checkbox" checked={hasProperty} onChange={e => setHasProperty(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              <span className="text-sm font-semibold text-gray-700">Υπάρχει ακίνητο;</span>
            </label>
            {hasProperty && (
              <div className="space-y-2 ml-6">
                {numInput(propertyValue, setPropertyValue, 'Αντικειμενική αξία (€)', '€')}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasMortgage} onChange={e => setHasMortgage(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-gray-700">Υπάρχει υποθήκη</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Results */}
        <div>
          {!calc ? (
            <div className="card text-center text-gray-400 py-16">
              <div className="text-4xl mb-3">💡</div>
              <div className="font-semibold">Συμπλήρωσε οφειλή + εισόδημα για εκτίμηση</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-blue-800 rounded-2xl p-5 text-white text-center">
                <div className="text-blue-200 text-xs font-semibold uppercase tracking-wider mb-1">ΓΡΗΓΟΡΗ ΕΚΤΙΜΗΣΗ</div>
                <div className="text-amber-300 text-xs font-bold mb-3 uppercase">Ενδεικτική — όχι νομικά δεσμευτική</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/10 rounded-xl p-3">
                    <div className="text-xs text-blue-200 mb-1">Εκτ. Διαγραφή</div>
                    <div className="text-xl font-black text-orange-300">{fmt(calc.totalWr)}</div>
                    <div className="text-xs text-orange-200">{calc.wrPct}%</div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-3">
                    <div className="text-xs text-blue-200 mb-1">Εναπομένουσα</div>
                    <div className="text-xl font-black text-green-300">{fmt(calc.remaining)}</div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-3">
                    <div className="text-xs text-blue-200 mb-1">Μηνιαία Δόση</div>
                    <div className="text-xl font-black text-green-200">{fmt(calc.monthlyPay)}</div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-3">
                    <div className="text-xs text-blue-200 mb-1">Διάρκεια</div>
                    <div className="text-xl font-black text-white">{calc.months} μήνες</div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="text-xs font-bold text-gray-500 mb-2 uppercase">Ανάλυση Διαγραφής</div>
                {[
                  ['Τράπεζες/Funds', calc.bankWr, totalDebt * debtComposition.banks / 100, 'text-blue-700'],
                  ['ΑΑΔΕ', calc.taxWr, totalDebt * debtComposition.tax / 100, 'text-orange-600'],
                  ['ΕΦΚΑ', calc.fundWr, totalDebt * debtComposition.funds / 100, 'text-purple-700'],
                ].map(([l, wr, debt, cls]) => debt > 0 ? (
                  <div key={l} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                    <span className="text-gray-600">{l}</span>
                    <span className={`font-semibold ${cls}`}>{fmt(wr)} <span className="text-xs text-gray-400">({Math.round(wr/debt*100)}%)</span></span>
                  </div>
                ) : null)}
              </div>

              <div className="card text-sm">
                <div className="text-xs font-bold text-gray-500 mb-2 uppercase">Εισοδηματική Εικόνα</div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Ετήσιο διαθέσιμο</span>
                  <span className="font-semibold">{fmt(calc.disposable)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Μηνιαίο διαθέσιμο</span>
                  <span className="font-semibold text-blue-700">{fmt(calc.monthlyDisp)}</span>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                ⚠️ Η εκτίμηση αυτή είναι <b>ενδεικτική</b> και βασίζεται σε απλοποιημένο αλγόριθμο. Για ακριβή ανάλυση, δημιούργησε πλήρη υπόθεση με όλα τα στοιχεία.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
