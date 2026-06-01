import { useEffect, useState, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  getBookings, getUnits, getCustomers, createBooking, updateBooking, deleteBooking,
  createCustomer, recommendUnit, exportBookings, downloadTemplate, importBookings,
  getPortalLink, sendPortalEmail,
} from '../api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  PlusIcon, XMarkIcon, TrashIcon, PencilSquareIcon,
  SparklesIcon, FunnelIcon, ArrowDownTrayIcon, ArrowUpTrayIcon,
  LinkIcon, EnvelopeIcon,
} from '@heroicons/react/24/outline'

const CHANNELS = [
  { value: 'booking', label: 'Booking.com', color: 'bg-blue-100 text-blue-800' },
  { value: 'airbnb', label: 'Airbnb', color: 'bg-red-100 text-red-800' },
  { value: 'direct', label: 'Απευθείας', color: 'bg-green-100 text-green-800' },
  { value: 'oga', label: 'ΟΓΑ', color: 'bg-purple-100 text-purple-800' },
  { value: 'social_tourism', label: 'Κοιν.Τουρισμός', color: 'bg-teal-100 text-teal-800' },
  { value: 'other', label: 'Άλλο', color: 'bg-gray-100 text-gray-700' },
]
const CH = Object.fromEntries(CHANNELS.map((c) => [c.value, c]))

const STATUSES = [
  { value: 'confirmed', label: 'Επιβεβαιωμένη', color: 'bg-green-100 text-green-700' },
  { value: 'pending', label: 'Εκκρεμής', color: 'bg-amber-100 text-amber-700' },
  { value: 'cancelled', label: 'Ακυρωμένη', color: 'bg-red-100 text-red-700' },
  { value: 'no_show', label: 'No-show', color: 'bg-gray-100 text-gray-600' },
]
const ST = Object.fromEntries(STATUSES.map((s) => [s.value, s]))

const emptyBooking = {
  unit_id: '', customer_id: '', channel: 'direct', check_in: '', check_out: '',
  guests: 1, total_price: 0, commission: 0, commission_percent: 0,
  status: 'confirmed', is_billed: false, notes: '',
}
const emptyCustomer = { first_name: '', last_name: '', email: '', phone: '', nationality: '', id_number: '' }

