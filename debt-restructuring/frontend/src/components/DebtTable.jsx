import { TrashIcon, PlusIcon } from '@heroicons/react/24/outline'
import { fmt, creditorDisplayName } from '../utils/calculations'

const DEBT_TYPES = ['Τράπεζα', 'Εφορία', 'Ασφαλιστικά Ταμεία']
const DEBT_STATUSES = ['Ενήμερη', 'Ληξιπρόθεσμη']

// Category definitions per public creditor type
const PUB_CATS = {
  'Εφορία': [
    { key: 'nonErasable', label: 'ΜΗ ΔΙΑΓΡ. Βασική',    hint: 'ΦΠΑ, ΦΜΥ',              badgeClass: 'bg-red-100 text-red-700' },
    { key: 'otherBasic',  label: 'ΔΙΑΓΡ. 75% Βασική',   hint: 'εισόδημα, ΕΝΦΙΑ, ΓΕΜΗ', badgeClass: 'bg-amber-100 text-amber-700' },
    { key: 'surcharges',  label: 'ΔΙΑΓΡ. 85% Προσαυξ.', hint: '',                       badgeClass: 'bg-orange-100 text-orange-700' },
    { key: 'fines',       label: 'ΔΙΑΓΡ. 95% Πρόστιμα', hint: '',                       badgeClass: 'bg-green-100 text-green-800' },
  ],
  'Ασφαλιστικά Ταμεία': [
    { key: 'nonErasable', label: 'ΜΗ ΔΙΑΓΡ. Βασική',    hint: 'εισφορές',               badgeClass: 'bg-red-100 text-red-700' },
    { key: 'surcharges',  label: 'ΔΙΑΓΡ. 85% Προσαυξ.', hint: '',                       badgeClass: 'bg-orange-100 text-orange-700' },
  ],
}

function emptyPubCategories(type) {
  if (type === 'Εφορία')            return { nonErasable: 0, otherBasic: 0, surcharges: 0, fines: 0 }
  if (type === 'Ασφαλιστικά Ταμεία') return { nonErasable: 0, surcharges: 0 }
  return null
}

function pubCatTotal(cats) {
  if (!cats) return 0
  return Object.values(cats).reduce((a, v) => a + (v || 0), 0)
}

export function emptyDebt() {
  return {
    id: crypto.randomUUID(),
    amount: 0,
    interestPct: 0,
    type: 'Τράπεζα',
    creditorName: '',
    status: 'Ληξιπρόθεσμη',
    mortgaged: false,
    propertyValue: 0,
    pubCategories: null,
  }
}

// Controlled numeric input — display always reflects current value
function CatInput({ value, onChange, className = '' }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      className={`input text-center text-xs ${className}`}
      placeholder="0"
      value={value > 0 ? value.toLocaleString('el-GR') : ''}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, '')
        onChange(raw ? parseInt(raw) : 0)
      }}
    />
  )
}

function NumInput({ value, onChange, placeholder = '0', className = '' }) {
  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '')
    onChange(raw ? parseInt(raw) : 0)
  }
  return (
    <input type="text" inputMode="numeric" className={`input text-center ${className}`}
      placeholder={placeholder}
      value={value > 0 ? value.toLocaleString('el-GR') : ''}
      onChange={handleChange} />
  )
}

