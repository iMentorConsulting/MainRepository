'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, ChevronDown, ChevronUp, Check, Filter } from 'lucide-react'

export interface KadOption {
  code: string
  descr: string
}

// KAD section definitions (prefix range → name + color)
const KAD_SECTIONS: { label: string; prefixes: number[]; color: string; bg: string }[] = [
  { label: 'Αγροτικά & Αλιεία', prefixes: [1,2,3,5,6,7,8,9], color: 'text-green-800', bg: 'bg-green-50 border-green-200' },
  { label: 'Μεταποίηση', prefixes: Array.from({length:24}, (_,i)=>i+10), color: 'text-orange-800', bg: 'bg-orange-50 border-orange-200' },
  { label: 'Ενέργεια & Νερό', prefixes: [35,36,37,38,39], color: 'text-yellow-800', bg: 'bg-yellow-50 border-yellow-200' },
  { label: 'Κατασκευές', prefixes: [41,42,43], color: 'text-amber-800', bg: 'bg-amber-50 border-amber-200' },
  { label: 'Εμπόριο', prefixes: [45,46,47], color: 'text-blue-800', bg: 'bg-blue-50 border-blue-200' },
  { label: 'Μεταφορές & Αποθήκευση', prefixes: [49,50,51,52,53], color: 'text-cyan-800', bg: 'bg-cyan-50 border-cyan-200' },
  { label: 'Τουρισμός & Καταλύματα', prefixes: [55], color: 'text-sky-800', bg: 'bg-sky-50 border-sky-200' },
  { label: 'Εστίαση', prefixes: [56], color: 'text-rose-800', bg: 'bg-rose-50 border-rose-200' },
  { label: 'Πληροφορία & Επικοινωνία', prefixes: [58,59,60,61,62,63], color: 'text-violet-800', bg: 'bg-violet-50 border-violet-200' },
  { label: 'Χρηματοοικονομικά', prefixes: [64,65,66], color: 'text-indigo-800', bg: 'bg-indigo-50 border-indigo-200' },
  { label: 'Ακίνητα', prefixes: [68], color: 'text-teal-800', bg: 'bg-teal-50 border-teal-200' },
  { label: 'Επαγγελματικές & Επιστήμες', prefixes: [69,70,71,72,73,74,75], color: 'text-purple-800', bg: 'bg-purple-50 border-purple-200' },
  { label: 'Διοικητικές Υπηρεσίες', prefixes: [77,78,79,80,81,82], color: 'text-pink-800', bg: 'bg-pink-50 border-pink-200' },
  { label: 'Δημόσια Διοίκηση', prefixes: [84], color: 'text-slate-800', bg: 'bg-slate-50 border-slate-200' },
  { label: 'Εκπαίδευση', prefixes: [85], color: 'text-lime-800', bg: 'bg-lime-50 border-lime-200' },
  { label: 'Υγεία & Κοινωνική Μέριμνα', prefixes: [86,87,88], color: 'text-red-800', bg: 'bg-red-50 border-red-200' },
  { label: 'Πολιτισμός & Αθλητισμός', prefixes: [90,91,92,93], color: 'text-fuchsia-800', bg: 'bg-fuchsia-50 border-fuchsia-200' },
  { label: 'Άλλες Υπηρεσίες', prefixes: [94,95,96,97,98,99], color: 'text-gray-800', bg: 'bg-gray-50 border-gray-200' },
]

function getPrefix(code: string): number {
  const digits = code.replace(/\D/g, '')
  return parseInt(digits.slice(0, 2), 10) || 0
}

function getSectionForCode(code: string): number {
  const p = getPrefix(code)
  return KAD_SECTIONS.findIndex(s => s.prefixes.includes(p))
}

interface Props {
  options: KadOption[]
  selected: string[]
  onChange: (codes: string[]) => void
}

