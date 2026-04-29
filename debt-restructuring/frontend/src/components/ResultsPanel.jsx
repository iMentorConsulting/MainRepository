import { useState } from 'react'
import { fmt, creditorDisplayName, buildForecastText } from '../utils/calculations'

const SCENARIO_COLORS = {
  0: 'border-purple-300 bg-purple-50 text-purple-900',
  1: 'border-green-300 bg-green-50 text-green-900',
  2: 'border-yellow-300 bg-yellow-50 text-yellow-900',
  3: 'border-red-300 bg-red-50 text-red-900',
  4: 'border-blue-300 bg-blue-50 text-blue-900',
  5: 'border-indigo-300 bg-indigo-50 text-indigo-900',
}

// Show "conservativeValue – baseValue" ensuring lower value is first
function rng(conservative, base, formatter = fmt) {
  const lo = Math.min(conservative, base)
  const hi = Math.max(conservative, base)
  const diff = hi - lo
  if (diff === 0) return formatter(hi)
  const loStr = formatter(lo)
  const hiStr = formatter(hi)
  if (loStr === hiStr) return hiStr             // rounding artifact — same display
  if (diff < 10 || diff / hi < 0.05) return formatter(base) // trivial diff — skip range
  return `${loStr} – ${hiStr}`
}

function rngPct(conservativePct, basePct) {
  const lo = Math.min(conservativePct, basePct)
  const hi = Math.max(conservativePct, basePct)
  if (hi - lo <= 1) return `${basePct}%`       // ≤1 pp — not meaningful
  return `${lo}% – ${hi}%`
}

