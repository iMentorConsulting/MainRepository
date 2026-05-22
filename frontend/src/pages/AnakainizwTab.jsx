import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  getAnakainizwData, updateAnakainizwData,
  getBudgetCategories, createBudgetCategory, updateBudgetCategory, deleteBudgetCategory,
} from '../api'

const fmt = (n) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n || 0)

const DOC_FIELDS = [
  { key: 'doc_title_deed', label: 'Τίτλος Ιδιοκτησίας (ΤΙΤΛΟΣ)', required: true },
  { key: 'doc_e9', label: 'Ε9', required: true },
  { key: 'doc_permit', label: 'Άδεια Δόμησης (ΑΔΕΙΑ)', required: true },
  { key: 'doc_legalization', label: 'Τακτοποίηση Αυθαιρέτου (ΤΑΚΤ.ΑΥΘ.)', required: true },
  { key: 'doc_plans', label: 'Αρχιτεκτονικά Σχέδια (ΣΧΕΔΙΑ)', required: true },
  { key: 'doc_e1', label: 'Ε1', required: false },
  { key: 'doc_tax_clearance', label: 'Εκκαθαριστικό (ΕΚΚΑΘ)', required: false },
  { key: 'doc_e2', label: 'Ε2', required: false },
]

const BOOST_FLAGS = [
  { key: 'boost_island', label: 'Νησί / Ορεινή περιοχή' },
  { key: 'boost_single_parent', label: 'Μονογονεϊκή οικογένεια' },
  { key: 'boost_three_children', label: 'Τρίτεκνη οικογένεια' },
  { key: 'boost_large_family', label: 'Πολύτεκνη οικογένεια' },
  { key: 'boost_youth', label: 'Νέος ηλικίας 25-35' },
  { key: 'boost_disability', label: 'ΑΜΕΑ' },
]

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
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-xs text-gray-500 w-40 pt-2 shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function InlineInput({ value, onChange, type = 'text', placeholder = '' }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
      placeholder={placeholder}
      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
    />
  )
}