function BookingModal({ booking, units, customers: initCustomers, onClose, onSaved }) {
  const [form, setForm] = useState(booking ? { ...booking } : { ...emptyBooking })
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiRec, setAiRec] = useState(null)
  const [customers, setCustomers] = useState(initCustomers)
  const [custSearch, setCustSearch] = useState('')
  const [showNewCust, setShowNewCust] = useState(false)
  const [newCust, setNewCust] = useState({ fullName: '', email: '', phone: '', nationality: '', id_number: '' })
  const [savingCust, setSavingCust] = useState(false)
  const [portalLink, setPortalLink] = useState(null)
  const [sendingEmail, setSendingEmail] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    if (booking?.id) {
      getPortalLink(booking.id).then((r) => setPortalLink(r.data)).catch(() => {})
    }
  }, [booking?.id])

  const portalFullUrl = portalLink?.portal_url
    ? `${window.location.origin}${portalLink.portal_url}`
    : null

  const handleCopyLink = () => {
    if (!portalFullUrl) return
    navigator.clipboard.writeText(portalFullUrl)
    toast.success('Ο σύνδεσμος αντιγράφηκε!')
  }

  const handleSendEmail = async () => {
    if (!portalLink?.url) return
    setSendingEmail(true)
    try {
      await sendPortalEmail(booking.id, {})
      toast.success('Email στάλθηκε στον πελάτη!')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποστολής email')
    } finally {
      setSendingEmail(false)
    }
  }

  const handleCustSearch = async (e) => {
    const v = e.target.value
    setCustSearch(v)
    if (v.length >= 2) {
      const r = await getCustomers({ search: v, limit: 20 })
      setCustomers(r.data)
    } else {
      setCustomers(initCustomers.slice(0, 30))
    }
  }

  const handleSaveNewCust = async () => {
    if (!newCust.fullName.trim()) return
    const parts = newCust.fullName.trim().split(' ')
    const first_name = parts[0]
    const last_name = parts.slice(1).join(' ')
    setSavingCust(true)
    try {
      const r = await createCustomer({ first_name, last_name, email: newCust.email, phone: newCust.phone, nationality: newCust.nationality, id_number: newCust.id_number })
      setCustomers((prev) => [r.data, ...prev])
      set('customer_id', r.data.id)
      setCustSearch(`${r.data.first_name} ${r.data.last_name}`)
      setShowNewCust(false)
      setNewCust({ fullName: '', email: '', phone: '', nationality: '', id_number: '' })
      toast.success('Ο πελάτης δημιουργήθηκε')
    } catch {
      toast.error('Σφάλμα δημιουργίας πελάτη')
    } finally {
      setSavingCust(false)
    }
  }

  const handleAI = async () => {
    if (!form.check_in || !form.check_out) { toast.error('Επιλέξτε πρώτα ημερομηνίες'); return }
    setAiLoading(true)
    try {
      const unit = units.find((u) => u.id === +form.unit_id)
      const r = await recommendUnit({ check_in: form.check_in, check_out: form.check_out, guests: form.guests, unit_type: unit?.type || null })
      setAiRec(r.data)
      if (r.data.recommendation?.recommended_unit_id) {
        set('unit_id', r.data.recommendation.recommended_unit_id)
        toast.success('Η AI επέλεξε βέλτιστη μονάδα!')
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα AI')
    } finally {
      setAiLoading(false)
    }
  }

  const handleCommPct = (pct) => {
    set('commission_percent', pct)
    set('commission', +(form.total_price * pct / 100).toFixed(2))
  }
  const handlePrice = (price) => {
    set('total_price', +price)
    set('commission', +(price * form.commission_percent / 100).toFixed(2))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.unit_id) { toast.error('Επιλέξτε μονάδα'); return }
    if (!form.customer_id) { toast.error('Επιλέξτε πελάτη'); return }
    setSaving(true)
    try {
      if (booking?.id) {
        await updateBooking(booking.id, form)
        toast.success('Η κράτηση ενημερώθηκε')
      } else {
        await createBooking(form)
        toast.success('Η κράτηση δημιουργήθηκε')
      }
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-2xl rounded-t-2xl md:rounded-2xl shadow-xl max-h-[94vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-800">{booking?.id ? 'Επεξεργασία Κράτησης' : 'Νέα Κράτηση'}</h3>
          <button onClick={onClose}><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Dates + guests */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Άφιξη *</label>
              <input className="input" type="date" required value={form.check_in} onChange={(e) => set('check_in', e.target.value)} />
            </div>
            <div>
              <label className="label">Αναχώρηση *</label>
              <input className="input" type="date" required value={form.check_out} onChange={(e) => set('check_out', e.target.value)} />
            </div>
            <div>
              <label className="label">Άτομα</label>
              <input className="input" type="number" min={1} max={20} value={form.guests} onChange={(e) => set('guests', +e.target.value)} />
            </div>
          </div>

          {/* Unit + AI */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Μονάδα *</label>
              {!booking?.id && (
                <button type="button" onClick={handleAI} disabled={aiLoading} className="flex items-center gap-1 text-xs text-purple-700 hover:text-purple-900 font-medium">
                  <SparklesIcon className="h-3.5 w-3.5" />
                  {aiLoading ? 'Ανάλυση...' : 'AI Βέλτιστη Επιλογή'}
                </button>
              )}
            </div>
            <select className="input" value={form.unit_id} onChange={(e) => set('unit_id', e.target.value)} required>
              <option value="">-- Επιλέξτε μονάδα --</option>
              {units.filter((u) => u.is_active).map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.type})</option>
              ))}
            </select>
            {aiRec && (
              <div className={`mt-2 p-3 rounded-lg text-sm border ${aiRec.available ? 'bg-purple-50 border-purple-200' : 'bg-red-50 border-red-200'}`}>
                {aiRec.available ? (
                  <>
                    <p className="font-medium text-purple-800">
                      ✨ AI Σύσταση: {aiRec.recommendation?.recommended_unit_name}
                      <span className="ml-2 text-xs font-normal text-purple-600">Σκορ: {aiRec.recommendation?.score}/100</span>
                    </p>
                    <p className="text-purple-700 text-xs mt-1">{aiRec.recommendation?.reasoning}</p>
                    {aiRec.recommendation?.warnings?.length > 0 && (
                      <p className="text-amber-700 text-xs mt-1">⚠️ {aiRec.recommendation.warnings.join(' ')}</p>
                    )}
                  </>
                ) : (
                  <p className="text-red-700">{aiRec.message}</p>
                )}
              </div>
            )}
          </div>

          {/* Customer */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Πελάτης *</label>
              <button type="button" onClick={() => setShowNewCust(!showNewCust)} className="text-xs text-blue-600 hover:underline">
                + Νέος πελάτης
              </button>
            </div>
            {showNewCust ? (
              <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
                <input className="input text-sm" placeholder="Ονοματεπώνυμο *" value={newCust.fullName} onChange={(e) => setNewCust((n) => ({ ...n, fullName: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-sm" placeholder="Τηλέφωνο" value={newCust.phone} onChange={(e) => setNewCust((n) => ({ ...n, phone: e.target.value }))} />
                  <input className="input text-sm" placeholder="Email" value={newCust.email} onChange={(e) => setNewCust((n) => ({ ...n, email: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-sm" placeholder="Εθνικότητα" value={newCust.nationality} onChange={(e) => setNewCust((n) => ({ ...n, nationality: e.target.value }))} />
                  <input className="input text-sm" placeholder="ΑΔΤ/Διαβατήριο" value={newCust.id_number} onChange={(e) => setNewCust((n) => ({ ...n, id_number: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowNewCust(false)} className="btn-secondary text-sm py-1 flex-1">Ακύρωση</button>
                  <button type="button" onClick={handleSaveNewCust} disabled={savingCust} className="btn-primary text-sm py-1 flex-1">
                    {savingCust ? 'Αποθήκευση...' : 'Αποθήκευση πελάτη'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <input className="input" placeholder="Αναζήτηση ονόματος..." value={custSearch} onChange={handleCustSearch} />
                <select
                  className="input"
                  value={form.customer_id}
                  onChange={(e) => {
                    set('customer_id', +e.target.value)
                    const c = customers.find((cu) => cu.id === +e.target.value)
                    if (c) setCustSearch(`${c.first_name} ${c.last_name}`)
                  }}
                  required
                >
                  <option value="">-- Επιλέξτε πελάτη --</option>
                  {customers.slice(0, 50).map((c) => (
                    <option key={c.id} value={c.id}>{c.last_name} {c.first_name} {c.phone ? `(${c.phone})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Channel + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Κανάλι</label>
              <select className="input" value={form.channel} onChange={(e) => set('channel', e.target.value)}>
                {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Κατάσταση</label>
              <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Σύνολο (€)</label>
              <input className="input" type="number" min={0} step={0.01} value={form.total_price} onChange={(e) => handlePrice(+e.target.value)} />
            </div>
            <div>
              <label className="label">Προμήθεια (%)</label>
              <input className="input" type="number" min={0} max={100} step={0.1} value={form.commission_percent} onChange={(e) => handleCommPct(+e.target.value)} />
            </div>
            <div>
              <label className="label">Προμήθεια (€)</label>
              <input className="input" type="number" min={0} step={0.01} value={form.commission} onChange={(e) => set('commission', +e.target.value)} />
            </div>
          </div>

          {form.total_price > 0 && (
            <div className="bg-gray-50 rounded-lg px-4 py-2 text-sm text-gray-600 flex justify-between">
              <span>Καθαρό εισόδημα:</span>
              <span className="font-semibold text-gray-800">€{(form.total_price - form.commission).toFixed(2)}</span>
            </div>
          )}

          {/* is_billed */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
              checked={!!form.is_billed}
              onChange={(e) => set('is_billed', e.target.checked)}
            />
            <span className="text-sm text-gray-700">Τιμολογήθηκε</span>
          </label>

          {/* Notes */}
          <div>
            <label className="label">Σημειώσεις</label>
            <textarea className="input" rows={2} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
          </div>

          {/* Guest Portal Link — only for saved bookings */}
          {booking?.id && portalLink && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-indigo-800 flex items-center gap-1.5">
                  <LinkIcon className="h-4 w-4" /> Guest Portal
                </span>
                {portalLink.is_verified
                  ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ Επαληθευμένος</span>
                  : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Αναμένει επαλήθευση</span>
                }
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={portalFullUrl || ''}
                  className="input text-xs flex-1 bg-white font-mono select-all cursor-pointer"
                  onClick={(e) => e.target.select()}
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="btn-secondary text-xs whitespace-nowrap px-3"
                >
                  Αντιγραφή
                </button>
              </div>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={sendingEmail}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 rounded-lg transition disabled:opacity-60"
              >
                <EnvelopeIcon className="h-4 w-4" />
                {sendingEmail ? 'Αποστολή...' : 'Αποστολή email στον πελάτη'}
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Ακύρωση</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Bookings() {
  const location = useLocation()
  const navigate = useNavigate()
  const importRef = useRef(null)

  const [bookings, setBookings] = useState([])
  const [units, setUnits] = useState([])
  const [customers, setCustomers] = useState([])
  const [modal, setModal] = useState(null)
  const [filters, setFilters] = useState({ channel: '', status: '', unit_id: '', is_billed: '' })
  const [sort, setSort] = useState({ sort_by: 'check_in', sort_dir: 'desc' })
  const [showFilters, setShowFilters] = useState(false)
  const [importing, setImporting] = useState(false)

  const load = useCallback(() => {
    const params = { ...sort, limit: 500 }
    if (filters.channel) params.channel = filters.channel
    if (filters.status) params.status = filters.status
    if (filters.unit_id) params.unit_id = filters.unit_id
    if (filters.is_billed !== '') params.is_billed = filters.is_billed === 'true'
    getBookings(params).then((r) => setBookings(r.data))
  }, [filters, sort])

  useEffect(() => {
    getUnits().then((r) => setUnits(r.data))
    getCustomers({ limit: 500 }).then((r) => setCustomers(r.data))
  }, [])

  useEffect(() => { load() }, [load])

  // Open edit modal from URL param ?edit=ID or from calendar navigation
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const editId = params.get('edit')
    if (editId && bookings.length > 0) {
      const b = bookings.find((x) => x.id === +editId)
      if (b) {
        setModal(b)
        navigate('/bookings', { replace: true })
      }
    }
  }, [location.search, bookings])

  const handleDelete = async (b) => {
    if (!confirm(`Διαγραφή κράτησης #${b.id};`)) return
    try {
      await deleteBooking(b.id)
      toast.success('Η κράτηση διαγράφηκε')
      load()
    } catch {
      toast.error('Σφάλμα διαγραφής')
    }
  }

  const handleExport = async () => {
    try {
      const params = {}
      if (filters.unit_id) params.unit_id = filters.unit_id
      const r = await exportBookings(params)
      const url = URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = 'kratiseis.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Σφάλμα εξαγωγής')
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const r = await downloadTemplate()
      const url = URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = 'template_kratiseis.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Σφάλμα λήψης template')
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    try {
      const r = await importBookings(file)
      toast.success(`Εισήχθησαν ${r.data.created} κρατήσεις`)
      if (r.data.errors?.length) {
        r.data.errors.forEach((err) => toast.error(err, { duration: 6000 }))
      }
      load()
    } catch {
      toast.error('Σφάλμα εισαγωγής αρχείου')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const nights = (b) => Math.round((new Date(b.check_out) - new Date(b.check_in)) / 86400000)

  const SortBtn = ({ field, label }) => (
    <button
      onClick={() => setSort((s) => ({ sort_by: field, sort_dir: s.sort_by === field && s.sort_dir === 'asc' ? 'desc' : 'asc' }))}
      className={`text-xs px-2 py-1 rounded border ${sort.sort_by === field ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
    >
      {label} {sort.sort_by === field ? (sort.sort_dir === 'asc' ? '↑' : '↓') : ''}
    </button>
  )

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800">Κρατήσεις</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowFilters(!showFilters)} className="btn-secondary flex items-center gap-1">
            <FunnelIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Φίλτρα</span>
          </button>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-1" title="Εξαγωγή Excel">
            <ArrowDownTrayIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button onClick={handleDownloadTemplate} className="btn-secondary flex items-center gap-1 text-xs" title="Κατέβασμα Template">
            <ArrowDownTrayIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Template</span>
          </button>
          <label className={`btn-secondary flex items-center gap-1 cursor-pointer ${importing ? 'opacity-60' : ''}`} title="Εισαγωγή από Excel">
            <ArrowUpTrayIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{importing ? 'Εισαγωγή...' : 'Εισαγωγή'}</span>
            <input ref={importRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} disabled={importing} />
          </label>
          <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-1">
            <PlusIcon className="h-4 w-4" /> Νέα
          </button>
        </div>
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400">Ταξινόμηση:</span>
        <SortBtn field="check_in" label="Άφιξη" />
        <SortBtn field="check_out" label="Αναχώρηση" />
        <SortBtn field="total_price" label="Ποσό" />
        <SortBtn field="created_at" label="Δημιουργία" />
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Κανάλι</label>
            <select className="input" value={filters.channel} onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}>
              <option value="">Όλα</option>
              {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Κατάσταση</label>
            <select className="input" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">Όλες</option>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Μονάδα</label>
            <select className="input" value={filters.unit_id} onChange={(e) => setFilters((f) => ({ ...f, unit_id: e.target.value }))}>
              <option value="">Όλες</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Τιμολόγηση</label>
            <select className="input" value={filters.is_billed} onChange={(e) => setFilters((f) => ({ ...f, is_billed: e.target.value }))}>
              <option value="">Όλες</option>
              <option value="true">Τιμολογήθηκαν</option>
              <option value="false">Δεν τιμολογήθηκαν</option>
            </select>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">#</th>
                <th className="text-left px-4 py-3">Πελάτης</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Μονάδα</th>
                <th className="text-left px-4 py-3">Περίοδος</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Κανάλι</th>
                <th className="text-right px-4 py-3 hidden lg:table-cell">Ποσό</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Κατάσταση</th>
                <th className="text-center px-2 py-3 hidden lg:table-cell">✓</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bookings.map((b) => (
                <tr key={b.id} className={`hover:bg-gray-50 ${b.status === 'cancelled' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-gray-400 text-xs">{b.id}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{b.customer.first_name} {b.customer.last_name}</p>
                    <p className="text-xs text-gray-400 sm:hidden">{b.unit.name}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{b.unit.name}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700 whitespace-nowrap">{format(new Date(b.check_in + 'T00:00:00'), 'dd/MM/yy')} – {format(new Date(b.check_out + 'T00:00:00'), 'dd/MM/yy')}</p>
                    <p className="text-xs text-gray-400">{nights(b)} νύχτες · {b.guests} άτομα</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CH[b.channel]?.color}`}>
                      {CH[b.channel]?.label || b.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    <p className="font-medium text-gray-800">€{b.total_price.toLocaleString('el-GR')}</p>
                    {b.commission > 0 && <p className="text-xs text-gray-400">-€{b.commission.toFixed(2)} προμ.</p>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ST[b.status]?.color}`}>
                      {ST[b.status]?.label || b.status}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-center hidden lg:table-cell">
                    {b.is_billed && <span className="text-green-600 font-bold text-sm">✓</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => setModal(b)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(b)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {bookings.length === 0 && (
            <p className="text-center py-10 text-sm text-gray-400">Δεν υπάρχουν κρατήσεις</p>
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
          {bookings.length} κρατήσεις
        </div>
      </div>

      {modal && (
        <BookingModal
          booking={modal === 'new' ? null : modal}
          units={units}
          customers={customers}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
