import React, { useState, useEffect } from 'react'
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
  // State for displaying the input while user types (unformatted)
  const [displayValue, setDisplayValue] = useState(String(value || ''))

  // When parent prop changes (e.g., from loading data), update our display
  useEffect(() => {
    setDisplayValue(String(value || ''))
  }, [value])

  const handleChange = (e) => {
    const input = e.target.value
    setDisplayValue(input)

    // Extract only digits and update parent
    const raw = input.replace(/[^\d]/g, '')
    onChange(raw ? parseInt(raw) : 0)
  }

  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        className="input"
        placeholder={placeholder || 'π.χ. 1.000'}
        value={displayValue}
        onChange={handleChange}
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

// Common personal expense + household fields — used by both FP sub-types
function FpCommonFields({ income, set, fpSubType }) {
  return (
    <div className="space-y-3">
      <MoneyField
        label="Εισόδημα Συζύγου / Συντρόφου (€/έτος) — από ΕΓΔΙΧ"
        value={income.spouseIncome}
        onChange={(v) => set('spouseIncome', v)}
        placeholder="0 αν δεν υπάρχει"
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Τύπος Νοικοκυριού (ΕΛΣΤΑΤ)</label>
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
      <div>
        <label className="label">Ηλικία νεότερου οφειλέτη</label>
        <input
          type="number" min="18" max="84" className="input"
          placeholder="π.χ. 55"
          value={income.debtorAge || ''}
          onChange={(e) => set('debtorAge', e.target.value ? parseInt(e.target.value) : 0)}
        />
      </div>
      <MoneyField label="Ετήσιος ΕΝΦΙΑ (€)" value={income.enfiaCost} onChange={(v) => set('enfiaCost', v)} />
      <MoneyField label="Ετήσιες Ιατρικές Δαπάνες (€)" value={income.medicalCost} onChange={(v) => set('medicalCost', v)} />
      <MoneyField label="Ετήσιο Ενοίκιο (€)" value={income.rentCost} onChange={(v) => set('rentCost', v)} />
      {fpSubType !== 'Επιτηδευματίας' && (
        <MoneyField label="Ετήσιο Ενοίκιο Εξαρτ. Μέλους (€)" value={income.studentRentCost} onChange={(v) => set('studentRentCost', v)} />
      )}
      <MoneyField label="Ετήσια Διατροφή λόγω Διαζυγίου (€)" value={income.alimonyCost} onChange={(v) => set('alimonyCost', v)} />
    </div>
  )
}

