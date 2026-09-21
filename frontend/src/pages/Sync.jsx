import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  ArrowPathIcon, LinkIcon, ClipboardDocumentIcon, CheckIcon,
  CloudArrowUpIcon, CloudArrowDownIcon, PencilIcon,
  PlusIcon, ChevronDownIcon, ChevronRightIcon, TrashIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import {
  getIcalUnits, syncIcalUnit, syncIcalAll,
  getIcalExportUrl, regenerateIcalToken, updateIcalImportUrl,
  getChannelRates, createChannelRate, updateChannelRate, deleteChannelRate,
} from '../api'

const BASE_URL = window.location.origin

const PLATFORM_GUIDES = [
  { name: 'Airbnb', logo: '🏠', step: 'Go to Listing → Calendar → Availability Settings → Import Calendar and paste the URL.' },
  { name: 'Booking.com', logo: '🅱️', step: 'Go to Property → Rates & Availability → Calendar Sync → Add Feed URL.' },
  { name: 'VRBO / HomeAway', logo: '🏡', step: 'Go to Calendar → Import → Add iCal URL and paste the link.' },
  { name: 'Expedia', logo: '✈️', step: 'Go to Calendar → Manage → iCal Export/Import and add the feed.' },
]

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy} title="Αντιγραφή"
      className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0">
      {copied ? <><CheckIcon className="h-3.5 w-3.5 text-green-600" /> Copied!</> : <><ClipboardDocumentIcon className="h-3.5 w-3.5" /> Copy</>}
    </button>
  )
}

