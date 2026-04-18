import { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { fmt, creditorDisplayName, maxMonthsByType, PMT } from '../utils/calculations'

const RATE = 0.03 / 12

export default function PlanParamsModal({ calc, onGenerate, onClose }) {
  const { finalPlan } = calc

  const [rows, setRows] = useState(() =>
    (finalPlan || []).map((p) => ({
      ...p,
      name: creditorDisplayName(p.type, p.creditorName),
      reqPct: p.writeoffPct || 0,
      reqMonths: p.months || 0,
      excluded: false,
    }))
  )

  function update(i, field, value) {
    setRows((prev) => prev.map((r, idx) => idx !== i ? r : { ...r, [field]: value }))
  }

  function handleGenerate() {
    onGenerate(rows)
  }

  const RATE_LOCAL = RATE

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-black text-blue-800">📋 Παράμετροι πρότασης αναδιάρθρωσης</h2>
            <p className="text-sm text-gray-500 mt-0.5">Συμπληρώστε το ποσοστό διαγραφής και τον αριθμό δόσεων που επιθυμείτε να προτείνετε ανά πιστωτή.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 p-5">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b-2 border-blue-100">
                <th className="th text-left">Πιστωτής</th>
                <th className="th">Αρχικό Ποσό</th>
                <th className="th">Εκτίμηση Διαγραφής<br/><span className="font-normal text-xs">Ποσό &amp; %</span></th>
                <th className="th">Εκτίμηση Δόσεων<br/><span className="font-normal text-xs">Αριθμός &amp; Ποσό Δόσης</span></th>
                <th className="th">Αίτηση για<br/>Διαγραφή %</th>
                <th className="th">Αίτηση για<br/>Αριθμό Δόσεων</th>
                <th className="th">Εξαίρεση</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const maxPct = r.amount > 0 ? Math.round(((r.writeoff || 0) / r.amount) * 100) : 0
                const maxM = maxMonthsByType(r.type, r.amount)
                const reqWrAmt = Math.round(r.amount * r.reqPct / 100)
                const reqRemaining = Math.max(0, r.amount - reqWrAmt)
                const reqMonthlyPay = reqRemaining > 0 && r.reqMonths > 0
                  ? Math.floor(PMT(RATE_LOCAL, r.reqMonths, reqRemaining))
                  : 0

                return (
                  <tr key={i} className={`border-b border-gray-100 ${r.excluded ? 'opacity-40' : ''}`}>
                    <td className="td text-left font-semibold">{r.name}</td>
                    <td className="td font-mono">{fmt(r.amount)}</td>
                    <td className="td font-mono text-orange-600">
                      {(r.writeoff || 0) > 0 ? `${fmt(r.writeoff)} (${r.writeoffPct}%)` : '—'}
                    </td>
                    <td className="td font-mono">
                      {r.months} δόσεις • {fmt(r.payShown)}
                    </td>
                    <td className="td">
                      <div className="flex flex-col items-center gap-0.5">
                        <input
                          type="number" min={0} max={100}
                          disabled={r.excluded}
                          value={r.reqPct}
                          onChange={(e) => update(i, 'reqPct', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                          className="input w-20 text-center py-1 text-sm"
                        />
                        <span className="text-xs text-gray-400">Εκτίμηση: {maxPct}%</span>
                        {reqWrAmt > 0 && <span className="text-xs text-orange-600 font-mono">{fmt(reqWrAmt)}</span>}
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex flex-col items-center gap-0.5">
                        <input
                          type="number" min={1} max={maxM}
                          disabled={r.excluded}
                          value={r.reqMonths}
                          onChange={(e) => update(i, 'reqMonths', Math.min(maxM, Math.max(1, parseInt(e.target.value) || 1)))}
                          className="input w-20 text-center py-1 text-sm"
                        />
                        <span className="text-xs text-gray-400">Μέγιστο: {maxM} μήνες</span>
                        {reqMonthlyPay > 0 && <span className="text-xs text-blue-700 font-mono font-bold">{fmt(reqMonthlyPay)}</span>}
                      </div>
                    </td>
                    <td className="td text-center">
                      <label className="flex items-center justify-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={r.excluded}
                          onChange={(e) => update(i, 'excluded', e.target.checked)}
                          className="w-4 h-4 accent-red-500"
                        />
                        <span className="text-xs text-red-600 font-semibold">Εξαίρεση</span>
                      </label>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-3">Η εκτίμηση εμφανίζεται μόνο ως σημείο αναφοράς. Το business plan θα συνταχθεί με βάση τα ποσοστά διαγραφής και τις δόσεις που θα ορίσετε εσείς.</p>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Ακύρωση</button>
          <button onClick={handleGenerate} className="btn-primary gap-2">
            ✅ Δημιουργία Business Plan
          </button>
        </div>
      </div>
    </div>
  )
}
