import { useEffect, useState, useRef, useCallback } from 'react'
import api from '../api'
import toast from 'react-hot-toast'
import {
  PlusIcon,
  XMarkIcon,
  TrashIcon,
  PencilSquareIcon,
  Cog6ToothIcon,
  BookOpenIcon,
  MapPinIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  ChatBubbleLeftRightIcon,
  ChartBarIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
}

const STATUS_OPTIONS = [
  { value: 'received',    label: 'Received',    cls: 'bg-gray-100 text-gray-600' },
  { value: 'assigned',    label: 'Assigned',    cls: 'bg-blue-100 text-blue-700' },
  { value: 'in_progress', label: 'In Progress', cls: 'bg-yellow-100 text-yellow-700' },
  { value: 'completed',   label: 'Completed',   cls: 'bg-green-100 text-green-700' },
]
const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s]))

const GUIDE_CATEGORIES = [
  { value: 'checkin',    label: 'Check-in',  emoji: '🔑' },
  { value: 'wifi',       label: 'WiFi',      emoji: '📶' },
  { value: 'rules',      label: 'House Rules', emoji: '📋' },
  { value: 'equipment',  label: 'Equipment', emoji: '🏠' },
  { value: 'parking',    label: 'Parking',   emoji: '🚗' },
  { value: 'local_info', label: 'Local Info', emoji: '🗺️' },
  { value: 'emergency',  label: 'Emergency', emoji: '🚨' },
  { value: 'checkout',   label: 'Check-out', emoji: '👋' },
  { value: 'general',    label: 'General',   emoji: 'ℹ️' },
]
const GUIDE_CAT_MAP = Object.fromEntries(GUIDE_CATEGORIES.map(c => [c.value, c]))

const LOCAL_CATEGORIES = [
  { value: 'restaurant',  label: 'Restaurant',  emoji: '🍽️' },
  { value: 'beach',       label: 'Beach',       emoji: '🏖️' },
  { value: 'attraction',  label: 'Attraction',  emoji: '🎭' },
  { value: 'activity',    label: 'Activity',    emoji: '🏄' },
  { value: 'shopping',    label: 'Shopping',    emoji: '🛍️' },
  { value: 'nightlife',   label: 'Nightlife',   emoji: '🎵' },
]
const LOCAL_CAT_MAP = Object.fromEntries(LOCAL_CATEGORIES.map(c => [c.value, c]))

// ── Shared UI components ──────────────────────────────────────────────────────

