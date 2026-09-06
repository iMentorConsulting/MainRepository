import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  CodeBracketIcon, ArrowPathIcon, ClipboardDocumentIcon, CheckIcon,
  ChevronDownIcon, ChevronUpIcon,
} from '@heroicons/react/24/outline'
import api from '../api'

const getWidgetUnits = () => api.get('/widget/units')
const generateWidgetToken = (id) => api.post(`/widget/generate-token/${id}`)
const regenerateWidgetToken = (id) => api.post(`/widget/regenerate-token/${id}`)
const getWidgetInquiries = () => api.get('/widget/inquiries')
const updateInquiryStatus = (id, status) => api.patch(`/widget/inquiries/${id}`, { status })

const BASE_URL = window.location.origin

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
      className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
      {copied
        ? <CheckIcon className="h-4 w-4 text-green-500" />
        : <ClipboardDocumentIcon className="h-4 w-4" />}
    </button>
  )
}

const STATUS_COLORS = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  declined:  'bg-red-100 text-red-600',
}
const STATUS_LABELS = { pending: 'Εκκρεμεί', confirmed: 'Επιβεβαιωμένο', declined: 'Απορρίφθηκε' }

function InquiryRow({ inq, onStatusChange }) {
  const [open, setOpen] = useState(false)
  const nights = Math.round(
    (new Date(inq.check_out+'T00:00') - new Date(inq.check_in+'T00:00')) / 86400000
  )

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
        onClick={() => setOpen(o => !o)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800 text-sm">{inq.guest_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[inq.status] || 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABELS[inq.status] || inq.status}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {inq.unit_name} · {new Date(inq.check_in+'T00:00').toLocaleDateString('el-GR')} → {new Date(inq.check_out+'T00:00').toLocaleDateString('el-GR')} ({nights} νύχτες) · {inq.guests} άτομα
          </div>
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:block">
          {inq.created_at ? new Date(inq.created_at).toLocaleDateString('el-GR') : ''}
        </span>
        {open ? <ChevronUpIcon className="h-4 w-4 text-gray-400 flex-shrink-0" /> : <ChevronDownIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />}
      </div>

      {open && (
        <div className="px-4 pb-4 bg-gray-50 border-t border-gray-100 space-y-3">
          <div className="grid grid-cols-2 gap-3 pt-3 text-sm">
            <div><span className="text-gray-400 text-xs">Email</span><p className="font-medium text-gray-700">{inq.guest_email}</p></div>
            <div><span className="text-gray-400 text-xs">Τηλέφωνο</span><p className="font-medium text-gray-700">{inq.guest_phone || '—'}</p></div>
          </div>
          {inq.message && (
            <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
              {inq.message}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            {inq.status !== 'confirmed' && (
              <button
                className="flex-1 py-1.5 rounded-lg bg-green-500 text-white text-xs font-semibold hover:bg-green-600"
                onClick={() => onStatusChange(inq.id, 'confirmed')}
              >
                ✓ Επιβεβαίωση
              </button>
            )}
            {inq.status !== 'declined' && (
              <button
                className="flex-1 py-1.5 rounded-lg bg-red-100 text-red-600 text-xs font-semibold hover:bg-red-200"
                onClick={() => onStatusChange(inq.id, 'declined')}
              >
                ✕ Απόρριψη
              </button>
            )}
            {inq.status !== 'pending' && (
              <button
                className="flex-1 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200"
                onClick={() => onStatusChange(inq.id, 'pending')}
              >
                ↺ Εκκρεμεί
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function UnitWidgetCard({ unit, onTokenGenerated }) {
  const [loading, setLoading] = useState(false)
  const widgetUrl = unit.widget_token ? `${BASE_URL}/widget/${unit.widget_token}` : null
  const bookingUrl = unit.widget_token ? `${BASE_URL}/book/${unit.widget_token}` : null
  const iframeCode = widgetUrl
    ? `<iframe src="${widgetUrl}" width="100%" height="700" frameborder="0" style="border-radius:16px;overflow:hidden;" allow="clipboard-write"></iframe>`
    : null

  const generate = async () => {
    setLoading(true)
    try {
      const r = await generateWidgetToken(unit.id)
      onTokenGenerated(unit.id, r.data.widget_token)
      toast.success('Widget URL δημιουργήθηκε')
    } catch { toast.error('Σφάλμα') } finally { setLoading(false) }
  }

  const regenerate = async () => {
    if (!confirm('Το παλιό embed link θα σταματήσει να λειτουργεί. Συνεχίζετε;')) return
    setLoading(true)
    try {
      const r = await regenerateWidgetToken(unit.id)
      onTokenGenerated(unit.id, r.data.widget_token)
      toast.success('Νέο Widget URL δημιουργήθηκε')
    } catch { toast.error('Σφάλμα') } finally { setLoading(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">{unit.name}</h3>
          <p className="text-xs text-gray-400">{unit.type} · {unit.capacity} άτομα</p>
        </div>
        {!widgetUrl ? (
          <button onClick={generate} disabled={loading}
            className="flex items-center gap-1.5 bg-[#1e3a5f] text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-[#162d4a] disabled:opacity-50">
            <CodeBracketIcon className="h-3.5 w-3.5" />
            {loading ? 'Δημιουργία...' : 'Δημιουργία Widget'}
          </button>
        ) : (
          <button onClick={regenerate} disabled={loading}
            className="flex items-center gap-1.5 text-gray-400 text-xs px-3 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50">
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Ανανέωση
          </button>
        )}
      </div>

      {widgetUrl && (
        <>
          {/* Widget URL */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Σύνδεσμος Widget</label>
            <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              <a href={widgetUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-green-700 font-mono truncate flex-1 hover:underline">
                {widgetUrl}
              </a>
              <CopyButton value={widgetUrl} />
            </div>
          </div>

          {/* Embed code */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Embed Κώδικας (HTML iframe)</label>
            <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <code className="text-xs text-gray-600 font-mono flex-1 break-all leading-relaxed">
                {iframeCode}
              </code>
              <CopyButton value={iframeCode} />
            </div>
            <p className="text-xs text-gray-400">
              Επικολλήστε αυτόν τον κώδικα στη σελίδα του ακινήτου στο WordPress, Wix, κ.ά.
            </p>
          </div>

          {/* Direct Booking Page */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">🏠 Direct Booking Page (standalone)</label>
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <a href={bookingUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-700 font-mono truncate flex-1 hover:underline">
                {bookingUrl}
              </a>
              <CopyButton value={bookingUrl} />
            </div>
            <p className="text-xs text-gray-400">Μοιραστείτε αυτόν τον σύνδεσμο σε Instagram bio, WhatsApp, email, κ.ά.</p>
          </div>

          {/* Preview links */}
          <div className="flex gap-4 flex-wrap">
            <a href={widgetUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#1e3a5f] font-semibold hover:underline">
              👁️ Προεπισκόπηση Widget →
            </a>
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:underline">
              🏠 Booking Page →
            </a>
          </div>
        </>
      )}
    </div>
  )
}

export default function WidgetAdmin() {
  const [units, setUnits] = useState([])
  const [inquiries, setInquiries] = useState([])
  const [tab, setTab] = useState('embed')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getWidgetUnits().then(r => setUnits(r.data)),
      getWidgetInquiries().then(r => setInquiries(r.data)),
    ]).finally(() => setLoading(false))
  }, [])

  const handleTokenGenerated = (unitId, token) => {
    setUnits(us => us.map(u => u.id === unitId ? { ...u, widget_token: token } : u))
  }

  const handleStatusChange = async (id, status) => {
    try {
      await updateInquiryStatus(id, status)
      setInquiries(qs => qs.map(q => q.id === id ? { ...q, status } : q))
    } catch { toast.error('Σφάλμα') }
  }

  const pendingCount = inquiries.filter(q => q.status === 'pending').length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-[#1e3a5f] rounded-xl flex items-center justify-center">
              <CodeBracketIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Availability Widget</h1>
              <p className="text-xs text-gray-500">Embeddable booking widget για το website σας</p>
            </div>
          </div>

          <div className="flex gap-1">
            {[
              { id: 'embed', label: 'Embed Κώδικας' },
              { id: 'inquiries', label: `Αιτήματα${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id ? 'bg-[#1e3a5f] text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full" />
          </div>
        ) : tab === 'embed' ? (
          <>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
              <strong>Πώς λειτουργεί:</strong> Κάθε ακίνητο παίρνει έναν μοναδικό σύνδεσμο widget.
              Οι επισκέπτες βλέπουν το ημερολόγιο διαθεσιμότητας σε πραγματικό χρόνο και υποβάλλουν αίτημα κράτησης.
              Θα λαμβάνετε email για κάθε νέο αίτημα.
            </div>
            {units.map(u => (
              <UnitWidgetCard key={u.id} unit={u} onTokenGenerated={handleTokenGenerated} />
            ))}
          </>
        ) : (
          <>
            {inquiries.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-gray-500 text-sm">Δεν υπάρχουν αιτήματα ακόμα</p>
              </div>
            ) : (
              <div className="space-y-2">
                {inquiries.map(inq => (
                  <InquiryRow key={inq.id} inq={inq} onStatusChange={handleStatusChange} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
