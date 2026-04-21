import { useState } from 'react'
import { TrashIcon, PlusIcon } from '@heroicons/react/24/outline'
import { fmt, creditorDisplayName } from '../utils/calculations'

const DEBT_TYPES = ['Τράπεζα', 'Εφορία', 'Ασφαλιστικά Ταμεία']
const DEBT_STATUSES = ['Ενήμερη', 'Ληξιπρόθεσμη']

export function emptyDebt() {
  return {
    id: crypto.randomUUID(),
    amount: 0,
    interestPct: 0,
    surchargesPct: 0,
    finesPct: 0,
    type: 'Τράπεζα',
    creditorName: '',
    status: 'Ληξιπρόθεσμη',
    mortgaged: false,
    propertyValue: 0,
  }
}

function NumInput({ value, onChange, placeholder = '0', className = '' }) {
  const [display, setDisplay] = useState(value > 0 ? value.toLocaleString('el-GR') : '')
  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '')
    setDisplay(raw ? parseInt(raw).toLocaleString('el-GR') : '')
    onChange(raw ? parseInt(raw) : 0)
  }
  return (
    <input type="text" inputMode="numeric" className={`input text-center ${className}`}
      placeholder={placeholder} value={display} onChange={handleChange} />
  )
}

function PctInput({ label, value, onChange, max = 100 }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
      <input type="number" min="0" max={max} value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(0, +e.target.value)))}
        className="input text-center text-sm w-16" />
      <span className="text-xs text-gray-400">%</span>
    </div>
  )
}

function DebtRow({ debt, onChange, onDelete, coverage }) {
  const isBank = debt.type === 'Τράπεζα'
  const isTax = !isBank

  const surchargesPct = debt.surchargesPct || 0
  const finesPct = debt.finesPct || 0
  const interestPct = debt.interestPct || 0

  const basicPct = isTax ? Math.max(0, 100 - surchargesPct - finesPct) : (100 - interestPct)
  const basicAmt = debt.amount * basicPct / 100
  const surchargeAmt = debt.amount * surchargesPct / 100
  const finesAmt = debt.amount * finesPct / 100
  const intAmt = debt.amount * interestPct / 100

  return (
    <tr className="border-b border-gray-100 hover:bg-blue-50/40">
      {/* Amount */}
      <td className="td px-2 py-2 min-w-[130px]">
        <NumInput value={debt.amount} onChange={(v) => onChange({ ...debt, amount: v })} placeholder="π.χ. 50000" />
      </td>

      {/* Capital / Interest split */}
      <td className="td px-2 py-2 min-w-[200px]">
        {isBank ? (
          <div className="flex flex-col gap-1">
            <input type="range" min="0" max="100" value={interestPct}
              onChange={(e) => onChange({ ...debt, interestPct: +e.target.value })}
              className="w-full accent-blue-600" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Κεφ. {100 - interestPct}% <b>{fmt(basicAmt)}</b></span>
              <span>Τόκ. {interestPct}% <b>{fmt(intAmt)}</b></span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <PctInput label="Προσαυξήσεις" value={surchargesPct}
              onChange={(v) => onChange({ ...debt, surchargesPct: v })} max={100 - finesPct} />
            <PctInput label="Πρόστιμα" value={finesPct}
              onChange={(v) => onChange({ ...debt, finesPct: v })} max={100 - surchargesPct} />
            <div className="text-xs text-gray-400 pl-1">
              Βασική: {basicPct}% <b>{fmt(basicAmt)}</b>
              {surchargesPct > 0 && <span> · Προσ: {fmt(surchargeAmt)}</span>}
              {finesPct > 0 && <span> · Πρόστ: {fmt(finesAmt)}</span>}
            </div>
          </div>
        )}
      </td>

      {/* Type */}
      <td className="td px-2 py-2 min-w-[140px]">
        <select className="input text-center text-sm" value={debt.type}
          onChange={(e) => onChange({ ...debt, type: e.target.value, creditorName: '' })}>
          {DEBT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </td>

      {/* Creditor name */}
      <td className="td px-2 py-2 min-w-[130px]">
        {isBank ? (
          <input type="text" className="input text-center text-sm" placeholder="π.χ. Alpha Bank"
            value={debt.creditorName} onChange={(e) => onChange({ ...debt, creditorName: e.target.value })} />
        ) : (
          <span className="text-xs text-gray-400 italic">{creditorDisplayName(debt.type)}</span>
        )}
      </td>

      {/* Status */}
      <td className="td px-2 py-2 min-w-[120px]">
        <select className="input text-center text-sm" value={debt.status}
          onChange={(e) => onChange({ ...debt, status: e.target.value })}>
          {DEBT_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </td>

      {/* Mortgaged */}
      <td className="td px-2 py-2">
        <input type="checkbox" checked={debt.mortgaged}
          onChange={(e) => onChange({ ...debt, mortgaged: e.target.checked, propertyValue: e.target.checked ? debt.propertyValue : 0 })}
          className="w-4 h-4 accent-blue-600" />
      </td>

      {/* Property value */}
      <td className="td px-2 py-2 min-w-[130px]">
        {debt.mortgaged ? (
          <NumInput value={debt.propertyValue} onChange={(v) => onChange({ ...debt, propertyValue: v })} placeholder="Αξία €" />
        ) : (
          debt.amount > 0 && <span className="text-xs text-red-500 font-semibold">⚠️ Ανασφάλιστη</span>
        )}
      </td>

      {/* Coverage chip */}
      <td className="td px-2 py-2 min-w-[90px]">
        {coverage != null && debt.amount > 0 && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${coverage >= debt.amount ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
            {coverage >= debt.amount ? '✅ 100%' : `${Math.round(coverage * 100 / debt.amount)}%`}
          </span>
        )}
      </td>

      {/* Delete */}
      <td className="td px-2 py-2">
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500">
          <TrashIcon className="w-4 h-4" />
        </button>
      </td>
    </tr>
  )
}

export default function DebtTable({ debts, onChange, calculations }) {
  const covMap = calculations?.covMap || {}
  const updateDebt = (id, updated) => onChange(debts.map((d) => d.id === id ? updated : d))
  const deleteDebt = (id) => onChange(debts.filter((d) => d.id !== id))
  const addDebt = () => onChange([...debts, emptyDebt()])

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b-2 border-blue-100">
              <th className="th">Ποσό Οφειλής</th>
              <th className="th">Κεφάλαιο / Τόκοι — Προσαυξ. / Πρόστ.</th>
              <th className="th">Είδος</th>
              <th className="th">Όνομα Τράπεζας</th>
              <th className="th">Κατάσταση</th>
              <th className="th">Ενυπόθηκο</th>
              <th className="th">Αξία Ακινήτου</th>
              <th className="th">Κάλυψη</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {debts.map((d, i) => (
              <DebtRow key={d.id} debt={d}
                onChange={(updated) => updateDebt(d.id, updated)}
                onDelete={() => deleteDebt(d.id)}
                coverage={covMap[i]} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <div className="text-xs text-gray-400 mb-2 px-1">
          Τράπεζες: διαγραφή έως 80% κεφαλαίου + 100% τόκων · ΑΑΔΕ/ΕΦΚΑ: 75% βασικής + 85% προσαυξήσεων + 95% προστίμων
        </div>
        <div className="text-center">
          <button onClick={addDebt} className="btn-primary gap-2 text-sm">
            <PlusIcon className="w-4 h-4" /> Προσθήκη Οφειλής
          </button>
        </div>
      </div>
    </div>
  )
}
