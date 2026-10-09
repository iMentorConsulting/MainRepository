import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowPathIcon, PlayIcon, CheckIcon, XMarkIcon, ClipboardDocumentIcon,
  ExclamationTriangleIcon, ChevronDownIcon, ChevronUpIcon, ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'
import {
  getUnits, getListingConfig, saveListingConfig, runListingOptimizer, getListingRunStatus,
  getListingLatest, getListingHistory, getListingRecommendations, setListingRecommendationStatus,
} from '../api'

const PLATFORM = {
  airbnb: { label: 'Airbnb', cls: 'bg-rose-50 text-rose-700 border-rose-200', color: '#E11D48' },
  booking: { label: 'Booking', cls: 'bg-blue-50 text-blue-700 border-blue-200', color: '#2563EB' },
  both: { label: 'Airbnb + Booking', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
}
const PRIORITY = {
  high: { label: 'Υψηλή', cls: 'bg-red-50 text-red-700 border-red-200' },
  medium: { label: 'Μεσαία', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  low: { label: 'Χαμηλή', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
}
const CATEGORY = {
  price: 'Τιμή', offer: 'Προσφορά', title: 'Τίτλος', description: 'Περιγραφή', photos: 'Φωτογραφίες',
  amenities: 'Παροχές', policy: 'Πολιτική', availability: 'Διαθεσιμότητα', reviews: 'Κριτικές', other: 'Άλλο',
}

const TIER = {
  superior: { label: 'Ανώτερο', cls: 'text-violet-700 bg-violet-50 border-violet-200' },
  comparable: { label: 'Ισάξιο', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  inferior: { label: 'Κατώτερο', cls: 'text-gray-500 bg-gray-50 border-gray-200' },
}
const tierOf = (score, mine) => mine == null || score == null ? null
  : score >= mine + 5 ? 'superior' : score >= mine - 5 ? 'comparable' : 'inferior'

const fmtD = (iso) => iso ? new Date(iso).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' }) : ''
const eur = (v) => v == null ? '—' : `€${Math.round(v).toLocaleString('el-GR')}`

function Chip({ cls, children }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium ${cls}`}>{children}</span>
}

function RankBadge({ rank, total }) {
  if (!total) return <span className="text-gray-400">—</span>
  if (!rank) return <span className="text-red-600 font-semibold">Εκτός top {total}</span>
  const cls = rank === 1 ? 'text-green-700' : rank <= 5 ? 'text-emerald-600' : rank <= 15 ? 'text-amber-600' : 'text-red-600'
  return <span className={`font-bold tabular-nums ${cls}`}>#{rank}<span className="text-gray-400 font-normal"> / {total}</span></span>
}

const PLATFORM_OPTS = [['both', 'Airbnb + Booking'], ['airbnb', 'Airbnb'], ['booking', 'Booking']]

function MinStayPeriods({ periods, onChange }) {
  const upd = (i, k, v) => onChange(periods.map((p, j) => j === i ? { ...p, [k]: v } : p))
  return (
    <div className="sm:col-span-2 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label className="label mb-0">Ελάχιστη διαμονή ανά περίοδο (όπως στις πλατφόρμες)</label>
        <button type="button" className="text-xs text-blue-600 hover:underline shrink-0"
          onClick={() => onChange([...periods, { from: '', to: '', platform: 'both', nights: 3 }])}>+ Προσθήκη περιόδου</button>
      </div>
      {periods.length === 0 ? (
        <p className="text-xs text-gray-400">Καμία περίοδος — ισχύουν οι κανόνες του iStay (Availability / Τιμολόγηση).</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 text-left">
              <th className="py-1 pr-2 font-medium">Check-in από</th><th className="py-1 pr-2 font-medium">έως</th>
              <th className="py-1 pr-2 font-medium">Πλατφόρμα</th><th className="py-1 pr-2 font-medium">Νύχτες</th><th />
            </tr></thead>
            <tbody>
              {periods.map((p, i) => (
                <tr key={i} className="align-top">
                  <td className="py-1 pr-2"><input type="date" className="input py-1 text-xs" value={p.from || ''} onChange={e => upd(i, 'from', e.target.value)} /></td>
                  <td className="py-1 pr-2"><input type="date" className="input py-1 text-xs" value={p.to || ''} onChange={e => upd(i, 'to', e.target.value)} /></td>
                  <td className="py-1 pr-2">
                    <select className="input py-1 text-xs" value={p.platform || 'both'} onChange={e => upd(i, 'platform', e.target.value)}>
                      {PLATFORM_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="py-1 pr-2 w-20"><input type="number" min={1} max={60} className="input py-1 text-xs" value={p.nights || ''} onChange={e => upd(i, 'nights', +e.target.value || '')} /></td>
                  <td className="py-1 whitespace-nowrap">
                    {p.rec_id && <span className="mr-1 px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 text-[10px]" title={p.note}>από πρόταση</span>}
                    <button type="button" title="Διαγραφή" className="p-1 text-gray-400 hover:text-red-600" onClick={() => onChange(periods.filter((_, j) => j !== i))}>
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-400">Π.χ. καλοκαίρι 7 νύχτες, χειμώνας 3, και εξαιρέσεις. Όταν επικαλύπτονται, ισχύει η μικρότερη περίοδος (η εξαίρεση).</p>
    </div>
  )
}

export default function ListingOptimizer() {
  const [units, setUnits] = useState([])
  const [cfg, setCfg] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState({ running: false })
  const [latest, setLatest] = useState(null)
  const [history, setHistory] = useState([])
  const [recs, setRecs] = useState([])
  const [recFilter, setRecFilter] = useState('open')
  const poll = useRef(null)

  const unitName = (id) => units.find(u => u.id === id)?.name || `#${id}`

  function loadResults() {
    getListingLatest().then(r => setLatest(r.data)).catch(() => {})
    getListingHistory().then(r => setHistory(r.data)).catch(() => {})
    getListingRecommendations().then(r => setRecs(r.data)).catch(() => {})
  }

  function checkStatus() {
    getListingRunStatus().then(r => {
      setStatus(r.data)
      if (r.data.running) {
        poll.current = setTimeout(checkStatus, 4000)
      } else if (poll.current) {
        poll.current = null
        loadResults()
        if (r.data.error) toast.error(r.data.error)
        else toast.success('Η ανάλυση ολοκληρώθηκε')
      }
    }).catch(() => {})
  }

  useEffect(() => {
    getUnits().then(r => setUnits((r.data || []).filter(u => u.is_active !== false))).catch(() => {})
    getListingConfig().then(r => {
      setCfg(r.data)
      if (!r.data.search_location) setShowSettings(true)
    }).catch(() => {})
    loadResults()
    getListingRunStatus().then(r => {
      setStatus(r.data)
      if (r.data.running) { poll.current = setTimeout(checkStatus, 4000) }
    }).catch(() => {})
    return () => poll.current && clearTimeout(poll.current)
  }, [])

  const setC = (k, v) => setCfg(c => ({ ...c, [k]: v }))
  const af = cfg?.airbnb_filters || {}
  const setAF = (k, v) => setCfg(c => ({ ...c, airbnb_filters: { ...(c.airbnb_filters || {}), [k]: v } }))
  const setU = (uid, k, v) => setCfg(c => ({ ...c, units: { ...c.units, [uid]: { ...(c.units?.[uid] || {}), [k]: v } } }))

  async function save() {
    setSaving(true)
    try {
      const { apify_configured, ai_configured, ...data } = cfg
      await saveListingConfig(data)
      toast.success('Αποθηκεύτηκε')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Σφάλμα αποθήκευσης')
    } finally { setSaving(false) }
  }

  async function run() {
    try {
      await runListingOptimizer()
      setStatus({ running: true, log: [] })
      poll.current = setTimeout(checkStatus, 2000)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Σφάλμα εκκίνησης')
    }
  }

  async function mark(id, st) {
    const r = await setListingRecommendationStatus(id, st)
    setRecs(rs => rs.map(x => x.id === id ? { ...x, status: st } : x))
    if (recs.find(x => x.id === id)?.category === 'availability') {
      // The backend records/removes a min-stay exception — reload so a later save doesn't overwrite it
      getListingConfig().then(c => setCfg(c.data)).catch(() => {})
      if (r.data?.message) toast.success(r.data.message)
    }
  }

  // Rank history → one line per unit+platform; Y axis reversed so #1 is on top
  const { chartData, series } = useMemo(() => {
    const byDate = {}, keys = new Set()
    history.forEach(h => {
      const k = `${h.unit_id}|${h.platform}`
      keys.add(k)
      byDate[h.date] = byDate[h.date] || { date: h.date }
      const val = h.rank ?? h.total_results + 1
      byDate[h.date][k] = Math.min(byDate[h.date][k] ?? Infinity, val)
    })
    return { chartData: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)), series: [...keys] }
  }, [history])

  const visibleRecs = recs.filter(r => recFilter === 'all' || r.status === recFilter)
  const openCount = recs.filter(r => r.status === 'open').length
  const ready = cfg?.apify_configured && cfg?.ai_configured && cfg?.search_location

  const guestGroups = cfg ? new Set(units.filter(u => cfg.units?.[u.id]?.airbnb_url || cfg.units?.[u.id]?.booking_url)
    .map(u => cfg.units[u.id].guests || u.capacity || cfg.adults)).size || 1 : 1
  const periodCount = (cfg?.analysis_periods || []).filter(p => p.from && p.to).length
  const searchesPerRun = cfg ? (periodCount || 1) * cfg.max_periods * cfg.platforms.length * guestGroups : 0
  const setPeriods = (ps) => setC('analysis_periods', ps)
  const updPeriod = (i, k, v) => setPeriods((cfg.analysis_periods || []).map((p, j) => j === i ? { ...p, [k]: v } : p))

  if (!cfg) return <div className="p-6 text-gray-400 text-sm">Φόρτωση…</div>

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowTrendingUpIcon className="w-7 h-7 text-blue-600" /> Βελτιστοποίηση Listing
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Θέση στις αναζητήσεις Airbnb & Booking για τις κενές σας ημερομηνίες, με συγκεκριμένες προτάσεις AI
            {cfg.search_location && <> · <strong>{cfg.search_location}</strong>, {cfg.adults} ενήλικες</>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSettings(s => !s)} className="btn-secondary text-sm flex items-center gap-1">
            Ρυθμίσεις {showSettings ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
          </button>
          <button onClick={run} disabled={status.running || !ready}
            className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
            {status.running ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <PlayIcon className="w-4 h-4" />}
            {status.running ? 'Ανάλυση σε εξέλιξη…' : 'Ανάλυση τώρα'}
          </button>
        </div>
      </div>

      {/* Setup warnings */}
      {(!cfg.apify_configured || !cfg.ai_configured) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex gap-2">
          <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
          <div>
            {!cfg.apify_configured && <p>Λείπει το <code className="bg-amber-100 px-1 rounded">APIFY_TOKEN</code> στις μεταβλητές του Railway (apify.com → Settings → API & Integrations).</p>}
            {!cfg.ai_configured && <p>Λείπει το <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code>.</p>}
          </div>
        </div>
      )}

      {/* Settings */}
      {showSettings && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="label">Περιοχή αναζήτησης (όπως την γράφει ο επισκέπτης)</label>
              <input className="input" placeholder="π.χ. Chania, Crete" value={cfg.search_location}
                onChange={e => setC('search_location', e.target.value)} />
            </div>
            <div>
              <label className="label">Επισκέπτες (αν λείπει χωρητικότητα)</label>
              <input type="number" min={1} max={16} className="input" value={cfg.adults}
                onChange={e => setC('adults', +e.target.value)} />
            </div>
            <div>
              <label className="label">Πλατφόρμες</label>
              <div className="flex gap-3 pt-2">
                {['airbnb', 'booking'].map(p => (
                  <label key={p} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={cfg.platforms.includes(p)}
                      onChange={e => setC('platforms', e.target.checked ? [...cfg.platforms, p] : cfg.platforms.filter(x => x !== p))} />
                    {PLATFORM[p].label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Ελεύθερα διαστήματα ανά περίοδο</label>
              <input type="number" min={1} max={6} className="input" value={cfg.max_periods}
                onChange={e => setC('max_periods', +e.target.value)} />
            </div>
            <div>
              <label className="label">Αποτελέσματα ανά αναζήτηση</label>
              <input type="number" min={10} max={100} step={10} className="input" value={cfg.max_results}
                onChange={e => setC('max_results', +e.target.value)} />
            </div>
            <div>
              <label className="label">Ορίζοντας (ημέρες)</label>
              <input type="number" min={7} max={365} className="input disabled:bg-gray-100 disabled:text-gray-400" value={cfg.lookahead_days}
                disabled={periodCount > 0} title={periodCount ? 'Δεν χρησιμοποιείται — εξετάζονται οι περίοδοι ανάλυσης' : ''}
                onChange={e => setC('lookahead_days', +e.target.value)} />
              {periodCount > 0 && <p className="text-[11px] text-gray-400 mt-1">Αντικαθίσταται από τις περιόδους ανάλυσης</p>}
            </div>
            <div>
              <label className="label">Μέγ. κόστος ανά αναζήτηση ($)</label>
              <input type="number" min={0.05} max={5} step={0.05} className="input" value={cfg.max_usd_per_search ?? 0.3}
                onChange={e => setC('max_usd_per_search', +e.target.value)} />
            </div>
            <div>
              <label className="label">Μέγ. κόστος ανά ανάλυση ($)</label>
              <input type="number" min={0.05} max={20} step={0.05} className="input" value={cfg.max_usd_per_run ?? 1}
                onChange={e => setC('max_usd_per_run', +e.target.value)} />
            </div>
            <div>
              <label className="label">Ελάχιστη τιμή (€/νύχτα)</label>
              <input type="number" min={0} step={10} className="input" value={cfg.luxury_min_nightly ?? 200}
                onChange={e => setC('luxury_min_nightly', +e.target.value || 0)} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm pb-2">
                <input type="checkbox" checked={cfg.enabled} onChange={e => setC('enabled', e.target.checked)} />
                Αυτόματα κάθε Δευτέρα
              </label>
            </div>
          </div>
          <div className="border border-blue-100 bg-blue-50/40 rounded-lg p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-gray-700">Περίοδοι ανάλυσης</p>
              <button type="button" className="text-xs text-blue-600 hover:underline"
                onClick={() => setPeriods([...(cfg.analysis_periods || []), { from: '', to: '', label: '' }])}>+ Προσθήκη περιόδου</button>
            </div>
            {!(cfg.analysis_periods || []).length ? (
              <p className="text-xs text-gray-500">Καμία περίοδος — εξετάζονται οι επόμενες {cfg.lookahead_days} ημέρες (ορίζοντας).</p>
            ) : (
              <div className="space-y-2">
                {(cfg.analysis_periods || []).map((p, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <div><label className="label">Από</label><input type="date" className="input py-1 text-sm" value={p.from || ''} onChange={e => updPeriod(i, 'from', e.target.value)} /></div>
                    <div><label className="label">Έως (τελευταία νύχτα)</label><input type="date" className="input py-1 text-sm" value={p.to || ''} onChange={e => updPeriod(i, 'to', e.target.value)} /></div>
                    <div className="flex-1 min-w-[140px]"><label className="label">Όνομα</label><input className="input py-1 text-sm" placeholder="π.χ. Πάσχα 2027" value={p.label || ''} onChange={e => updPeriod(i, 'label', e.target.value)} /></div>
                    <button type="button" title="Διαγραφή" className="p-2 text-gray-400 hover:text-red-600"
                      onClick={() => setPeriods(cfg.analysis_periods.filter((_, j) => j !== i))}><XMarkIcon className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500">
              Σε κάθε περίοδο αναζητείται το πρώτο ελεύθερο διάστημα που καλύπτει την ελάχιστη διαμονή (οι κλεισμένες μέρες
              δεν μπορούν να εμφανιστούν σε αναζήτηση). Το check-in είναι μέσα στην περίοδο· η διαμονή μπορεί να συνεχίζει μετά.
            </p>
          </div>
          <div className="border border-rose-100 bg-rose-50/40 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Φίλτρα αναζήτησης Airbnb</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {[['entire_place', 'Ολόκληρο κατάλυμα'], ['pool', 'Πισίνα'], ['house', 'Τύπος: Σπίτι']].map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!af[k]} onChange={e => setAF(k, e.target.checked)} /> {l}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 max-w-md">
              {[['min_bedrooms', 'Υπνοδωμάτια'], ['min_beds', 'Κρεβάτια'], ['min_bathrooms', 'Μπάνια']].map(([k, l]) => (
                <div key={k}>
                  <label className="label">{l} (από)</label>
                  <input type="number" min={0} max={20} className="input" value={af[k] ?? ''}
                    onChange={e => setAF(k, +e.target.value || 0)} />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              Ελάχιστη τιμή ταξιδιού = {cfg.luxury_min_nightly || 0}€ × νύχτες (π.χ. 5 νύχτες → {(cfg.luxury_min_nightly || 0) * 5}€).
              Η ίδια τιμή ορίζει και ποια listings μετράνε ως luxury.
            </p>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-gray-500">Προχωρημένα: Apify scrapers</summary>
            <div className="grid sm:grid-cols-2 gap-4 mt-3">
              <div>
                <label className="label">Airbnb actor</label>
                <input className="input font-mono text-xs" placeholder="cirkit/airbnb-search-scraper" value={cfg.airbnb_actor || ''}
                  onChange={e => setC('airbnb_actor', e.target.value)} />
              </div>
              <div>
                <label className="label">Booking actor</label>
                <input className="input font-mono text-xs" placeholder="voyager/booking-scraper" value={cfg.booking_actor || ''}
                  onChange={e => setC('booking_actor', e.target.value)} />
              </div>
            </div>
          </details>
          <p className="text-xs text-gray-500">
            Κάθε ανάλυση κάνει <strong>{searchesPerRun}</strong> αναζητήσεις των {cfg.max_results} αποτελεσμάτων.
            Μέγιστο κόστος: <strong>${Math.min((cfg.max_usd_per_search ?? 0.3) * searchesPerRun, cfg.max_usd_per_run ?? 1).toFixed(2)}</strong> ανά ανάλυση
            {cfg.enabled && <> · ~${(Math.min((cfg.max_usd_per_search ?? 0.3) * searchesPerRun, cfg.max_usd_per_run ?? 1) * 4.3).toFixed(2)}/μήνα με την εβδομαδιαία εκτέλεση</>}.
            Το Apify σταματά κάθε αναζήτηση μόλις φτάσει το όριο.
          </p>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Τα listings σας</h3>
            {units.map(u => {
              const uc = cfg.units?.[u.id] || {}
              return (
                <div key={u.id} className="border border-gray-100 rounded-lg p-4 space-y-3 bg-gray-50/50">
                  <p className="font-medium text-gray-800">{u.name}</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Link Airbnb</label>
                      <input className="input" placeholder="https://www.airbnb.com/rooms/…" value={uc.airbnb_url || ''}
                        onChange={e => setU(u.id, 'airbnb_url', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Link Booking</label>
                      <input className="input" placeholder="https://www.booking.com/hotel/gr/…" value={uc.booking_url || ''}
                        onChange={e => setU(u.id, 'booking_url', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Επισκέπτες στην αναζήτηση</label>
                      <input type="number" min={1} max={30} className="input" placeholder={`${u.capacity || ''} (χωρητικότητα)`}
                        value={uc.guests || ''} onChange={e => setU(u.id, 'guests', +e.target.value || undefined)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[['airbnb_min_stay', 'Ελάχ. διαμονή Airbnb (υπόλοιπες ημ/νίες)'], ['booking_min_stay', 'Ελάχ. διαμονή Booking (υπόλοιπες ημ/νίες)']].map(([k, l]) => (
                        <div key={k}>
                          <label className="label">{l}</label>
                          <input type="number" min={1} max={30} className="input" placeholder="από iStay"
                            value={uc[k] || ''} onChange={e => setU(u.id, k, +e.target.value || undefined)} />
                        </div>
                      ))}
                    </div>
                    <MinStayPeriods periods={uc.min_stay_periods || []}
                      onChange={ps => setU(u.id, 'min_stay_periods', ps)} />
                    <div>
                      <label className="label">Τρέχων τίτλος listing</label>
                      <input className="input" value={uc.title || ''} onChange={e => setU(u.id, 'title', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Τρέχουσα περιγραφή</label>
                      <textarea rows={4} className="input" value={uc.description || ''}
                        onChange={e => setU(u.id, 'description', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Δυνατά σημεία / παροχές</label>
                      <textarea rows={4} className="input" placeholder="π.χ. ιδιωτική πισίνα, θέα θάλασσα, 5' από παραλία, BBQ, EV charger"
                        value={uc.highlights || ''} onChange={e => setU(u.id, 'highlights', e.target.value)} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? 'Αποθήκευση…' : 'Αποθήκευση ρυθμίσεων'}</button>
          </div>
        </div>
      )}

      {/* Run log */}
      {(status.running || status.log?.length > 0) && (
        <div className="bg-gray-900 text-gray-100 rounded-xl p-4 text-xs font-mono space-y-0.5 max-h-48 overflow-y-auto">
          {(status.log || []).map((l, i) => <p key={i}>{l}</p>)}
          {status.running && <p className="text-gray-400 animate-pulse">Αναμονή για Apify (1–3 λεπτά ανά αναζήτηση)…</p>}
        </div>
      )}

      {/* Latest positions */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Θέση στις αναζητήσεις</h2>
          {latest?.created_at && <span className="text-xs text-gray-400">Τελευταία ανάλυση: {new Date(latest.created_at).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' })}</span>}
        </div>
        {!latest?.snapshots?.length ? (
          <p className="py-10 text-center text-sm text-gray-400">Δεν υπάρχει ανάλυση ακόμα. Συμπληρώστε τις ρυθμίσεις και πατήστε «Ανάλυση τώρα».</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-xs text-gray-600 uppercase border-b">
                <th className="text-left px-4 py-3">Μονάδα</th>
                <th className="text-left px-4 py-3">Πλατφόρμα</th>
                <th className="text-left px-4 py-3">Κενή περίοδος</th>
                <th className="text-right px-4 py-3">Θέση</th>
                <th className="text-right px-4 py-3">Θέση στα luxury</th>
                <th className="text-right px-4 py-3">Δική σας τιμή</th>
                <th className="text-left px-4 py-3">Μείωση τιμής;</th>
                <th className="text-left px-4 py-3">Πρώτοι στην αναζήτηση</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {latest.snapshots.map(s => (
                  <tr key={s.id} className="align-top">
                    <td className="px-4 py-3 font-medium">{unitName(s.unit_id)}</td>
                    <td className="px-4 py-3"><Chip cls={PLATFORM[s.platform]?.cls}>{PLATFORM[s.platform]?.label}</Chip></td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                      {fmtD(s.check_in)} – {fmtD(s.check_out)}
                      <span className="block text-[11px] text-gray-500">{s.adults} επισκέπτες</span>
                      {s.search_url && <a href={s.search_url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline">Άνοιγμα αναζήτησης ↗</a>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {s.error ? <span className="text-red-500 text-xs" title={s.error}>Σφάλμα</span> : <RankBadge rank={s.rank} total={s.total_results} />}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {s.lux_rank ? <RankBadge rank={s.lux_rank} total={s.lux_total} /> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {eur(s.my_price)}
                      {s.my_score != null && <span className="block text-[11px] text-gray-500">score {s.my_score}/100</span>}
                    </td>
                    <td className="px-4 py-3 text-xs min-w-[170px]">
                      {s.error ? null : s.better_cheaper?.length ? (
                        <div className="text-amber-700">
                          <p className="font-semibold">Ναι — {s.better_cheaper.length} ισάξιο/ανώτερο φθηνότερο</p>
                          {s.better_cheaper.slice(0, 2).map((b, i) => (
                            <a key={i} href={b.url} target="_blank" rel="noreferrer" className="block hover:underline truncate max-w-[200px]">
                              #{b.position} {b.name} · {eur(b.price)}
                            </a>
                          ))}
                        </div>
                      ) : <span className="text-green-700 font-medium">Όχι — κανένα αντίστοιχο φθηνότερο</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 space-y-0.5 min-w-[220px]">
                      {s.competitors.slice(0, 3).map((c, i) => (
                        <a key={i} href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-blue-600 max-w-[320px]">
                          {tierOf(c.score, s.my_score) && (
                            <span className={`shrink-0 px-1.5 rounded border text-[10px] ${TIER[tierOf(c.score, s.my_score)].cls}`}>{TIER[tierOf(c.score, s.my_score)].label}</span>
                          )}
                          <span className="truncate">{c.position || i + 1}. {c.name} · {eur(c.price)}{c.rating ? ` · ★${c.rating}` : ''}</span>
                        </a>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-2 items-center justify-between">
          <h2 className="font-semibold text-gray-800">Προτάσεις βελτίωσης {openCount > 0 && <span className="ml-1 text-xs bg-blue-600 text-white rounded-full px-2 py-0.5">{openCount}</span>}</h2>
          <div className="flex gap-1">
            {[['open', 'Ανοιχτές'], ['done', 'Έγιναν'], ['ignored', 'Αγνοήθηκαν'], ['all', 'Όλες']].map(([v, l]) => (
              <button key={v} onClick={() => setRecFilter(v)}
                className={`px-3 py-1 rounded-full text-xs border ${recFilter === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>{l}</button>
            ))}
          </div>
        </div>
        {visibleRecs.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">Καμία πρόταση σε αυτή την κατηγορία</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visibleRecs.map(r => (
              <li key={r.id} className={`p-5 space-y-2 ${r.status !== 'open' ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip cls={PRIORITY[r.priority]?.cls || PRIORITY.medium.cls}>{PRIORITY[r.priority]?.label || r.priority}</Chip>
                  {r.platform && PLATFORM[r.platform] && <Chip cls={PLATFORM[r.platform].cls}>{PLATFORM[r.platform].label}</Chip>}
                  <Chip cls="bg-white text-gray-600 border-gray-200">{CATEGORY[r.category] || r.category}</Chip>
                  <span className="text-xs text-gray-500">{unitName(r.unit_id)}{r.check_in && <> · {fmtD(r.check_in)}{r.check_out && <>–{fmtD(r.check_out)}</>}</>}</span>
                </div>
                <p className="font-semibold text-gray-900">{r.title}</p>
                <p className="text-sm text-gray-700 whitespace-pre-line">{r.action}</p>
                {r.suggested_text && (
                  <div className="relative bg-blue-50 border border-blue-100 rounded-lg p-3 pr-10 text-sm text-gray-800 whitespace-pre-line">
                    {r.suggested_text}
                    <button title="Αντιγραφή" onClick={() => { navigator.clipboard.writeText(r.suggested_text); toast.success('Αντιγράφηκε') }}
                      className="absolute top-2 right-2 p-1 rounded hover:bg-blue-100 text-blue-600">
                      <ClipboardDocumentIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  {r.status === 'open' ? (<>
                    <button onClick={() => mark(r.id, 'done')} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700"><CheckIcon className="w-3.5 h-3.5" /> {r.category === 'availability' ? 'Έγινε — το άλλαξα στην πλατφόρμα' : 'Έγινε'}</button>
                    <button onClick={() => mark(r.id, 'ignored')} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"><XMarkIcon className="w-3.5 h-3.5" /> Αγνόηση</button>
                  </>) : (
                    <button onClick={() => mark(r.id, 'open')} className="text-xs text-blue-600 hover:underline">Επαναφορά σε ανοιχτή</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Rank history */}
      {chartData.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-1">Εξέλιξη θέσης</h2>
          <p className="text-xs text-gray-500 mb-3">Καλύτερη θέση ανά ανάλυση · πάνω = καλύτερα</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={fmtD} />
              <YAxis reversed allowDecimals={false} domain={[1, 'dataMax']} tick={{ fontSize: 11 }} tickFormatter={v => `#${v}`} />
              <Tooltip labelFormatter={fmtD} formatter={(v, k) => [`#${v}`, k]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series.map((k, i) => {
                const [uid, p] = k.split('|')
                return <Line key={k} dataKey={k} name={`${unitName(+uid)} · ${PLATFORM[p]?.label}`} stroke={PLATFORM[p]?.color}
                  strokeDasharray={i % 2 ? '5 3' : undefined} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
