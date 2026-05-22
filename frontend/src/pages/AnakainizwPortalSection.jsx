// AnakainizwPortalSection.jsx
// Renders ΑΝΑΚΑΙΝΙΖΩ-specific content on the client portal page.

function fmtEuro(n) {
  if (!n && n !== 0) return '—'
  return n.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

// Document checklist items with labels and their field keys
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

export default function AnakainizwPortalSection({ caseData }) {
  const ana = caseData?.anakainizw
  if (!ana) return null

  const activeBoosts = BOOST_LABELS.filter(b => ana[b.key])
  const docItems = DOC_ITEMS.map(d => ({ ...d, received: !!ana[d.key] }))
  const docsReceived = docItems.filter(d => d.received).length

  return (
    <div className="space-y-5">
      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1e3a5f] to-[#2c5282] text-white p-6 shadow-lg">
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-10 -left-6 w-32 h-32 rounded-full bg-white/5" />

        <div className="relative flex items-start gap-4">
          <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center text-3xl shadow-inner">
            🏠
          </div>
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

        {/* Boost badges */}
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

      {/* ── Property info grid ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🏡</span>
          <h3 className="text-sm font-bold text-gray-800">Στοιχεία Ακινήτου</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ana.property_sqm && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <div className="text-xs text-blue-500 font-medium mb-0.5">Εμβαδόν</div>
              <div className="text-lg font-bold text-blue-800">{ana.property_sqm} τ.μ.</div>
            </div>
          )}
          {ana.property_prefecture && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-3">
              <div className="text-xs text-green-500 font-medium mb-0.5">Περιοχή</div>
              <div className="text-base font-bold text-green-800 leading-tight">{ana.property_prefecture}</div>
            </div>
          )}
          {ana.property_usage && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
              <div className="text-xs text-orange-500 font-medium mb-0.5">Χρήση Ακινήτου</div>
              <div className="text-base font-bold text-orange-800">{USAGE_LABELS[ana.property_usage] || ana.property_usage}</div>
            </div>
          )}
          {ana.property_type && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <div className="text-xs text-gray-500 font-medium mb-0.5">Τύπος Κατοικίας</div>
              <div className="text-base font-bold text-gray-700">{ana.property_type}</div>
            </div>
          )}
          {ana.property_age && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <div className="text-xs text-gray-500 font-medium mb-0.5">Παλαιότητα</div>
              <div className="text-base font-bold text-gray-700">{ana.property_age}</div>
            </div>
          )}
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

      {/* ── Income limit info ─────────────────────────────────────────────── */}
      {ana.income_limit > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">💶</span>
            <h3 className="text-sm font-bold text-gray-800">Εισοδηματικά Κριτήρια</h3>
          </div>
          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div>
              <div className="text-xs text-blue-500 font-medium mb-0.5">
                Τύπος νοικοκυριού: {ana.household_type || '—'}
                {(ana.num_children || 0) > 0 && ` με ${ana.num_children} παιδί${ana.num_children > 1 ? 'α' : ''}`}
              </div>
              <div className="text-xs text-blue-400">Βασικό εισόδημα + {ana.num_children || 0} × 5.000€</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-blue-500 font-medium mb-0.5">Όριο Εισοδήματος</div>
              <div className="text-xl font-black text-blue-800">{fmtEuro(ana.income_limit)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Document checklist ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">📂</span>
            <div>
              <h3 className="text-sm font-bold text-gray-800">Έγγραφα Ακινήτου</h3>
              <p className="text-xs text-gray-400 mt-0.5">Απαιτούμενα για τη συγκέντρωση φακέλου</p>
            </div>
          </div>
          <div className="text-xs font-bold px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
            {docsReceived}/{docItems.length} παραλήφθηκαν
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {docItems.map(({ key, icon, label, received }) => (
            <div
              key={key}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors ${
                received
                  ? 'bg-green-50 border-green-200'
                  : 'bg-gray-50 border-gray-100'
              }`}
            >
              <span className="flex-shrink-0 text-xl">{received ? '✅' : icon}</span>
              <span className={`text-sm font-medium leading-tight ${received ? 'text-green-700' : 'text-gray-600'}`}>
                {label}
              </span>
              {received && (
                <span className="ml-auto text-xs font-bold text-green-600">✓</span>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
