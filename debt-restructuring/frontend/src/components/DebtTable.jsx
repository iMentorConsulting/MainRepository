import { useState } from 'react'
import { TrashIcon, PlusIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import { fmt, creditorDisplayName } from '../utils/calculations'

const DEBT_TYPES = ['Τράπεζα', 'Εφορία', 'Ασφαλιστικά Ταμεία']
const DEBT_STATUSES = ['Ενήμερη', 'Ληξιπρόθεσμη']

function emptyPubCategories(type) {
  if (type === 'Εφορία') {
    return { nonErasableBasic: 0, nonErasableSurcharges: 0, otherBasic: 0, otherSurcharges: 0, fines: 0 }
  }
  if (type === 'Ασφαλιστικά Ταμεία') {
    return { nonErasableBasic: 0, nonErasableSurcharges: 0, otherBasic: 0, otherSurcharges: 0 }
  }
  return null
}

// Migrate old pubCategories structure (pre-categorization) to new shape
function normalizeCats(cats, type) {
  if (!cats) return emptyPubCategories(type)
  if (cats.nonErasable !== undefined && cats.nonErasableBasic === undefined) {
    return {
      nonErasableBasic: cats.nonErasable || 0,
      nonErasableSurcharges: 0,
      ...(type === 'Εφορία' ? {
        otherBasic: cats.otherBasic || 0,
        otherSurcharges: cats.surcharges || 0,
        fines: cats.fines || 0,
      } : {}),
      ...(type === 'Ασφαλιστικά Ταμεία' ? { otherBasic: 0, otherSurcharges: 0 } : {}),
    }
  }
  // Migrate ΕΦΚΑ saved before otherBasic/otherSurcharges were added
  if (type === 'Ασφαλιστικά Ταμεία' && cats.otherBasic === undefined) {
    return { ...cats, otherBasic: 0, otherSurcharges: 0 }
  }
  return cats
}

function pubCatTotal(cats) {
  if (!cats) return 0
  return (cats.nonErasableBasic ?? 0)
       + (cats.nonErasableSurcharges ?? 0)
       + (cats.otherBasic ?? 0)
       + (cats.otherSurcharges ?? 0)
       + (cats.fines ?? 0)
       + (cats.surcharges ?? 0) // legacy compat
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

function CatInput({ value, onChange, className = '' }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      className={`input text-right text-xs px-2 py-1 ${className}`}
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
  return (
    <input type="text" inputMode="numeric" className={`input text-center ${className}`}
      placeholder={placeholder}
      value={value > 0 ? value.toLocaleString('el-GR') : ''}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, '')
        onChange(raw ? parseInt(raw) : 0)
      }} />
  )
}

