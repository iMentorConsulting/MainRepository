import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGapAlerts, recommendUnit, getUnits, getBookingAlerts } from '../api'
import {
  SparklesIcon, ExclamationTriangleIcon, CheckCircleIcon,
  XCircleIcon, ArrowPathIcon, ClockIcon, CreditCardIcon,
} from '@heroicons/react/24/outline'

const UNIT_TYPES = [
  { value: '', label: 'Οποιοσδήποτε' },
  { value: 'apartment', label: 'Διαμέρισμα' },
  { value: 'room', label: 'Δωμάτιο' },
  { value: 'villa', label: 'Βίλα' },
  { value: 'studio', label: 'Στούντιο' },
  { value: 'house', label: 'Σπίτι' },
]

const CHANNEL_LABELS = {
  booking: 'Booking.com', airbnb: 'Airbnb', direct: 'Απευθείας',
  oga: 'ΟΓΑ', social_tourism: 'Κοιν.Τουρισμός', other: 'Άλλο',
}

function GapBadge({ days }) {
  const color = days === 1 ? 'bg-red-100 text-red-700' : days === 2 ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'
  return <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${color}`}>{days}</span>
}

export default function SmartAdvisor() {
  const navigate = useNavigate()
  const [gaps, setGaps] = useState(null)
  const [gapsLoading, setGapsLoading] = useState(false)
  const [maxGap, setMaxGap] = useState(3)

  const [reqForm, setReqForm] = useState({ check_in: '', check_out: '', guests: 1, unit_type: '' })
  const [recResult, setRecResult] = useState(null)
  const [recLoading, setRecLoading] = useState(false)

  const [alerts, setAlerts] = useState(null)
  const [alertsLoading, setAlertsLoading] = useState(false)

  useEffect(() => {
    getUnits({ active_only: true })
    loadGaps()
    loadAlerts()
  }, [])

  const loadGaps = async (mg = maxGap) => {
    setGapsLoading(true)
    try {
      const r = await getGapAlerts({ max_gap_days: mg })
      setGaps(r.data)
    } finally {
      setGapsLoading(false)
    }
  }

  const loadAlerts = async () => {
    setAlertsLoading(true)
    try {
      const r = await getBookingAlerts()
      setAlerts(r.data)
    } finally {
      setAlertsLoading(false)
    }
  }

  const handleMaxGapChange = (v) => {
    setMaxGap(v)
    loadGaps(v)
  }

  const handleRecommend = async (e) => {
    e.preventDefault()
    if (!reqForm.check_in || !reqForm.check_out) return
    setRecLoading(true)
    setRecResult(null)
    try {
      const r = await recommendUnit({
        check_in: reqForm.check_in,
        check_out: reqForm.check_out,
        guests: reqForm.guests,
        unit_type: reqForm.unit_type || null,
      })
      setRecResult(r.data)
    } catch (err) {
      setRecResult({ error: err.response?.data?.detail || 'Σφάλμα AI' })
    } finally {
      setRecLoading(false)
    }
  }

  const nights = reqForm.check_in && reqForm.check_out
    ? Math.max(0, Math.round((new Date(reqForm.check_out) - new Date(reqForm.check_in)) / 86400000))
    : 0

  const totalAlerts = (alerts?.past_pending?.length || 0) + (alerts?.unbilled_platform?.length || 0)

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <SparklesIcon className="h-6 w-6 text-purple-600" />
        <h2 className="text-xl font-bold text-gray-800">AI Σύμβουλος</h2>
      </div>

      {/* ── BOOKING ALERTS ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
            <h3 className="font-semibold text-gray-800">Έλεγχοι Κρατήσεων</h3>
            {alerts && totalAlerts > 0 && (
              <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{totalAlerts}</span>
            )}
          </div>
          <button onClick={loadAlerts} className="p-1.5 rounded hover:bg-gray-100">
            <ArrowPathIcon className={`h-4 w-4 text-gray-400 ${alertsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="divide-y divide-gray-50">
          {/* Past pending */}
          <div className="px-5 py-3 bg-amber-50/50">
            <div className="flex items-center gap-2 mb-2">
              <ClockIcon className="h-4 w-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">
                Παλιές Εκκρεμείς Κρατήσεις
                {alerts && <span className="ml-2 font-normal text-amber-600">({alerts.past_pending.length})</span>}
              </p>
            </div>
            {alertsLoading && <p className="text-xs text-gray-400 py-2">Φόρτωση...</p>}
            {!alertsLoading && alerts?.past_pending?.length === 0 && (
              <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircleIcon className="h-4 w-4" /> Καμία εκκρεμής παλιά κράτηση</p>
            )}
            {!alertsLoading && alerts?.past_pending?.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-1.5 text-sm">
                <div>
                  <span className="font-medium text-gray-800">#{b.id} {b.customer_name}</span>
                  <span className="text-gray-500 ml-2">{b.unit_name}</span>
                  <span className="text-xs text-gray-400 ml-2">{new Date(b.check_in + 'T00:00:00').toLocaleDateString('el-GR')} – {new Date(b.check_out + 'T00:00:00').toLocaleDateString('el-GR')}</span>
                </div>
                <button
                  onClick={() => navigate(`/bookings?edit=${b.id}`)}
                  className="text-xs text-blue-600 hover:underline ml-3 flex-shrink-0"
                >
                  Επεξεργασία →
                </button>
              </div>
            ))}
          </div>

          {/* Unbilled platform */}
          <div className="px-5 py-3 bg-orange-50/50">
            <div className="flex items-center gap-2 mb-2">
              <CreditCardIcon className="h-4 w-4 text-orange-600" />
              <p className="text-sm font-semibold text-orange-800">
                Αχρέωτες Κρατήσεις (Booking/Airbnb)
                {alerts && <span className="ml-2 font-normal text-orange-600">({alerts.unbilled_platform.length})</span>}
              </p>
            </div>
            {alertsLoading && <p className="text-xs text-gray-400 py-2">Φόρτωση...</p>}
            {!alertsLoading && alerts?.unbilled_platform?.length === 0 && (
              <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircleIcon className="h-4 w-4" /> Όλες τιμολογήθηκαν</p>
            )}
            {!alertsLoading && alerts?.unbilled_platform?.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-1.5 text-sm">
                <div>
                  <span className="font-medium text-gray-800">#{b.id} {b.customer_name}</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded ml-2">{CHANNEL_LABELS[b.channel] || b.channel}</span>
                  <span className="text-gray-500 ml-2">{b.unit_name}</span>
                  <span className="text-xs text-gray-400 ml-2">{new Date(b.check_in + 'T00:00:00').toLocaleDateString('el-GR')} – {new Date(b.check_out + 'T00:00:00').toLocaleDateString('el-GR')}</span>
                  <span className="text-xs font-medium text-gray-600 ml-2">€{b.total_price}</span>
                </div>
                <button
                  onClick={() => navigate(`/bookings?edit=${b.id}`)}
                  className="text-xs text-blue-600 hover:underline ml-3 flex-shrink-0"
                >
                  Τιμολόγηση →
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RECOMMENDATION TOOL ─────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-r from-purple-50 to-blue-50 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-purple-600" />
            Βέλτιστη Τοποθέτηση Νέας Κράτησης
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Η AI αναλύει τις υπάρχουσες κρατήσεις και βρίσκει την ιδανική μονάδα ώστε να ελαχιστοποιηθούν τα ακάλυπτα κενά.
          </p>
        </div>

        <form onSubmit={handleRecommend} className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Άφιξη *</label>
              <input className="input" type="date" required value={reqForm.check_in}
                onChange={(e) => setReqForm((f) => ({ ...f, check_in: e.target.value }))} />
            </div>
            <div>
              <label className="label">Αναχώρηση *</label>
              <input className="input" type="date" required value={reqForm.check_out}
                onChange={(e) => setReqForm((f) => ({ ...f, check_out: e.target.value }))} />
            </div>
            <div>
              <label className="label">Άτομα</label>
              <input className="input" type="number" min={1} max={20} value={reqForm.guests}
                onChange={(e) => setReqForm((f) => ({ ...f, guests: +e.target.value }))} />
            </div>
            <div>
              <label className="label">Τύπος Μονάδας</label>
              <select className="input" value={reqForm.unit_type}
                onChange={(e) => setReqForm((f) => ({ ...f, unit_type: e.target.value }))}>
                {UNIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {nights > 0 && (
            <p className="text-sm text-gray-500">Διάρκεια: <strong>{nights} νύχτες</strong></p>
          )}

          <button type="submit" disabled={recLoading} className="btn-primary flex items-center gap-2">
            {recLoading ? (
              <><ArrowPathIcon className="h-4 w-4 animate-spin" /> Ανάλυση AI...</>
            ) : (
              <><SparklesIcon className="h-4 w-4" /> Εύρεση Βέλτιστης Μονάδας</>
            )}
          </button>
        </form>

        {recResult && (
          <div className="px-5 pb-5">
            {recResult.error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-2">
                <XCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{recResult.error}</p>
              </div>
            ) : !recResult.available ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-2">
                <XCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{recResult.message}</p>
              </div>
            ) : (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="h-6 w-6 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-purple-900 text-lg">{recResult.recommendation?.recommended_unit_name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                        Σκορ: {recResult.recommendation?.score}/100
                      </span>
                      <span className="text-xs text-purple-600">{recResult.available_units_count} διαθέσιμες μονάδες</span>
                    </div>
                    <p className="text-sm text-purple-800 mt-2">{recResult.recommendation?.reasoning}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-purple-100">
                    <p className="text-xs text-gray-500">Κενά που δημιουργούνται</p>
                    <p className={`text-xl font-bold ${recResult.recommendation?.gaps_created > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                      {recResult.recommendation?.gaps_created}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-purple-100">
                    <p className="text-xs text-gray-500">Κενά που κλείνουν</p>
                    <p className={`text-xl font-bold ${recResult.recommendation?.gaps_closed > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {recResult.recommendation?.gaps_closed}
                    </p>
                  </div>
                </div>
                {recResult.recommendation?.warnings?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-amber-800 mb-1">Προειδοποιήσεις:</p>
                    {recResult.recommendation.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-700">⚠️ {w}</p>
                    ))}
                  </div>
                )}
                {recResult.recommendation?.alternatives?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">Εναλλακτικές μονάδες:</p>
                    <div className="space-y-1.5">
                      {recResult.recommendation.alternatives.map((a, i) => (
                        <div key={i} className="bg-white rounded-lg p-2.5 border border-purple-100 text-xs">
                          <span className="font-medium text-gray-700">{a.unit_name}</span>
                          <span className="text-gray-500 ml-2">— {a.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── GAP ALERTS ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold text-gray-800">Ειδοποιήσεις Μικρών Κενών</h3>
            {gaps && (
              <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {gaps.alerts_count}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Μέχρι</label>
            <select className="input text-xs py-1 w-16" value={maxGap} onChange={(e) => handleMaxGapChange(+e.target.value)}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="text-xs text-gray-500">μέρες</label>
            <button onClick={() => loadGaps()} className="p-1.5 rounded hover:bg-gray-100">
              <ArrowPathIcon className={`h-4 w-4 text-gray-400 ${gapsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="p-2">
          {gapsLoading && <p className="text-center py-8 text-gray-400 text-sm">Φόρτωση...</p>}
          {!gapsLoading && gaps?.alerts?.length === 0 && (
            <div className="flex items-center gap-3 px-4 py-8 justify-center text-gray-400">
              <CheckCircleIcon className="h-6 w-6 text-green-400" />
              <p className="text-sm">Δεν υπάρχουν μικρά κενά! Εξαιρετική οργάνωση κρατήσεων.</p>
            </div>
          )}
          {!gapsLoading && gaps?.alerts?.map((g, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-amber-50/50 rounded-lg transition-colors">
              <GapBadge days={g.gap_days} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-800 text-sm">{g.unit_name}</p>
                  <span className="text-xs text-gray-500">
                    {new Date(g.gap_start + 'T00:00:00').toLocaleDateString('el-GR')} –{' '}
                    {new Date(g.gap_end + 'T00:00:00').toLocaleDateString('el-GR')}
                  </span>
                </div>
                <p className="text-sm text-amber-700 mt-0.5 leading-relaxed">{g.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Πώς λειτουργεί ο AI Σύμβουλος</h3>
        <div className="grid md:grid-cols-2 gap-3 text-sm text-gray-600">
          <div className="flex gap-2">
            <span className="text-purple-500 font-bold">1.</span>
            <p><strong>Βέλτιστη Τοποθέτηση:</strong> Κατά την εισαγωγή νέας κράτησης, η AI εξετάζει όλες τις μονάδες και επιλέγει εκείνη που δημιουργεί τα λιγότερα ακάλυπτα κενά ή καλύπτει ήδη υπάρχοντα.</p>
          </div>
          <div className="flex gap-2">
            <span className="text-amber-500 font-bold">2.</span>
            <p><strong>Ειδοποιήσεις Κενών:</strong> Σαρώνει αυτόματα τις κρατήσεις και εντοπίζει κενά 1-3 ημερών μεταξύ κρατήσεων, με σύσταση αλλαγής ελάχιστης διαμονής στις πλατφόρμες.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
