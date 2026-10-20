import { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ArrowLeftIcon, EyeIcon, EyeSlashIcon, PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import * as api from '../api'
import { PORTAL_BASE } from '../api'
import FinanceIntakePanel from '../components/FinanceIntakePanel'
import {
  BANKRUPTCY_STAGES, SERVICE_BANKRUPTCY, successFeeSchedule, threeYearEnd, fmtDateGr, eur,
} from '../utils/bankruptcy'

const CONTACT_STAGES = ['Νέα Ανάλυση', 'Εστάλη Σύνδεσμος', 'Θετική Ανταπόκριση', 'Σε Διαπραγμάτευση', 'Έκλεισε', 'Δεν Ενδιαφέρεται']

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

export default function BankruptcyCase({ caseData, onChange }) {
  const navigate = useNavigate()
  const [b, setB] = useState(() => ({ ...(caseData.bankruptcy || {}) }))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newDoc, setNewDoc] = useState('')
  const [hearing, setHearing] = useState({ date: '', note: '' })

  const set = (k, v) => { setB(prev => ({ ...prev, [k]: v })); setDirty(true) }

  const schedule = useMemo(() => successFeeSchedule(b.success_fee, b.filing_date), [b.success_fee, b.filing_date])
  const feeTotal = (Number(b.fee_office) || 0) + (Number(b.fee_lawyer) || 0)
  const docs = b.documents || []
  const docsDone = docs.filter(d => d.done).length
  const stageIdx = Math.max(0, BANKRUPTCY_STAGES.indexOf(b.stage))
  const portalActive = caseData.portal_active !== false
  const installment = schedule[0]?.amount || (Number(b.success_fee) || 0) / 4

  const save = async () => {
    setSaving(true)
    try {
      const res = await api.updateCase(caseData.id, { bankruptcy: b })
      onChange(res.data)
      setB({ ...(res.data.bankruptcy || {}) })
      setDirty(false)
      toast.success('Αποθηκεύτηκε ✓')
    } catch { toast.error('Σφάλμα αποθήκευσης') }
    finally { setSaving(false) }
  }

  const togglePortal = async () => {
    try {
      const res = await api.updateCase(caseData.id, { portal_active: !portalActive })
      onChange(res.data)
      toast.success(!portalActive ? 'Portal ενεργοποιήθηκε' : 'Portal απενεργοποιήθηκε')
    } catch { toast.error('Σφάλμα') }
  }

  const changeContactStage = async (stage) => {
    try {
      const res = await api.updateContact(caseData.id, { contact_stage: stage })
      onChange(res.data)
    } catch { toast.error('Σφάλμα') }
  }

  const copyLink = () => {
    const url = `${PORTAL_BASE}/preview/${caseData.share_token}`
    navigator.clipboard.writeText(url).then(() => toast.success('Σύνδεσμος αντιγράφηκε!')).catch(() => toast.error('Αδύνατη αντιγραφή'))
  }

  const addDoc = () => {
    if (!newDoc.trim()) return
    set('documents', [...docs, { label: newDoc.trim(), done: false }])
    setNewDoc('')
  }
  const addHearing = () => {
    if (!hearing.date) return
    set('hearing_dates', [...(b.hearing_dates || []), hearing].sort((x, y) => x.date.localeCompare(y.date)))
    setHearing({ date: '', note: '' })
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeftIcon className="w-5 h-5 text-gray-600" /></button>
          <div>
            <div className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-black px-3 py-1 rounded-lg mb-1">⚖️ ΠΤΩΧΕΥΣΗ</div>
            <h1 className="text-2xl font-black text-blue-800">{caseData.client_name}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs">
              <span className="bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">{caseData.employee}</span>
              <span className="text-gray-500">{caseData.client_phone}</span>
              <span className="text-gray-500">{caseData.client_email}</span>
              {caseData.portal_visit_count > 0 && <span className="bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">👁 {caseData.portal_visit_count}</span>}
              {b.source_case_id && <Link to={`/cases/${b.source_case_id}`} className="text-violet-700 underline">↩ Εξωδικαστικός #{b.source_case_id}</Link>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={togglePortal}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border-2 ${portalActive ? 'bg-green-50 border-green-400 text-green-700' : 'bg-red-50 border-red-300 text-red-600'}`}>
            {portalActive ? <EyeIcon className="w-3.5 h-3.5" /> : <EyeSlashIcon className="w-3.5 h-3.5" />} Portal {portalActive ? 'ON' : 'OFF'}
          </button>
          <a href={`${PORTAL_BASE}/preview/${caseData.share_token}?notrack=1`} target="_blank" rel="noreferrer" className="btn-secondary gap-2 text-sm"
             onClick={() => { if (caseData.client_vat) navigator.clipboard.writeText(caseData.client_vat).then(() => toast.success('ΑΦΜ αντιγράφηκε')).catch(() => {}) }}>
            <EyeIcon className="w-4 h-4" /> Προβολή portal
          </a>
          <button onClick={copyLink} className="btn-secondary text-sm">🔗 Αντιγραφή συνδέσμου</button>
          <Link to={`/cases/${caseData.id}/edit`} className="btn-secondary gap-2 text-sm"><PencilIcon className="w-4 h-4" /> Στοιχεία οφειλετών</Link>
        </div>
      </div>

      {/* Stage stepper */}
      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-bold text-gray-800 text-sm">Στάδιο διαδικασίας</h2>
          <label className="text-xs text-gray-500 flex items-center gap-2">Στάδιο πώλησης:
            <select className="input w-auto text-xs py-1" value={caseData.contact_stage} onChange={e => changeContactStage(e.target.value)}>
              {CONTACT_STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {BANKRUPTCY_STAGES.map((s, i) => (
            <button key={s} onClick={() => set('stage', s)}
              className={`text-xs font-semibold rounded-lg px-2 py-2 border text-left transition-colors ${
                i === stageIdx ? 'bg-indigo-600 text-white border-indigo-600'
                : i < stageIdx ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'}`}>
              <span className="opacity-70">{i + 1}.</span> {s}
            </button>
          ))}
        </div>
      </div>

      {/* Process details */}
      <div className="card space-y-4">
        <h2 className="font-bold text-gray-800 text-sm">Στοιχεία διαδικασίας</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Δικηγόρος"><input className="input" value={b.lawyer || ''} onChange={e => set('lawyer', e.target.value)} /></Field>
          <Field label="Δικαστήριο"><input className="input" value={b.court || ''} onChange={e => set('court', e.target.value)} placeholder="π.χ. Πολυμελές Πρωτοδικείο Ηρακλείου" /></Field>
          <Field label="Αριθμός κατάθεσης"><input className="input" value={b.filing_number || ''} onChange={e => set('filing_number', e.target.value)} /></Field>
          <Field label="Εγγραφή στο Μητρώο Φερεγγυότητας"><input type="date" className="input" value={b.registry_date || ''} onChange={e => set('registry_date', e.target.value || null)} /></Field>
          <Field label="Ημ/νία κατάθεσης σε δικαστήριο"><input type="date" className="input" value={b.filing_date || ''} onChange={e => set('filing_date', e.target.value || null)} /></Field>
          <Field label="Ημ/νία έκδοσης απόφασης"><input type="date" className="input" value={b.decision_date || ''} onChange={e => set('decision_date', e.target.value || null)} /></Field>
          <Field label="Απόφαση">
            <select className="input" value={b.decision_type || ''} onChange={e => set('decision_type', e.target.value)}>
              <option value="">—</option>
              <option value="installments">Με πληρωμή δόσεων για την 3ετία</option>
              <option value="none">Χωρίς δόσεις</option>
            </select>
          </Field>
          <Field label="Λήξη τριετίας (από την ημ/νία απόφασης)">
            <div className="input bg-gray-50 text-gray-700">{b.decision_date ? fmtDateGr(threeYearEnd(b.decision_date)) : '—'}</div>
          </Field>
        </div>

        <div>
          <label className="label">Δικάσιμοι / προθεσμίες</label>
          <div className="space-y-1 mb-2">
            {(b.hearing_dates || []).map((h, i) => (
              <div key={i} className="flex items-center gap-3 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                <span className="font-semibold">{fmtDateGr(h.date)}</span><span className="text-gray-600 flex-1">{h.note}</span>
                <button onClick={() => set('hearing_dates', b.hearing_dates.filter((_, j) => j !== i))} className="text-red-500"><TrashIcon className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <input type="date" className="input w-auto" value={hearing.date} onChange={e => setHearing({ ...hearing, date: e.target.value })} />
            <input className="input flex-1 min-w-[160px]" placeholder="Σημείωση (π.χ. δικάσιμος, προθεσμία)" value={hearing.note} onChange={e => setHearing({ ...hearing, note: e.target.value })} />
            <button onClick={addHearing} className="btn-secondary gap-1 text-sm"><PlusIcon className="w-4 h-4" /> Προσθήκη</button>
          </div>
        </div>

        <Field label="Κύρια κατοικία / περιουσία — σημειώσεις">
          <textarea className="input" rows={3} value={b.primary_home || ''} onChange={e => set('primary_home', e.target.value)} />
        </Field>
      </div>

      {/* Documents */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800 text-sm">Δικαιολογητικά</h2>
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">{docsDone}/{docs.length}</span>
        </div>
        <div className="space-y-1">
          {docs.map((d, i) => (
            <label key={i} className="flex items-center gap-3 text-sm px-2 py-1.5 rounded hover:bg-gray-50">
              <input type="checkbox" className="rounded border-gray-300 text-indigo-600" checked={!!d.done}
                onChange={() => set('documents', docs.map((x, j) => j === i ? { ...x, done: !x.done } : x))} />
              <span className={`flex-1 ${d.done ? 'line-through text-gray-400' : ''}`}>{d.label}</span>
              <button onClick={(e) => { e.preventDefault(); set('documents', docs.filter((_, j) => j !== i)) }} className="text-gray-300 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>
            </label>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input className="input flex-1" placeholder="Νέο δικαιολογητικό…" value={newDoc} onChange={e => setNewDoc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDoc()} />
          <button onClick={addDoc} className="btn-secondary gap-1 text-sm"><PlusIcon className="w-4 h-4" /> Προσθήκη</button>
        </div>
      </div>

      {/* Fees */}
      <div className="card space-y-4">
        <h2 className="font-bold text-gray-800 text-sm">Αμοιβές</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Αμοιβή γραφείου (€) — εσωτερικό"><input type="number" className="input" value={b.fee_office ?? 0} onChange={e => set('fee_office', Number(e.target.value))} /></Field>
          <Field label="Αμοιβή δικηγόρου (€) — εσωτερικό"><input type="number" className="input" value={b.fee_lawyer ?? 0} onChange={e => set('fee_lawyer', Number(e.target.value))} /></Field>
          <Field label="Αμοιβή αίτησης προς πελάτη">
            <div className="input bg-blue-50 text-blue-800 font-black">{eur(feeTotal)}</div>
          </Field>
          <Field label="Success fee (€)"><input type="number" className="input" value={b.success_fee ?? 0} onChange={e => set('success_fee', Number(e.target.value))} /></Field>
        </div>
        <p className="text-xs text-gray-500">Ο πελάτης βλέπει στο portal μία μόνο αμοιβή αίτησης (γραφείου + δικηγόρου). Το success fee καταβάλλεται σε 4 ισόποσες δόσεις ανά 3μηνο από την ημερομηνία κατάθεσης σε δικαστήριο.</p>
        {schedule.length > 0 ? (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Δόση</th><th>Ημερομηνία</th><th className="text-right">Ποσό</th></tr></thead>
            <tbody>
              {schedule.map(r => (
                <tr key={r.n} className="border-t border-gray-100"><td className="py-1.5">{r.n}η δόση</td><td>{fmtDateGr(r.due)}</td><td className="text-right font-semibold">{eur(r.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-amber-600">Ορίστε success fee και ημερομηνία κατάθεσης σε δικαστήριο για να υπολογιστούν οι δόσεις.</p>
        )}
      </div>

      {/* Save bar */}
      <div className="sticky bottom-3 flex justify-end">
        <button onClick={save} disabled={!dirty || saving} className="btn-primary shadow-lg disabled:opacity-40">
          {saving ? 'Αποθήκευση…' : dirty ? 'Αποθήκευση αλλαγών' : 'Αποθηκεύτηκε'}
        </button>
      </div>

      {/* Finance */}
      <FinanceIntakePanel
        caseData={caseData}
        serviceType={SERVICE_BANKRUPTCY}
        feeOverrides={{ appFee: feeTotal, successFee: Number(b.success_fee) || 0, successInstallment: installment }}
      />
    </div>
  )
}