const CHANNELS = [
  { value: 'airbnb', label: 'Airbnb', color: 'text-rose-600 bg-rose-50 border-rose-200' },
  { value: 'booking', label: 'Booking.com', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { value: 'vrbo', label: 'VRBO', color: 'text-teal-600 bg-teal-50 border-teal-200' },
  { value: 'direct', label: 'Direct', color: 'text-green-600 bg-green-50 border-green-200' },
]

const CHANNEL_COLORS = Object.fromEntries(CHANNELS.map(c => [c.value, c.color]))
const CHANNEL_LABELS = Object.fromEntries(CHANNELS.map(c => [c.value, c.label]))

const EMPTY_FORM = {
  channel: 'airbnb',
  base_price_weekday: '',
  base_price_weekend: '',
  cleaning_fee: '',
  extra_guest_fee: '',
  extra_guest_after: 2,
  min_stay: 1,
  max_stay: '',
  weekly_discount_pct: '',
  monthly_discount_pct: '',
  notes: '',
  is_active: true,
}

function ChannelRateForm({ unitId, rate, onSave, onCancel }) {
  const [form, setForm] = useState(rate ? {
    channel: rate.channel,
    base_price_weekday: rate.base_price_weekday ?? '',
    base_price_weekend: rate.base_price_weekend ?? '',
    cleaning_fee: rate.cleaning_fee ?? '',
    extra_guest_fee: rate.extra_guest_fee ?? '',
    extra_guest_after: rate.extra_guest_after ?? 2,
    min_stay: rate.min_stay ?? 1,
    max_stay: rate.max_stay ?? '',
    weekly_discount_pct: rate.weekly_discount_pct ?? '',
    monthly_discount_pct: rate.monthly_discount_pct ?? '',
    notes: rate.notes ?? '',
    is_active: rate.is_active ?? true,
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.channel) { toast.error('Επιλέξτε κανάλι'); return }
    setSaving(true)
    try {
      const payload = {
        unit_id: unitId,
        channel: form.channel,
        base_price_weekday: form.base_price_weekday !== '' ? parseFloat(form.base_price_weekday) : null,
        base_price_weekend: form.base_price_weekend !== '' ? parseFloat(form.base_price_weekend) : null,
        cleaning_fee: form.cleaning_fee !== '' ? parseFloat(form.cleaning_fee) : 0,
        extra_guest_fee: form.extra_guest_fee !== '' ? parseFloat(form.extra_guest_fee) : 0,
        extra_guest_after: parseInt(form.extra_guest_after) || 2,
        min_stay: parseInt(form.min_stay) || 1,
        max_stay: form.max_stay !== '' ? parseInt(form.max_stay) : null,
        weekly_discount_pct: form.weekly_discount_pct !== '' ? parseFloat(form.weekly_discount_pct) : 0,
        monthly_discount_pct: form.monthly_discount_pct !== '' ? parseFloat(form.monthly_discount_pct) : 0,
        notes: form.notes || null,
        is_active: form.is_active,
      }
      if (rate?.id) {
        const r = await updateChannelRate(rate.id, payload)
        onSave(r.data)
      } else {
        const r = await createChannelRate(payload)
        onSave(r.data)
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-400"
  const labelCls = "block text-xs text-gray-500 mb-0.5 font-medium"

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 mt-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>Κανάλι *</label>
          <select value={form.channel} onChange={e => set('channel', e.target.value)} className={inputCls}>
            {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Τιμή Καθημερινές (€)</label>
          <input type="number" min="0" step="0.01" value={form.base_price_weekday}
            onChange={e => set('base_price_weekday', e.target.value)} placeholder="π.χ. 120" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Τιμή Σαββατοκύριακο (€)</label>
          <input type="number" min="0" step="0.01" value={form.base_price_weekend}
            onChange={e => set('base_price_weekend', e.target.value)} placeholder="π.χ. 150" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Τέλος Καθαρισμού (€)</label>
          <input type="number" min="0" step="0.01" value={form.cleaning_fee}
            onChange={e => set('cleaning_fee', e.target.value)} placeholder="0" className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className={labelCls}>Extra Άτομο (€)</label>
          <input type="number" min="0" step="0.01" value={form.extra_guest_fee}
            onChange={e => set('extra_guest_fee', e.target.value)} placeholder="0" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Μετά από N άτομα</label>
          <input type="number" min="1" step="1" value={form.extra_guest_after}
            onChange={e => set('extra_guest_after', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Ελάχιστη Διαμονή (νύχτες)</label>
          <input type="number" min="1" step="1" value={form.min_stay}
            onChange={e => set('min_stay', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Μέγιστη Διαμονή (νύχτες)</label>
          <input type="number" min="1" step="1" value={form.max_stay}
            onChange={e => set('max_stay', e.target.value)} placeholder="χωρίς όριο" className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className={labelCls}>Εβδομαδιαία Έκπτωση (%)</label>
          <input type="number" min="0" max="100" step="0.1" value={form.weekly_discount_pct}
            onChange={e => set('weekly_discount_pct', e.target.value)} placeholder="0" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Μηνιαία Έκπτωση (%)</label>
          <input type="number" min="0" max="100" step="0.1" value={form.monthly_discount_pct}
            onChange={e => set('monthly_discount_pct', e.target.value)} placeholder="0" className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Σημειώσεις</label>
          <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Προαιρετικές σημειώσεις..." className={inputCls} />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={saving}
          className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
        <button type="button" onClick={onCancel}
          className="text-xs border border-gray-200 px-4 py-1.5 rounded-lg hover:bg-gray-100">
          Ακύρωση
        </button>
      </div>
    </form>
  )
}

function ChannelRateAccordion({ rate, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const colorCls = CHANNEL_COLORS[rate.channel] || 'text-gray-600 bg-gray-50 border-gray-200'
  const label = CHANNEL_LABELS[rate.channel] || rate.channel

  const summaryParts = []
  if (rate.base_price_weekday != null) summaryParts.push(`€${rate.base_price_weekday}/νύχτα`)
  if (rate.cleaning_fee > 0) summaryParts.push(`καθαριότητα €${rate.cleaning_fee}`)
  if (rate.min_stay > 1) summaryParts.push(`min ${rate.min_stay} νύχτες`)

  return (
    <div className={`border rounded-lg overflow-hidden ${colorCls}`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:opacity-90 transition-opacity">
        <div className="flex items-center gap-2">
          {open ? <ChevronDownIcon className="h-3.5 w-3.5 flex-shrink-0" /> : <ChevronRightIcon className="h-3.5 w-3.5 flex-shrink-0" />}
          <span className="text-xs font-semibold">{label}</span>
          {summaryParts.length > 0 && (
            <span className="text-xs font-normal opacity-70">— {summaryParts.join(' · ')}</span>
          )}
          {!rate.is_active && <span className="text-xs opacity-50 ml-1">(ανενεργό)</span>}
        </div>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit}
            className="p-1 rounded hover:bg-white/50 transition-colors" title="Επεξεργασία">
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete}
            className="p-1 rounded hover:bg-white/50 transition-colors" title="Διαγραφή">
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </button>
      {open && (
        <div className="bg-white/60 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs border-t border-current/10">
          <div><span className="text-gray-500">Τιμή καθημερινές:</span> <span className="font-medium">{rate.base_price_weekday != null ? `€${rate.base_price_weekday}` : '—'}</span></div>
          <div><span className="text-gray-500">Τιμή Σ/Κ:</span> <span className="font-medium">{rate.base_price_weekend != null ? `€${rate.base_price_weekend}` : '—'}</span></div>
          <div><span className="text-gray-500">Καθαριότητα:</span> <span className="font-medium">€{rate.cleaning_fee}</span></div>
          <div><span className="text-gray-500">Extra άτομο:</span> <span className="font-medium">€{rate.extra_guest_fee} μετά {rate.extra_guest_after} άτομα</span></div>
          <div><span className="text-gray-500">Ελάχ. διαμονή:</span> <span className="font-medium">{rate.min_stay} νύχτ.</span></div>
          <div><span className="text-gray-500">Μέγ. διαμονή:</span> <span className="font-medium">{rate.max_stay ?? 'χωρίς όριο'}</span></div>
          <div><span className="text-gray-500">Εβδ. έκπτωση:</span> <span className="font-medium">{rate.weekly_discount_pct}%</span></div>
          <div><span className="text-gray-500">Μην. έκπτωση:</span> <span className="font-medium">{rate.monthly_discount_pct}%</span></div>
          {rate.notes && <div className="col-span-2"><span className="text-gray-500">Σημειώσεις:</span> <span className="font-medium">{rate.notes}</span></div>}
        </div>
      )}
    </div>
  )
}

function ChannelRatesSection({ unit }) {
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRate, setEditingRate] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await getChannelRates(unit.id)
      setRates(r.data)
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [unit.id])

  useEffect(() => { load() }, [load])

  const handleSave = (saved) => {
    setRates(prev => {
      const idx = prev.findIndex(r => r.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [...prev, saved]
    })
    setShowForm(false)
    setEditingRate(null)
    toast.success('Αποθηκεύτηκε')
  }

  const handleDelete = async (rate) => {
    if (!confirm(`Διαγραφή τιμής για ${CHANNEL_LABELS[rate.channel] || rate.channel};`)) return
    try {
      await deleteChannelRate(rate.id)
      setRates(prev => prev.filter(r => r.id !== rate.id))
      toast.success('Διαγράφηκε')
    } catch {
      toast.error('Σφάλμα διαγραφής')
    }
  }

  return (
    <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-purple-800">Τιμές ανά Κανάλι</span>
        {!showForm && !editingRate && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs text-purple-700 hover:text-purple-900 font-medium px-2 py-1 rounded-lg hover:bg-purple-100 transition-colors">
            <PlusIcon className="h-3.5 w-3.5" />
            Προσθήκη καναλιού
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-xs text-gray-400 py-1">Φόρτωση…</div>
      ) : rates.length === 0 && !showForm ? (
        <div className="text-xs text-gray-400">Δεν έχουν οριστεί τιμές ανά κανάλι.</div>
      ) : (
        <div className="space-y-1.5">
          {rates.map(r =>
            editingRate?.id === r.id ? (
              <ChannelRateForm key={r.id} unitId={unit.id} rate={r}
                onSave={handleSave} onCancel={() => setEditingRate(null)} />
            ) : (
              <ChannelRateAccordion key={r.id} rate={r}
                onEdit={() => { setShowForm(false); setEditingRate(r) }}
                onDelete={() => handleDelete(r)} />
            )
          )}
        </div>
      )}

      {showForm && (
        <ChannelRateForm unitId={unit.id} rate={null}
          onSave={handleSave} onCancel={() => setShowForm(false)} />
      )}
    </div>
  )
}

function UnitRow({ unit, onSynced }) {
  const [exportToken, setExportToken] = useState(unit.ical_export_token || '')
  const [importUrl, setImportUrl] = useState(unit.ical_url || '')
  const [editingImport, setEditingImport] = useState(false)
  const [draftImport, setDraftImport] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(false)

  const exportUrl = exportToken ? `${BASE_URL}/api/ical/feed/${exportToken}` : ''

  const ensureExportToken = async () => {
    if (exportToken) return exportToken
    setLoading(true)
    try {
      const r = await getIcalExportUrl(unit.id)
      setExportToken(r.data.ical_export_token)
      return r.data.ical_export_token
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateToken = async () => {
    await ensureExportToken()
  }

  const handleRegenerateToken = async () => {
    if (!confirm('Regenerating the token will break any existing platform subscriptions. Continue?')) return
    setLoading(true)
    try {
      const r = await regenerateIcalToken(unit.id)
      setExportToken(r.data.ical_export_token)
      toast.success('Token regenerated')
    } catch {
      toast.error('Error regenerating token')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveImport = async () => {
    try {
      await updateIcalImportUrl(unit.id, draftImport.trim())
      setImportUrl(draftImport.trim())
      setEditingImport(false)
      toast.success('Import URL saved')
    } catch {
      toast.error('Error saving URL')
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const r = await syncIcalUnit(unit.id)
      toast.success(`Sync OK — +${r.data.added} added, ~${r.data.updated} updated`)
      onSynced?.()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-800">{unit.name}</p>
          <p className="text-xs text-gray-400 capitalize">{unit.type}</p>
        </div>
        <button onClick={handleSync} disabled={syncing || !importUrl}
          className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
          <ArrowPathIcon className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>

      {/* Export (our URL → platforms import this) */}
      <div className="bg-green-50 border border-green-100 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <CloudArrowUpIcon className="h-4 w-4 text-green-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-green-800">Export URL — paste into platform calendars</span>
        </div>
        {exportToken ? (
          <div className="flex items-center gap-2 bg-white border border-green-200 rounded-lg px-3 py-2">
            <code className="text-xs text-gray-700 flex-1 break-all">{exportUrl}</code>
            <CopyButton value={exportUrl} />
          </div>
        ) : (
          <button onClick={handleGenerateToken} disabled={loading}
            className="text-xs font-medium text-green-700 underline hover:no-underline">
            {loading ? 'Generating…' : 'Generate export URL'}
          </button>
        )}
        {exportToken && (
          <button onClick={handleRegenerateToken} disabled={loading}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors">
            Regenerate token (breaks existing subscriptions)
          </button>
        )}
      </div>

      {/* Import (platform URL → we pull from this) */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <CloudArrowDownIcon className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-blue-800">Import URL — platform's iCal feed we sync from</span>
        </div>
        {editingImport ? (
          <div className="space-y-2">
            <input type="url" value={draftImport} onChange={e => setDraftImport(e.target.value)}
              placeholder="https://www.airbnb.com/calendar/ical/…"
              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-400" />
            <div className="flex gap-2">
              <button onClick={handleSaveImport} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">Save</button>
              <button onClick={() => setEditingImport(false)} className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {importUrl ? (
              <code className="text-xs text-gray-700 flex-1 truncate">{importUrl}</code>
            ) : (
              <span className="text-xs text-gray-400 flex-1">No import URL set</span>
            )}
            <button onClick={() => { setDraftImport(importUrl); setEditingImport(true) }}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 flex-shrink-0 px-2 py-1 rounded-lg hover:bg-blue-100">
              <PencilIcon className="h-3.5 w-3.5" /> Edit
            </button>
          </div>
        )}
      </div>

      {/* Per-channel pricing */}
      <ChannelRatesSection unit={unit} />
    </div>
  )
}

export default function Sync() {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncingAll, setSyncingAll] = useState(false)

  const load = async () => {
    try {
      const r = await getIcalUnits()
      setUnits(r.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSyncAll = async () => {
    setSyncingAll(true)
    try {
      const r = await syncIcalAll()
      toast.success(`Sync all — +${r.data.total_added} added, ~${r.data.total_updated} updated`)
    } catch {
      toast.error('Sync failed')
    } finally {
      setSyncingAll(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-800">Συγχρονισμός Πλατφορμών</h2>
        </div>
        <button onClick={handleSyncAll} disabled={syncingAll}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          <ArrowPathIcon className={`h-4 w-4 ${syncingAll ? 'animate-spin' : ''}`} />
          {syncingAll ? 'Syncing all…' : 'Sync All Units'}
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Πώς λειτουργεί το iCal Sync</p>
        <p>• <strong>Export URL</strong>: Δώστε αυτό το URL στις πλατφόρμες (Airbnb, Booking, VRBO) ώστε να εισάγουν τις κρατήσεις σας.</p>
        <p>• <strong>Import URL</strong>: Το URL iCal της πλατφόρμας από το οποίο εισάγουμε κρατήσεις κάθε 6 ώρες αυτόματα.</p>
        <p>• Ο αυτόματος συγχρονισμός τρέχει κάθε 6 ώρες. Μπορείτε επίσης να πατήσετε "Sync Now" ανά μονάδα.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : units.length === 0 ? (
        <p className="text-center text-gray-400 py-12">Δεν υπάρχουν ενεργές μονάδες.</p>
      ) : (
        <div className="space-y-4">
          {units.map(u => (
            <UnitRow key={u.id} unit={u} onSynced={load} />
          ))}
        </div>
      )}

      {/* Platform guides */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800">Οδηγίες ανά πλατφόρμα</h3>
          <p className="text-xs text-gray-500 mt-0.5">Πώς να συνδέσετε το Export URL σε κάθε πλατφόρμα</p>
        </div>
        <div className="divide-y divide-gray-50">
          {PLATFORM_GUIDES.map(p => (
            <div key={p.name} className="flex items-start gap-3 px-5 py-4">
              <span className="text-2xl flex-shrink-0">{p.logo}</span>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{p.step}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
