import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { getAnakainizwData, updateAnakainizwData } from '../api'

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

const BUDGET_GROUPS = [
  {
    key: 'energy', label: 'Ενεργειακές Παρεμβάσεις', icon: '⚡', is_energy: true,
    items: [
      { key: 'energy_insulation', label: 'Θερμομόνωση / θερμοπρόσοψη' },
      { key: 'energy_windows', label: 'Αντικατάσταση κουφωμάτων' },
      { key: 'energy_hvac', label: 'Συστήματα θέρμανσης/ψύξης υψηλής απόδοσης' },
      { key: 'energy_solar', label: 'Ηλιακοί θερμοσίφωνες' },
      { key: 'energy_pv', label: 'Φωτοβολταϊκά / εξοικονόμηση ενέργειας' },
      { key: 'energy_other', label: 'Άλλη δαπάνη (Ενεργειακή)' },
    ],
  },
  {
    key: 'general', label: 'Γενική Ανακαίνιση & Επισκευές', icon: '🔨', is_energy: false,
    items: [
      { key: 'general_kitchen', label: 'Κουζίνα & μπάνιο' },
      { key: 'general_floors', label: 'Πατώματα & κουφώματα εσωτερικά' },
      { key: 'general_drywall', label: 'Γυψοσανίδες & βαφές' },
      { key: 'general_plumbing', label: 'Υδραυλικά & ηλεκτρολογικά' },
      { key: 'general_upgrades', label: 'Λοιπές εργασίες αναβάθμισης' },
      { key: 'general_other', label: 'Άλλη δαπάνη (Γενική)' },
    ],
  },
  {
    key: 'consultant', label: 'Δαπάνες Συμβούλου & Μηχανικού', icon: '📋', is_energy: false,
    items: [
      { key: 'consultant_fees', label: 'Δαπάνες Συμβούλου' },
      { key: 'pea_a', label: 'ΠΕΑ Α' },
      { key: 'pea_b', label: 'ΠΕΑ Β' },
    ],
  },
]

