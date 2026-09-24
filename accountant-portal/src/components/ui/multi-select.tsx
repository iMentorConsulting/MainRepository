'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface Option {
  value: string
  label: string
}

export function MultiSelect({ label, options, selected, onChange, placeholder }: {
  label?: string
  options: Option[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])
  }

  const text = selected.length === 0 ? (placeholder || 'Όλα') : `${selected.length} επιλεγμένα`

  return (
    <div className="relative" ref={ref}>
      {label && <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between gap-2 w-full min-w-[160px] px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
      >
        <span className={selected.length ? 'text-gray-900' : 'text-gray-400'}>{text}</span>
        <ChevronDown size={14} className="text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[220px] max-h-64 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {options.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">Καμία επιλογή διαθέσιμη</div>}
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} className="rounded" />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-gray-50 border-t border-gray-100 mt-1"
            >
              Καθαρισμός επιλογών
            </button>
          )}
        </div>
      )}
    </div>
  )
}
