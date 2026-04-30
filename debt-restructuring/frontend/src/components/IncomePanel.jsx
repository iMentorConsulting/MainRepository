import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'

const HOUSEHOLD_OPTIONS = [
  { value: 6448, label: 'Ένας ενήλικας' },
  { value: 10866, label: 'Δύο ενήλικες' },
  { value: 9096, label: 'Ένας ενήλικας με 1 τέκνο' },
  { value: 13514, label: 'Δύο ενήλικες με 1 τέκνο' },
  { value: 16162, label: 'Δύο ενήλικες με 2 τέκνα' },
  { value: 18659, label: 'Δύο ενήλικες με 2 τέκνα + εξαρτώμενο ενήλικο' },
  { value: 18810, label: 'Δύο ενήλικες με 3 τέκνα' },
  { value: 21307, label: 'Δύο ενήλικες με 3 τέκνα + εξαρτώμενο ενήλικο' },
  { value: 21458, label: 'Δύο ενήλικες με 4 τέκνα' },
]

function MoneyField({ label, id, value, onChange, placeholder = '' }) {
  const display = value > 0 ? value.toLocaleString('el-GR') : ''
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        className="input"
        placeholder={placeholder || 'π.χ. 1.000'}
        value={display}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, '')
          onChange(raw ? parseInt(raw) : 0)
        }}
      />
    </div>
  )
}

function SignedMoneyField({ label, value, onChange, placeholder = '' }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        className="input"
        placeholder={placeholder || 'π.χ. 30.000'}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value !== '' ? parseInt(e.target.value) : null)}
      />
    </div>
  )
}

