import { useState, useEffect } from 'react'
import { getPipelines, updatePipeline } from '../api'
import {
  PlusIcon, TrashIcon, CheckIcon, ArrowUpIcon, ArrowDownIcon,
  AdjustmentsHorizontalIcon, ChevronDownIcon, ChevronUpIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const PHASE_COLORS = ['blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'teal']
const COLOR_CLASSES = {
  blue:   'bg-blue-50 border-blue-200 text-blue-700',
  green:  'bg-green-50 border-green-200 text-green-700',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
  pink:   'bg-pink-50 border-pink-200 text-pink-700',
  teal:   'bg-teal-50 border-teal-200 text-teal-700',
}

function PhaseCard({ phase, phaseIdx, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [collapsed, setCollapsed] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const colorClass = COLOR_CLASSES[phase.color] || COLOR_CLASSES.blue

  const addStatus = () => {
    const trimmed = newStatus.trim().toUpperCase()
    if (!trimmed) return
    if (phase.statuses.includes(trimmed)) { toast.error('Αυτό το status υπάρχει ήδη'); return }
    onUpdate({ ...phase, statuses: [...phase.statuses, trimmed] })
    setNewStatus('')
  }

  const removeStatus = (idx) => {
    const next = phase.statuses.filter((_, i) => i !== idx)
    onUpdate({ ...phase, statuses: next })
  }

  const moveStatus = (idx, dir) => {
    const arr = [...phase.statuses]
    const swap = idx + dir
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    onUpdate({ ...phase, statuses: arr })
  }

  return (
    <div className={`border rounded-xl overflow-hidden ${colorClass}`}>
      {/* Phase header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex gap-1">
          <button onClick={onMoveUp} disabled={isFirst} className="p-1 rounded hover:bg-black/10 disabled:opacity-30">
            <ArrowUpIcon className="w-3.5 h-3.5" />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="p-1 rounded hover:bg-black/10 disabled:opacity-30">
            <ArrowDownIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        <input
          className="flex-1 font-semibold text-sm bg-transparent border-b border-current/30 focus:outline-none focus:border-current py-0.5"
          value={phase.label}
          onChange={e => onUpdate({ ...phase, label: e.target.value })}
        />
        <select
          className="text-xs bg-transparent border border-current/30 rounded px-1.5 py-0.5 focus:outline-none"
          value={phase.color}
          onChange={e => onUpdate({ ...phase, color: e.target.value })}
        >
          {PHASE_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs opacity-60">{phase.statuses.length} statuses</span>
        <button onClick={() => setCollapsed(v => !v)} className="p-1 rounded hover:bg-black/10">
          {collapsed ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronUpIcon className="w-4 h-4" />}
        </button>
        <button onClick={onDelete} className="p-1 rounded hover:bg-red-200 text-red-600">
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>

      {!collapsed && (
        <div className="bg-white px-4 pb-3 pt-1 space-y-1.5">
          {phase.statuses.map((s, idx) => (
            <div key={idx} className="flex items-center gap-2 group">
              <div className="flex gap-0.5">
                <button onClick={() => moveStatus(idx, -1)} disabled={idx === 0}
                  className="p-0.5 rounded text-gray-300 hover:text-gray-600 disabled:opacity-20">
                  <ArrowUpIcon className="w-3 h-3" />
                </button>
                <button onClick={() => moveStatus(idx, 1)} disabled={idx === phase.statuses.length - 1}
                  className="p-0.5 rounded text-gray-300 hover:text-gray-600 disabled:opacity-20">
                  <ArrowDownIcon className="w-3 h-3" />
                </button>
              </div>
              <input
                className="flex-1 text-sm text-gray-700 font-medium bg-transparent border border-transparent rounded px-1 py-0.5 focus:outline-none focus:border-gray-300 focus:bg-gray-50 uppercase"
                value={s}
                onChange={e => {
                  const arr = [...phase.statuses]
                  arr[idx] = e.target.value.toUpperCase()
                  onUpdate({ ...phase, statuses: arr })
                }}
                onBlur={e => {
                  const val = e.target.value.trim().toUpperCase()
                  if (!val) { removeStatus(idx); return }
                  const arr = [...phase.statuses]
                  arr[idx] = val
                  onUpdate({ ...phase, statuses: arr })
                }}
              />
              <button onClick={() => removeStatus(idx)}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity">
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Add status */}
          <div className="flex gap-2 pt-1">
            <input
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 uppercase"
              placeholder="Νέο status..."
              value={newStatus}
              onChange={e => setNewStatus(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addStatus()}
            />
            <button onClick={addStatus}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
              <PlusIcon className="w-4 h-4" />
              Προσθήκη
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProgramEditor({ programKey, config, label, onSaved }) {
  const [phases, setPhases] = useState([])
  const [extraStatuses, setExtraStatuses] = useState([])
  const [newExtra, setNewExtra] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setPhases(config.phases ? JSON.parse(JSON.stringify(config.phases)) : [])
    setExtraStatuses(config.extra_statuses || [])
    setDirty(false)
  }, [config])

  const mark = () => setDirty(true)

  const updatePhase = (idx, updated) => { setPhases(prev => prev.map((p, i) => i === idx ? updated : p)); mark() }
  const deletePhase = (idx) => { setPhases(prev => prev.filter((_, i) => i !== idx)); mark() }
  const movePhase = (idx, dir) => {
    setPhases(prev => {
      const arr = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= arr.length) return arr;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]]
      return arr
    })
    mark()
  }

  const addPhase = () => {
    const id = `PHASE_${Date.now()}`
    setPhases(prev => [...prev, { id, label: 'Νέα Φάση', color: 'blue', statuses: [] }])
    mark()
  }

  const addExtra = () => {
    const trimmed = newExtra.trim().toUpperCase()
    if (!trimmed) return
    if (extraStatuses.includes(trimmed)) { toast.error('Υπάρχει ήδη'); return }
    setExtraStatuses(prev => [...prev, trimmed])
    setNewExtra('')
    mark()
  }

  const removeExtra = (idx) => { setExtraStatuses(prev => prev.filter((_, i) => i !== idx)); mark() }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updatePipeline(programKey, { phases, extra_statuses: extraStatuses })
      toast.success('Αποθηκεύτηκε — οι αλλαγές ισχύουν αμέσως')
      setDirty(false)
      onSaved()
    } catch {
      toast.error('Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Phases */}
      <div className="space-y-3">
        {phases.map((phase, idx) => (
          <PhaseCard
            key={phase.id + idx}
            phase={phase}
            phaseIdx={idx}
            isFirst={idx === 0}
            isLast={idx === phases.length - 1}
            onUpdate={updated => updatePhase(idx, updated)}
            onDelete={() => deletePhase(idx)}
            onMoveUp={() => movePhase(idx, -1)}
            onMoveDown={() => movePhase(idx, 1)}
          />
        ))}
      </div>

      <button onClick={addPhase}
        className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 text-gray-500 rounded-xl hover:border-blue-400 hover:text-blue-600 text-sm w-full justify-center transition-colors">
        <PlusIcon className="w-4 h-4" />
        Προσθήκη Νέας Φάσης
      </button>

      {/* Extra statuses */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Ειδικές Καταστάσεις (εκτός pipeline)</h4>
        <div className="flex flex-wrap gap-2">
          {extraStatuses.map((s, idx) => (
            <span key={idx} className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 border border-gray-200 rounded-full text-sm text-gray-700">
              {s}
              <button onClick={() => removeExtra(idx)} className="text-gray-400 hover:text-red-500">
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 uppercase"
            placeholder="π.χ. ΠΑΓΩΜΕΝΗ ΥΠΟΘΕΣΗ"
            value={newExtra}
            onChange={e => setNewExtra(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addExtra()}
          />
          <button onClick={addExtra}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm font-semibold hover:bg-gray-700">
            <PlusIcon className="w-4 h-4" />
            Προσθήκη
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white rounded-xl font-semibold hover:bg-[#16305a] disabled:opacity-50 transition-colors"
        >
          <CheckIcon className="w-5 h-5" />
          {saving ? 'Αποθήκευση...' : dirty ? 'Αποθήκευση Αλλαγών' : 'Αποθηκεύτηκε'}
        </button>
      </div>
    </div>
  )
}

export default function PipelineAdmin() {
  const [pipelines, setPipelines] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeProgram, setActiveProgram] = useState('ΕΣΠΑ')

  const load = async () => {
    setLoading(true)
    try {
      const data = await getPipelines()
      setPipelines(data)
    } catch {
      toast.error('Σφάλμα φόρτωσης pipeline')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full" />
      </div>
    )
  }

  const programs = pipelines ? Object.keys(pipelines) : []

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <AdjustmentsHorizontalIcon className="w-7 h-7 text-[#1e3a5f]" />
          Διαχείριση Pipeline
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Επεξεργαστείτε τις φάσεις και τα statuses ανά κατηγορία προγράμματος. Οι αλλαγές ισχύουν αμέσως.
        </p>
      </div>

      {/* Program tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {programs.map(prog => (
          <button
            key={prog}
            onClick={() => setActiveProgram(prog)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              activeProgram === prog
                ? 'border-[#1e3a5f] text-[#1e3a5f]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {pipelines[prog]?.label || prog}
          </button>
        ))}
      </div>

      {pipelines && pipelines[activeProgram] && (
        <ProgramEditor
          key={activeProgram}
          programKey={activeProgram}
          config={pipelines[activeProgram]}
          label={pipelines[activeProgram].label || activeProgram}
          onSaved={load}
        />
      )}
    </div>
  )
}
