import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { el } from 'date-fns/locale'
import * as api from '../api'
import { fmt, creditorDisplayName } from '../utils/calculations'

const STATUS_LABELS = {
  draft: 'Σε Επεξεργασία', submitted: 'Υποβλήθηκε',
  in_review: 'Υπό Αξιολόγηση', completed: 'Ολοκληρώθηκε', cancelled: 'Ακυρώθηκε',
}
const STATUS_COLORS = {
  draft: 'bg-gray-200 text-gray-700', submitted: 'bg-blue-100 text-blue-800',
  in_review: 'bg-yellow-100 text-yellow-800', completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}
const STATUS_ORDER = ['draft', 'submitted', 'in_review', 'completed']

function KpiBlock({ label, value, sub, accent }) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 text-center border border-white/20">
      <div className="text-blue-200 text-xs font-semibold uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl md:text-3xl font-black ${accent || 'text-white'}`}>{value}</div>
      {sub && <div className="text-blue-300 text-xs mt-1">{sub}</div>}
    </div>
  )
}

function ForecastSection({ s }) {
  const isSuccess = s.type === 'success'
  return (
    <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${isSuccess ? 'bg-green-50 border border-green-200 text-green-900' : 'bg-blue-50 border border-blue-200 text-blue-900'}`}>
      <div className="font-bold mb-1">{s.icon} {s.label}</div>
      <div className="whitespace-pre-line">{s.body}</div>
    </div>
  )
}

function VatGate({ onSubmit, error, loading }) {
  const [vat, setVat] = useState('')
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🔐</div>
        <div className="font-black text-2xl text-blue-900 mb-1">i-Mentor Consulting</div>
        <div className="text-gray-500 text-sm mb-6">Εισάγετε τον ΑΦΜ σας για να αποκτήσετε πρόσβαση στην ανάλυσή σας</div>
        <input
          type="text" inputMode="numeric" maxLength={9}
          className="w-full border-2 border-blue-200 rounded-xl px-4 py-3 text-center text-xl font-mono font-bold text-blue-900 focus:outline-none focus:border-blue-500 tracking-widest mb-3"
          placeholder="_ _ _ _ _ _ _ _ _"
          value={vat}
          onChange={(e) => setVat(e.target.value.replace(/\D/g, '').slice(0, 9))}
          onKeyDown={(e) => e.key === 'Enter' && vat.length === 9 && onSubmit(vat)}
        />
        {error && <p className="text-red-500 text-sm mb-3">❌ {error}</p>}
        <button
          disabled={vat.length !== 9 || loading}
          onClick={() => onSubmit(vat)}
          className="w-full bg-blue-800 hover:bg-blue-700 disabled:opacity-40 text-white font-black py-3 rounded-xl text-base transition-all"
        >
          {loading ? 'Έλεγχος…' : 'Είσοδος →'}
        </button>
        <p className="text-xs text-gray-400 mt-5">www.i-mentor.gr • info@i-mentor.gr • 2810 363007</p>
      </div>
    </div>
  )
}

export default function ClientPreview() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [vatRequired, setVatRequired] = useState(false)
  const [vatError, setVatError] = useState(null)
  const [vatLoading, setVatLoading] = useState(false)

  useEffect(() => {
    api.getPublicCase(token)
      .then((r) => setData(r.data))
      .catch((err) => {
        const detail = err.response?.data?.detail
        if (detail === 'vat_required') setVatRequired(true)
        else if (detail === 'portal_disabled') setError('Ο σύνδεσμος αυτός έχει απενεργοποιηθεί προσωρινά. Επικοινωνήστε με το γραφείο μας.')
        else setError('Η υπόθεση δεν βρέθηκε ή ο σύνδεσμος δεν είναι έγκυρος.')
      })
      .finally(() => setLoading(false))
  }, [token])

  const handleVat = (vat) => {
    setVatError(null)
    setVatLoading(true)
    api.getPublicCase(token, vat)
      .then((r) => { setData(r.data); setVatRequired(false) })
      .catch((err) => {
        const detail = err.response?.data?.detail
        setVatError(detail === 'vat_invalid' ? 'Λάθος ΑΦΜ. Δοκιμάστε ξανά.' : 'Σφάλμα σύνδεσης.')
      })
      .finally(() => setVatLoading(false))
  }

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-700 flex items-center justify-center">
      <div className="text-white text-lg font-semibold animate-pulse">⚖️ Φόρτωση ανάλυσης…</div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 text-center max-w-sm">
        <div className="text-4xl mb-4">❌</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Σφάλμα</h2>
        <p className="text-gray-500 text-sm">{error}</p>
        <p className="text-xs text-gray-400 mt-4">i-Mentor Consulting • www.i-mentor.gr</p>
      </div>
    </div>
  )

  if (vatRequired) return <VatGate onSubmit={handleVat} error={vatError} loading={vatLoading} />

  const est = data.estimates || {}
  const act = data.actual_results
  const finalPlan = est.finalPlan || []
  const forecastSections = est.forecastSections || []
  const forecastTitle = est.forecastTitle || 'Πρόβλεψη Ρύθμισης'
  const st = STATUS_LABELS[data.status] || 'Άγνωστο'
  const stCls = STATUS_COLORS[data.status] || STATUS_COLORS.draft
  const hasActuals = !!act
  const writeoffPct = est.sumWrPct || 0
  const ratio = est.ratio || 0
  const statusIdx = STATUS_ORDER.indexOf(data.status)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800">

      {/* TOP BAR */}
      <div className="flex justify-between items-center px-5 py-3 bg-white/5 backdrop-blur-sm border-b border-white/10">
        <div className="font-black text-white text-base">⚖️ i-Mentor Consulting</div>
        <div className="text-blue-300 text-xs hidden sm:flex gap-4">
          <span>📞 2810 363007</span>
          <span>📧 info@i-mentor.gr</span>
          <span>🌐 www.i-mentor.gr</span>
        </div>
      </div>

      {/* HERO */}
      <div className="px-4 pt-10 pb-8 text-center">
        <div className="inline-block bg-white/10 text-blue-200 text-xs font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-widest">
          Ανάλυση Εξωδικαστικού Μηχανισμού
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-white mb-2">{data.client_name}</h1>
        <div className="flex items-center justify-center gap-3 flex-wrap mb-6">
          <span className="text-blue-300 text-sm">{data.debtor_type}</span>
          <span className="text-blue-500">•</span>
          <span className="text-blue-300 text-sm">
            {data.created_at ? format(new Date(data.created_at), 'dd MMMM yyyy', { locale: el }) : ''}
          </span>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${stCls}`}>{st}</span>
        </div>

        {/* Status timeline */}
        <div className="flex items-center justify-center max-w-lg mx-auto mb-8">
          {STATUS_ORDER.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${
                  i < statusIdx ? 'bg-green-400 border-green-400 text-white'
                  : i === statusIdx ? 'bg-white border-white text-blue-900 scale-110'
                  : 'bg-white/10 border-white/20 text-white/40'
                }`}>{i < statusIdx ? '✓' : i + 1}</div>
                <div className={`text-xs mt-1 font-semibold ${i === statusIdx ? 'text-white' : 'text-white/40'}`}>
                  {STATUS_LABELS[s]}
                </div>
              </div>
              {i < STATUS_ORDER.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 mb-5 ${i < statusIdx ? 'bg-green-400' : 'bg-white/20'}`} />
              )}
            </div>
          ))}
        </div>

        {/* KPI cards */}
        {est.sumDebt > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
            <KpiBlock label="Συνολική Οφειλή" value={fmt(est.sumDebt)} accent="text-white" />
            <KpiBlock label="Εκτ. Διαγραφή" value={fmt(est.sumWr)} sub={writeoffPct > 0 ? `${writeoffPct}% του συνόλου` : null} accent="text-orange-300" />
            <KpiBlock label="Εναπομένουσα" value={fmt(est.totalRemaining)} accent="text-blue-200" />
            <KpiBlock label="Μηνιαία Δόση" value={fmt(est.totalMonthlyPay)} sub={ratio > 0 ? `${ratio}% εισοδήματος` : null} accent="text-green-300" />
          </div>
        )}
      </div>

      {/* CONTENT CARDS */}
      <div className="max-w-3xl mx-auto px-4 pb-12 space-y-5">

        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
          ⚠️ <b>Θεωρητική Προσομοίωση:</b> Τα παρακάτω αποτελέσματα αποτελούν εκτίμηση βάσει των στοιχείων που παρείχατε και δεν συνιστούν δεσμευτική πρόταση ή εγγύηση αποτελέσματος.
        </div>

        {/* Income summary */}
        {(est.annualIncome > 0 || est.dispMonthly > 0) && (
          <div className="bg-white rounded-2xl shadow-lg p-5">
            <h2 className="text-base font-black text-blue-800 border-b-2 border-blue-100 pb-2 mb-3">💶 Εισοδηματική Εικόνα</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {est.annualIncome > 0 && <div><span className="text-gray-500">Ετήσιο εισόδημα:</span> <b>{fmt(est.annualIncome)}</b></div>}
              {est.totalExpenses > 0 && <div><span className="text-gray-500">Σύνολο δαπανών:</span> <b>{fmt(est.totalExpenses)}</b></div>}
              {est.dispAnnual > 0 && <div><span className="text-gray-500">Ετήσιο διαθέσιμο (×80%):</span> <b>{fmt(est.dispAnnual)}</b></div>}
              {est.dispMonthly > 0 && <div><span className="text-gray-500">Μηνιαίο διαθέσιμο:</span> <b className="text-blue-700">{fmt(est.dispMonthly)}</b></div>}
            </div>
          </div>
        )}

        {/* Creditor table */}
        {finalPlan.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-5">
            <h2 className="text-base font-black text-blue-800 border-b-2 border-blue-100 pb-2 mb-3">📊 Αναλυτική Εκτίμηση ανά Πιστωτή</h2>
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
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { label: 'Συνολική Εκτ. Διαγραφή', value: est.sumWr, color: 'text-orange-600' },
                { label: 'Εναπομένουσες Οφειλές', value: est.totalRemaining, color: 'text-blue-700' },
                { label: 'Συνολικές Μηνιαίες Δόσεις', value: est.totalMonthlyPay, color: 'text-green-700' },
              ].map((k) => (
                <div key={k.label} className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-blue-600 font-semibold mb-1">{k.label}</div>
                  <div className={`text-lg font-black ${k.color}`}>{k.value ? fmt(k.value) : '—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Forecast */}
        {forecastSections.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-5">
            <h2 className="text-base font-black text-blue-800 border-b-2 border-blue-100 pb-2 mb-4">🔮 {forecastTitle}</h2>
            <div className="space-y-3">
              {forecastSections.map((s, i) => <ForecastSection key={i} s={s} />)}
            </div>
          </div>
        )}

        {/* Actual results */}
        {hasActuals && (
          <div className="bg-white rounded-2xl shadow-lg p-5">
            <h2 className="text-base font-black text-green-700 border-b-2 border-green-100 pb-2 mb-4">✅ Πραγματικά Αποτελέσματα Ρύθμισης</h2>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Πραγματική Διαγραφή', value: act.actualWriteOff, color: 'text-orange-600' },
                  { label: 'Εναπομένουσα Οφειλή', value: act.actualRemaining, color: 'text-blue-700' },
                  { label: 'Μηνιαία Δόση', value: act.actualMonthlyPay, color: 'text-green-700' },
                  { label: 'Διάρκεια', value: act.actualDurationMonths, isMonths: true },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <div className="text-xs font-semibold text-green-700 mb-1">{item.label}</div>
                    <div className={`text-xl font-black ${item.color || 'text-blue-800'}`}>
                      {item.isMonths ? `${item.value || '—'} μήνες` : (item.value ? fmt(item.value) : '—')}
                    </div>
                  </div>
                ))}
              </div>
              {act.actualNotes && (
                <div className="mt-3 text-sm text-green-800 italic border-t border-green-200 pt-2">💬 {act.actualNotes}</div>
              )}
            </div>
            {est.sumDebt > 0 && (
              <div className="overflow-x-auto">
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
          </div>
        )}

        {/* CTA */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-base font-black text-blue-800 mb-3">🟦 Επόμενα Βήματα</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            Η ομάδα της <b>i-Mentor Consulting</b> είναι στη διάθεσή σας για οποιαδήποτε διευκρίνιση ή για την προετοιμασία της επίσημης αίτησης στον Εξωδικαστικό Μηχανισμό Ρύθμισης Οφειλών. Κάθε υπόθεση αντιμετωπίζεται με πλήρη εμπιστευτικότητα και επαγγελματισμό.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a href="tel:2810363007" className="flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all">
              📞 2810 363007
            </a>
            <a href="mailto:info@i-mentor.gr" className="flex items-center justify-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold py-3 px-4 rounded-xl text-sm transition-all">
              📧 info@i-mentor.gr
            </a>
            <a href="https://www.i-mentor.gr" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold py-3 px-4 rounded-xl text-sm transition-all">
              🌐 www.i-mentor.gr
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-6 text-blue-400 text-xs px-4 border-t border-white/10">
        <p>© i-Mentor Consulting — Εμπιστευτικό έγγραφο, αποκλειστικά για τον αποδέκτη</p>
        <p className="mt-1 text-blue-500">Ανάλυση: {data.employee} • {data.created_at ? format(new Date(data.created_at), 'dd/MM/yyyy') : ''}</p>
      </div>
    </div>
  )
}