// ── Inspection Fee Card ───────────────────────────────────────────────────────
function InspectionFeeCard({ data, onSave }) {
  const [saving, setSaving] = useState(false)
  const paid = data?.inspection_fee_paid
  const paidAt = data?.inspection_fee_paid_at

  const toggle = async () => {
    setSaving(true)
    try {
      await onSave({ inspection_fee_paid: !paid })
      toast.success(paid ? 'Επαναφέρθηκε ως μη πληρωμένο' : 'Σημειώθηκε ως πληρωμένο')
    } finally { setSaving(false) }
  }

  return (
    <Card>
      <div className={`rounded-xl p-4 flex items-start gap-4 ${paid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <div className={`text-3xl ${paid ? 'text-green-500' : 'text-red-500'}`}>
          {paid ? '✓' : '!'}
        </div>
        <div className="flex-1">
          <div className={`font-semibold text-sm ${paid ? 'text-green-800' : 'text-red-800'}`}>
            {paid ? 'Πληρωμή Αρχικού Ελέγχου: Εξοφλήθηκε' : 'Απαιτείται Πληρωμή Αρχικού Ελέγχου'}
          </div>
          <div className={`text-xs mt-1 ${paid ? 'text-green-700' : 'text-red-700'}`}>
            {paid
              ? `49€ + ΦΠΑ (${paidAt ? new Date(paidAt).toLocaleDateString('el-GR') : '—'})`
              : '49€ + ΦΠΑ · Απαραίτητο για άνοιγμα φακέλου & έλεγχο ακινήτου'}
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={saving}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            paid
              ? 'bg-white border border-green-300 text-green-700 hover:bg-green-100'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {saving ? '...' : paid ? 'Αναίρεση' : 'Σημείωσε ως Πληρωμένο'}
        </button>
      </div>
    </Card>
  )
}

// ── Property Card ─────────────────────────────────────────────────────────────
function PropertyCard({ data, onSave }) {
  const [form, setForm] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      property_sqm: data?.property_sqm ?? '',
      property_prefecture: data?.property_prefecture ?? '',
      property_type: data?.property_type ?? '',
      property_age: data?.property_age ?? '',
      property_usage: data?.property_usage ?? '',
      renovation_works: data?.renovation_works ?? '',
      legality: data?.legality ?? '',
    })
    setDirty(false)
  }, [data])

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(true) }

  const save = async () => {
    setSaving(true)
    try { await onSave(form); setDirty(false); toast.success('Αποθηκεύτηκε') }
    finally { setSaving(false) }
  }

  return (
    <Card title="Στοιχεία Ακινήτου">
      <FieldRow label="Τ.Μ. (τ.μ.)">
        <InlineInput type="number" value={form.property_sqm} onChange={v => set('property_sqm', v)} placeholder="π.χ. 85" />
      </FieldRow>
      <FieldRow label="Χρήση Ακινήτου">
        <select value={form.property_usage ?? ''} onChange={e => set('property_usage', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">—</option>
          <option value="ΚΕΝΟ">ΚΕΝΟ</option>
          <option value="ΜΙΣΘΩΜΕΝΟ">ΜΙΣΘΩΜΕΝΟ</option>
          <option value="ΙΔΙΟΚΑΤΟΙΚΗΣΗ">ΙΔΙΟΚΑΤΟΙΚΗΣΗ</option>
          <option value="2η Κατοικία (εξοχικό)">2η Κατοικία (εξοχικό)</option>
        </select>
      </FieldRow>
      <FieldRow label="Παλαιότητα / Ηλικία">
        <InlineInput value={form.property_age} onChange={v => set('property_age', v)} placeholder="π.χ. 1985 ή >25 έτη" />
      </FieldRow>
      <FieldRow label="Νομαρχία">
        <InlineInput value={form.property_prefecture} onChange={v => set('property_prefecture', v)} placeholder="π.χ. Αττικής" />
      </FieldRow>
      <FieldRow label="Τύπος Κατοικίας">
        <InlineInput value={form.property_type} onChange={v => set('property_type', v)} placeholder="π.χ. Διαμέρισμα" />
      </FieldRow>
      <FieldRow label="Εργασίες Ανακαίνισης">
        <textarea value={form.renovation_works ?? ''} onChange={e => set('renovation_works', e.target.value)}
          rows={2} placeholder="Περιγραφή εργασιών..."
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
      </FieldRow>
      <FieldRow label="Νομιμότητα Ακινήτου">
        <InlineInput value={form.legality} onChange={v => set('legality', v)} placeholder="π.χ. Νόμιμο, Αυθαίρετο τακτοποιημένο..." />
      </FieldRow>
      {dirty && (
        <button onClick={save} disabled={saving}
          className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
      )}
    </Card>
  )
}

// ── Household & Boosters Card ─────────────────────────────────────────────────
function HouseholdCard({ data, onSave }) {
  const [form, setForm] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const f = {}
    f.household_type = data?.household_type ?? ''
    f.num_children = data?.num_children ?? 0
    BOOST_FLAGS.forEach(({ key }) => { f[key] = data?.[key] ?? false })
    setForm(f)
    setDirty(false)
  }, [data])

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(true) }

  const save = async () => {
    setSaving(true)
    try { await onSave(form); setDirty(false); toast.success('Αποθηκεύτηκε') }
    finally { setSaving(false) }
  }

  const incomeLimit = (() => {
    const base = (form.household_type || '').toLowerCase() === 'άγαμος' ? 25000 : 35000
    return base + (parseInt(form.num_children) || 0) * 5000
  })()

  return (
    <Card title="Νοικοκυριό & Ειδικές Συνθήκες">
      <FieldRow label="Τύπος Νοικοκυριού">
        <select value={form.household_type ?? ''} onChange={e => set('household_type', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">—</option>
          <option value="άγαμος">Άγαμος / Μεμονωμένος</option>
          <option value="ζευγάρι">Ζευγάρι / Έγγαμοι</option>
        </select>
      </FieldRow>
      <FieldRow label="Αριθμός Παιδιών">
        <InlineInput type="number" value={form.num_children} onChange={v => set('num_children', parseInt(v) || 0)} placeholder="0" />
      </FieldRow>
      <div className="mt-3 mb-2">
        <div className="text-xs font-medium text-gray-600 mb-2">Ειδικές Συνθήκες (αύξηση επιχορήγησης)</div>
        <div className="grid grid-cols-2 gap-2">
          {BOOST_FLAGS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={form[key] ?? false}
                onChange={e => set(key, e.target.checked)}
                className="rounded border-gray-300 text-blue-600" />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-3 bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-800">
        Εισοδηματικό Όριο: <strong>{fmt(incomeLimit)}</strong>
      </div>
      {dirty && (
        <button onClick={save} disabled={saving}
          className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
      )}
    </Card>
  )
}

// ── Subsidy & Budget Card ─────────────────────────────────────────────────────
function SubsidyCard({ data, onSave }) {
  const [form, setForm] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      subsidy_percent: data?.subsidy_percent ?? 70,
      energy_works_budget: data?.energy_works_budget ?? 0,
      general_works_budget: data?.general_works_budget ?? 0,
    })
    setDirty(false)
  }, [data])

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(true) }

  const save = async () => {
    setSaving(true)
    try { await onSave(form); setDirty(false); toast.success('Αποθηκεύτηκε') }
    finally { setSaving(false) }
  }

  const total = (parseFloat(form.energy_works_budget) || 0) + (parseFloat(form.general_works_budget) || 0)
  const maxBudget = data?.property_sqm ? Math.min(data.property_sqm * 300, 36000) : 36000
  const energyPct = total > 0 ? Math.round(((parseFloat(form.energy_works_budget) || 0) / total) * 100) : 0
  const subsidy = total * ((parseFloat(form.subsidy_percent) || 70) / 100)

  return (
    <Card title="Επιχορήγηση & Προϋπολογισμός">
      <FieldRow label="% Επιχορήγησης">
        <div className="flex gap-2">
          {[70, 75, 80].map(pct => (
            <button key={pct} onClick={() => set('subsidy_percent', pct)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                (form.subsidy_percent || 70) === pct
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}>{pct}%</button>
          ))}
          <InlineInput type="number" value={form.subsidy_percent} onChange={v => set('subsidy_percent', v)} placeholder="70" />
        </div>
      </FieldRow>
      <FieldRow label="Ενεργειακά Έργα (€)">
        <InlineInput type="number" value={form.energy_works_budget} onChange={v => set('energy_works_budget', v)} placeholder="0" />
      </FieldRow>
      <FieldRow label="Γενικές Εργασίες (€)">
        <InlineInput type="number" value={form.general_works_budget} onChange={v => set('general_works_budget', v)} placeholder="0" />
      </FieldRow>

      <div className="mt-4 bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">Σύνολο Προϋπολογισμού</span>
          <span className="font-semibold text-gray-800">{fmt(total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Ανώτατο Επιλέξιμο (ΤΜ×300, max 36.000€)</span>
          <span className="font-semibold text-gray-600">{fmt(maxBudget)}</span>
        </div>
        <div className="flex justify-between">
          <span className={`${energyPct < 20 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
            Ενεργειακά {energyPct}% {energyPct < 20 ? '⚠ <20%' : '✓'}
          </span>
          <span className="font-semibold text-gray-600">{fmt(parseFloat(form.energy_works_budget) || 0)}</span>
        </div>
        <div className="flex justify-between border-t pt-1.5 mt-1">
          <span className="text-green-700 font-semibold">Εκτιμώμενη Επιδότηση ({form.subsidy_percent}%)</span>
          <span className="font-bold text-green-700 text-sm">{fmt(subsidy)}</span>
        </div>
      </div>

      {dirty && (
        <button onClick={save} disabled={saving}
          className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
      )}
    </Card>
  )
}

// ── Budget Categories ─────────────────────────────────────────────────────────
function BudgetCategoriesCard({ caseId }) {
  const [cats, setCats] = useState([])
  const [adding, setAdding] = useState(false)
  const [newCat, setNewCat] = useState({ category_name: '', approved_amount: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try { setCats(await getBudgetCategories(caseId)) } catch {}
  }, [caseId])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newCat.category_name) return
    setSaving(true)
    try {
      await createBudgetCategory(caseId, {
        category_name: newCat.category_name,
        approved_amount: parseFloat(newCat.approved_amount) || 0,
      })
      setNewCat({ category_name: '', approved_amount: '' })
      setAdding(false)
      load()
      toast.success('Προστέθηκε κατηγορία')
    } finally { setSaving(false) }
  }

  const handleDelete = async (catId) => {
    if (!confirm('Διαγραφή κατηγορίας;')) return
    try {
      await deleteBudgetCategory(caseId, catId)
      load()
      toast.success('Διαγράφηκε')
    } catch { toast.error('Σφάλμα') }
  }

  const total = cats.reduce((s, c) => s + (c.approved_amount || 0), 0)

  return (
    <Card title="Κατηγορίες Δαπανών">
      {cats.length > 0 ? (
        <div className="space-y-1 mb-3">
          {cats.map(cat => (
            <div key={cat.id} className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0">
              <span className="flex-1 text-sm text-gray-700">{cat.category_name}</span>
              <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmt(cat.approved_amount)}</span>
              <button onClick={() => handleDelete(cat.id)}
                className="text-xs text-red-400 hover:text-red-600 ml-2">✕</button>
            </div>
          ))}
          <div className="flex justify-between pt-2 text-sm font-semibold text-gray-800">
            <span>Σύνολο</span>
            <span>{fmt(total)}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-3">Δεν υπάρχουν κατηγορίες δαπανών.</p>
      )}

      {adding ? (
        <div className="flex gap-2 mt-2">
          <input value={newCat.category_name} onChange={e => setNewCat(f => ({ ...f, category_name: e.target.value }))}
            placeholder="Κατηγορία (π.χ. Μόνωση)" className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <input type="number" value={newCat.approved_amount} onChange={e => setNewCat(f => ({ ...f, approved_amount: e.target.value }))}
            placeholder="Ποσό €" className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button onClick={handleAdd} disabled={saving || !newCat.category_name}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? '...' : '✓'}
          </button>
          <button onClick={() => { setAdding(false); setNewCat({ category_name: '', approved_amount: '' }) }}
            className="px-3 py-1.5 text-gray-500 border border-gray-200 text-sm rounded-lg hover:bg-gray-50">✕</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Νέα Κατηγορία</button>
      )}
    </Card>
  )
}

