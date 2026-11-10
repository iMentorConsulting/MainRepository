import { useState, useEffect } from 'react'
import { getServiceTypeGroups, putServiceTypeGroups } from '../api'
import toast from 'react-hot-toast'
import { PlusIcon, TrashIcon, Bars3Icon } from '@heroicons/react/24/outline'

export default function ServiceTypesAdminPage() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newGroupLabel, setNewGroupLabel] = useState('')
  const [newItems, setNewItems] = useState({}) // groupIdx -> string

  useEffect(() => {
    getServiceTypeGroups()
      .then(data => { setGroups(data); setLoading(false) })
      .catch(() => { toast.error('Σφάλμα φόρτωσης'); setLoading(false) })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await putServiceTypeGroups(groups)
      toast.success('Αποθηκεύτηκε!')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  const addGroup = () => {
    const label = newGroupLabel.trim().toUpperCase()
    if (!label) return
    if (groups.some(g => g.label === label)) { toast.error('Υπάρχει ήδη αυτή η κατηγορία'); return }
    setGroups(prev => [...prev, { label, items: [] }])
    setNewGroupLabel('')
  }

  const removeGroup = (idx) => {
    setGroups(prev => prev.filter((_, i) => i !== idx))
  }

  const addItem = (idx) => {
    const val = (newItems[idx] || '').trim().toUpperCase()
    if (!val) return
    setGroups(prev => prev.map((g, i) => {
      if (i !== idx) return g
      if (g.items.includes(val)) { toast.error('Υπάρχει ήδη'); return g }
      return { ...g, items: [...g.items, val] }
    }))
    setNewItems(prev => ({ ...prev, [idx]: '' }))
  }

  const removeItem = (gIdx, item) => {
    setGroups(prev => prev.map((g, i) =>
      i !== gIdx ? g : { ...g, items: g.items.filter(it => it !== item) }
    ))
  }

  const moveGroup = (idx, dir) => {
    const next = idx + dir
    if (next < 0 || next >= groups.length) return
    setGroups(prev => {
      const a = [...prev]
      ;[a[idx], a[next]] = [a[next], a[idx]]
      return a
    })
  }

  if (loading) return <div className="p-8 text-gray-500">Φόρτωση...</div>

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Τύποι Υπηρεσιών</h1>
          <p className="text-sm text-gray-500 mt-1">Διαχείριση λίστας "Αποστολή στα Οικονομικά"</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
      </div>

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
