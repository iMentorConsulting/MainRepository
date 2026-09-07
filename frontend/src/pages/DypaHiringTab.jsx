import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { getDypaHiringData, updateDypaHiringData } from '../api'

function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
      {title && <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">{title}</h3>}
      {children}
    </div>
  )
}

function FieldRow({ label, children }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-xs text-gray-500 w-44 shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

const PERIOD_LABELS = ['1ο', '2ο', '3ο', '4ο', '5ο', '6ο', '7ο', '8ο', '9ο']

export default function DypaHiringTab({ caseId }) {
  const [data, setData] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await getDypaHiringData(caseId)
      setData(d)
    } catch (e) {
      toast.error('Αδυναμία φόρτωσης στοιχείων ΔΥΠΑ Πρόσληψης')
    }
  }, [caseId])

  useEffect(() => { load() }, [load])

  const save = async (patch) => {
    setSaving(true)
    try {
      const updated = await updateDypaHiringData(caseId, patch)
      setData(updated)
      toast.success('Αποθηκεύτηκε')
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  if (!data) return <div className="p-6 text-sm text-gray-400">Φόρτωση...</div>

  const totalSlots = (data.program_duration_months || 12) / 2
  const submitted = data.requests_submitted || 0
  const paid = data.periods_paid || 0

  return (
    <div className="space-y-4">
      {/* Basic info */}
      <Card title="Στοιχεία Προγράμματος Πρόσληψης">
        <FieldRow label="Διάρκεια προγράμματος">
          <select
            className="text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={data.program_duration_months || 12}
            disabled={saving}
            onChange={e => save({ program_duration_months: parseInt(e.target.value) })}
          >
            <option value={12}>12 μήνες (6 δίμηνα)</option>
            <option value={18}>18 μήνες (9 δίμηνα)</option>
          </select>
        </FieldRow>
        <FieldRow label="Ημ/νία Πρόσληψης">
          <input
            type="date"
            className="text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={data.hiring_date || ''}
            disabled={saving}
            onChange={e => save({ hiring_date: e.target.value || '' })}
          />
        </FieldRow>
      </Card>

      {/* Bi-monthly requests tracker */}
      <Card title="Δίμηνα — Αιτήματα Πληρωμής ΔΥΠΑ">
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-blue-700">{submitted}<span className="text-base font-normal text-blue-500">/{totalSlots}</span></div>
            <div className="text-xs text-blue-600 mt-1">Αιτήματα Υποβληθέντα</div>
          </div>
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-green-700">{paid}<span className="text-base font-normal text-green-500">/{totalSlots}</span></div>
            <div className="text-xs text-green-600 mt-1">Δίμηνα Πληρωμένα</div>
          </div>
        </div>

        {/* Period grid */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {Array.from({ length: totalSlots }, (_, i) => {
            const periodNum = i + 1
            const isPaid = periodNum <= paid
            const isSubmitted = !isPaid && periodNum <= submitted
            return (
              <div
                key={i}
                className={`rounded-xl border p-3 text-center text-xs font-semibold ${
                  isPaid ? 'bg-green-100 border-green-300 text-green-800' :
                  isSubmitted ? 'bg-blue-100 border-blue-300 text-blue-800' :
                  'bg-gray-50 border-gray-200 text-gray-400'
                }`}
              >
                <div className="text-lg mb-0.5">
                  {isPaid ? '✓' : isSubmitted ? '⏳' : '·'}
                </div>
                <div>{PERIOD_LABELS[i]} Δίμηνο</div>
                <div className="text-xs font-normal mt-0.5">
                  {isPaid ? 'Πληρωμένο' : isSubmitted ? 'Υποβλήθηκε' : 'Εκκρεμεί'}
                </div>
              </div>
            )
          })}
        </div>

        {/* Counters */}
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-40">
            <label className="text-xs text-gray-500 block mb-1">Αιτήματα υποβληθέντα</label>
            <div className="flex items-center gap-2">
              <button
                className="w-8 h-8 rounded-lg border bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold disabled:opacity-40"
                disabled={saving || submitted <= 0}
                onClick={() => save({ requests_submitted: submitted - 1 })}
              >−</button>
              <span className="text-lg font-bold w-8 text-center">{submitted}</span>
              <button
                className="w-8 h-8 rounded-lg border bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold disabled:opacity-40"
                disabled={saving || submitted >= totalSlots}
                onClick={() => save({ requests_submitted: submitted + 1 })}
              >+</button>
            </div>
          </div>
          <div className="flex-1 min-w-40">
            <label className="text-xs text-gray-500 block mb-1">Δίμηνα πληρωμένα από ΔΥΠΑ</label>
            <div className="flex items-center gap-2">
              <button
                className="w-8 h-8 rounded-lg border bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold disabled:opacity-40"
                disabled={saving || paid <= 0}
                onClick={() => save({ periods_paid: paid - 1 })}
              >−</button>
              <span className="text-lg font-bold w-8 text-center">{paid}</span>
              <button
                className="w-8 h-8 rounded-lg border bg-green-50 hover:bg-green-100 text-green-700 font-bold disabled:opacity-40"
                disabled={saving || paid >= totalSlots}
                onClick={() => save({ periods_paid: paid + 1 })}
              >+</button>
            </div>
          </div>
        </div>

        {submitted > paid && (
          <div className="mt-4 text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
            {submitted - paid} {submitted - paid === 1 ? 'αίτημα υποβλήθηκε' : 'αιτήματα υποβλήθηκαν'} αλλά δεν έχουν εισπραχθεί ακόμα από τη ΔΥΠΑ.
          </div>
        )}
      </Card>

      {/* Notes */}
      <Card title="Σημειώσεις">
        <textarea
          className="w-full text-sm border rounded-lg px-3 py-2 h-24 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          placeholder="Σημειώσεις για το πρόγραμμα πρόσληψης..."
          value={data.notes || ''}
          disabled={saving}
          onChange={e => setData(prev => ({ ...prev, notes: e.target.value }))}
          onBlur={e => save({ notes: e.target.value })}
        />
      </Card>
    </div>
  )
}
