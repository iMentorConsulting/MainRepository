// AnakainizwPortalSection.jsx
// Renders ΑΝΑΚΑΙΝΙΖΩ-specific content on the client portal page.

function fmtEuro(n) {
  if (!n && n !== 0) return '—'
  return n.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

const DOC_ITEMS = [
  { key: 'doc_title_deed', icon: '📄', label: 'Τίτλος Ιδιοκτησίας' },
  { key: 'doc_e9', icon: '🏛️', label: 'Ε9 (ΕΝΦΙΑ)' },
  { key: 'doc_permit', icon: '🏗️', label: 'Άδεια Οικοδομής' },
  { key: 'doc_legalization', icon: '⚖️', label: 'Τακτοποίηση Αυθαιρέτων' },
  { key: 'doc_plans', icon: '📐', label: 'Αρχιτεκτονικά Σχέδια' },
  { key: 'doc_e1', icon: '📋', label: 'Ε1 (Φορολογική Δήλωση)' },
  { key: 'doc_tax_clearance', icon: '🧾', label: 'Εκκαθαριστικό Σημείωμα' },
  { key: 'doc_e2', icon: '🏠', label: 'Ε2 (Μισθώματα)' },
]

const BOOST_LABELS = [
  { key: 'boost_island', label: 'Νησί / Ορεινή Περιοχή', icon: '🏝️' },
  { key: 'boost_single_parent', label: 'Μονογονεική Οικογένεια', icon: '👨‍👧' },
  { key: 'boost_three_children', label: 'Τρίτεκνη Οικογένεια', icon: '👨‍👩‍👧‍👦' },
  { key: 'boost_large_family', label: 'Πολύτεκνη Οικογένεια', icon: '👪' },
  { key: 'boost_youth', label: 'Νέοι 25-35 ετών', icon: '🧑' },
]

const USAGE_LABELS = {
  'ΚΕΝΟ': 'Κενό',
  'ΜΙΣΘΩΜΕΝΟ': 'Μισθωμένο',
  'ΙΔΙΟΚΑΤΟΙΚΗΣΗ': 'Ιδιοκατοίκηση',
}

const ADVISOR_CHECK_ITEMS = [
  { key: 'household_type', label: 'Τύπος Νοικοκυριού', icon: '👥' },
  { key: 'income', label: 'Εισόδημα', icon: '💶' },
  { key: 'special_conditions', label: 'Ειδικές Συνθήκες (αύξηση επιχορήγησης)', icon: '⭐' },
  { key: 'title_deed', label: 'Τίτλος Ιδιοκτησίας', icon: '📄' },
  { key: 'enfia', label: 'ΕΝΦΙΑ', icon: '🏛️' },
  { key: 'electricity_bill', label: 'Λογαριασμός Ρεύματος', icon: '⚡' },
  { key: 'building_permit', label: 'Άδεια Οικοδομής', icon: '🏗️' },
  { key: 'legalization', label: 'Τακτοποίηση Αυθαιρέτου', icon: '⚖️' },
  { key: 'vacant_property', label: 'Έλεγχος Κενού Ακινήτου', icon: '🔑' },
  { key: 'other', label: 'Άλλοι Έλεγχοι', icon: '🔍' },
]

function CheckStatusBadge({ status }) {
  if (status === 'positive') return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
      ✅ Θετικό
    </span>
  )
  if (status === 'negative') return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
      ❌ Αρνητικό
    </span>
  )
  if (status === 'in_progress') return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
      🔄 Σε Εξέλιξη
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200">
      ⏳ Εκκρεμεί
    </span>
  )
}

