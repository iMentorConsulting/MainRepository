import { useEffect, useState, useRef } from 'react'
import {
  getOwners, createOwner, updateOwner, deleteOwner, assignOwnerUnits,
  getOwnerReport, sendOwnerReport, getUnits,
} from '../api'
import { PlusIcon, PencilSquareIcon, TrashIcon, XMarkIcon, DocumentTextIcon, PaperAirplaneIcon, PrinterIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const EMPTY_OWNER = { name: '', email: '', phone: '', management_fee_percent: 20, auto_send_report: false, notes: '' }

function fmt(n) {
  return `€${Number(n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Owner Form Modal ────────────────────────────────────────────────────────
function OwnerModal({ owner, allUnits, onClose, onSaved }) {
  const [form, setForm] = useState(owner?.id ? { ...owner } : { ...EMPTY_OWNER })
  const [selectedUnits, setSelectedUnits] = useState(owner?.units?.map(u => u.id) || [])
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleUnit = (id) => setSelectedUnits(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name) { toast.error('Συμπληρώστε το όνομα'); return }
    setSaving(true)
    try {
      let saved
      if (owner?.id) {
        saved = await updateOwner(owner.id, form)
        await assignOwnerUnits(owner.id, selectedUnits)
      } else {
        saved = await createOwner(form)
        if (selectedUnits.length) await assignOwnerUnits(saved.data.id, selectedUnits)
      }
      toast.success('Αποθηκεύτηκε')
      onSaved()
    } catch { toast.error('Σφάλμα') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-800">{owner?.id ? 'Επεξεργασία Ιδιοκτήτη' : 'Νέος Ιδιοκτήτης'}</h3>
          <button onClick={onClose}><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Ονοματεπώνυμο *</label>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label className="label">Τηλέφωνο</label>
              <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Αμοιβή Διαχείρισης (%)</label>
            <input className="input" type="number" min="0" max="100" step="0.5"
              value={form.management_fee_percent} onChange={e => set('management_fee_percent', parseFloat(e.target.value))} />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="autosend" checked={form.auto_send_report}
              onChange={e => set('auto_send_report', e.target.checked)} className="h-4 w-4 rounded" />
            <label htmlFor="autosend" className="text-sm text-gray-700">
              Αυτόματη αποστολή μηνιαίας αναφοράς (1η κάθε μήνα)
            </label>
          </div>

          <div>
            <label className="label">Μονάδες που ανήκουν σε αυτόν τον ιδιοκτήτη</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {allUnits.map(u => (
                <label key={u.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedUnits.includes(u.id) ? 'bg-blue-50 border-blue-400' : 'border-gray-200 hover:bg-gray-50'
                }`}>
                  <input type="checkbox" checked={selectedUnits.includes(u.id)}
                    onChange={() => toggleUnit(u.id)} className="h-4 w-4" />
                  <span className="text-sm font-medium text-gray-700">{u.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Σημειώσεις</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Ακύρωση</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Owner Report Viewer ─────────────────────────────────────────────────────
function ReportViewer({ owner, onClose }) {
  const now = new Date()
  const [year, setYear] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth())
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await getOwnerReport(owner.id, year, month)
      setReport(r.data)
    } catch { toast.error('Σφάλμα φόρτωσης αναφοράς') } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [year, month])

  const handleSendEmail = async () => {
    if (!owner.email) { toast.error('Ο ιδιοκτήτης δεν έχει email'); return }
    setSending(true)
    try {
      await sendOwnerReport(owner.id, year, month)
      toast.success(`Αναφορά στάλθηκε στο ${owner.email}`)
    } catch { toast.error('Αποτυχία αποστολής') } finally { setSending(false) }
  }

  const s = report?.summary

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-0 md:p-4 overflow-y-auto">
      <div className="bg-white w-full md:max-w-4xl md:rounded-2xl shadow-2xl min-h-screen md:min-h-0 md:my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10 print:hidden">
          <div>
            <h3 className="font-bold text-gray-800">Αναφορά: {owner.name}</h3>
            <p className="text-xs text-gray-500">Αμοιβή διαχείρισης: {owner.management_fee_percent}%</p>
          </div>
          <div className="flex items-center gap-2">
            <select className="input text-sm w-auto" value={month} onChange={e => setMonth(+e.target.value)}>
              {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{String(m).padStart(2,'0')}</option>
              ))}
            </select>
            <input type="number" className="input text-sm w-24" value={year} onChange={e => setYear(+e.target.value)} />
            <button onClick={() => window.print()} className="btn-secondary flex items-center gap-1 text-sm">
              <PrinterIcon className="h-4 w-4" /> PDF
            </button>
            {owner.email && (
              <button onClick={handleSendEmail} disabled={sending} className="btn-primary flex items-center gap-1 text-sm">
                <PaperAirplaneIcon className="h-4 w-4" /> {sending ? '...' : 'Email'}
              </button>
            )}
            <button onClick={onClose}><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
          </div>
        </div>

        {loading && <div className="text-center py-16 text-gray-400">Φόρτωση...</div>}

        {!loading && report && (
          <div className="p-6 space-y-6 print:p-4">
            {/* Print header */}
            <div className="hidden print:block text-center border-b pb-4 mb-4">
              <h1 className="text-2xl font-bold">ΜΗΝΙΑΙΑ ΑΝΑΦΟΡΑ ΙΔΙΟΚΤΗΤΗ</h1>
              <p className="text-lg">{report.period.label}</p>
              <p className="text-base font-semibold mt-1">{owner.name}</p>
              <p className="text-sm text-gray-500">Μονάδες: {report.units.map(u => u.name).join(', ')}</p>
            </div>

            {/* Period + units */}
            <div className="print:hidden">
              <p className="text-lg font-bold text-gray-800">{report.period.label}</p>
              <p className="text-sm text-gray-500">Μονάδες: {report.units.map(u => u.name).join(' · ') || '—'}</p>
            </div>

            {/* Summary tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Συνολικά Έσοδα', value: fmt(s.total_revenue), color: 'text-gray-800' },
                { label: 'Καθαρά Έσοδα', value: fmt(s.net_revenue), color: 'text-blue-700' },
                { label: 'Έξοδα', value: fmt(s.total_expenses), color: 'text-red-600' },
                { label: `Αμοιβή (${s.management_fee_percent}%)`, value: fmt(s.management_fee), color: 'text-orange-600' },
              ].map(t => (
                <div key={t.label} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">{t.label}</p>
                  <p className={`text-lg font-bold ${t.color}`}>{t.value}</p>
                </div>
              ))}
            </div>

            {/* Profit box */}
            <div className={`rounded-xl border-2 p-4 flex items-center justify-between ${s.owner_profit >= 0 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
              <p className="font-bold text-gray-700 text-lg">ΚΑΘΑΡΟ ΚΕΡΔΟΣ ΙΔΙΟΚΤΗΤΗ</p>
              <p className={`text-3xl font-bold ${s.owner_profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(s.owner_profit)}</p>
            </div>

            {/* Bookings table */}
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">📋 Κρατήσεις ({report.bookings.length})</h4>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                    <th className="text-left px-3 py-2">Μονάδα</th>
                    <th className="text-left px-3 py-2">Πελάτης</th>
                    <th className="px-3 py-2">Check-in</th>
                    <th className="px-3 py-2 hidden md:table-cell">Νύχτες</th>
                    <th className="px-3 py-2 hidden md:table-cell">Κανάλι</th>
                    <th className="text-right px-3 py-2">Έσοδα</th>
                    <th className="text-right px-3 py-2 hidden md:table-cell">Προμήθεια</th>
                    <th className="text-right px-3 py-2">Καθαρά</th>
                  </tr></thead>
                  <tbody>
                    {report.bookings.length === 0
                      ? <tr><td colSpan={8} className="text-center py-6 text-gray-400">Δεν υπάρχουν κρατήσεις</td></tr>
                      : report.bookings.map(b => (
                        <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{b.unit_name}</td>
                          <td className="px-3 py-2">{b.customer}</td>
                          <td className="px-3 py-2 text-center">{b.check_in}</td>
                          <td className="px-3 py-2 text-center hidden md:table-cell">{b.nights}</td>
                          <td className="px-3 py-2 text-center hidden md:table-cell text-xs">{b.channel}</td>
                          <td className="px-3 py-2 text-right">{fmt(b.total_price)}</td>
                          <td className="px-3 py-2 text-right text-red-600 hidden md:table-cell">{fmt(b.commission)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-green-700">{fmt(b.net)}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                  {report.bookings.length > 0 && (
                    <tfoot><tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                      <td colSpan={5} className="px-3 py-2 text-right hidden md:table-cell">Σύνολο</td>
                      <td colSpan={5} className="px-3 py-2 text-right md:hidden">Σύνολο</td>
                      <td className="px-3 py-2 text-right">{fmt(s.total_revenue)}</td>
                      <td className="px-3 py-2 text-right text-red-600 hidden md:table-cell">{fmt(s.total_commission)}</td>
                      <td className="px-3 py-2 text-right text-green-700">{fmt(s.net_revenue)}</td>
                    </tr></tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Expenses table */}
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">💶 Έξοδα Μονάδων ({report.expenses.length})</h4>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                    <th className="text-left px-3 py-2">Ημ/νία</th>
                    <th className="text-left px-3 py-2">Κατηγορία</th>
                    <th className="text-left px-3 py-2">Περιγραφή</th>
                    <th className="text-left px-3 py-2 hidden md:table-cell">Προμηθευτής</th>
                    <th className="text-right px-3 py-2">Ποσό</th>
                  </tr></thead>
                  <tbody>
                    {report.expenses.length === 0
                      ? <tr><td colSpan={5} className="text-center py-6 text-gray-400">Δεν υπάρχουν έξοδα</td></tr>
                      : report.expenses.map(e => (
                        <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-500">{new Date(e.date+'T00:00:00').toLocaleDateString('el-GR')}</td>
                          <td className="px-3 py-2"><span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{e.category}</span></td>
                          <td className="px-3 py-2">{e.item}</td>
                          <td className="px-3 py-2 text-gray-400 hidden md:table-cell">{e.vendor}</td>
                          <td className="px-3 py-2 text-right font-semibold text-red-600">{fmt(e.amount)}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                  {report.expenses.length > 0 && (
                    <tfoot><tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                      <td colSpan={4} className="px-3 py-2 text-right">Σύνολο Εξόδων</td>
                      <td className="px-3 py-2 text-right text-red-700">{fmt(s.total_expenses)}</td>
                    </tr></tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function Owners() {
  const [owners, setOwners] = useState([])
  const [allUnits, setAllUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [reportOwner, setReportOwner] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [o, u] = await Promise.all([getOwners(), getUnits({ active_only: false })])
      setOwners(o.data)
      setAllUnits(u.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    try {
      await deleteOwner(deleting.id)
      toast.success('Διαγράφηκε')
      setDeleting(null)
      load()
    } catch { toast.error('Σφάλμα') }
  }

  const unassignedUnits = allUnits.filter(u => !owners.some(o => o.units?.some(ou => ou.id === u.id)))

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800">🏠 Ιδιοκτήτες</h2>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-1">
          <PlusIcon className="h-4 w-4" /> Νέος Ιδιοκτήτης
        </button>
      </div>

      {unassignedUnits.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          ⚠️ Μονάδες χωρίς ιδιοκτήτη: <strong>{unassignedUnits.map(u => u.name).join(', ')}</strong>
        </div>
      )}

      {loading && <div className="text-center py-12 text-gray-400">Φόρτωση...</div>}

      {!loading && owners.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🏠</p>
          <p className="font-medium">Δεν υπάρχουν ιδιοκτήτες ακόμα</p>
          <p className="text-sm mt-1">Προσθέστε τους πρώτα και αντιστοιχίστε μονάδες σε αυτούς</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {owners.map(owner => (
          <div key={owner.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-gray-800 text-lg">{owner.name}</p>
                {owner.email && <p className="text-sm text-gray-500">{owner.email}</p>}
                {owner.phone && <p className="text-sm text-gray-400">{owner.phone}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setModal(owner)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600">
                  <PencilSquareIcon className="h-4 w-4" />
                </button>
                <button onClick={() => setDeleting(owner)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-semibold">
                Αμοιβή: {owner.management_fee_percent}%
              </span>
              {owner.auto_send_report && (
                <span className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full">
                  📧 Αυτόματη αποστολή
                </span>
              )}
              {owner.units?.length > 0 && (
                <span className="text-xs text-gray-500">{owner.units.map(u => u.name).join(' · ')}</span>
              )}
              {(!owner.units || owner.units.length === 0) && (
                <span className="text-xs text-amber-600">⚠️ Καμία μονάδα</span>
              )}
            </div>

            <button
              onClick={() => setReportOwner(owner)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300 text-sm font-medium text-gray-600 hover:text-blue-700 transition-colors"
            >
              <DocumentTextIcon className="h-4 w-4" /> Προβολή Αναφοράς
            </button>
          </div>
        ))}
      </div>

      {modal !== null && (
        <OwnerModal
          owner={modal?.id ? modal : null}
          allUnits={allUnits}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}

      {reportOwner && (
        <ReportViewer owner={reportOwner} onClose={() => setReportOwner(null)} />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-800">Διαγραφή ιδιοκτήτη;</h3>
            <p className="text-sm text-gray-600">Οι μονάδες θα αποσυνδεθούν αλλά δεν θα διαγραφούν.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleting(null)} className="btn-secondary flex-1">Ακύρωση</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg">Διαγραφή</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
