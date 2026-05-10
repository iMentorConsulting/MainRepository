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
  const [debtComposition, setDebtComposition] = useState({ banks: 60, tax: 25, funds: 15 })
  // % of ΑΑΔΕ/ΕΦΚΑ balance that is surcharges/penalties (erasable); remainder is basic (non-erasable)
  const [taxSurchargePct, setTaxSurchargePct] = useState(50)
  const [fundSurchargePct, setFundSurchargePct] = useState(40)

  const calc = useMemo(() => {
    if (!totalDebt || !annualIncome) return null

    const household = debtorType !== 'np' ? HOUSEHOLD_OPTS[householdIdx].value : 0
    // ΚΥΑ 67360 Art.8A: ΜΔΑΧΟ = max(0, income − subsistence) × 80%
    const dispAnnual = Math.max(0, annualIncome - household) * 0.8
    const monthlyDisp = dispAnnual / 12

    if (monthlyDisp <= 0) return { noCapacity: true, disposable: 0, monthlyDisp: 0 }

    const bankDebt = totalDebt * (debtComposition.banks / 100)
    const taxDebt  = totalDebt * (debtComposition.tax / 100)
    const fundDebt = totalDebt * (debtComposition.funds / 100)

    // NWO floor (Art.8B / Art.977 ΚΠολΔ): banks receive at least liquidation value
    const liqValue = hasProperty && propertyValue > 0 ? propertyValue * 0.7 : 0

    const maxCapacity = monthlyDisp * 240 // 20-year max

    // Case A: income covers entire debt — no haircuts for anyone
    if (maxCapacity >= totalDebt) {
      const months = Math.min(240, Math.ceil(totalDebt / monthlyDisp))
      return {
        disposable: dispAnnual, monthlyDisp,
        taxWr: 0, fundWr: 0, bankWr: 0,
        totalWr: 0, remaining: totalDebt, wrPct: 0,
        months, monthlyPay: monthlyDisp,
        incomeCoversAll: true, feasible: true,
        assetLiqValue: liqValue,
      }
    }

    // Case B: income insufficient — apply haircuts by stage (Art.8B ν.4738/2020)
    // ΑΑΔΕ/ΕΦΚΑ: basic principal = 0% haircut; surcharges/penalties up to 85%
    const taxWr  = taxDebt  * (taxSurchargePct  / 100) * 0.85
    const fundWr = fundDebt * (fundSurchargePct / 100) * 0.85

    const stateRemaining = (taxDebt - taxWr) + (fundDebt - fundWr)

    // Banks: receive max(NWO floor, income capacity after state); writeoff capped by NWO
    let bankWr = 0
    if (bankDebt > 0) {
      const bankCapacity = Math.max(0, maxCapacity - stateRemaining)
      const bankReceives = Math.min(bankDebt, Math.max(liqValue, bankCapacity))
      bankWr = Math.min(
        Math.max(0, bankDebt - bankReceives),
        Math.max(0, bankDebt - liqValue) // NWO hard cap
      )
    }

    const totalWr = bankWr + taxWr + fundWr
    const remaining = Math.max(0, totalDebt - totalWr)
    const wrPct = totalDebt > 0 ? Math.round((totalWr / totalDebt) * 100) : 0

    // Monthly payment = full ΜΔΑΧΟ (income capacity, not remaining/months)
    const monthlyPay = monthlyDisp
    const months = Math.min(240, monthlyDisp > 0 ? Math.ceil(remaining / monthlyDisp) : 240)
    const feasible = maxCapacity >= remaining

    return {
      disposable: dispAnnual, monthlyDisp,
      totalWr, remaining, wrPct,
      months, monthlyPay,
      bankWr, taxWr, fundWr,
      assetLiqValue: liqValue,
      incomeCoversAll: false, feasible,
    }
  }, [totalDebt, annualIncome, householdIdx, hasProperty, propertyValue, debtComposition, debtorType, taxSurchargePct, fundSurchargePct])

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
            {(debtComposition.tax > 0 || debtComposition.funds > 0) && (
              <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
                <div className="text-xs font-bold text-gray-500 mb-1">% Προσαυξήσεων (διαγράψιμο μέρος)</div>
                {debtComposition.tax > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-28">ΑΑΔΕ προσαυξ.</span>
                    <input type="range" min="0" max="100" value={taxSurchargePct}
                      onChange={e => setTaxSurchargePct(Number(e.target.value))} className="flex-1" />
                    <span className="text-xs font-bold text-orange-600 w-8 text-right">{taxSurchargePct}%</span>
                  </div>
                )}
                {debtComposition.funds > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-28">ΕΦΚΑ προσαυξ.</span>
                    <input type="range" min="0" max="100" value={fundSurchargePct}
                      onChange={e => setFundSurchargePct(Number(e.target.value))} className="flex-1" />
                    <span className="text-xs font-bold text-purple-600 w-8 text-right">{fundSurchargePct}%</span>
                  </div>
                )}
                <div className="text-xs text-gray-400">Βασική οφειλή & εισφορές = μη διαγράψιμες</div>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="font-bold text-gray-700 mb-3 text-sm">Περιουσιακά Στοιχεία</h2>
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input type="checkbox" checked={hasProperty} onChange={e => setHasProperty(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              <span className="text-sm font-semibold text-gray-700">Υπάρχει ακίνητο;</span>
            </label>
            {hasProperty && (
              <div className="ml-6">
                {numInput(propertyValue, setPropertyValue, 'Αντικειμενική αξία (€)', '€')}
                <div className="text-xs text-gray-400 mt-1">Εκτίμηση ρευστοποίησης: ~70% αξίας (αρχή μη χειροτέρευσης)</div>
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
          ) : calc.noCapacity ? (
            <div className="card text-center text-red-500 py-12">
              <div className="text-3xl mb-2">⚠️</div>
              <div className="font-bold">Μηδενικό διαθέσιμο εισόδημα</div>
              <div className="text-sm text-gray-400 mt-1">Το εισόδημα δεν υπερβαίνει το όριο αξιοπρεπούς διαβίωσης.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {calc.incomeCoversAll ? (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-xs text-green-800 font-semibold">
                  ✅ Το εισόδημα επαρκεί για όλους τους πιστωτές — δεν απαιτείται καμία διαγραφή. Ρύθμιση σε {calc.months} μήνες.
                </div>
              ) : !calc.feasible ? (
                <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-2.5 text-xs text-red-800 font-semibold">
                  ⚠️ Μη βιώσιμη ρύθμιση: το εισόδημα δεν καλύπτει ακόμα και μετά τις μέγιστες διαγραφές. Απαιτείται πλήρης ανάλυση.
                </div>
              ) : null}
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
                    <div className="text-xs text-blue-300 mt-0.5">= ΜΔΑΧΟ</div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-3">
                    <div className="text-xs text-blue-200 mb-1">Διάρκεια</div>
                    <div className="text-xl font-black text-white">{calc.months} μήνες</div>
                    {calc.months === 240 && <div className="text-xs text-amber-300 mt-0.5">μέγιστη</div>}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="text-xs font-bold text-gray-500 mb-2 uppercase">Ανάλυση Διαγραφής</div>
                {[
                  ['Τράπεζες/Funds', calc.bankWr, totalDebt * debtComposition.banks / 100, 'text-blue-700', null],
                  ['ΑΑΔΕ', calc.taxWr, totalDebt * debtComposition.tax / 100, 'text-orange-600', `${taxSurchargePct}% προσ.`],
                  ['ΕΦΚΑ', calc.fundWr, totalDebt * debtComposition.funds / 100, 'text-purple-700', `${fundSurchargePct}% προσ.`],
                ].map(([l, wr, debt, cls, note]) => debt > 0 ? (
                  <div key={l} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                    <span className="text-gray-600">{l}{note && <span className="text-xs text-gray-400 ml-1">({note})</span>}</span>
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
                  <span className="text-gray-600">Μηνιαίο ΜΔΑΧΟ</span>
                  <span className="font-semibold text-blue-700">{fmt(calc.monthlyDisp)}</span>
                </div>
                {calc.assetLiqValue > 0 && (
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Εκτ. ρευστοποίησης ακινήτου</span>
                    <span className="font-semibold text-gray-700">{fmt(calc.assetLiqValue)}</span>
                  </div>
                )}
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