function Spinner({ size = 8 }) {
  return <div className={`animate-spin w-${size} h-${size} border-4 border-[#1e3a5f] border-t-transparent rounded-full`} />
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className={`bg-white rounded-2xl w-full shadow-xl my-4 ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-lg">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Label({ children }) {
  return <label className="block text-sm font-medium text-gray-700 mb-1.5">{children}</label>
}

function Input({ label, ...props }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
        {...props}
      />
    </div>
  )
}

function Textarea({ label, rows = 4, ...props }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <textarea
        rows={rows}
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent resize-y"
        {...props}
      />
    </div>
  )
}

function Select({ label, options, ...props }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <select
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent bg-white"
        {...props}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function Badge({ cls, children }) {
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>{children}</span>
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-[#1e3a5f]' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function EmptyState({ icon, title, desc }) {
  return (
    <div className="text-center py-12">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="font-semibold text-gray-700">{title}</p>
      <p className="text-sm text-gray-400 mt-1">{desc}</p>
    </div>
  )
}

function DeleteConfirm({ onConfirm, onCancel }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-red-600 font-medium">Delete?</span>
      <button onClick={onConfirm} className="text-xs bg-red-600 text-white px-2.5 py-1 rounded-lg hover:bg-red-700 transition-colors">Yes</button>
      <button onClick={onCancel} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg hover:bg-gray-200 transition-colors">No</button>
    </div>
  )
}

// ── Tab 1: Settings ───────────────────────────────────────────────────────────

function SettingsTab() {
  const [form, setForm] = useState({
    welcome_message: '',
    checkin_time: '14:00',
    checkout_time: '11:00',
    from_name: '',
    manager_phone: '',
    manager_email: '',
    emergency_contact: '',
    hospital_name: '',
    hospital_phone: '',
    police_phone: '100',
    ambulance_phone: '166',
    fire_phone: '199',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    api.get('/portal/settings')
      .then(r => setForm(f => ({ ...f, ...r.data })))
      .catch(() => toast.error('Failed to load settings.'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put('/portal/settings', form)
      toast.success('Settings saved.')
    } catch {
      toast.error('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wider text-[#1e3a5f]">Welcome & Times</h3>
        <Textarea
          label="Welcome Message"
          value={form.welcome_message}
          onChange={e => set('welcome_message', e.target.value)}
          rows={5}
          placeholder="Welcome to our property! We hope you enjoy your stay..."
        />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Check-in Time" type="time" value={form.checkin_time} onChange={e => set('checkin_time', e.target.value)} />
          <Input label="Check-out Time" type="time" value={form.checkout_time} onChange={e => set('checkout_time', e.target.value)} />
        </div>
        <Input label="Email Sender Name" value={form.from_name} onChange={e => set('from_name', e.target.value)} placeholder="Property Name" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wider text-[#1e3a5f]">Contact Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Manager Phone" type="tel" value={form.manager_phone} onChange={e => set('manager_phone', e.target.value)} placeholder="+30 6900 000000" />
          <Input label="Manager Email" type="email" value={form.manager_email} onChange={e => set('manager_email', e.target.value)} placeholder="manager@example.com" />
        </div>
        <Input label="Emergency Contact (name + phone)" value={form.emergency_contact} onChange={e => set('emergency_contact', e.target.value)} placeholder="John Doe: +30 6900 000000" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wider text-[#1e3a5f]">Emergency Services</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Hospital Name" value={form.hospital_name} onChange={e => set('hospital_name', e.target.value)} placeholder="General Hospital" />
          <Input label="Hospital Phone" type="tel" value={form.hospital_phone} onChange={e => set('hospital_phone', e.target.value)} placeholder="+30 2810 000000" />
          <Input label="Police Phone" type="tel" value={form.police_phone} onChange={e => set('police_phone', e.target.value)} />
          <Input label="Ambulance Phone" type="tel" value={form.ambulance_phone} onChange={e => set('ambulance_phone', e.target.value)} />
          <Input label="Fire Department Phone" type="tel" value={form.fire_phone} onChange={e => set('fire_phone', e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="bg-[#1e3a5f] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#16305a] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </form>
  )
}

// ── Tab 2: Welcome Guide ──────────────────────────────────────────────────────

const emptyGuideItem = { category: 'general', title: '', content: '', is_active: true }

function GuideTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const load = useCallback(() => {
    api.get('/portal/guide')
      .then(r => setItems(r.data || []))
      .catch(() => toast.error('Failed to load guide.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (form) => {
    setSaving(true)
    try {
      if (form.id) {
        await api.put(`/portal/guide/${form.id}`, form)
        toast.success('Item updated.')
      } else {
        await api.post('/portal/guide', form)
        toast.success('Item added.')
      }
      setModal(null)
      load()
    } catch {
      toast.error('Failed to save item.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (item) => {
    try {
      await api.put(`/portal/guide/${item.id}`, { ...item, is_active: !item.is_active })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i))
    } catch {
      toast.error('Failed to update item.')
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/portal/guide/${id}`)
      setItems(prev => prev.filter(i => i.id !== id))
      setDeletingId(null)
      toast.success('Item deleted.')
    } catch {
      toast.error('Failed to delete item.')
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{items.length} guide items</p>
        <button
          onClick={() => setModal({ ...emptyGuideItem })}
          className="flex items-center gap-2 bg-[#1e3a5f] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#16305a] transition-colors"
        >
          <PlusIcon className="w-4 h-4" /> Add Item
        </button>
      </div>

      {items.length === 0 && (
        <EmptyState icon="📖" title="No guide items yet" desc="Add check-in instructions, WiFi details, house rules and more." />
      )}

      <div className="space-y-2">
        {items.map(item => {
          const cat = GUIDE_CAT_MAP[item.category] || { emoji: 'ℹ️', label: item.category }
          return (
            <div key={item.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-start gap-3">
              <span className="text-2xl flex-shrink-0 mt-0.5">{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{cat.label}</span>
                  <span className="font-semibold text-gray-900 text-sm">{item.title}</span>
                </div>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2 leading-relaxed">{item.content}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <ToggleSwitch checked={item.is_active} onChange={() => handleToggle(item)} />
                <button
                  onClick={() => setModal({ ...item })}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <PencilSquareIcon className="w-4 h-4 text-gray-500" />
                </button>
                {deletingId === item.id ? (
                  <DeleteConfirm onConfirm={() => handleDelete(item.id)} onCancel={() => setDeletingId(null)} />
                ) : (
                  <button onClick={() => setDeletingId(item.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                    <TrashIcon className="w-4 h-4 text-red-400" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {modal && (
        <GuideModal
          item={modal}
          saving={saving}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function GuideModal({ item, saving, onSave, onClose }) {
  const [form, setForm] = useState({ ...item })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal title={form.id ? 'Edit Guide Item' : 'Add Guide Item'} onClose={onClose} wide>
      <div className="space-y-4">
        <Select
          label="Category"
          value={form.category}
          onChange={e => set('category', e.target.value)}
          options={GUIDE_CATEGORIES.map(c => ({ value: c.value, label: `${c.emoji} ${c.label}` }))}
        />
        <Input label="Title" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. WiFi Password" autoFocus={!form.id} />
        <Textarea label="Content" value={form.content} onChange={e => set('content', e.target.value)} rows={6} placeholder="Detailed instructions..." />
        <div className="flex items-center gap-3">
          <ToggleSwitch checked={form.is_active} onChange={v => set('is_active', v)} />
          <span className="text-sm text-gray-600">Active (visible to guests)</span>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.title?.trim() || !form.content?.trim()}
            className="flex-1 bg-[#1e3a5f] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#16305a] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Tab 3: Local Tips ─────────────────────────────────────────────────────────

const emptyLocalItem = { category: 'restaurant', name: '', description: '', phone: '', website: '', address: '', maps_url: '' }

function LocalTipsTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const load = useCallback(() => {
    api.get('/portal/recommendations')
      .then(r => setItems(r.data || []))
      .catch(() => toast.error('Failed to load recommendations.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (form) => {
    setSaving(true)
    try {
      if (form.id) {
        await api.put(`/portal/recommendations/${form.id}`, form)
        toast.success('Updated.')
      } else {
        await api.post('/portal/recommendations', form)
        toast.success('Added.')
      }
      setModal(null)
      load()
    } catch {
      toast.error('Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/portal/recommendations/${id}`)
      setItems(prev => prev.filter(i => i.id !== id))
      setDeletingId(null)
      toast.success('Deleted.')
    } catch {
      toast.error('Failed to delete.')
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{items.length} recommendations</p>
        <button
          onClick={() => setModal({ ...emptyLocalItem })}
          className="flex items-center gap-2 bg-[#1e3a5f] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#16305a] transition-colors"
        >
          <PlusIcon className="w-4 h-4" /> Add Tip
        </button>
      </div>

      {items.length === 0 && (
        <EmptyState icon="📍" title="No recommendations yet" desc="Add restaurants, beaches, attractions and more for your guests." />
      )}

      <div className="space-y-2">
        {items.map(item => {
          const cat = LOCAL_CAT_MAP[item.category?.toLowerCase()] || { emoji: '📍', label: item.category }
          return (
            <div key={item.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-start gap-3">
              <span className="text-2xl flex-shrink-0 mt-0.5">{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{cat.label}</span>
                  <span className="font-semibold text-gray-900 text-sm">{item.name}</span>
                </div>
                {item.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.description}</p>}
                {item.address && <p className="text-xs text-gray-400 mt-0.5">📍 {item.address}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setModal({ ...item })} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <PencilSquareIcon className="w-4 h-4 text-gray-500" />
                </button>
                {deletingId === item.id ? (
                  <DeleteConfirm onConfirm={() => handleDelete(item.id)} onCancel={() => setDeletingId(null)} />
                ) : (
                  <button onClick={() => setDeletingId(item.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                    <TrashIcon className="w-4 h-4 text-red-400" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {modal && (
        <LocalModal item={modal} saving={saving} onSave={handleSave} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

function LocalModal({ item, saving, onSave, onClose }) {
  const [form, setForm] = useState({ ...item })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal title={form.id ? 'Edit Recommendation' : 'Add Recommendation'} onClose={onClose} wide>
      <div className="space-y-4">
        <Select
          label="Category"
          value={form.category}
          onChange={e => set('category', e.target.value)}
          options={LOCAL_CATEGORIES.map(c => ({ value: c.value, label: `${c.emoji} ${c.label}` }))}
        />
        <Input label="Name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Taverna Kostas" autoFocus={!form.id} />
        <Textarea label="Description" value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="Short description..." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+30 2810 000000" />
          <Input label="Website" type="url" value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://..." />
        </div>
        <Input label="Address" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street address" />
        <Input label="Google Maps URL" type="url" value={form.maps_url} onChange={e => set('maps_url', e.target.value)} placeholder="https://maps.google.com/..." />
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.name?.trim()}
            className="flex-1 bg-[#1e3a5f] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#16305a] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Tab 4: Marketplace ────────────────────────────────────────────────────────

const emptyMarketItem = { title: '', description: '', price: 0, is_available: true }

function MarketplaceTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const load = useCallback(() => {
    api.get('/portal/marketplace')
      .then(r => setItems(r.data || []))
      .catch(() => toast.error('Failed to load marketplace.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (form) => {
    setSaving(true)
    try {
      if (form.id) {
        await api.put(`/portal/marketplace/${form.id}`, form)
        toast.success('Updated.')
      } else {
        await api.post('/portal/marketplace', form)
        toast.success('Added.')
      }
      setModal(null)
      load()
    } catch {
      toast.error('Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (item) => {
    try {
      await api.put(`/portal/marketplace/${item.id}`, { ...item, is_available: !item.is_available })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !i.is_available } : i))
    } catch {
      toast.error('Failed to update.')
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/portal/marketplace/${id}`)
      setItems(prev => prev.filter(i => i.id !== id))
      setDeletingId(null)
      toast.success('Deleted.')
    } catch {
      toast.error('Failed to delete.')
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{items.length} services</p>
        <button
          onClick={() => setModal({ ...emptyMarketItem })}
          className="flex items-center gap-2 bg-[#1e3a5f] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#16305a] transition-colors"
        >
          <PlusIcon className="w-4 h-4" /> Add Service
        </button>
      </div>

      {items.length === 0 && (
        <EmptyState icon="🛎️" title="No services yet" desc="Add services guests can request, like airport transfers, early check-in, etc." />
      )}

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 text-sm">{item.title}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  item.price > 0 ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                }`}>
                  {item.price > 0 ? `€${item.price}` : 'Free'}
                </span>
                {!item.is_available && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Unavailable</span>
                )}
              </div>
              {item.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.description}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <ToggleSwitch checked={item.is_available} onChange={() => handleToggle(item)} />
              <button onClick={() => setModal({ ...item })} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <PencilSquareIcon className="w-4 h-4 text-gray-500" />
              </button>
              {deletingId === item.id ? (
                <DeleteConfirm onConfirm={() => handleDelete(item.id)} onCancel={() => setDeletingId(null)} />
              ) : (
                <button onClick={() => setDeletingId(item.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                  <TrashIcon className="w-4 h-4 text-red-400" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <MarketModal item={modal} saving={saving} onSave={handleSave} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

function MarketModal({ item, saving, onSave, onClose }) {
  const [form, setForm] = useState({ ...item })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal title={form.id ? 'Edit Service' : 'Add Service'} onClose={onClose}>
      <div className="space-y-4">
        <Input label="Service Title" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Airport Transfer" autoFocus={!form.id} />
        <Textarea label="Description" value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="What's included..." />
        <div>
          <Label>Price (€) — enter 0 for free</Label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={form.price}
            onChange={e => set('price', parseFloat(e.target.value) || 0)}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
          />
        </div>
        <div className="flex items-center gap-3">
          <ToggleSwitch checked={form.is_available} onChange={v => set('is_available', v)} />
          <span className="text-sm text-gray-600">Available to guests</span>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.title?.trim()}
            className="flex-1 bg-[#1e3a5f] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#16305a] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Tab 5: Requests ───────────────────────────────────────────────────────────

function RequestsTab() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const pollRef = useRef(null)

  const load = useCallback(() => {
    api.get('/portal/requests')
      .then(r => setRequests(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, 30000)
    return () => clearInterval(pollRef.current)
  }, [load])

  const handleExpand = (req) => {
    if (expanded === req.id) { setExpanded(null); return }
    setExpanded(req.id)
    setEditForm({ status: req.status, notes: req.notes || '' })
  }

  const handleSaveRequest = async (req) => {
    setSaving(true)
    try {
      await api.put(`/portal/requests/${req.id}`, editForm)
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, ...editForm } : r))
      setExpanded(null)
      toast.success('Request updated.')
    } catch {
      toast.error('Failed to update request.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  const pendingCount = requests.filter(r => r.status === 'received').length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">{requests.length} total requests</p>
          {pendingCount > 0 && (
            <span className="bg-orange-100 text-orange-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              {pendingCount} new
            </span>
          )}
        </div>
        <button onClick={load} className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
          Refresh
        </button>
      </div>

      {requests.length === 0 && (
        <EmptyState icon="📋" title="No requests yet" desc="Guest service requests will appear here." />
      )}

      <div className="space-y-2">
        {requests.map(req => {
          const st = STATUS_MAP[req.status] || STATUS_MAP.received
          const isOpen = expanded === req.id
          return (
            <div key={req.id} className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-all ${isOpen ? 'border-[#1e3a5f]/30' : 'border-gray-100'}`}>
              <button
                onClick={() => handleExpand(req)}
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{req.service_type}</span>
                    <Badge cls={st.cls}>{st.label}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{req.guest_name} · {req.unit_name}</p>
                  {req.description && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{req.description}</p>}
                </div>
                <div className="flex-shrink-0 text-xs text-gray-400 text-right">
                  <p>{fmtDate(req.created_at)}</p>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                  {req.description && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
                      <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2">{req.description}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
                      <select
                        value={editForm.status}
                        onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                      >
                        {STATUS_OPTIONS.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Internal Notes</label>
                      <input
                        type="text"
                        value={editForm.notes}
                        onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Add notes..."
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setExpanded(null)} className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveRequest(req)}
                      disabled={saving}
                      className="bg-[#1e3a5f] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#16305a] transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab 6: Messages ───────────────────────────────────────────────────────────

function MessagesTab() {
  const [conversations, setConversations] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const pollRef = useRef(null)

  const loadConversations = useCallback(() => {
    api.get('/portal/messages')
      .then(r => setConversations(r.data || []))
      .catch(() => {})
      .finally(() => setLoadingConvs(false))
  }, [])

  const loadMessages = useCallback((bookingId) => {
    if (!bookingId) return
    setLoadingMsgs(true)
    api.get(`/portal/messages/${bookingId}`)
      .then(r => setMessages(r.data || []))
      .catch(() => {})
      .finally(() => setLoadingMsgs(false))
  }, [])

  useEffect(() => {
    loadConversations()
    const convPoll = setInterval(loadConversations, 30000)
    return () => clearInterval(convPoll)
  }, [loadConversations])

  useEffect(() => {
    if (activeConv) {
      loadMessages(activeConv.booking_id)
      clearInterval(pollRef.current)
      pollRef.current = setInterval(() => loadMessages(activeConv.booking_id), 20000)
    }
    return () => clearInterval(pollRef.current)
  }, [activeConv, loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSelectConv = (conv) => {
    setActiveConv(conv)
    setMessages([])
    setText('')
  }

  const handleSend = async () => {
    if (!text.trim() || !activeConv) return
    setSending(true)
    try {
      await api.post(`/portal/messages/${activeConv.booking_id}`, { message: text.trim() })
      setText('')
      loadMessages(activeConv.booking_id)
      loadConversations()
    } catch {
      toast.error('Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  const senderLabel = (msg) => {
    if (msg.sender_type === 'guest' || msg.is_guest) return msg.guest_name || 'Guest'
    if (msg.sender_type === 'ai' || msg.is_ai) return '🤖 AI Assistant'
    return 'Manager'
  }

  const isManager = (msg) => !msg.is_guest && msg.sender_type !== 'guest' && msg.sender_type !== 'ai' && !msg.is_ai

  return (
    <div className="flex gap-4 h-[calc(100vh-10rem)] min-h-96">
      {/* Conversations list */}
      <div className="w-72 flex-shrink-0 flex flex-col">
        <p className="text-sm font-semibold text-gray-700 mb-3">Conversations</p>
        {loadingConvs ? (
          <div className="flex justify-center py-8"><Spinner size={6} /></div>
        ) : conversations.length === 0 ? (
          <EmptyState icon="💬" title="No conversations" desc="Guest messages will appear here." />
        ) : (
          <div className="overflow-y-auto space-y-1.5 flex-1">
            {conversations.map(conv => (
              <button
                key={conv.booking_id}
                onClick={() => handleSelectConv(conv)}
                className={`w-full text-left p-3 rounded-xl transition-colors ${
                  activeConv?.booking_id === conv.booking_id
                    ? 'bg-[#1e3a5f] text-white'
                    : 'bg-white border border-gray-100 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm truncate ${activeConv?.booking_id === conv.booking_id ? 'text-white' : 'text-gray-900'}`}>
                      {conv.guest_name || 'Guest'}
                    </p>
                    <p className={`text-xs truncate mt-0.5 ${activeConv?.booking_id === conv.booking_id ? 'text-blue-200' : 'text-gray-500'}`}>
                      {conv.unit_name}
                    </p>
                    {conv.last_message && (
                      <p className={`text-xs truncate mt-0.5 ${activeConv?.booking_id === conv.booking_id ? 'text-blue-200' : 'text-gray-400'}`}>
                        {conv.last_message}
                      </p>
                    )}
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="flex-shrink-0 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {conv.unread_count > 9 ? '9+' : conv.unread_count}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Message thread */}
      <div className="flex-1 flex flex-col min-w-0 bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <ChatBubbleLeftRightIcon className="w-12 h-12 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Select a conversation to view messages</p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
              <div>
                <p className="font-semibold text-gray-900 text-sm">{activeConv.guest_name || 'Guest'}</p>
                <p className="text-xs text-gray-500">{activeConv.unit_name}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {loadingMsgs ? (
                <div className="flex justify-center py-8"><Spinner size={6} /></div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No messages yet.</div>
              ) : (
                messages.map((msg, idx) => {
                  const manager = isManager(msg)
                  const isAI = msg.sender_type === 'ai' || msg.is_ai
                  return (
                    <div key={msg.id || idx} className={`flex flex-col ${manager ? 'items-end' : 'items-start'}`}>
                      <span className="text-xs text-gray-400 mb-1 px-1">{senderLabel(msg)}</span>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        manager
                          ? 'bg-[#1e3a5f] text-white rounded-br-sm'
                          : isAI
                            ? 'bg-purple-50 border border-purple-100 text-purple-900 rounded-bl-sm'
                            : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-bl-sm'
                      }`}>
                        {msg.photo_path && <img src={msg.photo_path} alt="Shared photo" className="rounded-xl mb-2 max-w-full" />}
                        <p className="text-sm whitespace-pre-line leading-relaxed">{msg.message || msg.content}</p>
                        <p className={`text-xs mt-1 ${manager ? 'text-blue-200' : 'text-gray-400'}`}>
                          {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-100 px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Type a message..."
                  rows={1}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] resize-none max-h-32"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !text.trim()}
                  className="flex-shrink-0 w-10 h-10 bg-[#1e3a5f] rounded-xl flex items-center justify-center hover:bg-[#16305a] transition-colors disabled:opacity-50"
                >
                  <PaperAirplaneIcon className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Tab 7: Analytics ──────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/portal/analytics')
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load analytics.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>
  if (!data) return <EmptyState icon="📊" title="No data" desc="Analytics will appear once guests start using their portals." />

  const stats = [
    { icon: '🔗', label: 'Portal Links Created', value: data.total_links ?? '—' },
    { icon: '✅', label: 'Verified Guests', value: data.verified_guests ?? '—' },
    { icon: '👁️', label: 'Total Portal Views', value: data.total_views ?? '—' },
    { icon: '📋', label: 'Service Requests', value: data.total_requests ?? '—' },
    { icon: '💬', label: 'Guest Messages', value: data.total_messages ?? '—' },
  ]

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {stats.map(stat => (
          <div key={stat.label} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="text-2xl mb-2">{stat.icon}</div>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {data.requests_by_type?.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">Requests by Type</h3>
          <div className="space-y-2">
            {data.requests_by_type.map((r, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 flex-1">{r.service_type}</span>
                <span className="text-sm font-semibold text-gray-900 w-10 text-right">{r.count}</span>
                <div className="w-32 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-[#1e3a5f] h-2 rounded-full transition-all"
                    style={{ width: `${Math.round((r.count / (data.total_requests || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.messages_by_day?.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">Recent Activity (Messages/Day)</h3>
          <div className="space-y-1.5">
            {data.messages_by_day.slice(-7).map((d, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-20 flex-shrink-0">{fmtDate(d.date)}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${Math.min(100, Math.round((d.count / 20) * 100))}%` }}
                  />
                </div>
                <span className="text-xs text-gray-700 w-6 text-right">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Top Tab Nav ───────────────────────────────────────────────────────────────

const PORTAL_TABS = [
  { id: 'settings',    label: 'Settings',      Icon: Cog6ToothIcon },
  { id: 'guide',       label: 'Welcome Guide',  Icon: BookOpenIcon },
  { id: 'local',       label: 'Local Tips',     Icon: MapPinIcon },
  { id: 'marketplace', label: 'Marketplace',    Icon: ShoppingBagIcon },
  { id: 'requests',    label: 'Requests',       Icon: ClipboardDocumentListIcon },
  { id: 'messages',    label: 'Messages',       Icon: ChatBubbleLeftRightIcon },
  { id: 'analytics',   label: 'Analytics',      Icon: ChartBarIcon },
]

// ── Main Component ────────────────────────────────────────────────────────────

export default function PortalAdmin() {
  const [activeTab, setActiveTab] = useState('settings')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-[#1e3a5f] rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-lg">🏡</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Guest Portal Admin</h1>
              <p className="text-xs text-gray-500">Manage the guest experience portal</p>
            </div>
          </div>

          {/* Tab nav */}
          <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide -mx-1 px-1">
            {PORTAL_TABS.map(tab => {
              const Icon = tab.Icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium flex-shrink-0 transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[#1e3a5f] text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'settings'    && <SettingsTab />}
        {activeTab === 'guide'       && <GuideTab />}
        {activeTab === 'local'       && <LocalTipsTab />}
        {activeTab === 'marketplace' && <MarketplaceTab />}
        {activeTab === 'requests'    && <RequestsTab />}
        {activeTab === 'messages'    && <MessagesTab />}
        {activeTab === 'analytics'   && <AnalyticsTab />}
      </div>
    </div>
  )
}