// ── Document Checklist ────────────────────────────────────────────────────────
function DocumentChecklist({ data, onSave }) {
  const [docExtras, setDocExtras] = useState({})
  const [docBools, setDocBools] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const extras = {}
    const bools = {}
    DOC_FIELDS.forEach(({ key }) => {
      extras[key] = data?.doc_extras?.[key] ?? { not_needed: false, notes: '' }
      bools[key] = data?.[key] ?? false
    })
    setDocExtras(extras)
    setDocBools(bools)
    setDirty(false)
  }, [data])

  const setExtra = (key, field, val) => {
    setDocExtras(e => ({ ...e, [key]: { ...e[key], [field]: val } }))
    setDirty(true)
  }
  const toggleBool = (key, val) => {
    setDocBools(b => ({ ...b, [key]: val }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = { doc_extras: docExtras }
      DOC_FIELDS.forEach(({ key }) => { payload[key] = docBools[key] })
      await onSave(payload)
      setDirty(false)
      toast.success('Αποθηκεύτηκε')
    } finally { setSaving(false) }
  }

  return (
    <Card title="Έγγραφα Ακινήτου">
      <div className="space-y-3">
        {DOC_FIELDS.map(({ key, label, required }) => {
          const extra = docExtras[key] ?? { not_needed: false, notes: '' }
          const received = docBools[key] ?? false
          const notNeeded = extra.not_needed
          return (
            <div key={key} className={`rounded-lg p-3 border ${
              notNeeded ? 'bg-gray-50 border-gray-200 opacity-60' :
              received ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { if (!notNeeded) toggleBool(key, !received) }}
                  disabled={notNeeded}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                    notNeeded ? 'border-gray-300 bg-gray-100 text-gray-400' :
                    received ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {notNeeded ? '—' : received ? '✓' : ''}
                </button>
                <span className={`flex-1 text-sm ${notNeeded ? 'line-through text-gray-400' : received ? 'text-green-800 font-medium' : 'text-gray-700'}`}>
                  {label} {required && <span className="text-red-400 text-xs">*</span>}
                </span>
                <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer select-none">
                  <input type="checkbox" checked={notNeeded}
                    onChange={e => setExtra(key, 'not_needed', e.target.checked)}
                    className="rounded border-gray-300" />
                  Δεν Απαιτείται
                </label>
              </div>
              {!notNeeded && (
                <input
                  value={extra.notes || ''}
                  onChange={e => setExtra(key, 'notes', e.target.value)}
                  placeholder="Σημείωση..."
                  className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                />
              )}
            </div>
          )
        })}
      </div>
      {dirty && (
        <button onClick={save} disabled={saving}
          className="mt-4 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
      )}
    </Card>
  )
}

// ── Main Tab Component ────────────────────────────────────────────────────────
export default function AnakainizwTab({ caseId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await getAnakainizwData(caseId)) }
    catch { toast.error('Σφάλμα φόρτωσης ΑΝΑΚΑΙΝΙΖΩ δεδομένων') }
    finally { setLoading(false) }
  }, [caseId])

  useEffect(() => { load() }, [load])

  const save = async (payload) => {
    const updated = await updateAnakainizwData(caseId, payload)
    setData(updated)
    return updated
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <InspectionFeeCard data={data} onSave={save} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PropertyCard data={data} onSave={save} />
        <div className="space-y-4">
          <HouseholdCard data={data} onSave={save} />
          <SubsidyCard data={data} onSave={save} />
        </div>
      </div>
      <BudgetCategoriesCard caseId={caseId} />
      <DocumentChecklist data={data} onSave={save} />
    </div>
  )
}
