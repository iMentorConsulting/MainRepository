import { useState, useMemo } from 'react'
import { fmt } from '../utils/calculations'

function annuityPMT(principal, annualRate, months) {
  if (principal <= 0 || months <= 0) return 0
  if (annualRate <= 0) return principal / months
  const r = annualRate / 12
  return principal * r / (1 - Math.pow(1 + r, -months))
}

const RATE = 0.03

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

  // Debt inputs (direct euro amounts, no sliders)
  const [bankDebt, setBankDebt] = useState(0)      // Τράπεζες / Funds
  const [publicDebt, setPublicDebt] = useState(0)  // Δημόσιο (ΑΑΔΕ + ΕΦΚΑ)

  // Asset
  const [commercialValue, setCommercialValue] = useState(0) // Εμπορική αξία ακινήτου

  // Income — fp/ep
  const [netIncome, setNetIncome] = useState(0)    // fp: ετήσιο εισόδημα; ep/np: καθαρά κέρδη
  const [turnover, setTurnover] = useState(0)      // ep + np: κύκλος εργασιών

  const [householdIdx, setHouseholdIdx] = useState(0)

  const calc = useMemo(() => {
    const totalDebt = bankDebt + publicDebt
    if (totalDebt <= 0) return null

    // ── Disposable income by debtor type ─────────────────────────────────────
    let dispAnnual = 0
    let incomeNote = ''

    if (debtorType === 'fp') {
      if (!netIncome) return null
      const household = HOUSEHOLD_OPTS[householdIdx].value
      dispAnnual = Math.max(0, netIncome - household) * 0.8
      incomeNote = 'ΕΛΣΤΑΤ × 80%'
    } else if (debtorType === 'ep') {
      if (!netIncome && !turnover) return null
      const household = HOUSEHOLD_OPTS[householdIdx].value
      const dispA = Math.max(0, netIncome - household) * 0.8
      const dispB = turnover * 0.10
      dispAnnual = Math.max(dispA, dispB)
      incomeNote = dispB > dispA ? '10% τζίρου (κανόνας ΕΠ)' : 'ΕΛΣΤΑΤ × 80%'
    } else { // np
      if (!netIncome && !turnover) return null
      const dispA = Math.max(0, netIncome)
      const dispB = turnover * 0.10
      dispAnnual = Math.max(dispA, dispB)
      incomeNote = dispB > dispA ? '10% τζίρου (κανόνας ΝΠ)' : 'Καθαρά Κέρδη'
    }

    // Profit margin rule for ep/np: if profit < 10% of turnover → force 240 public installments
    const profitMargin = (debtorType !== 'fp' && turnover > 0) ? netIncome / turnover : 1
    const forcedPublic240 = (debtorType === 'ep' || debtorType === 'np') && profitMargin < 0.10

    const monthlyDisp = dispAnnual / 12
    if (monthlyDisp <= 0) return { noCapacity: true, disposable: 0, monthlyDisp: 0, totalDebt }

    // ── Duration caps ─────────────────────────────────────────────────────────
    // Banks: 360mo for fp/ep, 240mo for np
    const bankDuration  = debtorType === 'np' ? 240 : 360
    const publicDuration = 240

    // ── NWO floor — 100% commercial value (no auction discount) ───────────────
    // Max total writeoff = max(0, totalDebt − commercialValue)
    const nwoFloor = commercialValue > 0 ? commercialValue : 0
    const maxTotalWr = Math.max(0, totalDebt - nwoFloor)

    // ── Proportional income allocation ────────────────────────────────────────
    const bankShare   = totalDebt > 0 ? bankDebt / totalDebt : 0
    const publicShare = totalDebt > 0 ? publicDebt / totalDebt : 0

    const bankMonthly   = monthlyDisp * bankShare
    const publicMonthly = monthlyDisp * publicShare

    // ── Max capacity per creditor class ───────────────────────────────────────
    const bankCap   = bankMonthly * bankDuration
    const publicCap = publicMonthly * publicDuration

    // ── Pre-floor writeoffs ───────────────────────────────────────────────────
    let bankWrPre   = Math.max(0, bankDebt - bankCap)
    // Public: max 50% erasable (basic principal/contributions are non-erasable)
    const publicWrMax = publicDebt * 0.50
    let publicWrPre = Math.min(Math.max(0, publicDebt - publicCap), publicWrMax)

    let totalWrPre = bankWrPre + publicWrPre

    // ── Apply NWO floor ───────────────────────────────────────────────────────
    let bankWr = bankWrPre
    let publicWr = publicWrPre

    if (totalWrPre > maxTotalWr && totalWrPre > 0) {
      const ratio = maxTotalWr / totalWrPre
      bankWr   = bankWrPre   * ratio
      publicWr = publicWrPre * ratio
    }

    const totalWr  = bankWr + publicWr
    const remaining = Math.max(0, totalDebt - totalWr)
    const wrPct    = totalDebt > 0 ? Math.round((totalWr / totalDebt) * 100) : 0

    // ── Duration of the plan ──────────────────────────────────────────────────
    const bankRemaining   = Math.max(0, bankDebt - bankWr)
    const publicRemaining = Math.max(0, publicDebt - publicWr)

    const bankMonths = (bankRemaining > 0 && bankMonthly > 0)
      ? Math.min(bankDuration, Math.ceil(bankRemaining / bankMonthly)) : 0
    const rawPublicMonths = (publicRemaining > 0 && publicMonthly > 0)
      ? Math.min(publicDuration, Math.ceil(publicRemaining / publicMonthly)) : 0
    const publicMonths = forcedPublic240 && publicRemaining > 0 ? 240 : rawPublicMonths

    const months = Math.max(bankMonths, publicMonths) || Math.min(bankDuration, Math.ceil(remaining / monthlyDisp))

    // ── Annuity installments at 3% annual ────────────────────────────────────
    const bankPMT   = annuityPMT(bankRemaining, RATE, bankMonths)
    const publicPMT = annuityPMT(publicRemaining, RATE, publicMonths)
    const totalPMT  = bankPMT + publicPMT

    // ── Feasibility ───────────────────────────────────────────────────────────
    const feasible = totalPMT <= monthlyDisp * 1.05 // 5% tolerance

    return {
      disposable: dispAnnual, monthlyDisp, incomeNote,
      totalDebt, bankDebt, publicDebt,
      totalWr, bankWr, publicWr, wrPct,
      remaining, bankRemaining, publicRemaining,
      months, bankMonths, publicMonths, bankDuration,
      bankPMT, publicPMT, totalPMT,
      forcedPublic240,
      nwoFloor, maxTotalWr,
      nwoActive: commercialValue > 0 && totalWrPre > maxTotalWr,
      feasible,
      incomeCoversAll: totalWr === 0 && remaining <= monthlyDisp * Math.max(bankDuration, publicDuration),
    }
  }, [bankDebt, publicDebt, commercialValue, netIncome, turnover, householdIdx, debtorType])

  const totalDebt = bankDebt + publicDebt

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-blue-800">⚡ Γρήγορη Ανάλυση Τηλεφώνου</h1>
        <p className="text-gray-500 text-sm mt-1">Γρήγορη εκτίμηση κατά τη διάρκεια κλήσης — χωρίς αποθήκευση</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* LEFT: Inputs */}
        <div className="space-y-4">

          {/* Debtor type */}
          <div className="card">
            <h2 className="font-bold text-gray-700 mb-3 text-sm">Τύπος Οφειλέτη</h2>
            <div className="flex gap-2">
              {[['fp','Φυσικό Πρόσωπο'],['ep','Επιτηδευματίας'],['np','Νομικό Πρόσωπο']].map(([v,l]) => (
                <button key={v} onClick={() => setDebtorType(v)}
                  className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors ${debtorType === v ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Debt breakdown */}
          <div className="card">
            <h2 className="font-bold text-gray-700 mb-3 text-sm">Οφειλές</h2>
            <div className="space-y-3">
              {numInput(bankDebt, setBankDebt, 'Οφειλές προς Τράπεζες / Funds (€)', '€')}
              {numInput(publicDebt, setPublicDebt, 'Οφειλές προς Δημόσιο — ΑΑΔΕ + ΕΦΚΑ (€)', '€')}
            </div>
            {totalDebt > 0 && (
              <div className="mt-2 text-xs text-right text-gray-500 font-semibold">
                Σύνολο: {fmt(totalDebt)}
                {bankDebt > 0 && publicDebt > 0 && (
                  <span className="ml-2 text-gray-400">
                    ({Math.round(bankDebt/totalDebt*100)}% Τράπεζες / {Math.round(publicDebt/totalDebt*100)}% Δημόσιο)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Income */}
          <div className="card">
            <h2 className="font-bold text-gray-700 mb-3 text-sm">Εισοδηματικά Στοιχεία</h2>
            <div className="space-y-3">
              {debtorType === 'fp' && (
                numInput(netIncome, setNetIncome, 'Ετήσιο Εισόδημα (€)', '€')
              )}
              {debtorType === 'ep' && (<>
                {numInput(netIncome, setNetIncome, 'Κέρδη Ατομικής Επιχείρησης Τεκμαρτά & Λοιπά Έσοδα (€)', '€')}
                {numInput(turnover, setTurnover, 'Κύκλος Εργασιών Ε3 (€)', '€')}
              </>)}
              {debtorType === 'np' && (<>
                {numInput(netIncome, setNetIncome, 'Καθαρά Κέρδη — έντυπο Ν (€)', '€')}
                {numInput(turnover, setTurnover, 'Κύκλος Εργασιών — κωδ.500 Ε3 (€)', '€')}
              </>)}
            </div>
            {debtorType !== 'np' && (
              <div className="mt-3">
                <label className="label">Σύνθεση νοικοκυριού</label>
                <select className="input w-full text-sm" value={householdIdx} onChange={e => setHouseholdIdx(Number(e.target.value))}>
                  {HOUSEHOLD_OPTS.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Asset */}
          <div className="card">
            <h2 className="font-bold text-gray-700 mb-3 text-sm">Ακίνητο (αν υπάρχει)</h2>
            {numInput(commercialValue, setCommercialValue, 'Εμπορική Αξία (€)', '€')}
            {commercialValue > 0 && (
              <div className="mt-1.5 text-xs text-blue-700 font-semibold bg-blue-50 rounded-lg px-3 py-1.5">
                🏠 100% ανακτήσιμη — καμία διαγραφή κάτω από {fmt(commercialValue)}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Results */}
        <div>
          {!calc ? (
            <div className="card text-center text-gray-400 py-16">
              <div className="text-4xl mb-3">💡</div>
              <div className="font-semibold">Συμπλήρωσε οφειλές + εισόδημα για εκτίμηση</div>
            </div>
          ) : calc.noCapacity ? (
            <div className="card text-center text-red-500 py-12">
              <div className="text-3xl mb-2">⚠️</div>
              <div className="font-bold">Μηδενικό διαθέσιμο εισόδημα</div>
              <div className="text-sm text-gray-400 mt-1">Το εισόδημα δεν επαρκεί για ρύθμιση.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {calc.totalWr === 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-xs text-green-800 font-semibold">
                  ✅ Το εισόδημα καλύπτει το σύνολο — δεν απαιτείται καμία διαγραφή. Ρύθμιση σε {calc.months} μήνες.
                </div>
              ) : !calc.feasible ? (
                <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-2.5 text-xs text-red-800 font-semibold">
                  ⚠️ Μη βιώσιμη ρύθμιση ακόμα και μετά τις μέγιστες διαγραφές. Απαιτείται πλήρης ανάλυση.
                </div>
              ) : calc.nwoActive ? (
                <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5 text-xs text-amber-800 font-semibold">
                  🏠 Διαγραφή περιορίστηκε από αξία ακινήτου (αρχή μη χειροτέρευσης)
                </div>
              ) : null}
              {calc.forcedPublic240 && (
                <div className="bg-orange-50 border border-orange-300 rounded-xl px-4 py-2.5 text-xs text-orange-800 font-semibold">
                  ⚠️ Περιθώριο κέρδους &lt;10% — Δημόσιο: 240 δόσεις υποχρεωτικά
                </div>
              )}

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
                  <div className="bg-white/10 rounded-xl p-3 col-span-2">
                    <div className="text-xs text-blue-200 mb-1">Μηνιαία Δόση (3% επιτ.)</div>
                    <div className="text-xl font-black text-green-200">{fmt(calc.totalPMT)}</div>
                    <div className="flex gap-3 mt-1.5 text-xs text-blue-300">
                      {calc.bankPMT > 0 && <span>Τράπεζες: {fmt(calc.bankPMT)} × {calc.bankMonths}μ.</span>}
                      {calc.publicPMT > 0 && <span>Δημόσιο: {fmt(calc.publicPMT)} × {calc.publicMonths}μ.{calc.forcedPublic240 ? ' (⚠️240)' : ''}</span>}
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-3">
                    <div className="text-xs text-blue-200 mb-1">Διάρκεια</div>
                    <div className="text-xl font-black text-white">{calc.months} μήνες</div>
                    {calc.months >= calc.bankDuration && <div className="text-xs text-amber-300 mt-0.5">μέγιστη τραπεζών</div>}
                  </div>
                  <div className="bg-white/10 rounded-xl p-3">
                    <div className="text-xs text-blue-200 mb-1">ΜΔΑΧΟ (ικανότητα)</div>
                    <div className="text-xl font-black text-blue-200">{fmt(calc.monthlyDisp)}</div>
                    <div className="text-xs text-blue-400 mt-0.5">{calc.incomeNote}</div>
                  </div>
                </div>
              </div>

              {/* Writeoff breakdown */}
              <div className="card">
                <div className="text-xs font-bold text-gray-500 mb-2 uppercase">Ανάλυση Διαγραφής</div>
                {calc.bankDebt > 0 && (
                  <div className="flex justify-between text-sm py-1 border-b border-gray-50">
                    <span className="text-gray-600">Τράπεζες/Funds
                      <span className="text-xs text-gray-400 ml-1">({calc.bankDuration}μ.)</span>
                    </span>
                    <span className="font-semibold text-blue-700">{fmt(calc.bankWr)}
                      <span className="text-xs text-gray-400 ml-1">({Math.round(calc.bankWr/calc.bankDebt*100)}%)</span>
                    </span>
                  </div>
                )}
                {calc.publicDebt > 0 && (
                  <div className="flex justify-between text-sm py-1 border-b border-gray-50">
                    <span className="text-gray-600">Δημόσιο — ΑΑΔΕ+ΕΦΚΑ
                      <span className="text-xs text-gray-400 ml-1">(240μ., max 50%)</span>
                    </span>
                    <span className="font-semibold text-orange-600">{fmt(calc.publicWr)}
                      <span className="text-xs text-gray-400 ml-1">({Math.round(calc.publicWr/calc.publicDebt*100)}%)</span>
                    </span>
                  </div>
                )}
                {calc.nwoFloor > 0 && (
                  <div className="flex justify-between text-xs py-1 text-gray-400">
                    <span>🏠 NWO floor (εμπορική αξία)</span>
                    <span className="font-semibold">{fmt(calc.nwoFloor)}</span>
                  </div>
                )}
              </div>

              {/* Income snapshot */}
              <div className="card text-sm">
                <div className="text-xs font-bold text-gray-500 mb-2 uppercase">Εισοδηματική Εικόνα</div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Ετήσιο διαθέσιμο <span className="text-gray-400">({calc.incomeNote})</span></span>
                  <span className="font-semibold">{fmt(calc.disposable)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Μηνιαίο ΜΔΑΧΟ</span>
                  <span className="font-semibold text-blue-700">{fmt(calc.monthlyDisp)}</span>
                </div>
                {calc.bankMonths > 0 && calc.publicMonths > 0 && calc.bankMonths !== calc.publicMonths && (
                  <div className="flex justify-between py-1 text-xs text-gray-400">
                    <span>Διάρκεια Τραπεζών / Δημοσίου</span>
                    <span>{calc.bankMonths}μ. / {calc.publicMonths}μ.</span>
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