export default function IncomePanel({ income, onChange, assets, onAssetsChange }) {
  const isLegal = income.debtorType === 'Νομικό Πρόσωπο'
  const fpSubType = income.fpSubType || 'Μισθωτός'

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

        {/* FP sub-type selector */}
        {!isLegal && (
          <div>
            <label className="label">🔸 Κατηγορία Φυσικού Προσώπου</label>
            <div className="grid grid-cols-1 gap-2">
              {[
                { value: 'Μισθωτός', label: 'Μισθωτός / Συνταξιούχος / Άνεργος', law: 'ΦΕΚ Β\' 2499/2021 §8' },
                { value: 'Επιτηδευματίας', label: 'Επιτηδευματίας (Ατομική / Ελεύθερος Επαγγελματίας)', law: 'ΦΕΚ Β\' 2499/2021 §9' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 cursor-pointer rounded-lg border px-3 py-2.5 text-sm transition-colors ${fpSubType === opt.value ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-200'}`}
                >
                  <input
                    type="radio"
                    name="fpSubType"
                    className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0"
                    checked={fpSubType === opt.value}
                    onChange={() => set('fpSubType', opt.value)}
                  />
                  <span>
                    <span className="font-semibold">{opt.label}</span>
                    <span className="block text-xs mt-0.5 opacity-70">{opt.law}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {isLegal ? (
          /* ── Νομικό Πρόσωπο ── */
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

        ) : fpSubType === 'Επιτηδευματίας' ? (
          /* ── Επιτηδευματίας ── */
          <div className="bg-amber-50 border-l-4 border-amber-500 rounded-lg p-4 space-y-4">
            <p className="text-xs font-bold text-amber-700 mb-1">Ατομική Επιχείρηση / Ελεύθερος Επαγγελματίας</p>

            <div className="rounded-md bg-amber-100 border border-amber-300 px-3 py-2 text-xs text-amber-800">
              ⚠️ <span className="font-semibold">Πού βρίσκεις τα νούμερα:</span> Όλες οι τιμές λαμβάνονται αποκλειστικά από την πλατφόρμα του Εξωδικαστικού (ΕΓΔΙΧ) — «Ετήσιο Ατομικό Εισόδημα Οφειλέτη» ανά φορολογικό έτος.
            </div>

            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1.5">Ετήσιο Ατομικό Εισόδημα Οφειλέτη — από πλατφόρμα ΕΓΔΙΧ (€)</p>
              <div className="grid grid-cols-3 gap-2">
                <MoneyField label="Έτος Τ" value={income.fp_income_t1} onChange={(v) => set('fp_income_t1', v)} placeholder="π.χ. 20.000" />
                <MoneyField label="Έτος Τ-1" value={income.fp_income_t2} onChange={(v) => set('fp_income_t2', v)} placeholder="π.χ. 18.000" />
                <MoneyField label="Έτος Τ-2" value={income.fp_income_t3} onChange={(v) => set('fp_income_t3', v)} placeholder="π.χ. 16.000" />
              </div>
              <p className="text-xs text-amber-600 mt-1">Χρησιμοποιείται ο μέσος όρος των 2 υψηλότερων ετών</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1.5">Κύκλος Εργασιών — από πλατφόρμα ΕΓΔΙΧ (€)</p>
              <div className="grid grid-cols-3 gap-2">
                <MoneyField label="ΚΕ Τ" value={income.fp_ke_t1} onChange={(v) => set('fp_ke_t1', v)} placeholder="π.χ. 200.000" />
                <MoneyField label="ΚΕ Τ-1" value={income.fp_ke_t2} onChange={(v) => set('fp_ke_t2', v)} placeholder="π.χ. 180.000" />
                <MoneyField label="ΚΕ Τ-2" value={income.fp_ke_t3} onChange={(v) => set('fp_ke_t3', v)} placeholder="π.χ. 160.000" />
              </div>
              <p className="text-xs text-amber-600 mt-1">ΚΕ Τ χρησιμοποιείται για τον έλεγχο ορίου ρύθμισης</p>
            </div>

            <MoneyField label="Καταθέσεις (€)" value={income.savings} onChange={(v) => set('savings', v)} placeholder="π.χ. 5.000" />

            <FpCommonFields income={income} set={set} fpSubType={fpSubType} />
          </div>

        ) : (
          /* ── Μισθωτός / Συνταξιούχος / Άνεργος ── */
          <div className="bg-green-50 border-l-4 border-green-600 rounded-lg p-4 space-y-4">
            <p className="text-xs font-bold text-green-700 mb-1">Μισθωτός / Συνταξιούχος / Άνεργος</p>

            <div>
              <p className="text-xs font-semibold text-green-700 mb-1.5">Καθαρό Εισόδημα — Εκκαθαριστικό (€)</p>
              <div className="grid grid-cols-3 gap-2">
                <MoneyField label="Έτος Τ" value={income.fp_income_t1} onChange={(v) => set('fp_income_t1', v)} placeholder="π.χ. 25.000" />
                <MoneyField label="Έτος Τ-1" value={income.fp_income_t2} onChange={(v) => set('fp_income_t2', v)} placeholder="π.χ. 24.000" />
                <MoneyField label="Έτος Τ-2" value={income.fp_income_t3} onChange={(v) => set('fp_income_t3', v)} placeholder="π.χ. 23.000" />
              </div>
              <p className="text-xs text-green-600 mt-1">Χρησιμοποιείται ο μέσος όρος των 2 υψηλότερων ετών</p>
            </div>

            <MoneyField label="Καταθέσεις / Αποταμιεύσεις (€)" value={income.savings} onChange={(v) => set('savings', v)} placeholder="π.χ. 5.000" />

            <FpCommonFields income={income} set={set} fpSubType={fpSubType} />
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
