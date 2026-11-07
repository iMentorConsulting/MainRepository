import { useEffect, useState } from 'react'
import { getProperties } from '../api'

const chip = (state) => {
  if (state === 'all') return 'bg-blue-600 text-white border-blue-600'
  if (state === 'some') return 'bg-blue-50 text-blue-800 border-blue-300'
  return 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
}
const naturalKey = (n) => (n || '').split(/(\d+)/).map(t => /^\d+$/.test(t) ? t.padStart(6, '0') : t.toLowerCase()).join('')

// Unit selector grouped property → room type → units; a type chip selects all its units at once
export default function UnitGroupFilter({ units, selected, onChange }) {
  const [props, setProps] = useState(null)
  const [open, setOpen] = useState({})
  useEffect(() => { getProperties().then(r => setProps(r.data)).catch(() => setProps([])) }, [])

  const visible = new Set(units.map(u => u.id))
  const stateOf = (ids) => {
    const n = ids.filter(id => selected.includes(id)).length
    return n === 0 ? 'none' : n === ids.length ? 'all' : 'some'
  }
  const toggleMany = (ids) => {
    const allOn = ids.every(id => selected.includes(id))
    onChange(allOn ? selected.filter(id => !ids.includes(id)) : [...new Set([...selected, ...ids])])
  }
  const toggleOne = (id) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])

  const groups = (props || []).map(p => ({
    ...p,
    types: p.room_types.map(t => ({
      ...t,
      units: t.units.filter(u => visible.has(u.id)).sort((a, b) => naturalKey(a.name).localeCompare(naturalKey(b.name))),
    })).filter(t => t.units.length),
  })).filter(p => p.types.length)
  const grouped = new Set(groups.flatMap(g => g.types.flatMap(t => t.units.map(u => u.id))))
  const loose = units.filter(u => !grouped.has(u.id))

  const unitChip = (u) => (
    <button key={u.id} onClick={() => toggleOne(u.id)}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${chip(selected.includes(u.id) ? 'all' : 'none')}`}>
      {u.name}
    </button>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-2.5">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-medium text-gray-500 mr-1">Μονάδες:</span>
        <button onClick={() => onChange([])}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${chip(selected.length === 0 ? 'all' : 'none')}`}>
          Όλες
        </button>
        {!props && units.map(unitChip)}
      </div>

      {props && groups.map(g => {
        const gIds = g.types.flatMap(t => t.units.map(u => u.id))
        return (
          <div key={g.id} className="space-y-1.5">
            {groups.length > 1 && (
              <button onClick={() => toggleMany(gIds)}
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide border transition-colors ${chip(stateOf(gIds))}`}>
                {g.name}
              </button>
            )}
            <div className="flex flex-wrap gap-2 items-start">
              {g.types.map(t => {
                if (t.units.length === 1) return unitChip(t.units[0])
                const ids = t.units.map(u => u.id)
                const st = stateOf(ids)
                const n = ids.filter(id => selected.includes(id)).length
                const isOpen = !!open[t.id]
                return (
                  <div key={t.id} className={`flex flex-wrap items-center gap-1.5 ${isOpen ? 'basis-full' : ''}`}>
                    <span className={`inline-flex items-center rounded-full border text-xs font-medium overflow-hidden ${chip(st)}`}>
                      <button onClick={() => toggleMany(ids)} className="pl-3 pr-2 py-1">
                        {t.name} <span className="opacity-70 tabular-nums">{st === 'some' ? `${n}/${ids.length}` : ids.length}</span>
                      </button>
                      <button onClick={() => setOpen(o => ({ ...o, [t.id]: !o[t.id] }))}
                        title={isOpen ? 'Σύμπτυξη' : 'Επιλογή μεμονωμένων μονάδων'}
                        className="px-2 py-1 border-l border-black/10 opacity-80 hover:opacity-100">
                        {isOpen ? '▾' : '▸'}
                      </button>
                    </span>
                    {isOpen && t.units.map(unitChip)}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {props && loose.length > 0 && <div className="flex flex-wrap gap-2">{loose.map(unitChip)}</div>}
    </div>
  )
}
