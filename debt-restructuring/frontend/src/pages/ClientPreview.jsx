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

function rng(conservative, base) {
  if (conservative == null) return fmt(base)
  const lo = Math.min(conservative, base)
  const hi = Math.max(conservative, base)
  const diff = hi - lo
  if (diff === 0) return fmt(hi)
  const loStr = fmt(lo)
  const hiStr = fmt(hi)
  if (loStr === hiStr) return hiStr
  if (diff < 10 || diff / hi < 0.05) return fmt(base)
  return `${loStr} – ${hiStr}`
}

const fmtDec2 = (n) => Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'

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

  const isVulnerable = !!(data.income_data?.isVulnerable) && !data.debtor_type?.includes('Νομικό')
  // Fallback: compute conservative aggregates from finalPlan entries if not in est (old cases)
  const sumWrC = est.sumWrC ?? finalPlan.reduce((s, p) => s + (p.writeoffC || 0), 0)
  const totalRemainingC = est.totalRemainingC ?? finalPlan.reduce((s, p) => s + (p.newAmtC || 0), 0)
  const totalMonthlyPayC = est.totalMonthlyPayC ?? finalPlan.reduce((s, p) => s + (p.payShownC || 0), 0)
  const totalC1C = est.totalC1C ?? finalPlan.reduce((s, p) => s + (p.c1C || 0), 0)
  const hasConservative = !isVulnerable && sumWrC != null && finalPlan.some(p => p.writeoffC != null)
  const nonErasableTotal = est.nonErasableTotal || (data.debts || []).reduce((s, d) => s + (d.pubCategories?.nonErasableBasic || 0), 0)

  // Chart data — use finalPlan (always stored) for correct type breakdown
  const banksDebt = finalPlan.filter(p => p.type === 'Τράπεζα').reduce((s, p) => s + (p.amount || 0), 0)
  const taxDebt = finalPlan.filter(p => p.type === 'Εφορία').reduce((s, p) => s + (p.amount || 0), 0)
  const fundsDebt = finalPlan.filter(p => p.type === 'Ασφαλιστικά Ταμεία').reduce((s, p) => s + (p.amount || 0), 0)
  const totalDebt = est.sumDebt || 1
  const banksPct = Math.round(banksDebt / totalDebt * 100)
  const taxPct = Math.round(taxDebt / totalDebt * 100)
  const fundsPct = 100 - banksPct - taxPct
  const writeoffAmt = est.sumWr || 0
  const remainingAmt = est.totalRemaining || 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800">

      {/* TOP BAR */}
      <div className="flex justify-between items-center px-5 py-3 bg-white/5 backdrop-blur-sm border-b border-white/10">
        <img src="https://i-mentor.gr/wp-content/uploads/2025/11/transparent-logo.png" alt="i-Mentor Consulting" className="h-8 object-contain" />
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
            <KpiBlock label="Εκτ. Διαγραφή" value={hasConservative ? rng(sumWrC, est.sumWr) : fmt(est.sumWr)} sub={writeoffPct > 0 ? `${writeoffPct}% του συνόλου` : null} accent="text-orange-300" />
            <KpiBlock label="Εναπομένουσα" value={hasConservative ? rng(totalRemainingC, est.totalRemaining) : fmt(est.totalRemaining)} accent="text-blue-200" />
            <KpiBlock label="Μηνιαία Δόση" value={hasConservative ? rng(totalMonthlyPayC, est.totalMonthlyPay) : fmt(est.totalMonthlyPay)} sub={ratio > 0 ? `${ratio}% εισοδήματος` : null} accent="text-green-300" />
          </div>
        )}
      </div>

      {/* CONTENT CARDS */}
      <div className="max-w-3xl mx-auto px-4 pb-12 space-y-5">

        {/* ΕΚΤΙΜΗΣΗ prominent banner */}
        <div className="bg-amber-400 rounded-2xl px-6 py-5 text-center">
          <div className="text-2xl font-black text-amber-900 tracking-widest uppercase mb-1">⚠️ ΕΚΤΙΜΗΣΗ — ΟΧΙ ΑΠΟΤΕΛΕΣΜΑ</div>
          <div className="text-amber-800 text-sm font-semibold">
            Το παρόν έγγραφο αποτελεί <b>θεωρητική εκτίμηση</b> βάσει των στοιχείων που δηλώθηκαν και του αλγορίθμου του Εξωδικαστικού Μηχανισμού.
            Δεν αποτελεί δεσμευτική πρόταση ούτε εγγύηση αποτελέσματος.
            Η i-Mentor Consulting δεν φέρει ευθύνη για αποκλίσεις από το τελικό αποτέλεσμα.
          </div>
        </div>

        {/* Ευάλωτος banner */}
        {isVulnerable && (
          <div className="bg-teal-50 border-2 border-teal-400 rounded-2xl p-5">
            <div className="text-lg font-black text-teal-800 mb-2">🛡️ ΕΥΑΛΩΤΟΣ ΟΦΕΙΛΕΤΗΣ</div>
            <p className="text-teal-700 text-sm mb-2">Με βάση τη βεβαίωση ευάλωτου οφειλέτη (περ. β΄ άρθρου 217 ν. 4738/2020), ισχύουν οι ευνοϊκές διατάξεις του <b>άρθρου 66 ν. 5072/2023</b>:</p>
            <ul className="list-disc list-inside text-teal-800 text-sm space-y-1">
              <li><b>Τεκμαιρόμενη συναίνεση</b> όλων των πιστωτών (τράπεζες, Δημόσιο, ΦΚΑ)</li>
              <li><b>Υποχρεωτική αποδοχή</b> πρότασης εφόσον πληρούνται οι προϋποθέσεις ΚΥΑ</li>
            </ul>
          </div>
        )}

        {/* Income summary — enriched */}
        {(est.annualIncome > 0 || est.dispMonthly > 0 || data.income_data) && (() => {
          const inc = data.income_data || {}
          const isLegal = data.debtor_type?.includes('Νομικό')
          const HOUSEHOLD_OPTS = [[6448,'Ένας ενήλικας'],[10866,'Δύο ενήλικες'],[9096,'Ένας ενήλικας με 1 τέκνο'],[13514,'Δύο ενήλικες με 1 τέκνο'],[16162,'Δύο ενήλικες με 2 τέκνα'],[18659,'Δύο ενήλικες με 2 τέκνα + εξαρτ.'],[18810,'Δύο ενήλικες με 3 τέκνα'],[21307,'Δύο ενήλικες με 3 τέκνα + εξαρτ.'],[21458,'Δύο ενήλικες με 4 τέκνα']]
          const hhLabel = HOUSEHOLD_OPTS.find(o => o[0] === inc.householdValue)?.[1]
          const assets = data.assets || []
          return (
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <h2 className="text-base font-black text-blue-800 border-b-2 border-blue-100 pb-2 mb-3">💶 Εισοδηματική & Περιουσιακή Εικόνα</h2>
              {isLegal ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {inc.turnover > 0 && <div><span className="text-gray-500">Κύκλος εργασιών:</span> <b>{fmt(inc.turnover)}</b></div>}
                  {inc.ebitda > 0 && <div><span className="text-gray-500">EBITDA:</span> <b>{fmt(inc.ebitda)}</b></div>}
                  {est.dispMonthly > 0 && <div><span className="text-gray-500">Μηνιαίο διαθέσιμο:</span> <b className="text-blue-700">{fmt(est.dispMonthly)}</b></div>}
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Εισοδήματα</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {inc.annualIncome > 0 && <div><span className="text-gray-500">Ετήσιο εισόδημα:</span> <b>{fmt(inc.annualIncome)}</b></div>}
                      {est.dispAnnual > 0 && <div><span className="text-gray-500">Διαθέσιμο (×80%):</span> <b className="text-blue-700">{fmt(est.dispAnnual)}</b></div>}
                      {est.dispMonthly > 0 && <div className="col-span-2"><span className="text-gray-500">Μηνιαίο διαθέσιμο:</span> <b className="text-blue-700 text-base">{fmt(est.dispMonthly)}</b></div>}
                    </div>
                  </div>
                  {(inc.householdValue > 0 || inc.enfiaCost > 0 || inc.medicalCost > 0 || inc.rentCost > 0 || inc.studentRentCost > 0 || inc.extraLivingCost > 0 || inc.alimonyCost > 0) && (
                    <div className="mb-3">
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Νοικοκυριό & Δαπάνες</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {inc.householdValue > 0 && <div><span className="text-gray-500">Εύλογες δαπάνες{hhLabel ? ` (${hhLabel})` : ''}:</span> <b>{fmt(inc.householdValue)}</b></div>}
                        {inc.enfiaCost > 0 && <div><span className="text-gray-500">ΕΝΦΙΑ:</span> <b>{fmt(inc.enfiaCost)}</b></div>}
                        {inc.medicalCost > 0 && <div><span className="text-gray-500">Ιατρικές δαπάνες:</span> <b>{fmt(inc.medicalCost)}</b></div>}
                        {inc.rentCost > 0 && <div><span className="text-gray-500">Ενοίκιο:</span> <b>{fmt(inc.rentCost)}</b></div>}
                        {inc.studentRentCost > 0 && <div><span className="text-gray-500">Ενοίκιο φοιτητών:</span> <b>{fmt(inc.studentRentCost)}</b></div>}
                        {inc.extraLivingCost > 0 && <div><span className="text-gray-500">Πρόσθετη διατροφή:</span> <b>{fmt(inc.extraLivingCost)}</b></div>}
                        {inc.alimonyCost > 0 && <div><span className="text-gray-500">Διατροφή (διαζύγιο):</span> <b>{fmt(inc.alimonyCost)}</b></div>}
                        {est.totalExpenses > 0 && <div className="col-span-2 font-semibold"><span className="text-gray-500">Σύνολο δαπανών:</span> <b>{fmt(est.totalExpenses)}</b></div>}
                      </div>
                    </div>
                  )}
                  {assets.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ακίνητα & Περιουσία</div>
                      <div className="space-y-1 text-sm">
                        {assets.map((a, i) => (
                          <div key={i} className="flex justify-between">
                            <span className="text-gray-600">{a.description || a.type || `Ακίνητο ${i+1}`}</span>
                            <b>{fmt(a.value)}</b>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })()}

        {/* Creditor table */}
        {finalPlan.length > 0 && (() => {
          const hasStepUp = finalPlan.some((p) => p.c1 != null && p.c2 != null && p.c1 !== p.c2)
          const totalC1 = finalPlan.reduce((s, p) => s + (p.c1 ?? p.payShown ?? 0), 0)
          return (
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
                      {hasStepUp ? (
                        <>
                          <th className="th">Δόση Έτη 1–3</th>
                          <th className="th">Δόση Έτη 4+</th>
                        </>
                      ) : (
                        <th className="th">Μηνιαία</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {finalPlan.map((p, i) => {
                      const c1 = p.c1 ?? p.payShown
                      const c2 = p.c2 ?? p.payShown
                      return (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="td text-left font-semibold">{creditorDisplayName(p.type, p.creditorName)}</td>
                          <td className="td font-mono">{fmt(p.amount)}</td>
                          <td className="td font-mono text-orange-600">{p.writeoff > 0 ? `${hasConservative ? rng(p.writeoffC, p.writeoff) : fmt(p.writeoff)} (${p.writeoffPct}%)` : '—'}</td>
                          <td className="td font-mono">{hasConservative ? rng(p.newAmtC, p.newAmt) : fmt(p.newAmt)}</td>
                          <td className="td">{p.months}</td>
                          {hasStepUp ? (
                            <>
                              <td className="td font-mono text-blue-600">{hasConservative ? rng(p.c1C, c1) : fmt(c1)}</td>
                              <td className="td font-mono font-bold text-blue-900">{hasConservative ? rng(p.c2C, c2) : fmt(c2)}{c1 !== c2 && <span className="text-xs text-amber-600 ml-1">↑</span>}</td>
                            </>
                          ) : (
                            <td className="td font-mono font-bold text-blue-800">{hasConservative ? rng(p.payShownC, p.payShown) : fmt(p.payShown)}</td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {hasStepUp && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                  ↑ Η δόση «Έτη 4+» ισχύει μετά τη λήξη της τριετούς προνομιακής περιόδου (Euribor + spread).
                </p>
              )}
              <div className={`grid gap-3 mt-4 ${hasStepUp ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-blue-600 font-semibold mb-1">Συνολική Εκτ. Διαγραφή</div>
                  <div className="text-lg font-black text-orange-600">{est.sumWr ? (hasConservative ? rng(sumWrC, est.sumWr) : fmt(est.sumWr)) : '—'}</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-blue-600 font-semibold mb-1">Εναπομένουσες Οφειλές</div>
                  <div className="text-lg font-black text-blue-700">{est.totalRemaining ? (hasConservative ? rng(totalRemainingC, est.totalRemaining) : fmt(est.totalRemaining)) : '—'}</div>
                </div>
                {hasStepUp ? (
                  <>
                    <div className="bg-blue-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-blue-600 font-semibold mb-1">Δόσεις Έτη 1–3</div>
                      <div className="text-lg font-black text-blue-600">{hasConservative ? rng(totalC1C, totalC1) : fmt(totalC1)}</div>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-blue-600 font-semibold mb-1">Δόσεις Έτη 4+</div>
                      <div className="text-lg font-black text-green-700">{est.totalMonthlyPay ? (hasConservative ? rng(totalMonthlyPayC, est.totalMonthlyPay) : fmt(est.totalMonthlyPay)) : '—'}</div>
                    </div>
                  </>
                ) : (
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <div className="text-xs text-blue-600 font-semibold mb-1">Συνολικές Μηνιαίες Δόσεις</div>
                    <div className="text-lg font-black text-green-700">{est.totalMonthlyPay ? (hasConservative ? rng(totalMonthlyPayC, est.totalMonthlyPay) : fmt(est.totalMonthlyPay)) : '—'}</div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* Non-erasable amounts notice */}
        {nonErasableTotal > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5">
            <div className="text-base font-black text-red-700 mb-2">⚠️ Μη Διαγράψιμα Ποσά — {fmt(nonErasableTotal)}</div>
            <p className="text-sm text-red-800">Βάσει ΚΥΑ 13243/2024, οι παρακάτω κατηγορίες οφειλών <b>δεν επιτρέπεται να διαγραφούν</b> μέσω Εξωδικαστικού Μηχανισμού και καταβάλλονται στο ακέραιο:</p>
            <ul className="list-disc list-inside text-sm text-red-700 mt-2 space-y-1">
              <li>Παρακρατούμενοι / επιρριπτόμενοι φόροι (ΦΠΑ, ΦΜΥ κτλ.)</li>
              <li>Παρακρατούμενες εισφορές ΕΦΚΑ</li>
            </ul>
            <div className="mt-3 bg-red-100 rounded-xl px-4 py-2 text-sm font-bold text-red-800">
              Σύνολο μη διαγράψιμων: {fmt(nonErasableTotal)} — <span className="font-normal">δεν συμπεριλαμβάνεται στις εκτιμώμενες διαγραφές</span>
            </div>
          </div>
        )}

        {/* Charts */}
        {est.sumDebt > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-5">
            <h2 className="text-base font-black text-blue-800 border-b-2 border-blue-100 pb-2 mb-5">Γραφική Απεικόνιση Εκτίμησης</h2>

            {/* Before / After — big clear comparison */}
            <div className="mb-6">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Εκτίμηση: Πριν & Μετά τη Ρύθμιση</div>
              <div className="grid grid-cols-3 gap-3 items-center">
                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 text-center">
                  <div className="text-xs font-semibold text-red-400 uppercase mb-1">Αρχική Οφειλή</div>
                  <div className="text-2xl font-black text-red-600">{fmt(totalDebt)}</div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="text-2xl">→</div>
                  {writeoffAmt > 0 && (
                    <div className="bg-orange-100 rounded-xl px-3 py-1 text-center">
                      <div className="text-xs text-orange-500 font-semibold">Εκτ. Διαγραφή</div>
                      <div className="text-sm font-black text-orange-600">−{fmt(writeoffAmt)}</div>
                    </div>
                  )}
                </div>
                <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-4 text-center">
                  <div className="text-xs font-semibold text-green-500 uppercase mb-1">Εκτ. Εναπομένουσα</div>
                  <div className="text-2xl font-black text-green-700">{fmt(remainingAmt)}</div>
                </div>
              </div>
            </div>

            {/* Debt breakdown by category */}
            {(banksDebt > 0 || taxDebt > 0 || fundsDebt > 0) && (
              <div className="mb-5">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Κατανομή Οφειλών ανά Κατηγορία</div>
                <div className="space-y-2">
                  {[
                    { label: 'Τράπεζες', amount: banksDebt, pct: banksPct, color: 'bg-blue-500' },
                    { label: 'ΑΑΔΕ', amount: taxDebt, pct: taxPct, color: 'bg-orange-400' },
                    { label: 'Ασφαλιστικά Ταμεία', amount: fundsDebt, pct: fundsPct, color: 'bg-purple-500' },
                  ].filter(r => r.amount > 0).map((r) => (
                    <div key={r.label} className="flex items-center gap-3">
                      <div className="w-28 text-xs font-semibold text-gray-600 shrink-0">{r.label}</div>
                      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                        <div className={`h-full ${r.color} rounded-full`} style={{ width: `${r.pct}%` }} />
                      </div>
                      <div className="text-xs font-bold text-gray-700 w-16 text-right">{fmt(r.amount)}</div>
                      <div className="text-xs text-gray-400 w-8">{r.pct}%</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly payment ratio */}
            {est.dispMonthly > 0 && est.totalMonthlyPay > 0 && (
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Εκτ. Μηνιαία Δόση ως % Διαθέσιμου Εισοδήματος</div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${ratio > 80 ? 'bg-red-400' : ratio > 50 ? 'bg-orange-400' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(ratio, 100)}%` }}
                    />
                  </div>
                  <div className={`text-sm font-black w-12 ${ratio > 80 ? 'text-red-500' : ratio > 50 ? 'text-orange-500' : 'text-green-600'}`}>{ratio}%</div>
                </div>
                <div className="flex gap-4 text-xs text-gray-400 mt-1">
                  <span className="text-green-600">Άνετο &lt;40%</span>
                  <span className="text-orange-500">Οριακό 40–60%</span>
                  <span className="text-red-500">Επικίνδυνο &gt;60%</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Forecast */}
        {forecastSections.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-5">
            <h2 className="text-base font-black text-blue-800 border-b-2 border-blue-100 pb-2 mb-4">{forecastTitle}</h2>
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
                  { label: 'Μηνιαία Δόση', value: act.actualMonthlyPay, color: 'text-green-700', isDec: true },
                  { label: 'Διάρκεια', value: act.actualDurationMonths, isMonths: true },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <div className="text-xs font-semibold text-green-700 mb-1">{item.label}</div>
                    <div className={`text-xl font-black ${item.color || 'text-blue-800'}`}>
                      {item.isMonths ? `${item.value || '—'} μήνες` : (item.value ? (item.isDec ? fmtDec2(item.value) : fmt(item.value)) : '—')}
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
                      { label: 'Μηνιαία Δόση', e: est.totalMonthlyPay, a: act.actualMonthlyPay, isDec: true },
                    ].map((row) => {
                      const diff = (row.a || 0) - (row.e || 0)
                      const pct = row.e > 0 ? Math.round(Math.abs(diff) / row.e * 100) : 0
                      return (
                        <tr key={row.label} className="border-b border-gray-100">
                          <td className="td text-left font-semibold">{row.label}</td>
                          <td className="td font-mono text-gray-500">{row.e ? fmt(row.e) : '—'}</td>
                          <td className="td font-mono font-bold">{row.a ? (row.isDec ? fmtDec2(row.a) : fmt(row.a)) : '—'}</td>
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

        {/* Service differentiation — "Δεν σταματάμε στην υποβολή" */}
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <h2 className="text-base font-black text-blue-800 border-b-2 border-blue-100 pb-2 mb-4">🏆 Γιατί η i-Mentor;</h2>
          <p className="text-sm font-bold text-blue-900 mb-2">Δεν σταματάμε στην υποβολή — ανεβάζουμε τεκμηριωμένο σχέδιο προς τους πιστωτές</p>
          <p className="text-sm text-gray-600 mb-4">Ενώ οι περισσότεροι σύμβουλοι σταματούν στην καταχώρηση της αίτησης, εμείς ανεβάζουμε επιπρόσθετα ένα <b>τεκμηριωμένο σχέδιο αναδιάρθρωσης</b> προσαρμοσμένο στους πιστωτές — τόσο για ιδιώτες όσο και για νομικά πρόσωπα.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="text-sm font-bold text-blue-800 mb-1">📄 Τεκμηριωμένο Σχέδιο Αναδιάρθρωσης</div>
              <div className="text-xs text-gray-600">Ειδικά τα funds και οι τράπεζες δίνουν αντιπρότασεις. Τεκμηριώνουμε τη δική μας πρόταση για μεγαλύτερη πιθανότητα αποδοχής ή ευνοϊκότερης αντιπρότασης.</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="text-sm font-bold text-amber-800 mb-1">💼 Business Plan για τη Δυσμενή Κατάσταση</div>
              <div className="text-xs text-gray-600">Περίληψη, οικονομική & περιουσιακή εικόνα, stress test βασικό & dark σενάριο, συνοπτική πρόταση ανά πιστωτή.</div>
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm">
            <span className="font-bold text-green-800">✅ Αυτό που μας ξεχωρίζει:</span>
            <span className="text-gray-700"> Η τεκμηρίωση προς τους πιστωτές είναι εξτρά βήμα που κάνουμε μόνο εμείς — με μετρήσιμο αντίκτυπο σε υποθέσεις με funds & τράπεζες.</span>
          </div>
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm">
            <span className="font-bold text-blue-800">📈 Στόχος μας:</span>
            <span className="text-gray-700"> Παρά την εκτίμησή μας, η πρόταση που καταθέτουμε στους πιστωτές στοχεύει να είναι <b>καλύτερη</b> από το θεωρητικό αποτέλεσμα — διεκδικώντας ευνοϊκότερες διαγραφές και χαμηλότερες δόσεις για εσάς.</span>
          </div>
        </div>

        {/* Οικονομική Προσφορά & IBANs */}
        {(() => {
          const offer = data.commercial_offer || {}
          if (!offer.application_fee && !offer.success_fee) return null
          return (
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <h2 className="text-base font-black text-blue-800 border-b-2 border-blue-100 pb-2 mb-4">💼 Οικονομική Προσφορά</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                {offer.application_fee > 0 && (
                  <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <div className="text-xs font-semibold text-blue-600 uppercase mb-1">Αίτηση & Διαδικασία</div>
                    <div className="text-2xl font-black text-blue-800">{Number(offer.application_fee).toLocaleString('el-GR')}€</div>
                    <div className="text-xs text-gray-500 mt-1">+ ΦΠΑ</div>
                  </div>
                )}
                {offer.success_fee > 0 && (
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <div className="text-xs font-semibold text-green-600 uppercase mb-1">Success Fee (σε αποδοχή)</div>
                    <div className="text-2xl font-black text-green-800">{Number(offer.success_fee).toLocaleString('el-GR')}€</div>
                    <div className="text-xs text-gray-500 mt-1">+ ΦΠΑ</div>
                  </div>
                )}
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="text-sm font-bold text-gray-700 mb-2">🏦 Τραπεζικοί Λογαριασμοί Πληρωμής</div>
                <div className="space-y-1 text-sm font-mono">
                  <div><span className="text-gray-500">Πειραιώς:</span> GR45 0171 4330 0064 3316 4381 388</div>
                  <div><span className="text-gray-500">Eurobank:</span> GR58 0260 1680 0000 6020 1330 648</div>
                  <div><span className="text-gray-500">Alpha Bank:</span> GR24 0140 7750 7750 0233 0002 138</div>
                  <div className="mt-1"><span className="text-gray-500">Δικαιούχος:</span> <b>I MENTOR IKE</b></div>
                </div>
              </div>
            </div>
          )
        })()}

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
      <div className="text-center py-8 px-4 border-t border-white/10">
        <img src="https://i-mentor.gr/wp-content/uploads/2025/11/transparent-logo.png" alt="i-Mentor Consulting" className="h-10 object-contain mx-auto mb-3 opacity-80" />
        <p className="text-blue-400 text-xs">© i-Mentor Consulting — Εμπιστευτικό έγγραφο, αποκλειστικά για τον αποδέκτη</p>
        <p className="mt-1 text-blue-500 text-xs">Ανάλυση: {data.employee} • {data.created_at ? format(new Date(data.created_at), 'dd/MM/yyyy') : ''}</p>
        <p className="mt-2 text-amber-400 text-xs font-bold">ΕΚΤΙΜΗΣΗ — ΟΧΙ ΑΠΟΤΕΛΕΣΜΑ</p>
      </div>
    </div>
  )
}