export default function ResultsPanel({ calc, incomeData }) {
  const [disclaimerOpen, setDisclaimerOpen] = useState(false)

  if (!calc || calc.sumDebt === 0) return null

  const forecast = buildForecastText(calc, incomeData)
  const isLegal = incomeData?.debtorType === 'Νομικό Πρόσωπο'
  const fgColor = SCENARIO_COLORS[calc.scenario] || SCENARIO_COLORS[1]

  const isVulnerable = !isLegal && !!(incomeData?.isVulnerable)

  const hasStepUp = (calc.finalPlan || []).some((p) => p.c1 != null && p.c2 != null && p.c1 !== p.c2)
  const totalC1 = (calc.finalPlan || []).reduce((s, p) => s + (p.c1 ?? p.payShown ?? 0), 0)
  const totalC1C = (calc.finalPlan || []).reduce((s, p) => s + (p.c1C ?? p.payShownC ?? 0), 0)

  // Vulnerable debtors: suppress conservative range — show single Proposal B values only
  const hasConservative = !isVulnerable && (calc.finalPlan || []).some((p) => p.writeoffC != null)

  return (
    <div className="space-y-6">
      {/* Vulnerable debtor banner */}
      {isVulnerable && (
        <div className="bg-teal-50 border-2 border-teal-400 rounded-xl p-4 text-sm">
          <p className="font-black text-teal-800 text-base mb-2">🛡️ ΕΥΑΛΩΤΟΣ ΟΦΕΙΛΕΤΗΣ</p>
          <p className="text-teal-700 mb-3">
            Με βάση τη βεβαίωση ευάλωτου που διαθέτει ο οφειλέτης, ισχύουν οι ευνοϊκές διατάξεις του{' '}
            <b>άρθρου 66 ν. 5072/2023</b>:
          </p>
          <ul className="space-y-1 text-teal-800 text-xs">
            <li>✓ <b>Τεκμαιρόμενη συναίνεση</b> όλων των πιστωτών (τράπεζες, Δημόσιο, ΦΚΑ)</li>
            <li>✓ <b>Μηδενική προκαταβολή 10%</b> — εξαίρεση βάσει Άρθρου 116 ν. 5072/2023 &amp; παρ. κγ ΚΥΑ 13243/2024</li>
            <li>✓ <b>Υποχρεωτική αποδοχή</b> πρότασης εφόσον πληρούνται οι προϋποθέσεις ΚΥΑ — δεν απαιτείται διαπραγμάτευση</li>
          </ul>
        </div>
      )}

      {/* Conservative scenario info banner */}
      {hasConservative && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm">
          <p className="font-bold text-amber-800 mb-1">📊 Εύρος Σεναρίων (Θεωρητικό – Συντηρητικό)</p>
          <p className="text-amber-700">
            Τα αποτελέσματα εμφανίζονται ως <b>εύρος</b>: από το <b>συντηρητικό σενάριο</b> (εκτιμώμενη παρέμβαση Συντονιστή Πιστωτή) έως το <b>θεωρητικό μέγιστο</b> βάσει ΚΥΑ 13243/2024.
          </p>
          <button
            onClick={() => setDisclaimerOpen((v) => !v)}
            className="mt-2 text-xs text-amber-600 underline hover:text-amber-800 focus:outline-none"
          >
            {disclaimerOpen ? '▲ Απόκρυψη αναλυτικής σημείωσης' : '▼ Αναλυτική νομική σημείωση'}
          </button>
          {disclaimerOpen && (
            <div className="mt-3 text-xs text-amber-900 bg-amber-100 border border-amber-200 rounded-lg p-3 space-y-2 leading-relaxed">
              <p><b>Συντηρητικό σενάριο</b>: Εμπειρικοί συντελεστές βάσει ολοκληρωμένων υποθέσεων (ΚΥΑ 77697/2021 §3.4). Ο Συντονιστής Πιστωτής τυπικά μειώνει τις διαγραφές πριν τη ψηφοφορία. Ισχύουν: εξασφαλισμένα τραπεζικά 65% × θεωρητική διαγραφή, ανεξασφάλιστα τραπεζικά 75% × θεωρητική διαγραφή, δημόσιο 100% (νομικά δεσμευτικό, ο Συντονιστής δεν μπορεί να τροποποιήσει).</p>
              <p><b>Σημαντική επισήμανση</b>: Τα εύρη αποτελούν εκτίμηση — δεν αποτελούν νομική συμβουλή και δεν εγγυώνται το αποτέλεσμα οποιασδήποτε διαδικασίας εξωδικαστικής ρύθμισης.</p>
            </div>
          )}
        </div>
      )}

      {/* Income summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm space-y-1">
        <p className="font-bold text-blue-800 mb-2">💶 Περίληψη Διαθέσιμου Εισοδήματος</p>
        {isLegal ? (
          <>
            <p>Ετήσιο διαθέσιμο για εξυπηρέτηση: <b>{fmt(calc.dispAnnual)}</b></p>
            <p>Μηνιαίο διαθέσιμο για εξυπηρέτηση: <b>{fmt(calc.dispMonthly)}</b></p>
          </>
        ) : (
          <>
            <p>Ετήσιο δηλωθέν εισόδημα: <b>{fmt(calc.annualIncome)}</b></p>
            <p>Σύνολο δαπανών (εύλογες + λοιπές): <b>{fmt(calc.totalExpenses)}</b></p>
            <p>Ετήσιο διαθέσιμο (×80%): <b>{fmt(calc.dispAnnual)}</b></p>
            <p>Μηνιαίο διαθέσιμο: <b>{fmt(calc.dispMonthly)}</b></p>
          </>
        )}
      </div>

      {/* Combined results table */}
      <div>
        <h3 className="section-title">📊 Θεωρητική Εκτίμηση Αποτελέσματος</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b-2 border-blue-100">
                <th className="th text-left">Πιστωτής</th>
                <th className="th">Αρχική Οφειλή</th>
                <th className="th">{hasConservative ? 'Εκτ. Διαγραφή (εύρος)' : 'Εκτ. Διαγραφή'}</th>
                <th className="th">{hasConservative ? 'Εναπομένουσα (εύρος)' : 'Εναπομένουσα'}</th>
                <th className="th">Διάρκεια</th>
                {hasStepUp ? (
                  <>
                    <th className="th">{hasConservative ? 'Δόση Έτη 1–3 (εύρος)' : 'Δόση Έτη 1–3'}</th>
                    <th className="th">{hasConservative ? 'Δόση Έτη 4+ (εύρος)' : 'Δόση Έτη 4+'}</th>
                  </>
                ) : (
                  <th className="th">{hasConservative ? 'Μηνιαία Δόση (εύρος)' : 'Μηνιαία Δόση'}</th>
                )}
                <th className="th">% Εισοδήματος</th>
              </tr>
            </thead>
            <tbody>
              {calc.finalPlan.map((p, i) => {
                const c1 = p.c1 ?? p.payShown
                const c2 = p.c2 ?? p.payShown
                const stepUp = c1 !== c2
                return (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="td text-left font-semibold">{creditorDisplayName(p.type, p.creditorName)}</td>
                    <td className="td font-mono">{fmt(p.amount)}</td>
                    <td className="td font-mono text-orange-600">
                      {p.writeoff > 0
                        ? hasConservative
                          ? `${rng(p.writeoffC, p.writeoff)} (${rngPct(p.writeoffPctC, p.writeoffPct)})`
                          : `${fmt(p.writeoff)} (${p.writeoffPct}%)`
                        : '—'}
                    </td>
                    <td className="td font-mono text-blue-700">
                      {hasConservative ? rng(p.newAmtC, p.newAmt) : fmt(p.newAmt)}
                    </td>
                    <td className="td">{p.months} μήνες</td>
                    {hasStepUp ? (
                      <>
                        <td className="td font-mono text-blue-600">
                          {hasConservative ? rng(p.c1C, c1) : fmt(c1)}
                        </td>
                        <td className="td font-mono font-bold text-blue-900">
                          {stepUp ? (
                            <span className="flex items-center gap-1">
                              {hasConservative ? rng(p.c2C, c2) : fmt(c2)}
                              <span className="text-xs text-amber-600 font-normal">↑</span>
                            </span>
                          ) : (hasConservative ? rng(p.c2C, c2) : fmt(c2))}
                        </td>
                      </>
                    ) : (
                      <td className="td font-mono font-bold text-blue-800">
                        {hasConservative ? rng(p.payShownC, p.payShown) : fmt(p.payShown)}
                      </td>
                    )}
                    <td className="td">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.incomePct > 80 ? 'bg-red-100 text-red-700' : p.incomePct > 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {p.incomePct}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* KPIs */}
        <div className="flex flex-wrap gap-3 mt-4">
          <div className="kpi-card">
            <div className="kpi-label">Συνολική Εκτ. Διαγραφή</div>
            <div className="kpi-value text-orange-600">
              {hasConservative ? rng(calc.sumWrC, calc.sumWr) : fmt(calc.sumWr)}
            </div>
            {calc.sumWrPct > 0 && (
              <div className="text-xs text-orange-500 mt-0.5">
                ({hasConservative ? rngPct(calc.sumWrPctC, calc.sumWrPct) : `${calc.sumWrPct}%`} του συνόλου)
              </div>
            )}
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Εναπομένουσες Οφειλές</div>
            <div className="kpi-value">
              {hasConservative ? rng(calc.totalRemainingC, calc.totalRemaining) : fmt(calc.totalRemaining)}
            </div>
          </div>
          {hasStepUp ? (
            <>
              <div className="kpi-card">
                <div className="kpi-label">Σύνολο Δόσεων Έτη 1–3</div>
                <div className="kpi-value text-blue-600">
                  {hasConservative ? rng(totalC1C, totalC1) : fmt(totalC1)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">(προνομιακό επιτόκιο)</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Σύνολο Δόσεων Έτη 4+</div>
                <div className="kpi-value text-blue-900">
                  {hasConservative ? rng(calc.totalMonthlyPayC, calc.totalMonthlyPay) : fmt(calc.totalMonthlyPay)}
                </div>
                {calc.ratio > 0 && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    ({hasConservative ? rngPct(calc.ratioC, calc.ratio) : `${calc.ratio}%`} εισοδήματος)
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="kpi-card">
              <div className="kpi-label">Συνολικές Μηνιαίες Δόσεις</div>
              <div className="kpi-value text-green-700">
                {hasConservative ? rng(calc.totalMonthlyPayC, calc.totalMonthlyPay) : fmt(calc.totalMonthlyPay)}
              </div>
              {calc.ratio > 0 && (
                <div className="text-xs text-gray-500 mt-0.5">
                  ({hasConservative ? rngPct(calc.ratioC, calc.ratio) : `${calc.ratio}%`} διαθέσιμου εισοδήματος)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step-up notice */}
        {hasStepUp && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ↑ Οι δόσεις «Έτη 4+» υπολογίζονται με επιτόκιο Euribor + spread μετά τη λήξη της τριετούς προνομιακής περιόδου.
          </div>
        )}
      </div>

      {/* Forecast box */}
      {forecast && (
        <div className={`border-2 rounded-xl p-5 ${fgColor}`}>
          <h3 className="font-black text-lg mb-4">{forecast.title}</h3>
          <div className="space-y-3">
            {(forecast.sections || []).map((s, i) => (
              <div key={i} className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                s.type === 'success'
                  ? 'bg-green-50 border border-green-300 text-green-900'
                  : 'bg-blue-50 border border-blue-200 text-blue-900'
              }`}>
                <div className="font-bold mb-1">{s.icon} {s.label}</div>
                <div className="whitespace-pre-line">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
