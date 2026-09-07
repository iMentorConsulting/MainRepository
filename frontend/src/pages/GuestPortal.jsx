import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  HomeIcon, BookOpenIcon, MapPinIcon, BellIcon,
  ChatBubbleLeftRightIcon, ExclamationTriangleIcon,
  PaperAirplaneIcon, CameraIcon, XMarkIcon,
  ChevronDownIcon, ChevronUpIcon, PhoneIcon, GlobeAltIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { TRANSLATIONS, LANGS, nationalityToLang } from '../i18n'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s, lang) {
  if (!s) return '—'
  const locale = { en: 'en-GB', el: 'el-GR', de: 'de-DE', fr: 'fr-FR' }[lang] || 'en-GB'
  return new Date(s).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
}

function nightsBetween(a, b) {
  if (!a || !b) return 0
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}

const GUIDE_ICONS = {
  checkin: '🔑', wifi: '📶', rules: '📋', equipment: '🏠',
  parking: '🚗', local_info: '🗺️', emergency: '🚨', checkout: '👋', general: 'ℹ️',
}

const LOCAL_CAT_KEYS = ['restaurant', 'beach', 'attraction', 'activity', 'shopping', 'nightlife']
const LOCAL_ICONS = { restaurant: '🍽️', beach: '🏖️', attraction: '🎭', activity: '🏄', shopping: '🛍️', nightlife: '🎵' }

const STATUS_BADGE = {
  received: 'bg-gray-100 text-gray-600',
  assigned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
}

const QUICK_EMOJIS = ['🚕', '👨‍⚕️', '🏨', '🔧', '✂️', '🧹']

// ── Language picker ───────────────────────────────────────────────────────────

