'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface Option {
  value: string
  label: string
}

export function MultiSelect({ label, options, selected, onChange, placeholder, searchable }: {
  label?: string
  options: Option[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [optionSearch, setOptionSearch] = useState('')
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
  const labelFor = (value: string) => options.find(o => o.value === value)?.label || value
  const visibleOptions = searchable && optionSearch
    ? options.filter(o => o.label.toLowerCase().includes(optionSearch.toLowerCase()) || o.value.toLowerCase().includes(optionSearch.toLowerCase()))
    : options

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
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map(v => (
            <span key={v} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs rounded-full px-2 py-0.5 border border-blue-100">
              <span className="truncate max-w-[160px]">{labelFor(v)}</span>
              <button type="button" onClick={() => toggle(v)} className="hover:text-blue-900 leading-none">×</button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[320px] bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {searchable && (
            <div className="px-3 pt-2 pb-1.5 border-b border-gray-100">
              <input
                type="text"
                value={optionSearch}
                onChange={e => setOptionSearch(e.target.value)}
                placeholder="Αναζήτηση..."
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-400"
                onClick={e => e.stopPropagation()}
                autoFocus
              />
            </div>
          )}
          <div className="max-h-64 overflow-auto">
            {visibleOptions.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">Καμία επιλογή διαθέσιμη</div>}
            {!optionSearch && <div className="px-3 py-1.5 text-[11px] text-gray-400 border-b border-gray-100">Επιλέξτε όσες θέλετε — η λίστα παραμένει ανοιχτή</div>}
            {visibleOptions.length > 1 && !optionSearch && (
              <button
                type="button"
                onClick={() => onChange(selected.length === options.length ? [] : options.map(o => o.value))}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 border-b border-gray-100"
              >
                {selected.length === options.length ? '☐ Αποεπιλογή Όλων' : '☑ Επιλογή Όλων'}
              </button>
            )}
            {visibleOptions.map(opt => (
              <label key={opt.value} className="flex items-start gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} className="rounded mt-0.5 shrink-0" />
                <span className="whitespace-normal">{opt.label}</span>
              </label>
            ))}
          </div>
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