const ENERGY_KEYS = new Set(['energy_insulation','energy_windows','energy_hvac','energy_solar','energy_pv','energy_other'])

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
        <div className={`text-3xl ${paid ? 'text-green-500' : 'text-red-500'}`}>{paid ? '✓' : '!'}</div>
        <div className="flex-1">
          <div className={`font-semibold text-sm ${paid ? 'text-green-800' : 'text-red-800'}`}>
            {paid ? 'Πληρωμή Αρχικού Ελέγχου: Εξοφλήθηκε' : 'Απαιτείται Πληρωμή Αρχικού Ελέγχου'}
          </div>
          <div className={`text-xs mt-1 ${paid ? 'text-green-700' : 'text-red-700'}`}>
            {paid
              ? `48,38€ + ΦΠΑ = 60€ (${paidAt ? new Date(paidAt).toLocaleDateString('el-GR') : '—'})`
              : '48,38€ + ΦΠΑ 24% = 60€ · Απαραίτητο για άνοιγμα φακέλου & έλεγχο ακινήτου'}
          </div>
        </div>
        <button onClick={toggle} disabled={saving}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            paid ? 'bg-white border border-green-300 text-green-700 hover:bg-green-100'
                 : 'bg-red-600 text-white hover:bg-red-700'
          }`}>
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

// ── Household & Income Card ───────────────────────────────────────────────────
function HouseholdCard({ data, onSave }) {
  const [form, setForm] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const f = { household_type: data?.household_type ?? '', num_children: data?.num_children ?? 0, actual_income: data?.actual_income ?? '' }
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

  const incomeLimit = Math.min(
    ((form.household_type || '').toLowerCase() === 'άγαμος' ? 25000 : 35000) + (parseInt(form.num_children) || 0) * 5000,
    45000
  )
  const actualIncome = parseFloat(form.actual_income) || null
  const eligible = actualIncome !== null ? actualIncome <= incomeLimit : null

  return (
    <Card title="Νοικοκυριό & Εισοδηματικά Κριτήρια">
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
      <FieldRow label="Δηλωθέν Εισόδημα (€)">
        <InlineInput type="number" value={form.actual_income} onChange={v => set('actual_income', v)} placeholder="π.χ. 18000" />
      </FieldRow>
      <div className="mt-3 space-y-2">
        <div className="bg-blue-50 rounded-lg px-3 py-2 flex items-center justify-between text-xs text-blue-800">
          <span>Εισοδηματικό Όριο (max 45.000€)</span>
          <strong>{fmt(incomeLimit)}</strong>
        </div>
        {eligible === true && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-green-800 font-semibold">
            <span className="text-base">✅</span>
            ΕΠΙΛΕΞΙΜΟΣ — Εισόδημα {fmt(actualIncome)} ≤ Όριο {fmt(incomeLimit)}
          </div>
        )}
        {eligible === false && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-red-800 font-semibold">
            <span className="text-base">❌</span>
            ΜΗ ΕΠΙΛΕΞΙΜΟΣ — Εισόδημα {fmt(actualIncome)} &gt; Όριο {fmt(incomeLimit)}
          </div>
        )}
      </div>
      <div className="mt-3 mb-2">
        <div className="text-xs font-medium text-gray-600 mb-2">Ειδικές Συνθήκες (αύξηση επιχορήγησης)</div>
        <div className="grid grid-cols-2 gap-2">
          {BOOST_FLAGS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={form[key] ?? false} onChange={e => set(key, e.target.checked)}
                className="rounded border-gray-300 text-blue-600" />
              {label}
            </label>
          ))}
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

// ── Subsidy Card (read-only totals, manual % only) ────────────────────────────
function SubsidyCard({ data, onSave }) {
  const [subsidyPct, setSubsidyPct] = useState(70)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSubsidyPct(data?.subsidy_percent ?? 70)
    setDirty(false)
  }, [data])

  const save = async () => {
    setSaving(true)
    try { await onSave({ subsidy_percent: subsidyPct }); setDirty(false); toast.success('Αποθηκεύτηκε') }
    finally { setSaving(false) }
  }

  const energy = data?.energy_works_budget || 0
  const general = data?.general_works_budget || 0
  const total = energy + general
  const maxBudget = data?.property_sqm ? Math.min(data.property_sqm * 300, 36000) : 36000
  const energyPct = total > 0 ? Math.round((energy / total) * 100) : 0
  const eligible = Math.min(total, maxBudget)
  const subsidy = eligible * (subsidyPct / 100)

  return (
    <Card title="Επιχορήγηση & Σύνοψη Προϋπολογισμού">
      <FieldRow label="% Επιχορήγησης">
        <div className="flex gap-2 flex-wrap">
          {[70, 75, 80].map(pct => (
            <button key={pct} onClick={() => { setSubsidyPct(pct); setDirty(true) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                subsidyPct === pct ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}>{pct}%</button>
          ))}
        </div>
      </FieldRow>
      <div className="mt-4 bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">⚡ Ενεργειακά Έργα (από κατηγορίες)</span>
          <span className="font-semibold text-gray-800">{fmt(energy)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">🔨 Γενικές / Σύμβουλος (από κατηγορίες)</span>
          <span className="font-semibold text-gray-800">{fmt(general)}</span>
        </div>
        <div className="flex justify-between border-t pt-1.5">
          <span className="text-gray-600 font-medium">Σύνολο Προϋπολογισμού</span>
          <span className="font-bold text-gray-800">{fmt(total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Ανώτατο Επιλέξιμο (ΤΜ×300, max 36.000€)</span>
          <span className="font-semibold text-gray-600">{fmt(maxBudget)}</span>
        </div>
        <div className="flex justify-between">
          <span className={`${energyPct < 20 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
            Ενεργειακά {energyPct}% {energyPct < 20 ? '⚠ <20%' : '✓'}
          </span>
          <span className="font-semibold text-gray-600">{fmt(energy)}</span>
        </div>
        <div className="flex justify-between border-t pt-1.5">
          <span className="text-green-700 font-semibold">Εκτιμώμενη Επιδότηση ({subsidyPct}%)</span>
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

// ── Predefined Budget Items Card ──────────────────────────────────────────────
function BudgetItemsCard({ data, onSave }) {
  const [items, setItems] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setItems(data?.budget_items || {})
    setDirty(false)
  }, [data])

  const setVal = (key, val) => {
    setItems(prev => ({ ...prev, [key]: parseFloat(val) || 0 }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try { await onSave({ budget_items: items }); setDirty(false); toast.success('Αποθηκεύτηκε') }
    finally { setSaving(false) }
  }

  const groupTotal = (group) => group.items.reduce((s, item) => s + (parseFloat(items[item.key]) || 0), 0)
  const energyTotal = BUDGET_GROUPS.filter(g => g.is_energy).reduce((s, g) => s + groupTotal(g), 0)
  const generalTotal = BUDGET_GROUPS.filter(g => !g.is_energy).reduce((s, g) => s + groupTotal(g), 0)
  const grandTotal = energyTotal + generalTotal
  const energyPct = grandTotal > 0 ? Math.round((energyTotal / grandTotal) * 100) : 0

  return (
    <Card title="Κατηγορίες Δαπανών">
      <div className="space-y-5">
        {BUDGET_GROUPS.map(group => {
          const gt = groupTotal(group)
          return (
            <div key={group.key}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{group.icon}</span>
                  <span className={`text-xs font-semibold ${group.is_energy ? 'text-blue-700' : 'text-gray-700'}`}>{group.label}</span>
                  {group.is_energy && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">Ενεργειακά</span>}
                </div>
                {gt > 0 && <span className="text-xs font-bold text-gray-700">{fmt(gt)}</span>}
              </div>
              <div className="space-y-1 pl-2">
                {group.items.map(item => (
                  <div key={item.key} className="flex items-center gap-2">
                    <span className="flex-1 text-xs text-gray-600">{item.label}</span>
                    <input
                      type="number"
                      value={items[item.key] || ''}
                      onChange={e => setVal(item.key, e.target.value)}
                      placeholder="0"
                      className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <span className="text-xs text-gray-400 w-4">€</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {grandTotal > 0 && (
        <div className="mt-4 bg-gray-50 rounded-xl p-3 space-y-1 text-xs border border-gray-200">
          <div className="flex justify-between">
            <span className="text-blue-600 font-medium">⚡ Ενεργειακά σύνολο</span>
            <span className="font-bold text-blue-700">{fmt(energyTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">🔨 Γενικά / Σύμβουλος σύνολο</span>
            <span className="font-bold text-gray-700">{fmt(generalTotal)}</span>
          </div>
          <div className="flex justify-between border-t pt-1">
            <span className="text-gray-700 font-semibold">Σύνολο</span>
            <span className="font-bold text-gray-900">{fmt(grandTotal)}</span>
          </div>
          <div className={`flex justify-between ${energyPct < 20 ? 'text-red-600' : 'text-green-600'}`}>
            <span className="font-medium">Ενεργειακά {energyPct}% {energyPct >= 20 ? '✓' : '⚠ απαιτείται ≥20%'}</span>
          </div>
        </div>
      )}

      {dirty && (
        <button onClick={save} disabled={saving}
          className="mt-4 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
        </button>
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
  const toggleBool = (key, val) => { setDocBools(b => ({ ...b, [key]: val })); setDirty(true) }

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
                <button onClick={() => { if (!notNeeded) toggleBool(key, !received) }} disabled={notNeeded}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                    notNeeded ? 'border-gray-300 bg-gray-100 text-gray-400' :
                    received ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 hover:border-blue-400'
                  }`}>
                  {notNeeded ? '—' : received ? '✓' : ''}
                </button>
                <span className={`flex-1 text-sm ${notNeeded ? 'line-through text-gray-400' : received ? 'text-green-800 font-medium' : 'text-gray-700'}`}>
                  {label} {required && <span className="text-red-400 text-xs">*</span>}
                </span>
                <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer select-none">
                  <input type="checkbox" checked={notNeeded} onChange={e => setExtra(key, 'not_needed', e.target.checked)}
                    className="rounded border-gray-300" />
                  Δεν Απαιτείται
                </label>
              </div>
              {!notNeeded && (
                <input value={extra.notes || ''} onChange={e => setExtra(key, 'notes', e.target.value)}
                  placeholder="Σημείωση..."
                  className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white" />
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
      <BudgetItemsCard data={data} onSave={save} />
      <DocumentChecklist data={data} onSave={save} />
    </div>
  )
}
