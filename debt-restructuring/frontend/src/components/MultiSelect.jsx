import { useState, useRef, useEffect } from 'react'

// Dropdown with checkboxes. value = array of selected option values (empty = no filter).
// options = [{ value, label }]
export default function MultiSelect({ value, onChange, options, placeholder, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const toggle = (v) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  const selected = options.filter(o => value.includes(o.value))
  const text = selected.length === 0 ? placeholder
    : selected.length <= 2 ? selected.map(o => o.label).join(', ')
    : `${selected.length} επιλεγμένα`

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`input w-full min-w-[170px] text-left flex items-center justify-between gap-2 ${selected.length ? 'ring-1 ring-blue-400' : ''}`}>
        <span className="truncate">{text}</span>
        <span className="text-gray-400 text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 min-w-full w-max bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-72 overflow-y-auto">
          {options.map(o => (
            <label key={o.value} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
              <input type="checkbox" className="rounded border-gray-300 text-blue-600"
                checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-xs text-blue-600 border-t border-gray-100 hover:bg-gray-50">
              Καθαρισμός επιλογής
            </button>
          )}
        </div>
      )}
    </div>
  )
}
