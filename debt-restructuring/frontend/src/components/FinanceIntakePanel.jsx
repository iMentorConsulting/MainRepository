import { useState, useEffect, useCallback } from 'react'
import { recordFinancePayment, getFinancePayments } from '../api'

const TODAY = () => new Date().toISOString().slice(0, 10)

const DESCRIPTION_OPTIONS = [
  'ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ Ν.4738/2020',
  'ΜΕΤΡΗΤΑ',
]

const SOURCE_REFERRAL_OPTIONS = [
  'FACEBOOK',
  'GOOGLE',
  'LOGISTIS.I-MENTOR.GR',
  'NEWSLETTER',
  'TIKTOK',
  'WEBSITE',
  'ΣΥΣΤΑΣΗ',
  'ΤΗΛΕΦΩΝΟ',
  'ΥΦΙΣΤΑΜΕΝΟΣ ΠΕΛΑΤΗΣ',
]

const TARGETING_CATEGORY_OPTIONS = [
  'ΠΩΛΗΣΗ ΑΙΤΗΣΗΣ',
  'ΠΩΛΗΣΗ ΥΛΟΠΟΙΗΣΗΣ',
]

const WORK_STATUS_OPTIONS = [
  'ΧΡΕΟΣ-1.ΑΝΑΛΥΣΗ ΣΤΟΙΧΕΙΩΝ',
  'ΧΡΕΟΣ-2.ΣΥΜΠΛΗΡΩΣΗ ΑΙΤΗΣΗΣ',
  'ΧΡΕΟΣ-3.ΑΝΤΛΗΣΗ ΣΤΟΙΧΕΙΩΝ',
  'ΧΡΕΟΣ-4.ΥΠΟΒΕΒΛΗΜΕΝΗ ΑΙΤΗΣΗ',
  'ΧΡΕΟΣ-5-ΑΠΟΔΟΧΗ ΑΠΟ ΠΕΛΑΤΗ',
  'ΧΡΕΟΣ-6-ΑΠΟΡΡΙΨΗ ΑΠΟ ΠΕΛΑΤΗ',
  'ΠΤ2-ΔΙΚΗΓΟΡΟΣ ΠΡΟΕΤ.',
  'ΠΤ3-ΕΓΓΡΑΦΗ ΜΗΤΡΩΟ Φ.',
  'ΠΤ4-ΑΙΤΗΣΗ ΠΡΩΤΟΔΙΚΕΙΟ',
  'ΠΤ5-ΑΠΟΦΑΣΗ ΑΠΛΗ',
  'ΠΤ6-ΑΠΟΡΡΙΨΗ ΑΙΤΗΣΗΣ',
  'ΠΤ6-ΑΠΟΦΑΣΗ ΣΥΝΔΙΚΟΣ',
  'ΠΤ7-ΑΝΑΜΟΝΗ ΤΡΙΕΤΙΑΣ',
]

const SERVICE_TYPE_OPTIONS = [
  'ΕΞΩΔΙΚΑΣΤΙΚΟΣ',
  'ΑΝΑΔΙΑΡΘΡΩΣΗ',
  'ΔΙΑΠΡΑΓΜΑΤΕΥΣΗ',
  'ΠΤΩΧΕΥΣΗ',
]

const INVOICE_TYPES = ['ΤΙΜΟΛΟΓΙΟ', 'ΑΠΟΔΕΙΞΗ', 'ΑΝΕΥ']

function fmt(amount) {
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(amount)
}

function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('el-GR')
  } catch {
    return iso
  }
}

const DEFAULT_FORM = {
  payment_type: '',
  invoice_type: 'ΤΙΜΟΛΟΓΙΟ',
  amount_collected: '',
  sale_date: TODAY(),
  description: 'ΥΠΟΒΟΛΗ ΑΙΤΗΣΗΣ Ν.4738/2020',
  targeting_category: 'ΠΩΛΗΣΗ ΑΙΤΗΣΗΣ',
  source_referral: 'FACEBOOK',
  work_status: 'ΧΡΕΟΣ-3.ΑΝΤΛΗΣΗ ΣΤΟΙΧΕΙΩΝ',
  service_type: 'ΕΞΩΔΙΚΑΣΤΙΚΟΣ',
  address: '',
  city: '',
}

