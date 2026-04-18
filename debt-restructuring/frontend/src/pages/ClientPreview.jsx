import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { el } from 'date-fns/locale'
import * as api from '../api'
import { fmt, creditorDisplayName } from '../utils/calculations'

const STATUS_LABELS = {
  draft: 'Σε Επεξεργασία', submitted: 'Υποβλήθηκε',
  in_review: 'Υπό Αξιολόγηση', completed: 'Ολοκληρώθηκε', cancelled: 'Ακυρώθηκε'
}
const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-700', submitted: 'bg-blue-100 text-blue-700',
  in_review: 'bg-yellow-100 text-yellow-700', completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700'
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h2 className="text-base font-bold text-blue-800 border-b-2 border-blue-100 pb-2 mb-3">{title}</h2>
      {children}
    </div>
  )
}

export default function ClientPreview() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getPublicCase(token)
      .then((r) => setData(r.data))
      .catch(() => setError('Η υπόθεση δεν βρέθηκε ή ο σύνδεσμος δεν είναι έγκυρος.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-600 flex items-center justify-center">
      <div className="text-white text-lg font-semibold">Φόρτωση…</div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 text-center max-w-sm">
        <div className="text-4xl mb-4">❌</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Σφάλμα</h2>
        <p className="text-gray-500 text-sm">{error}</p>
        <p className="text-xs text-gray-400 mt-4">i-Mentor Consulting • www.i-mentor.gr</p>
      </div>
    </div>
  )

  const est = data.estimates || {}
  const act = data.actual_results
  const finalPlan = est.finalPlan || []
  const st = STATUS_LABELS[data.status] || 'Άγνωστο'
  const stCls = STATUS_COLORS[data.status] || STATUS_COLORS.draft
  const hasActuals = !!act

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-600 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Brand header */}
        <div className="flex justify-between items-center bg-white/10 backdrop-blur-sm rounded-2xl px-5 py-3 mb-5 text-white">
          <div>
            <div className="font-black text-lg">⚖️ i-Mentor Consulting</div>
            <div className="text-blue-200 text-xs">Θεωρητική Προσομοίωση Εξωδικαστικού</div>
          </div>
          <div className="text-right text-blue-200 text-xs">
            <div>www.i-mentor.gr</div>
            <div>info@i-mentor.gr</div>
            <div>2810 363007</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6">
          {/* Status + title */}
          <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-black text-blue-800">{data.client_name}</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {data.debtor_type} •{' '}
                {data.created_at ? format(new Date(data.created_at), 'dd MMMM yyyy', { locale: el }) : ''}
              </p>
            </div>
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${stCls}`}>{st}</span>
          </div>

          {/* Disclaimer */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-xs text-amber-800 leading-relaxed">
            ⚠️ <b>Θεωρητική Προσομοίωση:</b> Τα παρακάτω αποτελέσματα αποτελούν εκτίμηση βάσει των στοιχείων που παρείχατε. Δεν συνιστούν δεσμευτική πρόταση ή εγγύηση αποτελέσματος.
          </div>

          {/* Estimated summary */}
          <Section title="📊 Εκτιμώμενα Αποτελέσματα">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Συνολική Οφειλή', value: est.sumDebt, color: 'text-blue-800' },
                { label: 'Εκτ. Διαγραφή', value: est.sumWr, sub: est.sumWrPct > 0 ? `(${est.sumWrPct}%)` : null, color: 'text-orange-600' },
                { label: 'Εναπομένουσα', value: est.totalRemaining, color: 'text-blue-700' },
                { label: 'Μηνιαία Δόση', value: est.totalMonthlyPay, color: 'text-green-700' },
              ].map((item) => (
                <div key={item.label} className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-xs font-semibold text-blue-600 mb-1">{item.label}</div>
                  <div className={`text-lg font-black ${item.color}`}>{item.value ? fmt(item.value) : '—'}</div>
                  {item.sub && <div className="text-xs text-gray-500">{item.sub}</div>}
                </div>
              ))}
            </div>

            {finalPlan.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-sm">
                  <thead>
                    <tr className="border-b-2 border-blue-100">
                      <th className="th text-left">Πιστωτής</th>
                      <th className="th">Αρχική</th>
                      <th className="th">Εκτ. Διαγραφή</th>
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
          </Section>

          {/* Actual results if available */}
          {hasActuals && (
            <Section title="✅ Πραγματικά Αποτελέσματα Ρύθμισης">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Πραγματική Διαγραφή', value: act.actualWriteOff, color: 'text-orange-600' },
                    { label: 'Εναπομένουσα Οφειλή', value: act.actualRemaining, color: 'text-blue-700' },
                    { label: 'Μηνιαία Δόση', value: act.actualMonthlyPay, color: 'text-green-700' },
                    { label: 'Διάρκεια', value: act.actualDurationMonths, isMonths: true },
                  ].map((item) => (
                    <div key={item.label} className="text-center">
                      <div className="text-xs font-semibold text-green-700 mb-1">{item.label}</div>
                      <div className={`text-lg font-black ${item.color || 'text-blue-800'}`}>
                        {item.isMonths ? `${item.value || '—'} μήνες` : (item.value ? fmt(item.value) : '—')}
                      </div>
                    </div>
                  ))}
                </div>
                {act.actualNotes && (
                  <div className="mt-3 text-sm text-green-800 italic border-t border-green-200 pt-2">
                    💬 {act.actualNotes}
                  </div>
                )}
              </div>

              {/* Comparison */}
              {est.sumDebt > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-blue-100">
                        <th className="th text-left">Δείκτης</th>
                        <th className="th">Εκτίμηση</th>
                        <th className="th">Πραγματικό</th>
                        <th className="th">Αποτέλεσμα</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Διαγραφή', e: est.sumWr, a: act.actualWriteOff },
                        { label: 'Εναπομένουσα', e: est.totalRemaining, a: act.actualRemaining },
                        { label: 'Μηνιαία Δόση', e: est.totalMonthlyPay, a: act.actualMonthlyPay },
                      ].map((row) => {
                        const diff = (row.a || 0) - (row.e || 0)
                        const pct = row.e > 0 ? Math.round(Math.abs(diff) / row.e * 100) : 0
                        return (
                          <tr key={row.label} className="border-b border-gray-100">
                            <td className="td text-left font-semibold">{row.label}</td>
                            <td className="td font-mono text-gray-500">{row.e ? fmt(row.e) : '—'}</td>
                            <td className="td font-mono font-bold">{row.a ? fmt(row.a) : '—'}</td>
                            <td className="td">
                              {row.e > 0 && row.a > 0 && (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${diff >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {diff >= 0 ? '▲' : '▼'} {pct}%
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {/* Next steps */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <p className="font-bold mb-2">🟦 Επόμενα Βήματα</p>
            <p>Η ομάδα της <b>i-Mentor Consulting</b> είναι στη διάθεσή σας για οποιαδήποτε διευκρίνιση ή για την προετοιμασία της επίσημης αίτησης στον Εξωδικαστικό Μηχανισμό Ρύθμισης Οφειλών.</p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              <span>📞 2810 363007</span>
              <span>📧 info@i-mentor.gr</span>
              <span>🌐 www.i-mentor.gr</span>
            </div>
          </div>
        </div>

        <p className="text-center text-blue-200 text-xs mt-4">
          © i-Mentor Consulting • Εμπιστευτικό έγγραφο — μόνο για τον αποδέκτη
        </p>
      </div>
    </div>
  )
}
