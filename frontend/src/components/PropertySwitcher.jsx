import { useEffect, useState } from 'react'
import { getProperties, getSelectedProperty, setSelectedProperty } from '../api'

// Shown only when the business has more than one property; switching reloads so every page refetches
export default function PropertySwitcher({ className = '' }) {
  const [props, setProps] = useState([])
  const [selected, setSelected] = useState(getSelectedProperty())

  useEffect(() => {
    const load = () => getProperties().then(r => {
      setProps(r.data)
      // Forget a selection that no longer exists (e.g. deleted property)
      if (selected && !r.data.some(p => String(p.id) === String(selected))) {
        setSelectedProperty('')
        setSelected('')
      }
    }).catch(() => {})
    load()
    // The Καταλύματα page announces changes so a newly added property appears without a reload
    window.addEventListener('istay:properties-changed', load)
    return () => window.removeEventListener('istay:properties-changed', load)
  }, [])

  if (props.length < 2) return null

  return (
    <label className={`block ${className}`}>
      <span className="sr-only">Κατάλυμα</span>
      <select
        value={selected}
        onChange={e => { setSelectedProperty(e.target.value); window.location.reload() }}
        className="w-full text-xs font-medium border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <option value="">Όλα τα καταλύματα</option>
        {props.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  )
}