export default function AnakainizwPortalSection({ caseData }) {
  const ana = caseData?.anakainizw
  if (!ana) return null

  const activeBoosts = BOOST_LABELS.filter(b => ana[b.key])
  const docItems = DOC_ITEMS.map(d => ({ ...d, received: !!ana[d.key] }))
  const visibleDocs = docItems.filter(d => !ana.doc_extras?.[d.key]?.not_needed)
  const docsReceived = visibleDocs.filter(d => d.received).length

  const advisorChecks = ana.advisor_checks || {}
  const visibleChecks = ADVISOR_CHECK_ITEMS.filter(
    item => (advisorChecks[item.key]?.status || 'pending') !== 'not_required'
  )
  const positiveCount = visibleChecks.filter(item => advisorChecks[item.key]?.status === 'positive').length

  const ENERGY_KEYS_SET = new Set(['energy_insulation','energy_windows','energy_hvac','energy_solar','energy_pv','energy_other'])
  const bi = ana.budget_items || {}
  const hasBudget = Object.values(bi).some(v => v > 0)
  const BUDGET_GROUPS = [
    { key: 'energy', label: 'Ενεργειακές Παρεμβάσεις', icon: '⚡', is_energy: true, items: [
      { key: 'energy_insulation', label: 'Θερμομόνωση / θερμοπρόσοψη' },
      { key: 'energy_windows', label: 'Αντικατάσταση κουφωμάτων' },
      { key: 'energy_hvac', label: 'Συστήματα θέρμανσης/ψύξης υψηλής απόδοσης' },
      { key: 'energy_solar', label: 'Ηλιακοί θερμοσίφωνες' },
      { key: 'energy_pv', label: 'Φωτοβολταϊκά / εξοικονόμηση ενέργειας' },
      { key: 'energy_other', label: 'Άλλη δαπάνη (Ενεργειακή)' },
    ]},
    { key: 'general', label: 'Γενική Ανακαίνιση & Επισκευές', icon: '🔨', is_energy: false, items: [
      { key: 'general_kitchen', label: 'Κουζίνα & μπάνιο' },
      { key: 'general_floors', label: 'Πατώματα & κουφώματα εσωτερικά' },
      { key: 'general_drywall', label: 'Γυψοσανίδες & βαφές' },
      { key: 'general_plumbing', label: 'Υδραυλικά & ηλεκτρολογικά' },
      { key: 'general_upgrades', label: 'Λοιπές εργασίες αναβάθμισης' },
      { key: 'general_other', label: 'Άλλη δαπάνη (Γενική)' },
    ]},
    { key: 'consultant', label: 'Δαπάνες Συμβούλου & Μηχανικού', icon: '📋', is_energy: false, items: [
      { key: 'consultant_fees', label: 'Δαπάνες Συμβούλου' },
      { key: 'pea_a', label: 'ΠΕΑ Α' },
      { key: 'pea_b', label: 'ΠΕΑ Β' },
    ]},
  ]
  const energyTotal = Object.entries(bi).filter(([k]) => ENERGY_KEYS_SET.has(k)).reduce((s,[,v]) => s + (v||0), 0)
  const generalTotal = Object.entries(bi).filter(([k]) => !ENERGY_KEYS_SET.has(k)).reduce((s,[,v]) => s + (v||0), 0)
  const grandTotal = energyTotal + generalTotal
  const energyPct = grandTotal > 0 ? Math.round((energyTotal / grandTotal) * 100) : 0
  const maxBudget = ana.max_budget || 0
  const eligible = Math.min(grandTotal, maxBudget > 0 ? maxBudget : grandTotal)
  const subsidyAmt = eligible * ((ana.subsidy_percent || 70) / 100)

  return (
    <div className="space-y-5">
      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1e3a5f] to-[#2c5282] text-white p-6 shadow-lg">
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-10 -left-6 w-32 h-32 rounded-full bg-white/5" />
        <div className="relative flex items-start gap-4">
          <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center text-3xl shadow-inner">🏠</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold uppercase tracking-widest text-blue-200 mb-0.5">Πρόγραμμα</div>
            <h2 className="text-2xl font-extrabold leading-tight">Ανακαινίζω</h2>
            <p className="text-sm text-blue-200 mt-1">Επιδότηση ανακαίνισης κατοικίας</p>
          </div>
          {ana.subsidy_percent && (
            <div className="flex-shrink-0 bg-white/20 backdrop-blur rounded-xl px-4 py-2 text-center border border-white/20">
              <div className="text-2xl font-black">{ana.subsidy_percent}%</div>
              <div className="text-xs text-blue-200 font-medium">Επιδότηση</div>
            </div>
          )}
        </div>
        {activeBoosts.length > 0 && (
          <div className="relative mt-4 flex gap-2 flex-wrap">
            {activeBoosts.map(b => (
              <span key={b.key} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-white/15 border border-white/25 text-blue-100">
                {b.icon} {b.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Property info grid (always visible) ─────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🏡</span>
          <h3 className="text-sm font-bold text-gray-800">Στοιχεία Ακινήτου</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <div className="text-xs text-blue-500 font-medium mb-0.5">Εμβαδόν</div>
            <div className="text-lg font-bold text-blue-800">{ana.property_sqm ? `${ana.property_sqm} τ.μ.` : <span className="text-sm text-blue-300">Σε επεξεργασία</span>}</div>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-xl p-3">
            <div className="text-xs text-green-500 font-medium mb-0.5">Περιοχή</div>
            <div className="text-base font-bold text-green-800 leading-tight">{ana.property_prefecture || <span className="text-sm text-green-300">Σε επεξεργασία</span>}</div>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
            <div className="text-xs text-orange-500 font-medium mb-0.5">Χρήση Ακινήτου</div>
            <div className="text-base font-bold text-orange-800">{ana.property_usage ? (USAGE_LABELS[ana.property_usage] || ana.property_usage) : <span className="text-sm text-orange-300">Σε επεξεργασία</span>}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <div className="text-xs text-gray-500 font-medium mb-0.5">Τύπος Κατοικίας</div>
            <div className="text-base font-bold text-gray-700">{ana.property_type || <span className="text-sm text-gray-300">Σε επεξεργασία</span>}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <div className="text-xs text-gray-500 font-medium mb-0.5">Παλαιότητα</div>
            <div className="text-base font-bold text-gray-700">{ana.property_age || <span className="text-sm text-gray-300">Σε επεξεργασία</span>}</div>
          </div>
        </div>
        {ana.property_address && (
          <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl p-3">
            <div className="text-xs text-gray-400 font-medium mb-0.5">📍 Διεύθυνση</div>
            <div className="text-sm font-semibold text-gray-700">{ana.property_address}</div>
          </div>
        )}
        {ana.renovation_works && (
          <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
            <div className="text-xs text-blue-500 font-medium mb-0.5">Εργασίες Ανακαίνισης</div>
            <div className="text-sm text-blue-800">{ana.renovation_works}</div>
          </div>
        )}
        {ana.legality && (
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
            <div className="text-xs text-gray-500 font-medium mb-0.5">Νομιμότητα Ακινήτου</div>
            <div className="text-sm font-semibold text-gray-700">{ana.legality}</div>
          </div>
        )}
        {ana.cooperating_engineer && (
          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center gap-3">
            <span className="text-2xl">👷</span>
            <div>
              <div className="text-xs text-amber-500 font-medium mb-0.5">Συνεργαζόμενος Μηχανικός</div>
              <div className="text-sm font-bold text-amber-800">{ana.cooperating_engineer}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Income eligibility (always visible, actual income prominent) ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">💶</span>
          <h3 className="text-sm font-bold text-gray-800">Εισοδηματικά Κριτήρια</h3>
        </div>

        {/* Actual income — BIG */}
        <div className={`rounded-2xl p-5 mb-3 border-2 ${
          ana.income_eligible === true ? 'bg-green-50 border-green-300' :
          ana.income_eligible === false ? 'bg-red-50 border-red-300' :
          'bg-gray-50 border-gray-200'
        }`}>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
            {ana.income_eligible === true ? '✅ ΕΠΙΛΕΞΙΜΟΣ' : ana.income_eligible === false ? '❌ ΜΗ ΕΠΙΛΕΞΙΜΟΣ' : '⏳ Υπό Έλεγχο Εισοδήματος'}
          </div>
          <div className={`text-3xl font-black leading-tight ${
            ana.income_eligible === true ? 'text-green-800' :
            ana.income_eligible === false ? 'text-red-800' : 'text-gray-400'
          }`}>
            {ana.actual_income ? fmtEuro(ana.actual_income) : '— €'}
          </div>
          <div className="text-xs text-gray-500 mt-1">Δηλωθέν Εισόδημα</div>
        </div>

        {/* Income limit — small */}
        <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
          <div className="text-xs text-blue-600">
            Τύπος: <strong>{ana.household_type || '—'}</strong>
            {(ana.num_children || 0) > 0 && ` · ${ana.num_children} παιδί${ana.num_children > 1 ? 'α' : ''}`}
            <span className="text-blue-400 ml-1">(max 45.000€)</span>
          </div>
          <div className="text-right">
            <div className="text-xs text-blue-400">Όριο</div>
            <div className="text-sm font-bold text-blue-700">{ana.income_limit ? fmtEuro(ana.income_limit) : '—'}</div>
          </div>
        </div>
      </div>

      {/* ── Document checklist (always visible) ─────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">📂</span>
            <div>
              <h3 className="text-sm font-bold text-gray-800">Έγγραφα Ακινήτου</h3>
              <p className="text-xs text-gray-400 mt-0.5">Απαιτούμενα για τη συγκέντρωση φακέλου</p>
            </div>
          </div>
          <div className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
            docsReceived === visibleDocs.length && visibleDocs.length > 0
              ? 'bg-green-100 text-green-700 border-green-200'
              : 'bg-blue-100 text-blue-700 border-blue-200'
          }`}>
            {docsReceived}/{visibleDocs.length} παραλήφθηκαν
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibleDocs.map(({ key, icon, label, received }) => {
            const notes = ana.doc_extras?.[key]?.notes
            return (
              <div key={key} className={`flex flex-col gap-1 rounded-xl px-4 py-3 border ${
                received ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 text-xl">{received ? '✅' : icon}</span>
                  <span className={`text-sm font-medium leading-tight ${received ? 'text-green-700' : 'text-gray-600'}`}>
                    {label}
                  </span>
                  {received && <span className="ml-auto text-xs font-bold text-green-600">✓</span>}
                </div>
                {notes && <div className="ml-8 text-xs text-gray-500 italic">{notes}</div>}
              </div>
            )
          })}
          {visibleDocs.length === 0 && (
            <div className="col-span-2 text-center text-sm text-gray-400 py-4">
              Τα έγγραφα θα καταγραφούν κατά τη διάρκεια του ελέγχου
            </div>
          )}
        </div>
      </div>

      {/* ── Advisor Checklist (always visible) ──────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔎</span>
            <div>
              <h3 className="text-sm font-bold text-gray-800">Έλεγχοι Επιλεξιμότητας</h3>
              <p className="text-xs text-gray-400 mt-0.5">Ανάλυση από τον Σύμβουλο iMentor</p>
            </div>
          </div>
          <div className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
            positiveCount === visibleChecks.length && visibleChecks.length > 0
              ? 'bg-green-100 text-green-700 border-green-200'
              : positiveCount > 0
              ? 'bg-blue-100 text-blue-700 border-blue-200'
              : 'bg-gray-100 text-gray-500 border-gray-200'
          }`}>
            {positiveCount}/{visibleChecks.length} θετικοί
          </div>
        </div>
        <div className="space-y-2">
          {visibleChecks.map(({ key, label, icon }) => {
            const check = advisorChecks[key] || { status: 'pending', comment: '' }
            return (
              <div key={key} className={`rounded-xl border px-4 py-3 ${
                check.status === 'positive' ? 'bg-green-50 border-green-200' :
                check.status === 'negative' ? 'bg-red-50 border-red-200' :
                check.status === 'in_progress' ? 'bg-blue-50 border-blue-100' :
                'bg-gray-50 border-gray-100'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-base shrink-0">{icon}</span>
                  <span className={`flex-1 text-sm font-medium ${
                    check.status === 'positive' ? 'text-green-800' :
                    check.status === 'negative' ? 'text-red-800' :
                    check.status === 'in_progress' ? 'text-blue-800' :
                    'text-gray-600'
                  }`}>{label}</span>
                  <CheckStatusBadge status={check.status} />
                </div>
                {check.comment && (
                  <div className="mt-1.5 ml-7 text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">
                    {check.comment}
                  </div>
                )}
                {!check.comment && check.status === 'pending' && (
                  <div className="mt-1 ml-7 text-xs text-gray-300 italic">
                    Ο έλεγχος αυτός θα πραγματοποιηθεί κατά τη συνεδρία με τον Σύμβουλο
                  </div>
                )}
              </div>
            )
          })}
          {visibleChecks.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-4">
              Οι έλεγχοι επιλεξιμότητας θα ξεκινήσουν σύντομα
            </div>
          )}
        </div>
      </div>

      {/* ── Budget breakdown (always visible) ───────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">💰</span>
          <h3 className="text-sm font-bold text-gray-800">Προϋπολογισμός Εργασιών</h3>
        </div>
        {hasBudget ? (
          <>
            {BUDGET_GROUPS.map(group => {
              const groupLines = group.items.filter(item => (bi[item.key] || 0) > 0)
              if (groupLines.length === 0) return null
              const groupTotal = groupLines.reduce((s, item) => s + (bi[item.key] || 0), 0)
              return (
                <div key={group.key} className="mb-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm">{group.icon}</span>
                    <span className={`text-xs font-semibold ${group.is_energy ? 'text-blue-700' : 'text-gray-700'}`}>{group.label}</span>
                    <span className="ml-auto text-xs font-bold text-gray-700">{fmtEuro(groupTotal)}</span>
                  </div>
                  {groupLines.map(item => (
                    <div key={item.key} className="flex justify-between text-xs text-gray-600 pl-5 py-0.5">
                      <span>{item.label}</span>
                      <span className="font-medium">{fmtEuro(bi[item.key])}</span>
                    </div>
                  ))}
                </div>
              )
            })}
            <div className="mt-3 bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs border border-gray-200">
              <div className="flex justify-between font-semibold text-gray-800">
                <span>Σύνολο Προϋπολογισμού</span>
                <span>{fmtEuro(grandTotal)}</span>
              </div>
              {maxBudget > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Ανώτατο Επιλέξιμο (τ.μ.×300, max 36.000€)</span>
                  <span className="font-medium">{fmtEuro(maxBudget)}</span>
                </div>
              )}
              <div className={`flex justify-between font-medium ${energyPct >= 20 ? 'text-green-700' : 'text-red-600'}`}>
                <span>Ενεργειακά {energyPct}% {energyPct >= 20 ? '✓' : '⚠ απαιτείται ≥20%'}</span>
                <span>{fmtEuro(energyTotal)}</span>
              </div>
              <div className="flex justify-between text-green-700 font-bold border-t pt-1.5">
                <span>Εκτιμώμενη Επιδότηση ({ana.subsidy_percent || 70}%)</span>
                <span>{fmtEuro(subsidyAmt)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-6 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
            <div className="text-2xl mb-2">📋</div>
            Ο προϋπολογισμός εργασιών θα καταρτιστεί κατά τη διαδικασία
          </div>
        )}
      </div>

    </div>
  )
}
