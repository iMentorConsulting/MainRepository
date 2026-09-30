import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowPathIcon, ClipboardDocumentIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { createIrisPayment, listIrisPayments, recheckIrisPayment } from '../api'

const VAT_RATE = 0.24

const STATUS_LABELS = {
  created: { label: 'Δημιουργήθηκε', cls: 'bg-gray-100 text-gray-700' },
  pending: { label: 'Σε εκκρεμότητα', cls: 'bg-yellow-100 text-yellow-700' },
  authorised: { label: 'Εγκρίθηκε', cls: 'bg-blue-100 text-blue-700' },
  paid: { label: 'Πληρώθηκε', cls: 'bg-green-100 text-green-700' },
  expired: { label: 'Έληξε', cls: 'bg-orange-100 text-orange-700' },
  cancelled: { label: 'Ακυρώθηκε', cls: 'bg-gray-200 text-gray-600' },
  failed: { label: 'Σφάλμα', cls: 'bg-red-100 text-red-700' },
}

function fmtMoney(v) {
  return (v ?? 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function CreateForm({ onCreated }) {
  const [customerName, setCustomerName] = useState('')
  const [customerAFM, setCustomerAFM] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [netAmount, setNetAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const net = parseFloat(netAmount) || 0
  const vat = +(net * VAT_RATE).toFixed(2)
  const total = +(net + vat).toFixed(2)

  const valid = customerName.trim() && net > 0

  const submit = async (e) => {
    e.preventDefault()
    if (!valid) return
    setSubmitting(true)
    try {
      const res = await createIrisPayment({
        customerName: customerName.trim(),
        customerAFM: customerAFM.trim(),
        serviceType: serviceType.trim(),
        netAmount: net,
      })
      toast.success('Δημιουργήθηκε αίτημα πληρωμής IRIS')
      setCustomerName(''); setCustomerAFM(''); setServiceType(''); setNetAmount('')
      onCreated(res.data)
    } catch (err) {
      const detail = err?.response?.data?.detail
      const msg = typeof detail === 'object' ? (detail?.errorDescription || detail?.errorCode) : detail
      toast.error(msg || 'Σφάλμα δημιουργίας πληρωμής')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="card mb-6 space-y-3">
      <h3 className="text-sm font-bold text-blue-800">💳 Νέο Αίτημα Πληρωμής IRIS</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Πελάτης *</label>
          <input className="input text-sm w-full" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Ονοματεπώνυμο / Επωνυμία" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">ΑΦΜ</label>
          <input className="input text-sm w-full" value={customerAFM} onChange={e => setCustomerAFM(e.target.value)} placeholder="ΑΦΜ" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Υπηρεσία</label>
          <input className="input text-sm w-full" value={serviceType} onChange={e => setServiceType(e.target.value)} placeholder="π.χ. ΕΞΩΔΙΚΑΣΤΙΚΟΣ" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Καθαρή Αξία (€) *</label>
          <input type="number" step="0.01" min="0" className="input text-sm w-full" value={netAmount} onChange={e => setNetAmount(e.target.value)} placeholder="250" />
        </div>
      </div>
      {net > 0 && (
        <div className="text-xs text-gray-600 flex gap-4">
          <span>Καθαρή Αξία: <b>{fmtMoney(net)}</b></span>
          <span>ΦΠΑ 24%: <b>{fmtMoney(vat)}</b></span>
          <span>Τελικό Ποσό: <b className="text-blue-700">{fmtMoney(total)}</b></span>
        </div>
      )}
      <button type="submit" disabled={!valid || submitting} className="btn-primary text-sm">
        {submitting ? 'Δημιουργία...' : 'Δημιουργία Αιτήματος Πληρωμής'}
      </button>
    </form>
  )
}

export default function IrisPayments() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [rechecking, setRechecking] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await listIrisPayments()
      setPayments(res.data)
    } catch {
      toast.error('Σφάλμα φόρτωσης πληρωμών')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleRecheck = async (paymentId) => {
    setRechecking(paymentId)
    try {
      const res = await recheckIrisPayment(paymentId)
      setPayments(prev => prev.map(p => p.paymentId === paymentId ? res.data : p))
      toast.success('Η κατάσταση ενημερώθηκε')
    } catch (err) {
      const detail = err?.response?.data?.detail
      const msg = typeof detail === 'object' ? (detail?.errorDescription || detail?.errorCode) : detail
      toast.error(msg || 'Σφάλμα ελέγχου κατάστασης')
    } finally {
      setRechecking(null)
    }
  }

  const copyReference = (p) => {
    navigator.clipboard.writeText(p.paymentCodeRI0)
    toast.success('Αντιγράφηκε ο κωδικός RI0')
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-4">💳 Πληρωμές IRIS (Request to Pay)</h2>

      <CreateForm onCreated={(p) => setPayments(prev => [p, ...prev])} />

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-blue-800">Ιστορικό Αιτημάτων Πληρωμής</h3>
          <button onClick={load} className="text-xs flex items-center gap-1 text-blue-600 hover:underline">
            <ArrowPathIcon className="w-4 h-4" /> Ανανέωση
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-gray-500">Φόρτωση...</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-gray-500">Δεν υπάρχουν ακόμα αιτήματα πληρωμής.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b-2 border-blue-100">
                  <th className="th text-left">Ημερομηνία</th>
                  <th className="th text-left">Πελάτης</th>
                  <th className="th">ΑΦΜ</th>
                  <th className="th text-left">Υπηρεσία</th>
                  <th className="th">Καθαρή Αξία</th>
                  <th className="th">ΦΠΑ</th>
                  <th className="th">Τελικό Ποσό</th>
                  <th className="th">Κωδικός RI0</th>
                  <th className="th">OrderId</th>
                  <th className="th">Κατάσταση</th>
                  <th className="th">Ενέργειες</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => {
                  const st = STATUS_LABELS[p.status] || { label: p.status, cls: 'bg-gray-100 text-gray-700' }
                  return (
                    <tr key={p.paymentId} className="border-b border-gray-100 hover:bg-blue-50">
                      <td className="td text-left whitespace-nowrap">{new Date(p.createdAt).toLocaleString('el-GR')}</td>
                      <td className="td text-left font-semibold">{p.customerName}</td>
                      <td className="td">{p.customerAFM}</td>
                      <td className="td text-left">{p.serviceType}</td>
                      <td className="td font-mono">{fmtMoney(p.netAmount)}</td>
                      <td className="td font-mono text-gray-500">{fmtMoney(p.vatAmount)}</td>
                      <td className="td font-mono font-bold">{fmtMoney(p.totalAmount)}</td>
                      <td className="td font-mono text-xs">{p.paymentCodeRI0}</td>
                      <td className="td font-mono text-xs">{p.diasOrderId ? p.diasOrderId.slice(0, 12) + '…' : '—'}</td>
                      <td className="td">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                        {p.status === 'failed' && p.errorDescription && (
                          <div className="text-[10px] text-red-500 mt-0.5">{p.errorDescription}</div>
                        )}
                      </td>
                      <td className="td">
                        <div className="flex items-center justify-center gap-2">
                          <button title="Έλεγχος Κατάστασης" onClick={() => handleRecheck(p.paymentId)}
                            disabled={rechecking === p.paymentId}
                            className="p-1 text-blue-600 hover:bg-blue-100 rounded">
                            <ArrowPathIcon className={`w-4 h-4 ${rechecking === p.paymentId ? 'animate-spin' : ''}`} />
                          </button>
                          <button title="Αντιγραφή Κωδικού RI0" onClick={() => copyReference(p)}
                            className="p-1 text-gray-600 hover:bg-gray-100 rounded">
                            <ClipboardDocumentIcon className="w-4 h-4" />
                          </button>
                          {p.bankSelectionToolUrl && (
                            <a title="Άνοιγμα Σελίδας Πληρωμής IRIS" href={p.bankSelectionToolUrl} target="_blank" rel="noreferrer"
                              className="p-1 text-green-600 hover:bg-green-100 rounded">
                              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