export function KadFilterButton({ options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">ΚΑΔ</label>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg bg-white hover:bg-gray-50 transition-colors ${
            selected.length > 0
              ? 'border-amber-400 text-amber-800 bg-amber-50'
              : 'border-gray-300 text-gray-600'
          }`}
        >
          <Filter size={13} className={selected.length > 0 ? 'text-amber-600' : 'text-gray-400'} />
          {selected.length === 0
            ? 'Όλοι οι ΚΑΔ'
            : `${selected.length} ΚΑΔ επιλεγμένοι`}
          <ChevronDown size={13} className="text-gray-400 ml-1" />
        </button>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 text-[11px] text-amber-600 hover:text-amber-800 underline"
          >
            Καθαρισμός
          </button>
        )}
      </div>

      {open && (
        <KadFilterModal
          options={options}
          selected={selected}
          onChange={v => { onChange(v); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function KadFilterModal({
  options,
  selected: initialSelected,
  onChange,
  onClose,
}: Props & { onClose: () => void }) {
  const [draft, setDraft] = useState<Set<string>>(new Set(initialSelected))
  const [search, setSearch] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const q = search.trim().toLowerCase()

  // Group options into sections
  const grouped = useMemo(() => {
    return KAD_SECTIONS.map((section, idx) => {
      let items = options.filter(o => section.prefixes.includes(getPrefix(o.code)))
      if (onlySelected) items = items.filter(o => draft.has(o.code))
      if (q) items = items.filter(o =>
        o.code.includes(q) ||
        o.descr.toLowerCase().includes(q)
      )
      return { section, idx, items }
    }).filter(g => g.items.length > 0)
  }, [options, q, onlySelected, draft])

  // Unclassified (prefix not in any section)
  const unclassified = useMemo(() => {
    let items = options.filter(o => getSectionForCode(o.code) === -1)
    if (onlySelected) items = items.filter(o => draft.has(o.code))
    if (q) items = items.filter(o => o.code.includes(q) || o.descr.toLowerCase().includes(q))
    return items
  }, [options, q, onlySelected, draft])

  function toggle(code: string) {
    setDraft(prev => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }

  function toggleSection(items: KadOption[]) {
    const codes = items.map(o => o.code)
    const allSelected = codes.every(c => draft.has(c))
    setDraft(prev => {
      const next = new Set(prev)
      if (allSelected) codes.forEach(c => next.delete(c))
      else codes.forEach(c => next.add(c))
      return next
    })
  }

  function selectAll() {
    const visible = grouped.flatMap(g => g.items).concat(unclassified)
    setDraft(prev => {
      const next = new Set(prev)
      visible.forEach(o => next.add(o.code))
      return next
    })
  }

  function clearAll() {
    if (q || onlySelected) {
      // Only clear what's visible
      const visible = new Set(grouped.flatMap(g => g.items).concat(unclassified).map(o => o.code))
      setDraft(prev => {
        const next = new Set(prev)
        visible.forEach(c => next.delete(c))
        return next
      })
    } else {
      setDraft(new Set())
    }
  }

  function apply() {
    onChange(Array.from(draft))
  }

  const totalVisible = grouped.reduce((s, g) => s + g.items.length, 0) + unclassified.length

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-12">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Φίλτρο ΚΑΔ</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {options.length} κωδικοί διαθέσιμοι · {draft.size} επιλεγμένοι
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Αναζήτηση κωδικού ή περιγραφής..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Only selected toggle */}
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={onlySelected}
              onChange={e => setOnlySelected(e.target.checked)}
              className="rounded border-gray-300 text-amber-500 focus:ring-amber-400"
            />
            Μόνο επιλεγμένοι
            {draft.size > 0 && (
              <span className="inline-flex items-center justify-center bg-amber-500 text-white text-[11px] font-bold rounded-full w-5 h-5">
                {draft.size}
              </span>
            )}
          </label>

          {/* Bulk actions */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={selectAll}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 border border-indigo-200"
            >
              ☑ Επιλογή όλων {q || onlySelected ? 'ορατών' : ''}
            </button>
            <button
              onClick={clearAll}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium px-2.5 py-1.5 rounded-lg hover:bg-gray-100 border border-gray-200"
            >
              ☐ Καθαρισμός {q || onlySelected ? 'ορατών' : 'όλων'}
            </button>
          </div>
        </div>

        {/* Results count hint */}
        {(q || onlySelected) && (
          <div className="px-5 py-2 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
            {totalVisible} αποτελέσματα
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
          {grouped.length === 0 && unclassified.length === 0 && (
            <div className="text-center text-gray-400 py-12 text-sm">Δεν βρέθηκαν κωδικοί</div>
          )}

          {grouped.map(({ section, idx, items }) => {
            const isCollapsed = collapsed.has(idx) && !q
            const sectionSelected = items.filter(o => draft.has(o.code)).length
            const allSectionSelected = sectionSelected === items.length && items.length > 0

            return (
              <div key={idx} className={`border rounded-xl overflow-hidden ${section.bg}`}>
                {/* Section header */}
                <div
                  className={`flex items-center justify-between px-4 py-2.5 cursor-pointer select-none`}
                  onClick={() => {
                    if (q) return
                    setCollapsed(prev => {
                      const next = new Set(prev)
                      next.has(idx) ? next.delete(idx) : next.add(idx)
                      return next
                    })
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={allSectionSelected}
                      ref={el => { if (el) el.indeterminate = sectionSelected > 0 && !allSectionSelected }}
                      onChange={() => toggleSection(items)}
                      onClick={e => e.stopPropagation()}
                      className="rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                    />
                    <span className={`text-sm font-semibold ${section.color}`}>{section.label}</span>
                    <span className="text-xs text-gray-500 font-normal">({items.length})</span>
                    {sectionSelected > 0 && (
                      <span className={`inline-flex items-center justify-center text-[11px] font-bold rounded-full w-5 h-5 bg-amber-500 text-white`}>
                        {sectionSelected}
                      </span>
                    )}
                  </div>
                  {!q && (
                    <span className="text-gray-400">
                      {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                    </span>
                  )}
                </div>

                {/* Section items */}
                {!isCollapsed && (
                  <div className="bg-white border-t border-gray-100 divide-y divide-gray-50">
                    {items.map(opt => (
                      <label
                        key={opt.code}
                        className="flex items-start gap-3 px-4 py-2 hover:bg-amber-50/60 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={draft.has(opt.code)}
                          onChange={() => toggle(opt.code)}
                          className="rounded border-gray-300 text-amber-500 focus:ring-amber-400 mt-0.5 shrink-0"
                        />
                        <span className="font-mono text-xs text-gray-400 shrink-0 mt-0.5 w-14">{opt.code}</span>
                        <span className="text-sm text-gray-700 leading-snug">{opt.descr}</span>
                        {draft.has(opt.code) && (
                          <Check size={13} className="text-amber-500 shrink-0 ml-auto mt-0.5" />
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Unclassified */}
          {unclassified.length > 0 && (
            <div className="border rounded-xl overflow-hidden bg-gray-50 border-gray-200">
              <div className="flex items-center gap-2.5 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={unclassified.every(o => draft.has(o.code))}
                  ref={el => {
                    if (el) {
                      const sel = unclassified.filter(o => draft.has(o.code)).length
                      el.indeterminate = sel > 0 && sel < unclassified.length
                    }
                  }}
                  onChange={() => toggleSection(unclassified)}
                  className="rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                />
                <span className="text-sm font-semibold text-gray-600">Λοιποί</span>
                <span className="text-xs text-gray-400">({unclassified.length})</span>
              </div>
              <div className="bg-white border-t border-gray-100 divide-y divide-gray-50">
                {unclassified.map(opt => (
                  <label
                    key={opt.code}
                    className="flex items-start gap-3 px-4 py-2 hover:bg-amber-50/60 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={draft.has(opt.code)}
                      onChange={() => toggle(opt.code)}
                      className="rounded border-gray-300 text-amber-500 focus:ring-amber-400 mt-0.5 shrink-0"
                    />
                    <span className="font-mono text-xs text-gray-400 shrink-0 mt-0.5 w-14">{opt.code}</span>
                    <span className="text-sm text-gray-700 leading-snug">{opt.descr}</span>
                    {draft.has(opt.code) && (
                      <Check size={13} className="text-amber-500 shrink-0 ml-auto mt-0.5" />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Selected preview strip */}
        {draft.size > 0 && (
          <div className="border-t border-gray-100 px-5 py-2.5 bg-amber-50 flex items-start gap-2 flex-wrap">
            <span className="text-xs font-semibold text-amber-700 shrink-0 mt-0.5">Επιλεγμένοι:</span>
            <div className="flex flex-wrap gap-1 flex-1 max-h-16 overflow-y-auto">
              {Array.from(draft).map(code => (
                <span
                  key={code}
                  className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[11px] font-mono rounded px-1.5 py-0.5 border border-amber-200"
                >
                  {code}
                  <button onClick={() => toggle(code)} className="text-amber-500 hover:text-amber-900 leading-none">×</button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100"
          >
            Ακύρωση
          </button>
          <div className="flex items-center gap-3">
            {draft.size > 0 && (
              <span className="text-xs text-amber-700 font-medium">
                {draft.size} ΚΑΔ επιλεγμένοι
              </span>
            )}
            <button
              onClick={apply}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Εφαρμογή Φίλτρου
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