export default function IncomePanel({ income, onChange, assets, onAssetsChange }) {
  const isLegal = income.debtorType === 'Νομικό Πρόσωπο'

  const set = (field, val) => onChange({ ...income, [field]: val })

  const addAsset = () => onAssetsChange([...assets, { id: crypto.randomUUID(), type: 'Ακίνητο', description: '', value: 0 }])
  const removeAsset = (id) => onAssetsChange(assets.filter((a) => a.id !== id))
  const updateAsset = (id, field, val) => onAssetsChange(assets.map((a) => a.id === id ? { ...a, [field]: val } : a))

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Left: Income params */}
      <div className="space-y-4">
        <div>
          <label className="label">🔹 Τύπος Οφειλέτη</label>
          <select className="input" value={income.debtorType} onChange={(e) => set('debtorType', e.target.value)}>
            <option>Φυσικό Πρόσωπο</option>
            <option>Νομικό Πρόσωπο</option>
          </select>
        </div>

        {!isLegal && (
          <label className={`flex items-start gap-3 cursor-pointer rounded-lg border px-3 py-2.5 text-sm transition-colors ${income.isVulnerable ? 'border-teal-400 bg-teal-50 text-teal-900' : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-teal-300'}`}>
            <input
              type="checkbox"
              className="mt-0.5 w-4 h-4 accent-teal-600 shrink-0"
              checked={!!income.isVulnerable}
              onChange={(e) => set('isVulnerable', e.target.checked)}
            />
            <span>
              <span className="font-semibold">🛡️ Ευάλωτος Οφειλέτης</span>
              <span className="block text-xs mt-0.5 opacity-80">Διαθέτει βεβαίωση ευάλωτου οφειλέτη (περ. β΄ άρθρου 217 ν. 4738/2020) — Άρθρο 66 ν. 5072/2023</span>
            </span>
          </label>
        )}

        {isLegal ? (
          <div className="bg-blue-50 border-l-4 border-blue-600 rounded-lg p-4 space-y-4">
            <p className="text-xs font-bold text-blue-700 mb-1">Στοιχεία Νομικού Προσώπου</p>

            <div>
              <p className="text-xs font-semibold text-blue-600 mb-1.5">Κύκλος Εργασιών — Ε3/500 (€)</p>
              <div className="grid grid-cols-3 gap-2">
                <MoneyField label="Έτος Τ-1" value={income.ke_t1} onChange={(v) => set('ke_t1', v)} placeholder="π.χ. 500.000" />
                <MoneyField label="Έτος Τ-2" value={income.ke_t2} onChange={(v) => set('ke_t2', v)} placeholder="π.χ. 480.000" />
                <MoneyField label="Έτος Τ-3" value={income.ke_t3} onChange={(v) => set('ke_t3', v)} placeholder="π.χ. 460.000" />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-blue-600 mb-1.5">Κέρδη / Ζημιές — Έντυπο Ν (€)</p>
              <div className="grid grid-cols-3 gap-2">
                <SignedMoneyField label="Έτος Τ-1" value={income.kerdh_t1} onChange={(v) => set('kerdh_t1', v)} placeholder="π.χ. 30.000" />
                <SignedMoneyField label="Έτος Τ-2" value={income.kerdh_t2} onChange={(v) => set('kerdh_t2', v)} placeholder="π.χ. 25.000" />
                <SignedMoneyField label="Έτος Τ-3" value={income.kerdh_t3} onChange={(v) => set('kerdh_t3', v)} placeholder="π.χ. 20.000" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <MoneyField label="ΕΝΦΙΑ Επιχείρησης (€/έτος)" value={income.leEnfia} onChange={(v) => set('leEnfia', v)} />
              <MoneyField label="Καταθέσεις Εταιρείας (€)" value={income.deposits} onChange={(v) => set('deposits', v)} />
            </div>
            <MoneyField label="Επενδυτικά Προϊόντα (€) — προαιρετικό" value={income.investments} onChange={(v) => set('investments', v)} placeholder="π.χ. 10.000" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <MoneyField label="1️⃣ Ετήσιο Καθαρό Εισόδημα (€)" value={income.annualIncome} onChange={(v) => set('annualIncome', v)} placeholder="π.χ. 25.000" />
              <div>
                <label className="label">Ηλικία νεότερου οφειλέτη</label>
                <input
                  type="number" min="18" max="84" className="input"
                  placeholder="π.χ. 55"
                  value={income.debtorAge || ''}
                  onChange={(e) => set('debtorAge', e.target.value ? parseInt(e.target.value) : 0)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">2️⃣ Τύπος Νοικοκυριού (ΕΛΣΤΑΤ)</label>
                <select className="input" value={income.householdValue} onChange={(e) => set('householdValue', Number(e.target.value))}>
                  <option value={0}>-- Επιλογή --</option>
                  {HOUSEHOLD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Αριθμός μελών νοικοκυριού</label>
                <input
                  type="number" min="1" max="10" className="input"
                  placeholder="π.χ. 3"
                  value={income.householdSize || ''}
                  onChange={(e) => set('householdSize', e.target.value ? parseInt(e.target.value) : 1)}
                />
              </div>
            </div>

            <MoneyField label="3️⃣ Ετήσιος ΕΝΦΙΑ (€)" value={income.enfiaCost} onChange={(v) => set('enfiaCost', v)} />
            <MoneyField label="4️⃣ Ετήσιες Ιατρικές Δαπάνες (€)" value={income.medicalCost} onChange={(v) => set('medicalCost', v)} />
            <MoneyField label="5️⃣ Ετήσιο Ενοίκιο (€)" value={income.rentCost} onChange={(v) => set('rentCost', v)} />
            <MoneyField label="6️⃣ Ετήσιο Ενοίκιο Εξαρτ. Μέλους (€)" value={income.studentRentCost} onChange={(v) => set('studentRentCost', v)} />
            <MoneyField label="7️⃣ Ετήσια Διατροφή λόγω Διαζυγίου (€)" value={income.alimonyCost} onChange={(v) => set('alimonyCost', v)} />
            <MoneyField label="8️⃣ Καταθέσεις / Αποταμιεύσεις (€)" value={income.savings} onChange={(v) => set('savings', v)} placeholder="π.χ. 5.000" />
          </div>
        )}
      </div>

      {/* Right: Other assets */}
      <div>
        <p className="label mb-3">🏠 Λοιπή Περιουσία & Καταθέσεις (όχι προσημειωμένη)</p>
        <div className="space-y-2">
          {assets.map((a) => (
            <div key={a.id} className="flex gap-2 items-center">
              <select
                className="input w-36 shrink-0"
                value={a.type}
                onChange={(e) => updateAsset(a.id, 'type', e.target.value)}
              >
                <option>Ακίνητο</option>
                <option>Καταθέσεις</option>
              </select>
              <input
                type="text"
                className="input"
                placeholder="Περιγραφή"
                value={a.description}
                onChange={(e) => updateAsset(a.id, 'description', e.target.value)}
              />
              <input
                type="text"
                inputMode="numeric"
                className="input w-32 shrink-0 text-center"
                placeholder="Αξία €"
                value={a.value > 0 ? a.value.toLocaleString('el-GR') : ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d]/g, '')
                  updateAsset(a.id, 'value', raw ? parseInt(raw) : 0)
                }}
              />
              <button onClick={() => removeAsset(a.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 shrink-0">
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button onClick={addAsset} className="btn-secondary gap-2 text-sm mt-2">
            <PlusIcon className="w-4 h-4" /> Προσθήκη Στοιχείου
          </button>
        </div>
      </div>
    </div>
  )
}