// Address is needed for ΑΠΟΔΕΙΞΗ and ΑΝΕΥ (ΤΙΜΟΛΟΓΙΟ fetches it automatically from Finance)
const needsAddress = (invoiceType) => invoiceType === 'ΑΠΟΔΕΙΞΗ' || invoiceType === 'ΑΝΕΥ'

export default function FinanceIntakePanel({ caseData }) {
  const [payments, setPayments] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const appFee = caseData?.commercial_offer?.application_fee ?? 450
  const successFee = caseData?.commercial_offer?.success_fee ?? 450

  const loadPayments = useCallback(async () => {
    if (!caseData?.id) return
    setLoadingHistory(true)
    try {
      const res = await getFinancePayments(caseData.id)
      setPayments(res.data)
    } catch {
      // non-fatal
    } finally {
      setLoadingHistory(false)
    }
  }, [caseData?.id])

  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  function openModal(preset = {}) {
    setForm({ ...DEFAULT_FORM, ...preset })
    setError('')
    setSuccess('')
    setShowModal(true)
  }

  function openApplicationFee() {
    openModal({ payment_type: 'Αίτηση', amount_collected: String(appFee) })
  }

  function openSuccessFee() {
    openModal({ payment_type: 'Success Fee', amount_collected: String(successFee), targeting_category: 'ΠΩΛΗΣΗ ΥΛΟΠΟΙΗΣΗΣ' })
  }

  function openCustom() {
    openModal({})
  }

  const vatAmount = form.invoice_type === 'ΑΝΕΥ'
    ? 0
    : Math.round((parseFloat(form.amount_collected) || 0) * 0.24 * 100) / 100

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!form.payment_type.trim()) { setError('Συμπλήρωσε τον τύπο πληρωμής.'); return }
    if (!form.amount_collected || isNaN(parseFloat(form.amount_collected))) { setError('Συμπλήρωσε το ποσό.'); return }
    if (needsAddress(form.invoice_type) && !form.address.trim()) {
      setError(`Απαιτείται διεύθυνση για ${form.invoice_type} παραστατικό.`)
      return
    }

    setSubmitting(true)
    try {
      const res = await recordFinancePayment({
        case_id: caseData.id,
        payment_type: form.payment_type,
        invoice_type: form.invoice_type,
        amount_collected: parseFloat(form.amount_collected),
        sale_date: form.sale_date,
        description: form.description,
        targeting_category: form.targeting_category,
        source_referral: form.source_referral,
        work_status: form.work_status,
        service_type: form.service_type,
        address: form.address,
        city: form.city,
      })
      const d = res.data
      setSuccess(
        d.duplicate
          ? `Καταχωρήθηκε (διπλότυπο — finance_id: ${d.finance_id})`
          : `Επιτυχής καταχώρηση! Finance ID: ${d.finance_id}`
      )
      await loadPayments()
      setTimeout(() => { setShowModal(false); setSuccess('') }, 2000)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Σφάλμα επικοινωνίας με Finance σύστημα.')
    } finally {
      setSubmitting(false)
    }
  }

  const field = (key, value) => setForm(f => ({ ...f, [key]: value }))

  return (
    <div className="mt-6 border border-green-200 rounded-lg bg-green-50">
      <div className="px-4 py-3 border-b border-green-200 flex items-center justify-between">
        <h3 className="font-semibold text-green-900 text-sm">💳 Καταχώρηση Πληρωμής → Finance</h3>
        {loadingHistory && <span className="text-xs text-gray-400">Φόρτωση...</span>}
      </div>

      {/* Quick buttons */}
      <div className="px-4 py-3 flex flex-wrap gap-2">
        <button
          onClick={openApplicationFee}
          className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 font-medium"
        >
          💰 Αίτηση ({fmt(appFee)})
        </button>
        <button
          onClick={openSuccessFee}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium"
        >
          🏆 Success Fee ({fmt(successFee)})
        </button>
        <button
          onClick={openCustom}
          className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 font-medium"
        >
          + Άλλη Πληρωμή
        </button>
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="px-4 pb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Ιστορικό Πληρωμών</p>
          <div className="space-y-1">
            {payments.map(p => (
              <div key={p.id} className={`text-xs px-3 py-2 rounded flex items-center justify-between ${p.error ? 'bg-red-50 border border-red-200' : p.is_duplicate ? 'bg-yellow-50 border border-yellow-200' : 'bg-white border border-gray-200'}`}>
                <div>
                  <span className="font-medium">{p.payment_type}</span>
                  <span className="text-gray-500 ml-2">{p.invoice_type}</span>
                  <span className="ml-2">{fmt(p.amount_collected)}</span>
                  {p.vat_amount > 0 && <span className="text-gray-400"> + ΦΠΑ {fmt(p.vat_amount)}</span>}
                  {p.is_duplicate && <span className="ml-2 text-yellow-600 font-medium">(διπλότυπο)</span>}
                  {p.error && <span className="ml-2 text-red-600">⚠ {p.error.slice(0, 60)}</span>}
                </div>
                <div className="text-gray-400 ml-4 shrink-0">
                  {p.sent_by} · {fmtDate(p.sent_at)}
                  {p.finance_id && <span className="ml-1 text-gray-300">#{p.finance_id}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h4 className="font-semibold text-gray-800">Καταχώρηση Πληρωμής</h4>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">

              {/* Client info preview */}
              <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs text-gray-600 space-y-0.5">
                <div><span className="font-medium">Πελάτης:</span> {caseData?.client_name || '—'}</div>
                <div className="flex gap-4">
                  <span><span className="font-medium">ΑΦΜ:</span> {caseData?.client_vat || '—'}</span>
                  <span><span className="font-medium">Τηλ:</span> {caseData?.client_phone || '—'}</span>
                  <span><span className="font-medium">Email:</span> {caseData?.client_email || '—'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Τύπος Πληρωμής *</label>
                  <input
                    value={form.payment_type}
                    onChange={e => field('payment_type', e.target.value)}
                    placeholder="π.χ. Αίτηση"
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Παραστατικό *</label>
                  <select value={form.invoice_type} onChange={e => field('invoice_type', e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                    {INVOICE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ποσό (€) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount_collected}
                    onChange={e => field('amount_collected', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ΦΠΑ 24%</label>
                  <div className="border rounded px-2 py-1.5 text-sm bg-gray-50 text-gray-500">
                    {fmt(vatAmount)}
                    {form.invoice_type === 'ΑΝΕΥ' && <span className="ml-1 text-xs">(χωρίς ΦΠΑ)</span>}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ημερομηνία Πώλησης *</label>
                <input type="date" value={form.sale_date} onChange={e => field('sale_date', e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Υπηρεσία</label>
                  <select value={form.service_type} onChange={e => field('service_type', e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                    {SERVICE_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Περιγραφή</label>
                  <select value={form.description} onChange={e => field('description', e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                    {DESCRIPTION_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Κατηγορία Στόχου</label>
                  <select value={form.targeting_category} onChange={e => field('targeting_category', e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                    {TARGETING_CATEGORY_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Πηγή Παραπομπής</label>
                  <select value={form.source_referral} onChange={e => field('source_referral', e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                    {SOURCE_REFERRAL_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Κατάσταση Εργασίας</label>
                <select value={form.work_status} onChange={e => field('work_status', e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                  {WORK_STATUS_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>

              {/* Address: required for ΑΠΟΔΕΙΞΗ and ΑΝΕΥ; ΤΙΜΟΛΟΓΙΟ fetches it automatically from Finance */}
              {needsAddress(form.invoice_type) && (
                <div className="grid grid-cols-2 gap-3 border border-orange-200 rounded p-3 bg-orange-50">
                  <div>
                    <label className="block text-xs font-medium text-orange-700 mb-1">
                      Διεύθυνση * <span className="font-normal text-orange-500">(για {form.invoice_type})</span>
                    </label>
                    <input value={form.address} onChange={e => field('address', e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Οδός και αριθμός" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-orange-700 mb-1">Πόλη</label>
                    <input value={form.city} onChange={e => field('city', e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="π.χ. Αθήνα" />
                  </div>
                </div>
              )}

              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
              {success && <p className="text-green-700 text-sm bg-green-50 border border-green-200 rounded px-3 py-2">{success}</p>}

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={submitting} className="flex-1 bg-green-600 text-white font-medium py-2 rounded hover:bg-green-700 disabled:opacity-50">
                  {submitting ? 'Αποστολή...' : 'Καταχώρηση'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">
                  Ακύρωση
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
