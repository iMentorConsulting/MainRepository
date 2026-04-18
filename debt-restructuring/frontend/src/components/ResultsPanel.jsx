import { fmt, creditorDisplayName, buildForecastText } from '../utils/calculations'

const SCENARIO_COLORS = {
  0: 'border-purple-300 bg-purple-50 text-purple-900',
  1: 'border-green-300 bg-green-50 text-green-900',
  2: 'border-yellow-300 bg-yellow-50 text-yellow-900',
  3: 'border-red-300 bg-red-50 text-red-900',
  4: 'border-blue-300 bg-blue-50 text-blue-900',
  5: 'border-indigo-300 bg-indigo-50 text-indigo-900',
}

export default function ResultsPanel({ calc, incomeData }) {
  if (!calc || calc.sumDebt === 0) return null

  const forecast = buildForecastText(calc, incomeData)
  const isLegal = incomeData?.debtorType === 'Νομικό Πρόσωπο'
  const fgColor = SCENARIO_COLORS[calc.scenario] || SCENARIO_COLORS[1]

  return (
    <div className="space-y-6">
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
                <th className="th">Εκτ. Διαγραφή</th>
                <th className="th">Εναπομένουσα</th>
                <th className="th">Διάρκεια</th>
                <th className="th">Μηνιαία Δόση</th>
                <th className="th">% Εισοδήματος</th>
              </tr>
            </thead>
            <tbody>
              {calc.finalPlan.map((p, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="td text-left font-semibold">{creditorDisplayName(p.type, p.creditorName)}</td>
                  <td className="td font-mono">{fmt(p.amount)}</td>
                  <td className="td font-mono text-orange-600">{p.writeoff > 0 ? `${fmt(p.writeoff)} (${p.writeoffPct}%)` : '—'}</td>
                  <td className="td font-mono text-blue-700">{fmt(p.newAmt)}</td>
                  <td className="td">{p.months} μήνες</td>
                  <td className="td font-mono font-bold text-blue-800">{fmt(p.payShown)}</td>
                  <td className="td">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.incomePct > 80 ? 'bg-red-100 text-red-700' : p.incomePct > 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                      {p.incomePct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* KPIs */}
        <div className="flex flex-wrap gap-3 mt-4">
          <div className="kpi-card">
            <div className="kpi-label">Συνολική Εκτ. Διαγραφή</div>
            <div className="kpi-value text-orange-600">{fmt(calc.sumWr)}</div>
            {calc.sumWrPct > 0 && <div className="text-xs text-orange-500 mt-0.5">({calc.sumWrPct}% του συνόλου)</div>}
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Εναπομένουσες Οφειλές</div>
            <div className="kpi-value">{fmt(calc.totalRemaining)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Συνολικές Μηνιαίες Δόσεις</div>
            <div className="kpi-value text-green-700">{fmt(calc.totalMonthlyPay)}</div>
            {calc.ratio > 0 && <div className="text-xs text-gray-500 mt-0.5">({calc.ratio}% διαθέσιμου εισοδήματος)</div>}
          </div>
        </div>
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
