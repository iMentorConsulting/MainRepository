import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { el } from 'date-fns/locale'
import { ArrowLeftIcon, PencilIcon, LinkIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import * as api from '../api'
import { fmt, creditorDisplayName } from '../utils/calculations'

const STATUS_LABELS = {
  draft: { label: 'Πρόχειρο', cls: 'bg-gray-100 text-gray-700' },
  submitted: { label: 'Υποβλήθηκε', cls: 'bg-blue-100 text-blue-700' },
  in_review: { label: 'Υπό Εξέταση', cls: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Ολοκληρώθηκε', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Ακυρώθηκε', cls: 'bg-red-100 text-red-700' },
}

function MoneyInput({ label, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        className="input"
        placeholder="0"
        value={value > 0 ? value.toLocaleString('el-GR') : ''}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, '')
          onChange(raw ? parseInt(raw) : 0)
        }}
      />
    </div>
  )
}

function DiffBadge({ estimated, actual }) {
  if (!actual || !estimated) return null
  const diff = actual - estimated
  const pct = estimated > 0 ? Math.round((diff / estimated) * 100) : 0
  const color = diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'
  return (
    <span className={`text-xs font-bold ml-2 ${color}`}>
      {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {Math.abs(pct)}%
    </span>
  )
}

export default function CaseDetail({ currentEmployee }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actuals, setActuals] = useState({
    actualWriteOff: 0,
    actualRemaining: 0,
    actualMonthlyPay: 0,
    actualDurationMonths: 0,
    actualNotes: '',
  })
  const [savingActuals, setSavingActuals] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.getCase(id)
      setCaseData(res.data)
      if (res.data.actual_results) {
        setActuals({ actualWriteOff: 0, actualRemaining: 0, actualMonthlyPay: 0, actualDurationMonths: 0, actualNotes: '', ...res.data.actual_results })
      }
    } catch { toast.error('Σφάλμα φόρτωσης') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  const handleSaveActuals = async () => {
    setSavingActuals(true)
    try {
      await api.saveActualResults(id, { actual_results: actuals })
      toast.success('Πραγματικά αποτελέσματα αποθηκεύτηκαν ✓')
      load()
    } catch { toast.error('Σφάλμα αποθήκευσης') }
    finally { setSavingActuals(false) }
  }

  const handleStatusChange = async (newStatus) => {
    setStatusUpdating(true)
    try {
      await api.updateCase(id, { status: newStatus })
      toast.success('Κατάσταση ενημερώθηκε')
      load()
    } catch { toast.error('Σφάλμα') }
    finally { setStatusUpdating(false) }
  }

  const copyShareLink = () => {
    if (!caseData) return
    const url = `${window.location.origin}/preview/${caseData.share_token}`
    navigator.clipboard.writeText(url).then(() => toast.success('Σύνδεσμος αντιγράφηκε!')).catch(() => toast.error('Αδύνατη αντιγραφή'))
  }

  if (loading) return <div className="p-10 text-center text-gray-400">Φόρτωση…</div>
  if (!caseData) return <div className="p-10 text-center text-red-500">Η υπόθεση δεν βρέθηκε</div>

  const est = caseData.estimates || {}
  const act = caseData.actual_results
  const st = STATUS_LABELS[caseData.status] || STATUS_LABELS.draft
  const finalPlan = est.finalPlan || []

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-blue-800">{caseData.client_name}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
              <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">{caseData.employee}</span>
              <span className="text-xs text-gray-500">{caseData.created_at ? format(new Date(caseData.created_at), 'dd/MM/yyyy', { locale: el }) : '—'}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={copyShareLink} className="btn-secondary gap-2 text-sm">
            <LinkIcon className="w-4 h-4" /> Σύνδεσμος Πελάτη
          </button>
          <button onClick={() => navigate(`/cases/${id}/edit`)} className="btn-secondary gap-2 text-sm">
            <PencilIcon className="w-4 h-4" /> Επεξεργασία
          </button>
        </div>
      </div>

      {/* Status changer */}
      <div className="card mb-5 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-600">Αλλαγή κατάστασης:</span>
        {Object.entries(STATUS_LABELS).map(([key, { label, cls }]) => (
          <button
            key={key}
            disabled={caseData.status === key || statusUpdating}
            onClick={() => handleStatusChange(key)}
            className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${caseData.status === key ? cls + ' ring-2 ring-offset-1 ring-blue-400' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Client info */}
      <div className="card mb-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><div className="label">Τύπος</div><div className="font-semibold">{caseData.debtor_type}</div></div>
        <div><div className="label">Τηλέφωνο</div><div>{caseData.client_phone || '—'}</div></div>
        <div><div className="label">Email</div><div>{caseData.client_email || '—'}</div></div>
        <div><div className="label">Σημειώσεις</div><div className="text-gray-500 italic">{caseData.notes || '—'}</div></div>
      </div>

      {/* Estimated results */}
      <h2 className="section-title">📊 Εκτιμώμενα Αποτελέσματα</h2>
      <div className="card mb-5">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="kpi-card">
            <div className="kpi-label">Συνολική Οφειλή</div>
            <div className="kpi-value">{est.sumDebt ? fmt(est.sumDebt) : '—'}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Εκτ. Διαγραφή</div>
            <div className="kpi-value text-orange-600">{est.sumWr ? fmt(est.sumWr) : '—'}</div>
            {est.sumWrPct > 0 && <div className="text-xs text-orange-500">({est.sumWrPct}%)</div>}
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Εκτ. Εναπομένουσα</div>
            <div className="kpi-value">{est.totalRemaining ? fmt(est.totalRemaining) : '—'}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Εκτ. Μηνιαία Δόση</div>
            <div className="kpi-value text-green-700">{est.totalMonthlyPay ? fmt(est.totalMonthlyPay) : '—'}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Μηνιαίο Διαθέσιμο</div>
            <div className="kpi-value text-blue-600">{est.dispMonthly ? fmt(est.dispMonthly) : '—'}</div>
          </div>
        </div>

        {finalPlan.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b-2 border-blue-100">
                  <th className="th text-left">Πιστωτής</th>
                  <th className="th">Αρχική</th>
                  <th className="th">Διαγραφή</th>
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
      </div>

      {/* Actual results entry */}
      <h2 className="section-title">✅ Πραγματικά Αποτελέσματα Ρύθμισης</h2>
      <div className="card mb-5">
        {act && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex items-center gap-2 text-sm text-green-800">
            <CheckCircleIcon className="w-5 h-5 shrink-0" />
            Τα πραγματικά αποτελέσματα έχουν καταχωρηθεί.
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <MoneyInput label="Πραγματική Διαγραφή (€)" value={actuals.actualWriteOff} onChange={(v) => setActuals({ ...actuals, actualWriteOff: v })} />
          <MoneyInput label="Πραγματική Εναπομένουσα (€)" value={actuals.actualRemaining} onChange={(v) => setActuals({ ...actuals, actualRemaining: v })} />
          <MoneyInput label="Πραγματική Μηνιαία Δόση (€)" value={actuals.actualMonthlyPay} onChange={(v) => setActuals({ ...actuals, actualMonthlyPay: v })} />
          <MoneyInput label="Πραγματική Διάρκεια (μήνες)" value={actuals.actualDurationMonths} onChange={(v) => setActuals({ ...actuals, actualDurationMonths: v })} />
          <div className="md:col-span-4">
            <label className="label">Σημειώσεις αποτελέσματος</label>
            <input className="input" placeholder="π.χ. Τράπεζα δέχτηκε μερική πρόταση…" value={actuals.actualNotes} onChange={(e) => setActuals({ ...actuals, actualNotes: e.target.value })} />
          </div>
        </div>
        <button onClick={handleSaveActuals} disabled={savingActuals} className="btn-primary gap-2">
          <CheckCircleIcon className="w-4 h-4" />
          {savingActuals ? 'Αποθήκευση…' : 'Αποθήκευση Αποτελεσμάτων'}
        </button>
      </div>

      {/* Comparison */}
      {act && est.sumDebt > 0 && (
        <>
          <h2 className="section-title">📈 Σύγκριση Εκτίμησης vs Πραγματικού</h2>
          <div className="card mb-5">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-blue-100">
                  <th className="th text-left">Δείκτης</th>
                  <th className="th">Εκτίμηση</th>
                  <th className="th">Πραγματικό</th>
                  <th className="th">Διαφορά</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Διαγραφή', est: est.sumWr, act: act.actualWriteOff },
                  { label: 'Εναπομένουσα Οφειλή', est: est.totalRemaining, act: act.actualRemaining },
                  { label: 'Μηνιαία Δόση', est: est.totalMonthlyPay, act: act.actualMonthlyPay },
                ].map((row) => {
                  const diff = (row.act || 0) - (row.est || 0)
                  const pct = row.est > 0 ? Math.round(Math.abs(diff) / row.est * 100) : 0
                  const positive = diff >= 0
                  return (
                    <tr key={row.label} className="border-b border-gray-100">
                      <td className="td text-left font-semibold">{row.label}</td>
                      <td className="td font-mono text-gray-600">{row.est ? fmt(row.est) : '—'}</td>
                      <td className="td font-mono font-bold">{row.act ? fmt(row.act) : '—'}</td>
                      <td className="td">
                        {row.est > 0 && row.act > 0 && (
                          <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {positive ? '▲' : '▼'} {pct}%
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {act.actualNotes && (
              <div className="mt-3 bg-gray-50 rounded-lg px-4 py-2 text-sm text-gray-600 italic">
                💬 {act.actualNotes}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