function PublicBreakdown({ debt, onChange }) {
  const cats = PUB_CATS[debt.type] || []
  const pc = debt.pubCategories || emptyPubCategories(debt.type) || {}

  const update = (key, val) => {
    const newCats = { ...pc, [key]: val }
    onChange({ ...debt, pubCategories: newCats, amount: pubCatTotal(newCats) })
  }

  return (
    <div className="space-y-1">
      {cats.map(({ key, label, hint, badgeClass }) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${badgeClass}`}>{label}</span>
          <CatInput value={pc[key] || 0} onChange={(v) => update(key, v)} className="w-24" />
          {hint && <span className="text-[10px] text-gray-400 whitespace-nowrap">{hint}</span>}
        </div>
      ))}
    </div>
  )
}

function DebtRow({ debt, onChange, onDelete }) {
  const isBank = debt.type === 'Τράπεζα'
  const hasPubCats = !isBank && debt.pubCategories != null
  const interestPct = debt.interestPct || 0
  const prinAmt = debt.amount * (100 - interestPct) / 100
  const intAmt = debt.amount * interestPct / 100

  const handleTypeChange = (newType) => {
    const isNewPublic = newType === 'Εφορία' || newType === 'Ασφαλιστικά Ταμεία'
    onChange({
      ...debt,
      type: newType,
      creditorName: '',
      pubCategories: isNewPublic ? emptyPubCategories(newType) : null,
      amount: isNewPublic ? 0 : debt.amount,
      mortgaged: false,
      propertyValue: 0,
    })
  }

  return (
    <tr className="border-b border-gray-100 hover:bg-blue-50/40">
      {/* Amount */}
      <td className="td px-2 py-2 min-w-[130px]">
        {hasPubCats ? (
          <div className="text-center py-1">
            <div className="text-sm font-bold text-gray-800">{fmt(debt.amount)}</div>
            <div className="text-[10px] text-gray-400">αυτόματο άθροισμα</div>
          </div>
        ) : (
          <NumInput value={debt.amount} onChange={(v) => onChange({ ...debt, amount: v })} placeholder="π.χ. 50000" />
        )}
      </td>

      {/* Capital / Interest split OR Public category breakdown */}
      <td className="td px-2 py-2 min-w-[260px]">
        {hasPubCats ? (
          <PublicBreakdown key={debt.type} debt={debt} onChange={onChange} />
        ) : (
          <div className="flex flex-col gap-1">
            <input type="range" min="0" max="100" value={interestPct}
              onChange={(e) => onChange({ ...debt, interestPct: +e.target.value })}
              className="w-full accent-blue-600" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{isBank ? 'Κεφ.' : 'Βασική'} {100 - interestPct}% <b>{fmt(prinAmt)}</b></span>
              <span>{isBank ? 'Τόκ.' : 'Τόκοι & Προσαυξ.'} {interestPct}% <b>{fmt(intAmt)}</b></span>
            </div>
          </div>
        )}
      </td>

      {/* Type */}
      <td className="td px-2 py-2 min-w-[140px]">
        <select className="input text-center text-sm" value={debt.type} onChange={(e) => handleTypeChange(e.target.value)}>
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

      {/* Mortgaged — hidden for public debts */}
      <td className="td px-2 py-2">
        {isBank ? (
          <input type="checkbox" checked={debt.mortgaged}
            onChange={(e) => onChange({ ...debt, mortgaged: e.target.checked, propertyValue: e.target.checked ? debt.propertyValue : 0 })}
            className="w-4 h-4 accent-blue-600" />
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Property value */}
      <td className="td px-2 py-2 min-w-[130px]">
        {isBank && debt.mortgaged ? (
          <NumInput value={debt.propertyValue} onChange={(v) => onChange({ ...debt, propertyValue: v })} placeholder="Αξία €" />
        ) : isBank && debt.amount > 0 ? (
          <span className="text-xs text-red-500 font-semibold">⚠️ Ανασφάλιστη</span>
        ) : null}
      </td>

      {/* Coverage chip — banks only */}
      <td className="td px-2 py-2 min-w-[90px]">
        {isBank && debt.mortgaged && debt.propertyValue > 0 && debt.amount > 0 && (() => {
          const net = Math.floor(debt.propertyValue * 0.97)
          const pct = net >= debt.amount ? 100 : Math.round(net * 100 / debt.amount)
          return (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pct >= 100 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {pct >= 100 ? '✅ 100%' : `${pct}%`}
            </span>
          )
        })()}
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
  const updateDebt = (id, updated) => onChange(debts.map((d) => d.id === id ? updated : d))
  const deleteDebt = (id) => onChange(debts.filter((d) => d.id !== id))
  const addDebt = () => onChange([...debts, emptyDebt()])

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px]">
          <thead>
            <tr className="border-b-2 border-blue-100">
              <th className="th">Ποσό Οφειλής</th>
              <th className="th">Κατηγορίες / Κεφάλαιο-Τόκοι</th>
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
            {debts.map((d) => (
              <DebtRow key={d.id} debt={d}
                onChange={(updated) => updateDebt(d.id, updated)}
                onDelete={() => deleteDebt(d.id)} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <div className="text-xs text-gray-400 mb-2 px-1">
          Τράπεζες: 80% κεφ. + 100% τόκων &nbsp;·&nbsp;
          ΑΑΔΕ: ΦΠΑ/ΦΜΥ 0% · λοιπές βασικές 75% · προσαυξ. 85% · πρόστιμα 95% &nbsp;·&nbsp;
          ΕΦΚΑ: εισφορές 0% · προσαυξ. 85%
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