function PublicBreakdown({ debt, onChange }) {
  const isAADE = debt.type === 'Εφορία'
  const cats = normalizeCats(debt.pubCategories, debt.type)

  const update = (key, val) => {
    const newCats = { ...cats, [key]: val }
    onChange({ ...debt, pubCategories: newCats, amount: pubCatTotal(newCats) })
  }

  const neb = cats.nonErasableBasic || 0
  const nes = cats.nonErasableSurcharges || 0
  const nesMin = Math.round(nes * 0.15)   // 15% of surcharges must be paid
  const nesWr  = nes - nesMin              // 85% written off
  const blockMinPay = neb + nesMin

  return (
    <div className="space-y-1.5 text-xs">

      {/* ΜΗ ΔΙΑΓΡΑΦΟΜΕΝΟ */}
      <div className="rounded-md border border-red-200 bg-red-50/50 px-2.5 py-2">
        <p className="text-[10px] font-extrabold text-red-700 tracking-wider mb-2">
          ΜΗ ΔΙΑΓΡΑΦΟΜΕΝΟ {isAADE ? '(ΦΠΑ, ΦΜΥ)' : '(εισφορές)'}
        </p>

        {/* Header row */}
        <div className="grid grid-cols-[5rem_6.5rem_3.5rem] gap-x-2 text-[10px] text-gray-400 mb-1">
          <span></span><span className="text-right">Ποσό €</span><span className="text-center">Διαγρ.</span>
        </div>

        <div className="space-y-1">
          <div className="grid grid-cols-[5rem_6.5rem_3.5rem] gap-x-2 items-center">
            <span className="text-gray-600">Βασική</span>
            <CatInput value={neb} onChange={(v) => update('nonErasableBasic', v)} />
            <span className="text-center text-red-500 font-bold text-[10px]">0%</span>
          </div>
          <div className="grid grid-cols-[5rem_6.5rem_3.5rem] gap-x-2 items-center">
            <span className="text-gray-600">Προσαυξ.</span>
            <CatInput value={nes} onChange={(v) => update('nonErasableSurcharges', v)} />
            <span className="text-center text-orange-600 font-bold text-[10px]">85%</span>
          </div>
        </div>

        {(neb > 0 || nes > 0) && (
          <div className="mt-2 pt-1.5 border-t border-red-200 space-y-0.5">
            {nes > 0 && (
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>Προσαυξ. ΜΗ ΔΙΑΓΡ. (15%)</span>
                <span className="font-semibold text-gray-700">{fmt(nesMin)}</span>
              </div>
            )}
            {nes > 0 && (
              <div className="flex justify-between text-[10px] text-orange-600">
                <span>Προσαυξ. διαγραφή (85%)</span>
                <span className="font-semibold">{fmt(nesWr)}</span>
              </div>
            )}
            <div className="flex justify-between text-[10px] font-bold text-red-700">
              <span>Σύνολο προς πληρωμή</span>
              <span>{fmt(blockMinPay)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ΔΙΑΓΡΑΦΟΜΕΝΟ — ΑΑΔΕ + ΕΦΚΑ */}
      <div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-2.5 py-2">
        <p className="text-[10px] font-extrabold text-emerald-700 tracking-wider mb-2">
          {isAADE ? 'ΔΙΑΓΡΑΦΟΜΕΝΟ (εισόδημα, ΕΝΦΙΑ, ΓΕΜΗ)' : 'ΔΙΑΓΡΑΦΟΜΕΝΟ (εργοδοτικές εισφορές)'}
        </p>

        <div className="grid grid-cols-[5rem_6.5rem_3.5rem] gap-x-2 text-[10px] text-gray-400 mb-1">
          <span></span><span className="text-right">Ποσό €</span><span className="text-center">Διαγρ.</span>
        </div>

        <div className="space-y-1">
          <div className="grid grid-cols-[5rem_6.5rem_3.5rem] gap-x-2 items-center">
            <span className="text-gray-600">Βασική</span>
            <CatInput value={cats.otherBasic || 0} onChange={(v) => update('otherBasic', v)} />
            <span className="text-center text-amber-600 font-bold text-[10px]">75%</span>
          </div>
          <div className="grid grid-cols-[5rem_6.5rem_3.5rem] gap-x-2 items-center">
            <span className="text-gray-600">Προσαυξ.</span>
            <CatInput value={cats.otherSurcharges || 0} onChange={(v) => update('otherSurcharges', v)} />
            <span className="text-center text-orange-600 font-bold text-[10px]">85%</span>
          </div>
          {isAADE && (
            <div className="grid grid-cols-[5rem_6.5rem_3.5rem] gap-x-2 items-center">
              <span className="text-gray-600">Πρόστιμα</span>
              <CatInput value={cats.fines || 0} onChange={(v) => update('fines', v)} />
              <span className="text-center text-emerald-700 font-bold text-[10px]">95%</span>
            </div>
          )}
        </div>
      </div>
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
    <tr className="border-b border-gray-100 align-top hover:bg-blue-50/30">
      {/* Amount */}
      <td className="td px-2 py-2 min-w-[120px]">
        {hasPubCats ? (
          <div className="text-center pt-1">
            <div className="text-sm font-bold text-gray-800">{fmt(debt.amount)}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">άθροισμα</div>
          </div>
        ) : (
          <NumInput value={debt.amount} onChange={(v) => onChange({ ...debt, amount: v })} placeholder="π.χ. 50000" />
        )}
      </td>

      {/* Breakdown / slider */}
      <td className="td px-2 py-2 min-w-[280px]">
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
      <td className="td px-2 py-2 min-w-[120px]">
        {isBank ? (
          <input type="text" className="input text-center text-sm" placeholder="π.χ. Alpha Bank"
            value={debt.creditorName} onChange={(e) => onChange({ ...debt, creditorName: e.target.value })} />
        ) : (
          <span className="text-xs text-gray-400 italic">{creditorDisplayName(debt.type)}</span>
        )}
      </td>

      {/* Status */}
      <td className="td px-2 py-2 min-w-[110px]">
        <select className="input text-center text-sm" value={debt.status}
          onChange={(e) => onChange({ ...debt, status: e.target.value })}>
          {DEBT_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </td>

      {/* Mortgaged — all debt types */}
      <td className="td px-2 py-2">
        <input type="checkbox" checked={debt.mortgaged}
          onChange={(e) => onChange({ ...debt, mortgaged: e.target.checked, propertyValue: e.target.checked ? debt.propertyValue : 0 })}
          className="w-4 h-4 accent-blue-600" />
      </td>

      {/* Property value */}
      <td className="td px-2 py-2 min-w-[120px]">
        {debt.mortgaged ? (
          <NumInput value={debt.propertyValue} onChange={(v) => onChange({ ...debt, propertyValue: v })} placeholder="Αξία €" />
        ) : isBank && debt.amount > 0 ? (
          <span className="text-xs text-red-500 font-semibold">⚠️ Ανασφάλιστη</span>
        ) : null}
      </td>

      {/* Coverage */}
      <td className="td px-2 py-2 min-w-[80px]">
        {debt.mortgaged && debt.propertyValue > 0 && debt.amount > 0 && (() => {
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

// ── Paste-import helpers ──────────────────────────────────────────────────────

function parseGreekNum(s) {
  if (!s || !String(s).trim()) return 0
  // Greek locale: dot = thousands sep, comma = decimal  →  strip dots, swap comma
  const n = parseFloat(String(s).trim().replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : Math.round(n) // round to integer (cents negligible for planning)
}

function parsePasteImport(text) {
  if (!text || !text.trim()) return []
  const rows = text.trim().split('\n').map(l => l.replace(/\r$/, '').split('\t'))

  // Detect header row
  const firstCell = (rows[0][0] || '').trim()
  const isHeader = /^(είδος|πιστ|cred|type)/i.test(firstCell)
  const startIdx = isHeader ? 1 : 0

  // Auto-detect format:
  // NEW (6-col): Είδος | Πιστωτής | ΚΑΤΗΓΟΡΙΑ | Βασική | Προσαυξ. | Πρόστιμο
  // OLD (5-col): Πιστωτής | ΚΑΤΗΓΟΡΙΑ | Βασική | Προσαυξ. | Πρόστιμο
  const firstDataCell = ((rows[startIdx] || [])[0] || '').trim()
  const hasTypeCol = /^είδος/i.test(firstCell) ||
    /^(τράπεζα|εφορ|εφκα|ε\.φ\.κ|ασφαλ)/i.test(firstDataCell)

  // Column offsets
  const CI = hasTypeCol ? 1 : 0  // creditor name
  const KI = hasTypeCol ? 2 : 1  // category
  const BI = hasTypeCol ? 3 : 2  // basic amount
  const SI = hasTypeCol ? 4 : 3  // surcharge
  const FI = hasTypeCol ? 5 : 4  // fine

  const aade = { cats: { nonErasableBasic: 0, nonErasableSurcharges: 0, otherBasic: 0, otherSurcharges: 0, fines: 0 } }
  const efka = { cats: { nonErasableBasic: 0, nonErasableSurcharges: 0, otherBasic: 0, otherSurcharges: 0 } }
  let hasAADE = false, hasEFKA = false
  const banks = {}

  for (let i = startIdx; i < rows.length; i++) {
    const cols = rows[i]
    const typeCell = hasTypeCol ? (cols[0] || '').trim() : ''
    const creditor = (cols[CI] || '').trim()
    const category = (cols[KI] || '').toUpperCase()
    if (!creditor || /^συνολ/i.test(creditor)) continue

    const basic      = parseGreekNum(cols[BI])
    const surcharges = parseGreekNum(cols[SI])
    const fines      = parseGreekNum(cols[FI])
    const isMH       = /ΜΗ/.test(category)

    // Determine type: use Είδος column when present, else match creditor name
    const isAADE = hasTypeCol
      ? /^(εφορ|ααδε)/i.test(typeCell) || /ΑΑΔΕ|αρμόδι|εφορ|εσοδ/i.test(creditor)
      : /ΑΑΔΕ|αρμόδι|εφορ|εσοδ/i.test(creditor)
    const isEFKA = hasTypeCol
      ? /^(εφκα|ε\.φ\.κ|ασφαλ|ενιαι)/i.test(typeCell) || /ΕΦΚΑ|ΙΚΑ|ΚΕΑΟ/i.test(creditor)
      : /ΕΦΚΑ|ΙΚΑ|ΚΕΑΟ/i.test(creditor)

    if (isAADE) {
      hasAADE = true
      if (isMH) {
        aade.cats.nonErasableBasic      += basic
        aade.cats.nonErasableSurcharges += surcharges
      } else {
        aade.cats.otherBasic      += basic
        aade.cats.otherSurcharges += surcharges
        aade.cats.fines           += fines
      }
    } else if (isEFKA) {
      hasEFKA = true
      if (isMH) {
        efka.cats.nonErasableBasic      += basic
        efka.cats.nonErasableSurcharges += surcharges
      } else {
        efka.cats.otherBasic      += basic
        efka.cats.otherSurcharges += surcharges
      }
    } else {
      if (!banks[creditor]) banks[creditor] = { basic: 0, surcharges: 0 }
      banks[creditor].basic      += basic
      banks[creditor].surcharges += surcharges
    }
  }

  const result = []

  if (hasAADE) {
    const cats = aade.cats
    result.push({ id: crypto.randomUUID(), type: 'Εφορία', creditorName: '', amount: pubCatTotal(cats), interestPct: 0, status: 'Ληξιπρόθεσμη', mortgaged: false, propertyValue: 0, pubCategories: cats })
  }
  if (hasEFKA) {
    const cats = efka.cats
    result.push({ id: crypto.randomUUID(), type: 'Ασφαλιστικά Ταμεία', creditorName: '', amount: pubCatTotal(cats), interestPct: 0, status: 'Ληξιπρόθεσμη', mortgaged: false, propertyValue: 0, pubCategories: cats })
  }
  for (const [name, d] of Object.entries(banks)) {
    const total = d.basic + d.surcharges
    const interestPct = total > 0 ? Math.round(d.surcharges / total * 100) : 0
    result.push({ id: crypto.randomUUID(), type: 'Τράπεζα', creditorName: name, amount: total, interestPct, status: 'Ληξιπρόθεσμη', mortgaged: false, propertyValue: 0, pubCategories: null })
  }

  return result
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DebtTable({ debts, onChange }) {
  const [showPaste, setShowPaste]   = useState(false)
  const [pasteText, setPasteText]   = useState('')
  const [preview, setPreview]       = useState([])
  const [parseError, setParseError] = useState('')

  const handlePasteChange = (text) => {
    setPasteText(text)
    setParseError('')
    if (!text.trim()) { setPreview([]); return }
    try {
      const rows = parsePasteImport(text)
      setPreview(rows)
      if (!rows.length) setParseError('Δεν αναγνωρίστηκαν γραμμές. Ελέγξτε τη μορφή (Tab-separated).')
    } catch (e) {
      setPreview([])
      setParseError('Σφάλμα ανάλυσης: ' + e.message)
    }
  }

  const handleImport = () => {
    if (!preview.length) return
    onChange(preview)
    setShowPaste(false)
    setPasteText('')
    setPreview([])
    setParseError('')
  }

  const updateDebt = (id, updated) => onChange(debts.map((d) => d.id === id ? updated : d))
  const deleteDebt = (id) => onChange(debts.filter((d) => d.id !== id))
  const addDebt = () => onChange([...debts, emptyDebt()])

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px]">
          <thead>
            <tr className="border-b-2 border-blue-100">
              <th className="th">Ποσό</th>
              <th className="th">Κατηγορίες / Κεφάλαιο–Τόκοι</th>
              <th className="th">Είδος</th>
              <th className="th">Τράπεζα</th>
              <th className="th">Κατάσταση</th>
              <th className="th">Ενυπόθηκο</th>
              <th className="th">Αξία Ακιν.</th>
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
            {debts.length > 0 && (() => {
              const totalAmount = debts.reduce((s, d) => s + (d.amount || 0), 0)
              const bankTotal   = debts.filter(d => d.type === 'Τράπεζα').reduce((s, d) => s + d.amount, 0)
              const aadeTotal   = debts.filter(d => d.type === 'Εφορία').reduce((s, d) => s + d.amount, 0)
              const efkaTotal   = debts.filter(d => d.type === 'Ασφαλιστικά Ταμεία').reduce((s, d) => s + d.amount, 0)
              const neTotal     = debts.reduce((s, d) => s + (d.pubCategories?.nonErasableBasic || 0), 0)
              return (
                <tr className="border-t-2 border-blue-200 bg-blue-50/70">
                  <td className="px-2 py-2 text-center">
                    <div className="text-sm font-extrabold text-blue-900">{fmt(totalAmount)}</div>
                    <div className="text-[10px] text-blue-600 font-semibold">ΣΥΝΟΛΟ</div>
                  </td>
                  <td className="px-2 py-2" colSpan={7}>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
                      {bankTotal > 0 && <span>Τράπεζες: <b className="text-gray-800">{fmt(bankTotal)}</b></span>}
                      {aadeTotal > 0 && <span>ΑΑΔΕ: <b className="text-gray-800">{fmt(aadeTotal)}</b></span>}
                      {efkaTotal > 0 && <span>ΕΦΚΑ: <b className="text-gray-800">{fmt(efkaTotal)}</b></span>}
                      {neTotal > 0 && <span className="text-red-600">εκ ων ΜΗ ΔΙΑΓΡ. βασική: <b>{fmt(neTotal)}</b></span>}
                    </div>
                  </td>
                  <td className="px-2 py-2" />
                </tr>
              )
            })()}
          </tbody>
        </table>
      </div>
      <div className="mt-3 space-y-3">
        <div className="text-xs text-gray-400 px-1">
          Τράπεζες: 80% κεφ. + 100% τόκων &nbsp;·&nbsp;
          ΑΑΔΕ ΜΗ ΔΙΑΓΡ.: βασική 0% + προσαυξ. 85% &nbsp;·&nbsp;
          ΑΑΔΕ ΔΙΑΓΡ.: βασική 75% + προσαυξ. 85% + πρόστιμα 95% &nbsp;·&nbsp;
          ΕΦΚΑ ΜΗ ΔΙΑΓΡ. (παρακρατ.): βασική 0% + προσαυξ. 85% &nbsp;·&nbsp;
          ΕΦΚΑ ΔΙΑΓΡ. (εργοδοτ.): βασική 75% + προσαυξ. 85%
        </div>

        <div className="flex justify-center gap-3">
          <button onClick={addDebt} className="btn-primary gap-2 text-sm">
            <PlusIcon className="w-4 h-4" /> Προσθήκη Οφειλής
          </button>
          <button
            onClick={() => { setShowPaste((v) => !v); setPasteText(''); setPreview([]); setParseError('') }}
            className="btn-secondary gap-2 text-sm"
          >
            <ClipboardDocumentListIcon className="w-4 h-4" />
            {showPaste ? 'Ακύρωση' : 'Εισαγωγή από πίνακα'}
          </button>
        </div>

        {showPaste && (
          <div className="border border-blue-300 rounded-xl bg-blue-50/60 p-4 space-y-3">
            <div>
              <p className="text-sm font-bold text-blue-800 mb-1">📋 Εισαγωγή από Excel / πίνακα</p>
              <p className="text-xs text-gray-500">
                Αντιγράψτε από Excel και επικολλήστε παρακάτω. Αναμενόμενες στήλες (με ή χωρίς γραμμή επικεφαλίδας):
                <span className="font-mono ml-1 text-gray-700">Πιστωτής · ΚΑΤΗΓΟΡΙΑ · Βασική · Προσαυξ./Τόκοι · Πρόστιμο · ...</span>
              </p>
            </div>

            <textarea
              className="w-full h-36 input text-xs font-mono leading-relaxed"
              placeholder={'Επικολλήστε εδώ (Ctrl+V)...\n\nΥποστηριζόμενες μορφές:\n\n6 στήλες (με Είδος):\nΕίδος\tΠιστωτής\tΚΑΤΗΓΟΡΙΑ\tΒασική\tΠροσαυξ.\tΠρόστιμο\nΤράπεζα\tEthniki\tΔΙΑΓΡΑΦΟΜΕΝΟ\t31.507,03 €\t161.658,07 €\t- €\nΕφορία\tΕφορία\tΔΙΑΓΡΑΦΟΜΕΝΟ\t19.451,17 €\t12.515,76 €\t100,00 €\nΕφορία\tΕφορία\tΜΗ ΔΙΑΓΡΑΦΟΜΕΝΟ\t10.757,71 €\t9.019,73 €\t- €\nΕΦΚΑ\tΕΦΚΑ\tΔΙΑΓΡΑΦΟΜΕΝΟ\t3,38 €\t7.801,09 €\t- €\nΕΦΚΑ\tΕΦΚΑ\tΜΗ ΔΙΑΓΡΑΦΟΜΕΝΟ\t33.954,65 €\t18.356,00 €\t- €\n\n5 στήλες (χωρίς Είδος):\nΑΑΔΕ\tΔΙΑΓΡΑΦΟΜΕΝΟ\t12276,29\t4779,92\t250,00\nΑΑΔΕ\tΜΗ ΔΙΑΓΡΑΦΟΜΕΝΟ\t20931,25\t8347,47\t0\nΕΦΚΑ\tΜΗ ΔΙΑΓΡΑΦΟΜΕΝΟ\t9698,41\t3115,55\t0\nIntrum\tΔΙΑΓΡΑΦΟΜΕΝΟ\t125186,13\t0\t0'}
              value={pasteText}
              onChange={(e) => handlePasteChange(e.target.value)}
            />

            {parseError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5">{parseError}</p>
            )}

            {preview.length > 0 && (
              <div className="text-xs bg-white border border-blue-200 rounded-lg overflow-hidden">
                <div className="bg-blue-100 px-3 py-1.5 font-bold text-blue-800">
                  Προεπισκόπηση — {preview.length} οφειλές
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-blue-100 text-gray-500">
                      <th className="text-left px-3 py-1">Πιστωτής</th>
                      <th className="text-right px-3 py-1">Ποσό</th>
                      <th className="text-left px-3 py-1">Λεπτομέρειες</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((d, i) => {
                      const isPub = d.type !== 'Τράπεζα'
                      const cats = d.pubCategories
                      const detail = isPub
                        ? [
                            cats?.nonErasableBasic > 0 ? `ΜΗ ΔΙΑΓΡ. Βασική ${fmt(cats.nonErasableBasic)}` : null,
                            cats?.nonErasableSurcharges > 0 ? `Προσαυξ. ΜΗ ${fmt(cats.nonErasableSurcharges)}` : null,
                            cats?.otherBasic > 0 ? `ΔΙΑΓΡ. Βασική ${fmt(cats.otherBasic)}` : null,
                            cats?.otherSurcharges > 0 ? `Προσαυξ. ${fmt(cats.otherSurcharges)}` : null,
                            cats?.fines > 0 ? `Πρόστιμα ${fmt(cats.fines)}` : null,
                          ].filter(Boolean).join(' · ')
                        : `κεφ. ${fmt(d.amount * (100 - d.interestPct) / 100)} / τόκ. ${fmt(d.amount * d.interestPct / 100)}`
                      return (
                        <tr key={i} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-1 font-semibold">
                            {creditorDisplayName(d.type, d.creditorName)}
                          </td>
                          <td className="px-3 py-1 text-right font-mono text-blue-700">{fmt(d.amount)}</td>
                          <td className="px-3 py-1 text-gray-500">{detail}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {preview.length > 0 && (
              <div className="flex items-center gap-3">
                <button onClick={handleImport} className="btn-primary gap-2 text-sm">
                  <PlusIcon className="w-4 h-4" />
                  Εισαγωγή {preview.length} οφειλών
                  {debts.some(d => d.amount > 0) && <span className="font-normal opacity-80">(αντικαθιστά υπάρχουσες)</span>}
                </button>
                <p className="text-xs text-gray-400">
                  Τα δεδομένα θα αντικαταστήσουν τον τρέχοντα πίνακα.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
