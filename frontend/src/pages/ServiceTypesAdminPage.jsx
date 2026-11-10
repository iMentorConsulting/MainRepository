import { useState, useEffect } from 'react'
import { getServiceTypeGroups, putServiceTypeGroups, getSettingList, putSettingList } from '../api'
import toast from 'react-hot-toast'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'

// ── Simple flat list editor ──────────────────────────────────────────────────
function FlatListEditor({ title, items, onChange }) {
  const [newVal, setNewVal] = useState('')

  const add = () => {
    const v = newVal.trim()
    if (!v) return
    if (items.includes(v)) { toast.error('Υπάρχει ήδη'); return }
    onChange([...items, v])
    setNewVal('')
  }

  const remove = (item) => onChange(items.filter(i => i !== item))

  const move = (idx, dir) => {
    const next = idx + dir
    if (next < 0 || next >= items.length) return
    const a = [...items]
    ;[a[idx], a[next]] = [a[next], a[idx]]
    onChange(a)
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <span className="font-bold text-sm text-gray-700">{title}</span>
        <span className="ml-2 text-xs text-gray-400">{items.length} επιλογές</span>
      </div>
      <div className="p-3 space-y-1">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-100 rounded-lg">
            <div className="flex flex-col gap-0.5 mr-0.5">
              <button onClick={() => move(idx, -1)} disabled={idx === 0}
                className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none text-xs">▲</button>
              <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1}
                className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none text-xs">▼</button>
            </div>
            <span className="flex-1 text-sm text-gray-800">{item}</span>
            <button onClick={() => remove(item)}
              className="text-red-400 hover:text-red-600 p-0.5 rounded">
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <input
            value={newVal}
            onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Νέα επιλογή…"
            className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button onClick={add}
            className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm hover:bg-blue-100 flex items-center gap-1">
            <PlusIcon className="w-3.5 h-3.5" /> Προσθήκη
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Grouped service types editor ─────────────────────────────────────────────
function GroupedEditor({ groups, onChange }) {
  const [newGroupLabel, setNewGroupLabel] = useState('')
  const [newItems, setNewItems] = useState({})

  const addGroup = () => {
    const label = newGroupLabel.trim().toUpperCase()
    if (!label) return
    if (groups.some(g => g.label === label)) { toast.error('Υπάρχει ήδη αυτή η κατηγορία'); return }
    onChange([...groups, { label, items: [] }])
    setNewGroupLabel('')
  }

  const removeGroup = (idx) => onChange(groups.filter((_, i) => i !== idx))

  const addItem = (idx) => {
    const val = (newItems[idx] || '').trim().toUpperCase()
    if (!val) return
    const updated = groups.map((g, i) => {
      if (i !== idx) return g
      if (g.items.includes(val)) { toast.error('Υπάρχει ήδη'); return g }
      return { ...g, items: [...g.items, val] }
    })
    onChange(updated)
    setNewItems(prev => ({ ...prev, [idx]: '' }))
  }

  const removeItem = (gIdx, item) =>
    onChange(groups.map((g, i) => i !== gIdx ? g : { ...g, items: g.items.filter(it => it !== item) }))

  const moveGroup = (idx, dir) => {
    const next = idx + dir
    if (next < 0 || next >= groups.length) return
    const a = [...groups]
    ;[a[idx], a[next]] = [a[next], a[idx]]
    onChange(a)
  }

  return (
    <div className="space-y-3">
      {groups.map((g, idx) => (
        <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 bg-gray-50 px-4 py-3 border-b border-gray-200">
            <div className="flex flex-col gap-0.5 mr-1">
              <button onClick={() => moveGroup(idx, -1)} disabled={idx === 0}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-20 leading-none text-xs">▲</button>
              <button onClick={() => moveGroup(idx, 1)} disabled={idx === groups.length - 1}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-20 leading-none text-xs">▼</button>
            </div>
            <span className="font-bold text-sm text-gray-700 flex-1">{g.label}</span>
            <span className="text-xs text-gray-400">{g.items.length} υπηρεσίες</span>
            <button onClick={() => removeGroup(idx)}
              className="text-red-400 hover:text-red-600 p-1 rounded">
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3 space-y-1">
            {g.items.map(item => (
              <div key={item} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-100 rounded-lg">
                <span className="flex-1 text-sm text-gray-800">{item}</span>
                <button onClick={() => removeItem(idx, item)}
                  className="text-red-400 hover:text-red-600 p-0.5 rounded">
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input
                value={newItems[idx] || ''}
                onChange={e => setNewItems(prev => ({ ...prev, [idx]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addItem(idx)}
                placeholder="Νέα υπηρεσία…"
                className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button onClick={() => addItem(idx)}
                className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm hover:bg-blue-100 flex items-center gap-1">
                <PlusIcon className="w-3.5 h-3.5" /> Προσθήκη
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Νέα κατηγορία</p>
        <div className="flex gap-2">
          <input
            value={newGroupLabel}
            onChange={e => setNewGroupLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addGroup()}
            placeholder="π.χ. ΔΑΝΕΙΑ"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button onClick={addGroup}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1">
            <PlusIcon className="w-4 h-4" /> Προσθήκη
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'service_types', label: 'Τύποι Υπηρεσιών' },
  { key: 'work_statuses', label: 'Κατάσταση Εργασίας' },
  { key: 'descriptions', label: 'Περιγραφή' },
  { key: 'source_referrals', label: 'Πηγή Σύστασης' },
]

export default function ServiceTypesAdminPage() {
  const [activeTab, setActiveTab] = useState('service_types')
  const [data, setData] = useState({
    service_types: null,
    work_statuses: null,
    descriptions: null,
    source_referrals: null,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getServiceTypeGroups().then(v => setData(d => ({ ...d, service_types: v }))).catch(() => {})
    getSettingList('work_statuses').then(v => setData(d => ({ ...d, work_statuses: v }))).catch(() => {})
    getSettingList('descriptions').then(v => setData(d => ({ ...d, descriptions: v }))).catch(() => {})
    getSettingList('source_referrals').then(v => setData(d => ({ ...d, source_referrals: v }))).catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      if (activeTab === 'service_types') {
        await putServiceTypeGroups(data.service_types)
      } else {
        await putSettingList(activeTab, data[activeTab])
      }
      toast.success('Αποθηκεύτηκε!')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  const current = data[activeTab]

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ρυθμίσεις Αποστολής στα Οικονομικά</h1>
          <p className="text-sm text-gray-500 mt-1">Διαχείριση επιλογών στη φόρμα "Αποστολή στα Οικονομικά"</p>
        </div>
        <button
          onClick={save}
          disabled={saving || current === null}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {current === null ? (
        <div className="text-center py-12 text-gray-400">Φόρτωση...</div>
      ) : activeTab === 'service_types' ? (
        <GroupedEditor groups={current} onChange={v => setData(d => ({ ...d, service_types: v }))} />
      ) : (
        <FlatListEditor
          title={TABS.find(t => t.key === activeTab)?.label}
          items={current}
          onChange={v => setData(d => ({ ...d, [activeTab]: v }))}
        />
      )}
    </div>
  )
}
