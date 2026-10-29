import { useState } from 'react'
import * as api from '../api'
import { fmtDateGr, eur } from '../utils/bankruptcy'

const BANKS = [
  ['Πειραιώς', 'GR4501714330006433164381388'],
  ['Alpha Bank', 'GR2401407750775002330002138'],
  ['Eurobank', 'GR5802601680000060201330648'],
]

// Client-facing page for the bankruptcy service (separate from the Εξωδικαστικός analysis page)
export default function BankruptcyPortal({ data, token }) {
  const b = data.bankruptcy || {}
  const stages = b.stages || []
  const idx = Math.max(0, stages.indexOf(b.stage))
  const docs = b.documents || []
  const pending = docs.filter(d => !d.done)
  const [interested, setInterested] = useState(() => localStorage.getItem(`interested-${token}`) === '1')
  const [busy, setBusy] = useState(false)

  const handleInterested = async () => {
    setBusy(true)
    try { await api.markPortalInterested(token) } catch { /* still mark locally */ }
    localStorage.setItem(`interested-${token}`, '1')
    setInterested(true)
    setBusy(false)
  }

  const dates = [
    ['Αριθμός κατάθεσης', b.filing_number || null],
    ['Δικαστήριο', b.court || null],
    ['Ημερομηνία κατάθεσης', b.filing_date ? fmtDateGr(b.filing_date) : null],
    ['Ημερομηνία έκδοσης απόφασης', b.decision_date ? fmtDateGr(b.decision_date) : null],
    ['Λήξη τριετίας (πλήρης απαλλαγή)', b.three_year_end ? fmtDateGr(b.three_year_end) : null],
  ].filter(([, v]) => v)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-700 p-3 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="text-white text-center pt-4 pb-2">
          <div className="text-sm opacity-80">i-Mentor Consulting</div>
          <h1 className="text-2xl sm:text-3xl font-black mt-1">⚖️ Διαδικασία Πτώχευσης</h1>
          <p className="opacity-90 mt-1">{data.client_name}</p>
        </div>

        {/* Progress */}
        <div className="bg-white rounded-2xl p-5 shadow-lg">
          <h2 className="font-bold text-gray-800 mb-3">Η πορεία της υπόθεσής σας</h2>
          <ol className="space-y-2">
            {stages.map((s, i) => (
              <li key={s} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm border ${
                i === idx ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                : i < idx ? 'bg-green-50 text-green-800 border-green-200'
                : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black bg-white/20 shrink-0">{i < idx ? '✓' : i + 1}</span>
                {s}
                {i === idx && <span className="ml-auto text-xs opacity-90">Τρέχον στάδιο</span>}
              </li>
            ))}
          </ol>
        </div>

        {/* Key facts */}
        {dates.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-lg">
            <h2 className="font-bold text-gray-800 mb-3">Στοιχεία διαδικασίας</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {dates.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-gray-100 py-1.5"><dt className="text-gray-500">{k}</dt><dd className="font-semibold text-gray-800 text-right">{v}</dd></div>
              ))}
            </dl>
            {(b.hearing_dates || []).length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">Επόμενες ημερομηνίες</div>
                {b.hearing_dates.map((h, i) => (
                  <div key={i} className="text-sm flex gap-3"><b>{fmtDateGr(h.date)}</b><span className="text-gray-600">{h.note}</span></div>
                ))}
              </div>
            )}
            {b.decision_type === 'installments' && b.decision_date && (
              <p className="text-xs text-gray-500 mt-3">Η απόφαση προβλέπει πληρωμή δόσεων για την τριετία, με έναρξη από την ημερομηνία έκδοσής της.</p>
            )}
          </div>
        )}

        {/* Documents */}
        {docs.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-gray-800">Δικαιολογητικά</h2>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">{docs.length - pending.length}/{docs.length} παραλήφθηκαν</span>
            </div>
            <ul className="space-y-1.5">
              {docs.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={d.done ? 'text-green-600' : 'text-amber-500'}>{d.done ? '✅' : '⏳'}</span>
                  <span className={d.done ? 'text-gray-400 line-through' : 'text-gray-800'}>{d.label}</span>
                </li>
              ))}
            </ul>
            {pending.length > 0 && <p className="text-xs text-gray-500 mt-3">Παρακαλούμε αποστείλετε τα δικαιολογητικά που εκκρεμούν στον σύμβουλό σας.</p>}
          </div>
        )}

        {/* Fees */}
        {(b.application_fee > 0 || b.success_fee > 0) && (
          <div className="bg-white rounded-2xl p-5 shadow-lg space-y-4">
            <h2 className="font-bold text-gray-800">Αμοιβή & τρόπος πληρωμής</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {b.application_fee > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
                  <div className="text-xs text-blue-700 font-semibold">Αμοιβή αίτησης</div>
                  <div className="text-2xl font-black text-blue-900">{eur(b.application_fee)}</div>
                </div>
              )}
              {b.success_fee > 0 && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-center">
                  <div className="text-xs text-indigo-700 font-semibold">Success fee (σε 4 ισόποσες δόσεις ανά 3μηνο)</div>
                  <div className="text-2xl font-black text-indigo-900">{eur(b.success_fee)}</div>
                </div>
              )}
            </div>
            {(b.success_fee_schedule || []).length > 0 && (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Δόση success fee</th><th>Ημερομηνία</th><th className="text-right">Ποσό</th></tr></thead>
                <tbody>
                  {b.success_fee_schedule.map(r => (
                    <tr key={r.n} className="border-t border-gray-100"><td className="py-1.5">{r.n}η δόση</td><td>{fmtDateGr(r.due)}</td><td className="text-right font-semibold">{eur(r.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="text-sm font-bold text-gray-700 mb-2">Τραπεζικοί λογαριασμοί κατάθεσης</div>
              <div className="space-y-1 text-sm font-mono break-all">
                {BANKS.map(([n, iban]) => <div key={n}><span className="text-gray-500">{n}:</span> {iban}</div>)}
                <div className="mt-1"><span className="text-gray-500">Δικαιούχος:</span> <b>I MENTOR IKE</b></div>
              </div>
            </div>
          </div>
        )}

        {/* Interested */}
        {idx <= 1 && (
          <div className="bg-white rounded-2xl p-5 shadow-lg text-center">
            {interested ? (
              <p className="text-green-700 font-semibold">✅ Λάβαμε το ενδιαφέρον σας. Ο σύμβουλός σας θα επικοινωνήσει σύντομα μαζί σας.</p>
            ) : (
              <button onClick={handleInterested} disabled={busy}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-black px-8 py-3 rounded-xl text-lg">
                {busy ? '⏳…' : '✅ Θέλω να Προχωρήσω'}
              </button>
            )}
          </div>
        )}

        <div className="text-center text-white/80 text-xs pb-6">
          Ο σύμβουλός σας: <b>{data.employee}</b> • i-Mentor Consulting • 2810 363007 • www.i-mentor.gr
        </div>
      </div>
    </div>
  )
}