function LangPicker({ lang, setLang }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white text-xs font-medium px-2 py-1 rounded-lg transition-colors"
      >
        <span>{LANGS[lang]?.flag}</span>
        <span>{lang.toUpperCase()}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-8 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden min-w-[130px]">
          {Object.entries(LANGS).map(([code, { label, flag }]) => (
            <button
              key={code}
              onClick={() => { setLang(code); localStorage.setItem('guest_lang', code); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${lang === code ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-700'}`}
            >
              <span>{flag}</span><span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="animate-spin w-10 h-10 border-4 border-[#1e3a5f] border-t-transparent rounded-full" />
    </div>
  )
}

// ── Verify Screen ─────────────────────────────────────────────────────────────

function VerifyScreen({ token, onVerified, lang, setLang }) {
  const [contact, setContact] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const tr = TRANSLATIONS[lang]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!contact.trim()) return
    setLoading(true)
    setError('')
    try {
      await axios.post(`/api/guest/${token}/verify`, { contact: contact.trim() })
      onVerified()
    } catch (err) {
      setError(err.response?.data?.detail || tr.verify_error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] to-[#2d5491] flex flex-col items-center justify-center p-6">
      <div className="absolute top-4 right-4">
        <LangPicker lang={lang} setLang={setLang} />
      </div>
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/logo-istay-blue.png" alt="iStay" className="h-10 w-auto object-contain mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900">{tr.verify_title}</h1>
          <p className="text-sm text-gray-500 mt-2">{tr.verify_sub}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="guest-contact" className="block text-sm font-medium text-gray-700 mb-1">
              {tr.verify_placeholder}
            </label>
            <input
              id="guest-contact"
              type="text"
              value={contact}
              onChange={e => setContact(e.target.value)}
              placeholder={tr.verify_placeholder}
              autoFocus
              autoComplete="email tel"
              aria-describedby={error ? 'verify-error' : undefined}
              aria-invalid={!!error}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
            />
          </div>
          {error && (
            <div
              id="verify-error"
              role="alert"
              aria-live="assertive"
              className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !contact.trim()}
            aria-busy={loading}
            className="w-full bg-[#1e3a5f] text-white py-3 rounded-xl font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1e3a5f]"
          >
            {loading ? tr.verifying : tr.verify_btn}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Home Tab ──────────────────────────────────────────────────────────────────

function HomeTab({ info, token, lang }) {
  const [cleaning, setCleaning] = useState(null)
  const [skipLoading, setSkipLoading] = useState(false)
  const tr = TRANSLATIONS[lang]
  const portalURL = window.location.href
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(portalURL)}`

  useEffect(() => {
    axios.get(`/api/guest/${token}/cleaning`).then(r => setCleaning(r.data)).catch(() => {})
  }, [token])

  const handleSkip = async () => {
    setSkipLoading(true)
    try {
      await axios.post(`/api/guest/${token}/cleaning/skip`)
      toast.success(tr.skip_success)
      setCleaning(prev => prev ? { ...prev, can_skip: false, skipped: true } : prev)
    } catch {
      toast.error(tr.skip_error)
    } finally {
      setSkipLoading(false)
    }
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Welcome card */}
      <div className="bg-gradient-to-br from-[#1e3a5f] to-[#2d5491] rounded-2xl p-5 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            {info.guest_first_name
              ? <p className="text-blue-200 text-sm font-medium">{tr.welcome_to}, <span className="text-white font-semibold">{info.guest_first_name}</span> 👋</p>
              : <p className="text-blue-200 text-sm font-medium">{tr.welcome_to}</p>
            }
            <h2 className="text-xl font-bold mt-0.5">{info.property_name || 'Your Property'}</h2>
            {info.unit_name && <p className="text-blue-200 text-sm mt-0.5">{info.unit_name}</p>}
          </div>
          <img src="/logo-istay.png" alt="iStay" className="h-9 w-auto object-contain flex-shrink-0" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-white/15 rounded-xl p-3">
            <p className="text-blue-200 text-xs font-medium">{tr.checkin}</p>
            <p className="text-white font-semibold text-sm mt-0.5">{fmtDate(info.check_in, lang)}</p>
            {info.checkin_time && <p className="text-blue-200 text-xs mt-0.5">{tr.from} {info.checkin_time}</p>}
          </div>
          <div className="bg-white/15 rounded-xl p-3">
            <p className="text-blue-200 text-xs font-medium">{tr.checkout}</p>
            <p className="text-white font-semibold text-sm mt-0.5">{fmtDate(info.check_out, lang)}</p>
            {info.checkout_time && <p className="text-blue-200 text-xs mt-0.5">{tr.by} {info.checkout_time}</p>}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-blue-100">
            <span>🌙</span>
            <span><span className="font-bold text-white">{nightsBetween(info.check_in, info.check_out)}</span> {tr.nights}</span>
          </div>
          {info.guests && (
            <div className="flex items-center gap-1.5 text-blue-100">
              <span>👤</span>
              <span><span className="font-bold text-white">{info.guests}</span> {tr.guests_label}</span>
            </div>
          )}
        </div>
      </div>

      {/* Welcome message */}
      {info.welcome_message && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">{tr.host_message}</h3>
          <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{info.welcome_message}</p>
        </div>
      )}

      {/* Cleaning card */}
      {cleaning && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🧹</span>
            <h3 className="text-sm font-semibold text-gray-700">{tr.cleaning_title}</h3>
          </div>
          {cleaning.next_cleaning ? (
            <div>
              <p className="text-sm text-gray-600">
                {tr.next_cleaning}: <span className="font-semibold text-gray-900">{fmtDate(cleaning.next_cleaning.date, lang)}</span>
              </p>
              {cleaning.skipped && (
                <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-500">{tr.cleaning_skipped}</div>
              )}
              {cleaning.can_skip && !cleaning.skipped && (
                <button
                  onClick={handleSkip}
                  disabled={skipLoading}
                  className="mt-3 w-full border border-gray-200 text-gray-700 text-sm py-2.5 rounded-xl font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  {skipLoading ? tr.skipping : `🌿 ${tr.skip_cleaning}`}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">{tr.no_cleaning}</p>
          )}
        </div>
      )}

      {/* QR code */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{tr.qr_title}</h3>
        <div className="flex items-center gap-4">
          <img src={qrSrc} alt="QR" className="w-20 h-20 rounded-xl border border-gray-100" />
          <p className="text-xs text-gray-500 leading-relaxed">{tr.qr_sub}</p>
        </div>
      </div>
    </div>
  )
}

// ── Guide Tab ─────────────────────────────────────────────────────────────────

function GuideTab({ token, lang }) {
  const [guide, setGuide] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const tr = TRANSLATIONS[lang]

  useEffect(() => {
    axios.get(`/api/guest/${token}/guide`)
      .then(r => setGuide(r.data || {}))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  const toggleCat = (cat) => setCollapsed(p => ({ ...p, [cat]: !p[cat] }))

  const filteredGuide = Object.entries(guide).reduce((acc, [cat, items]) => {
    if (!search.trim()) { acc[cat] = items; return acc }
    const q = search.toLowerCase()
    const f = items.filter(i => i.title?.toLowerCase().includes(q) || i.content?.toLowerCase().includes(q))
    if (f.length) acc[cat] = f
    return acc
  }, {})

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full" /></div>

  return (
    <div className="space-y-4 pb-4">
      <div className="relative">
        <MagnifyingGlassIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={tr.search_guide}
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] shadow-sm"
        />
      </div>
      {Object.keys(filteredGuide).length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">{tr.no_results}</div>
      )}
      {Object.entries(filteredGuide).map(([cat, items]) => (
        <div key={cat} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button onClick={() => toggleCat(cat)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-xl">{GUIDE_ICONS[cat] || 'ℹ️'}</span>
              <span className="font-semibold text-gray-800">
                {tr.guide_labels?.[cat] || cat.replace(/_/g, ' ')}
              </span>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{items.length}</span>
            </div>
            {collapsed[cat] ? <ChevronDownIcon className="w-4 h-4 text-gray-400" /> : <ChevronUpIcon className="w-4 h-4 text-gray-400" />}
          </button>
          {!collapsed[cat] && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {items.map((item, idx) => (
                <div key={idx} className="px-5 py-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-1">{item.title}</h4>
                  <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{item.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Local Tab ─────────────────────────────────────────────────────────────────

function LocalTab({ token, lang }) {
  const [recs, setRecs] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeCat, setActiveCat] = useState(null)
  const tr = TRANSLATIONS[lang]

  useEffect(() => {
    axios.get(`/api/guest/${token}/recommendations`)
      .then(r => {
        setRecs(r.data || {})
        const keys = Object.keys(r.data || {})
        if (keys.length) setActiveCat(keys[0])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full" /></div>

  const categories = Object.keys(recs)
  const items = recs[activeCat] || []

  return (
    <div className="space-y-4 pb-4">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeCat === cat ? 'bg-[#1e3a5f] text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            <span>{LOCAL_ICONS[cat] || '📍'}</span>
            <span>{tr.local_cats?.[cat] || cat}</span>
          </button>
        ))}
      </div>
      {items.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">{tr.no_local}</div>}
      {items.map((item, idx) => (
        <div key={idx} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900">{item.name}</h3>
          {item.description && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{item.description}</p>}
          <div className="mt-3 space-y-1.5">
            {item.address && (
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <MapPinIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <span>{item.address}</span>
              </div>
            )}
            {item.phone && (
              <a href={`tel:${item.phone}`} className="flex items-center gap-2 text-sm text-blue-600">
                <PhoneIcon className="w-4 h-4 flex-shrink-0" /><span>{item.phone}</span>
              </a>
            )}
            {item.website && (
              <a href={item.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600">
                <GlobeAltIcon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{item.website.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
          </div>
          {item.maps_url && (
            <a href={item.maps_url} target="_blank" rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 w-full bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium py-2.5 rounded-xl">
              <span>📍</span> {tr.maps_btn}
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Services Tab ──────────────────────────────────────────────────────────────

function RequestModal({ title, onClose, onSubmit, tr }) {
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit(desc)
      onClose()
    } catch {
      toast.error(tr.request_error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <textarea
            value={desc} onChange={e => setDesc(e.target.value)}
            placeholder={tr.request_placeholder} rows={3} autoFocus
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] resize-none"
          />
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 py-3 rounded-xl font-medium">{tr.cancel}</button>
            <button type="submit" disabled={loading} className="flex-1 bg-[#1e3a5f] text-white py-3 rounded-xl font-semibold disabled:opacity-50">
              {loading ? tr.sending : tr.send_request}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ReportIssueModal({ token, lang, onClose }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('other')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const tr = TRANSLATIONS[lang]

  const CATS = [
    { value: 'other', label: tr.issue_cat_other || 'General' },
    { value: 'electrical', label: tr.issue_cat_electrical || 'Electrical' },
    { value: 'plumbing', label: tr.issue_cat_plumbing || 'Plumbing' },
    { value: 'appliances', label: tr.issue_cat_appliances || 'Appliances' },
    { value: 'heating_cooling', label: tr.issue_cat_hvac || 'Heating / A/C' },
    { value: 'furniture', label: tr.issue_cat_furniture || 'Furniture' },
    { value: 'cleaning', label: tr.issue_cat_cleaning || 'Cleanliness' },
  ]

  const submit = async () => {
    if (!title.trim()) return
    setLoading(true)
    try {
      await axios.post(`/api/guest/${token}/report-issue`, { title: title.trim(), description: description.trim(), category })
      setDone(true)
    } catch {
      toast.error(tr.error_generic || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-lg">🔧 {tr.report_issue || 'Report a Problem'}</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><XMarkIcon className="h-5 w-5" /></button>
        </div>
        {done ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-4xl">✅</p>
            <p className="font-semibold text-gray-800">{tr.issue_reported || 'Issue reported!'}</p>
            <p className="text-sm text-gray-500">{tr.issue_reported_desc || 'Our team has been notified and will look into it.'}</p>
            <button onClick={onClose} className="mt-4 bg-[#1e3a5f] text-white px-6 py-2.5 rounded-xl font-semibold text-sm">
              {tr.close || 'Close'}
            </button>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{tr.issue_category || 'Category'}</label>
              <div className="grid grid-cols-2 gap-2">
                {CATS.map(c => (
                  <button key={c.value} onClick={() => setCategory(c.value)}
                    className={`text-sm py-2 px-3 rounded-xl border font-medium transition-colors ${category === c.value ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'border-gray-200 text-gray-700 hover:border-gray-400'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{tr.issue_title || 'Brief description *'}</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder={tr.issue_title_placeholder || 'e.g. AC not working, broken faucet…'}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{tr.issue_details || 'Details (optional)'}</label>
              <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
                placeholder={tr.issue_details_placeholder || 'Any additional information…'}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 resize-none" />
            </div>
            <button onClick={submit} disabled={loading || !title.trim()}
              className="w-full bg-[#1e3a5f] text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50">
              {loading ? '…' : (tr.submit_issue || 'Submit Report')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ServicesTab({ token, lang }) {
  const [marketplace, setMarketplace] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [showReportIssue, setShowReportIssue] = useState(false)
  const tr = TRANSLATIONS[lang]

  const loadData = useCallback(() => {
    Promise.all([
      axios.get(`/api/guest/${token}/marketplace`),
      axios.get(`/api/guest/${token}/requests`),
    ]).then(([m, r]) => {
      setMarketplace(m.data || [])
      setRequests(r.data || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [token])

  useEffect(() => { loadData() }, [loadData])

  const submitRequest = async (serviceType, itemId, description) => {
    await axios.post(`/api/guest/${token}/requests`, { marketplace_item_id: itemId, service_type: serviceType, description })
    toast.success(tr.request_success)
    loadData()
  }

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full" /></div>

  const quickLabels = tr.quick_labels || ['Taxi', 'Doctor', 'Extra Towels', 'Maintenance', 'Hairdresser', 'Extra Cleaning']

  return (
    <div className="space-y-6 pb-4">
      {/* Quick Requests */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{tr.quick_requests}</h2>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_EMOJIS.map((emoji, i) => (
            <button
              key={i}
              onClick={() => setModal({ type: 'quick', emoji, label: quickLabels[i] })}
              className="bg-white border border-gray-200 rounded-2xl p-3 flex flex-col items-center gap-1.5 hover:border-blue-300 hover:bg-blue-50 shadow-sm"
            >
              <span className="text-2xl">{emoji}</span>
              <span className="text-xs font-medium text-gray-700 text-center leading-tight">{quickLabels[i]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Marketplace */}
      {marketplace.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{tr.available_services}</h2>
          <div className="grid grid-cols-1 gap-3">
            {marketplace.filter(s => s.is_available !== false).map(item => (
              <div key={item.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm">{item.title}</h3>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.price > 0 ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {item.price > 0 ? `€${item.price}` : tr.free}
                    </span>
                  </div>
                  {item.description && <p className="text-xs text-gray-500 mt-1">{item.description}</p>}
                </div>
                <button onClick={() => setModal({ type: 'marketplace', item })}
                  className="flex-shrink-0 bg-[#1e3a5f] text-white text-xs font-semibold px-3 py-2 rounded-xl">
                  {tr.request_btn}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Requests */}
      {requests.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{tr.my_requests}</h2>
          <div className="space-y-2">
            {requests.map(req => (
              <div key={req.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{req.service_type}</p>
                    {req.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{req.description}</p>}
                    {req.notes && <p className="text-xs text-blue-600 mt-0.5">{req.notes}</p>}
                  </div>
                  <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[req.status] || STATUS_BADGE.received}`}>
                    {tr.status?.[req.status] || req.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report a Problem */}
      <div>
        <button
          onClick={() => setShowReportIssue(true)}
          className="w-full flex items-center justify-between bg-red-50 border border-red-100 rounded-2xl p-4 shadow-sm hover:bg-red-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔧</span>
            <div className="text-left">
              <p className="font-semibold text-gray-900 text-sm">{tr.report_issue || 'Report a Problem'}</p>
              <p className="text-xs text-gray-500">{tr.report_issue_desc || 'Something broken? Let us know.'}</p>
            </div>
          </div>
          <span className="text-red-400 text-lg">→</span>
        </button>
      </div>

      {modal && (
        <RequestModal
          title={modal.type === 'marketplace' ? `${tr.request_btn}: ${modal.item.title}` : `${modal.emoji} ${modal.label}`}
          onClose={() => setModal(null)}
          tr={tr}
          onSubmit={(desc) => modal.type === 'marketplace'
            ? submitRequest(modal.item.title, modal.item.id, desc)
            : submitRequest(modal.label, null, desc)
          }
        />
      )}
      {showReportIssue && <ReportIssueModal token={token} lang={lang} onClose={() => setShowReportIssue(false)} />}
    </div>
  )
}

// ── Chat Tab ──────────────────────────────────────────────────────────────────

function ChatTab({ token, lang }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const fileRef = useRef(null)
  const pollRef = useRef(null)
  const tr = TRANSLATIONS[lang]

  const loadMessages = useCallback(async () => {
    try {
      const r = await axios.get(`/api/guest/${token}/messages`)
      setMessages(r.data || [])
    } catch {}
  }, [token])

  useEffect(() => {
    loadMessages()
    pollRef.current = setInterval(loadMessages, 20000)
    return () => clearInterval(pollRef.current)
  }, [loadMessages])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = async () => {
    if (!text.trim()) return
    setSending(true)
    try {
      await axios.post(`/api/guest/${token}/messages`, { message: text.trim(), message_type: 'chat', lang })
      setText('')
      await loadMessages()
    } catch { toast.error(tr.send_error) }
    finally { setSending(false) }
  }

  const handlePhoto = async (file) => {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('description', file.name)
    try {
      await axios.post(`/api/guest/${token}/messages/photo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success(tr.photo_success)
      await loadMessages()
    } catch { toast.error(tr.photo_error) }
  }

  const senderName = (msg) => {
    if (msg.sender === 'guest') return tr.you
    if (msg.sender === 'ai') return tr.ai
    return tr.property
  }
  const isGuest = (msg) => msg.sender === 'guest'

  return (
    <div className="flex flex-col flex-1 pt-4 min-h-0">
      <div className="flex-1 overflow-y-auto space-y-3 pb-2 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">{tr.no_messages}</div>
        )}
        {messages.map((msg, idx) => {
          const guest = isGuest(msg)
          return (
            <div key={msg.id || idx} className={`flex flex-col ${guest ? 'items-end' : 'items-start'}`}>
              <span className="text-xs text-gray-400 mb-1 px-1">{senderName(msg)}</span>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${guest ? 'bg-[#1e3a5f] text-white rounded-br-sm' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'}`}>
                {msg.photo_path && <img src={msg.photo_path} alt="" className="rounded-xl mb-2 max-w-full" />}
                <p className="text-sm whitespace-pre-line leading-relaxed">{msg.message}</p>
                <p className={`text-xs mt-1 ${guest ? 'text-blue-200' : 'text-gray-400'}`}>
                  {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <div className="bg-white border-t border-gray-100 pt-3 pb-3">
        <div className="flex items-end gap-2">
          <button onClick={() => fileRef.current?.click()} className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-gray-200">
            <CameraIcon className="w-5 h-5 text-gray-600" />
          </button>
          <input type="file" ref={fileRef} accept="image/*" capture="environment" className="hidden"
            onChange={e => { handlePhoto(e.target.files[0]); e.target.value = '' }} />
          <textarea
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={tr.type_message} rows={1}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] resize-none max-h-32"
          />
          <button onClick={handleSend} disabled={sending || !text.trim()} className="flex-shrink-0 w-10 h-10 bg-[#1e3a5f] rounded-xl flex items-center justify-center disabled:opacity-50">
            <PaperAirplaneIcon className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Emergency Tab ─────────────────────────────────────────────────────────────

function EmergencyTab({ token, lang }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const tr = TRANSLATIONS[lang]

  useEffect(() => {
    axios.get(`/api/guest/${token}/emergency`).then(r => setData(r.data)).catch(() => setData({})).finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full" /></div>

  const contacts = [
    data?.manager_phone && { emoji: '📞', label: tr.em_manager, value: data.manager_phone, color: 'bg-blue-50 border-blue-200 text-blue-900', btn: 'bg-blue-600' },
    { emoji: '🚑', label: tr.em_ambulance, value: data?.ambulance_phone || '166', color: 'bg-red-50 border-red-200 text-red-900', btn: 'bg-red-600' },
    { emoji: '👮', label: tr.em_police, value: data?.police_phone || '100', color: 'bg-blue-50 border-blue-200 text-blue-900', btn: 'bg-blue-600' },
    { emoji: '🚒', label: tr.em_fire, value: data?.fire_phone || '199', color: 'bg-orange-50 border-orange-200 text-orange-900', btn: 'bg-orange-600' },
    data?.hospital_phone && { emoji: '🏥', label: data.hospital_name || tr.em_hospital, value: data.hospital_phone, color: 'bg-purple-50 border-purple-200 text-purple-900', btn: 'bg-purple-600' },
    data?.emergency_contact && { emoji: '📱', label: tr.em_contact, value: data.emergency_contact, color: 'bg-gray-50 border-gray-200 text-gray-900', btn: 'bg-gray-600' },
  ].filter(Boolean)

  return (
    <div className="space-y-3 pb-4">
      <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
        <p className="text-sm font-semibold text-red-800 flex items-center gap-2">
          <ExclamationTriangleIcon className="w-5 h-5" />{tr.emergency_banner}
        </p>
        <p className="text-xs text-red-600 mt-1">{tr.emergency_sub}</p>
      </div>
      {contacts.map((c, idx) => (
        <a key={idx} href={`tel:${c.value.replace(/\s/g, '')}`}
          className={`flex items-center gap-4 border-2 rounded-2xl px-5 py-4 ${c.color} active:scale-95 transition-transform shadow-sm`}>
          <span className="text-3xl flex-shrink-0">{c.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium opacity-70">{c.label}</p>
            <p className="text-xl font-bold tracking-wide">{c.value}</p>
          </div>
          <div className={`w-10 h-10 ${c.btn} rounded-xl flex items-center justify-center flex-shrink-0`}>
            <PhoneIcon className="w-5 h-5 text-white" />
          </div>
        </a>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function GuestPortal() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('home')
  const [lang, setLang] = useState(() => localStorage.getItem('guest_lang') || 'en')

  const loadInfo = useCallback(async () => {
    try {
      const r = await axios.get(`/api/guest/${token}/info`)
      const data = r.data
      setInfo(data)
      // Set language from nationality only if user hasn't manually chosen one
      if (!localStorage.getItem('guest_lang') && data.suggested_language) {
        setLang(data.suggested_language)
      }
    } catch (err) {
      setError(err.response?.status === 404 ? 'not_found' : 'error')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadInfo() }, [loadInfo])

  const tr = TRANSLATIONS[lang]

  const TABS = [
    { id: 'home',      emoji: '🏠', short: 'Home',  label: tr.tab_home,      Icon: HomeIcon },
    { id: 'guide',     emoji: '📖', short: 'Guide', label: tr.tab_guide,     Icon: BookOpenIcon },
    { id: 'local',     emoji: '📍', short: 'Local', label: tr.tab_local,     Icon: MapPinIcon },
    { id: 'services',  emoji: '🛎️', short: 'Serv.', label: tr.tab_services,  Icon: BellIcon },
    { id: 'chat',      emoji: '💬', short: 'Chat',  label: tr.tab_chat,      Icon: ChatBubbleLeftRightIcon },
    { id: 'emergency', emoji: '🚨', short: 'SOS',   label: tr.tab_emergency, Icon: ExclamationTriangleIcon },
  ]

  if (loading) return <Spinner />

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
      <span className="text-5xl mb-4">🏡</span>
      <h2 className="text-xl font-bold text-gray-700 mb-2">{tr.portal_not_found}</h2>
      <p className="text-gray-500 text-sm max-w-sm">{tr.portal_not_found_sub}</p>
    </div>
  )

  if (!info?.is_verified) {
    return <VerifyScreen token={token} onVerified={loadInfo} lang={lang} setLang={setLang} />
  }

  // Flatten info for HomeTab
  const homeInfo = {
    property_name: info.property_name,
    unit_name: info.booking?.unit_name,
    guest_first_name: info.customer_first_name || '',
    check_in: info.booking?.check_in,
    check_out: info.booking?.check_out,
    guests: info.booking?.guests,
    checkin_time: info.settings?.checkin_time,
    checkout_time: info.settings?.checkout_time,
    welcome_message: info.settings?.welcome_message,
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      {/* Top bar */}
      <header className="bg-[#1e3a5f] text-white sticky top-0 z-30 shadow-sm"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3 flex items-center gap-3">
          <img src="/logo-istay.png" alt="iStay" className="h-7 w-auto object-contain flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{info.property_name || 'Guest Portal'}</p>
            {info.booking?.unit_name && <p className="text-blue-200 text-xs truncate">{info.booking.unit_name}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {info.booking?.check_out && (
              <div className="text-right">
                <p className="text-blue-200 text-[10px] leading-none">{tr.checkout_label}</p>
                <p className="text-white text-xs font-semibold mt-0.5">{fmtDate(info.booking.check_out, lang)}</p>
              </div>
            )}
            <LangPicker lang={lang} setLang={setLang} />
          </div>
        </div>
      </header>

      {/* Content */}
      <main
        id="portal-main"
        role="main"
        aria-label="Περιεχόμενο Portal"
        tabIndex="-1"
        className={`flex-1 px-4 ${
          activeTab === 'chat'
            ? 'overflow-hidden flex flex-col'
            : 'overflow-y-auto pt-4 pb-28'
        }`}
      >
        {activeTab === 'home'      && <HomeTab info={homeInfo} token={token} lang={lang} />}
        {activeTab === 'guide'     && <GuideTab token={token} lang={lang} />}
        {activeTab === 'local'     && <LocalTab token={token} lang={lang} />}
        {activeTab === 'services'  && <ServicesTab token={token} lang={lang} />}
        {activeTab === 'chat'      && <ChatTab token={token} lang={lang} />}
        {activeTab === 'emergency' && <EmergencyTab token={token} lang={lang} />}
      </main>

      {/* Bottom nav */}
      <nav
        className="bg-white border-t border-gray-200 sticky bottom-0 z-30"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Πλοήγηση Portal"
      >
        <div className="grid grid-cols-6" role="tablist">
          {TABS.map(tab => {
            const active = activeTab === tab.id
            const isEmergency = tab.id === 'emergency'
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                aria-controls="portal-main"
                aria-label={tab.label}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] transition-colors ${
                  active
                    ? isEmergency ? 'text-red-600' : 'text-[#1e3a5f]'
                    : 'text-gray-400 active:text-gray-600'
                }`}
              >
                {/* Active top indicator */}
                {active && (
                  <span className={`absolute top-0 left-2 right-2 h-[3px] rounded-full ${isEmergency ? 'bg-red-500' : 'bg-[#1e3a5f]'}`} />
                )}
                <span className={`text-xl leading-none ${active && isEmergency ? 'animate-pulse' : ''}`}>
                  {tab.emoji}
                </span>
                <span className={`text-[9px] font-semibold leading-none tracking-tight ${active ? '' : 'opacity-70'}`}>
                  {tab.short}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
