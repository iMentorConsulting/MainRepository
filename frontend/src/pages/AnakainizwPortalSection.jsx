// AnakainizwPortalSection.jsx
// Renders ΑΝΑΚΑΙΝΙΖΩ-specific content on the client portal page.

function fmtEuro(n) {
  if (!n && n !== 0) return '—'
  return n.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

const BANK_ACCOUNTS = [
  { bank: 'Πειραιώς', iban: 'GR4501714330006433164381388' },
  { bank: 'Eurobank', iban: 'GR5802601680000060201330648' },
  { bank: 'Alpha Bank', iban: 'GR2401407750775002330002138' },
]

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

  const totalBudget = (ana.energy_works_budget || 0) + (ana.general_works_budget || 0)
  const maxBudget = ana.max_budget || 0
  const energyPct = ana.energy_pct ?? (totalBudget > 0 ? Math.round(((ana.energy_works_budget || 0) / totalBudget) * 100) : 0)
  const generalPct = totalBudget > 0 ? 100 - energyPct : 0
  const energyOk = energyPct >= 20

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
          {maxBudget > 0 && (
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
              <div className="text-xs text-purple-500 font-medium mb-0.5">Μέγ. Π/Υ Επιδότησης</div>
              <div className="text-lg font-bold text-purple-800">{fmtEuro(maxBudget)}</div>
              <div className="text-xs text-purple-400 mt-0.5">τ.μ. × 300€, max 36.000€</div>
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

      {/* ── Budget breakdown ─────────────────────────────────────────────── */}
      {totalBudget > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">💰</span>
              <h3 className="text-sm font-bold text-gray-800">Προϋπολογισμός Εργασιών</h3>
            </div>
            <span className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-semibold border border-gray-200">
              Σύνολο: {fmtEuro(totalBudget)}
            </span>
          </div>

          <div className="mb-4">
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-base">⚡</span>
                <span className="text-sm font-semibold text-gray-700">Ενεργειακές Παρεμβάσεις</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                  energyOk ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'
                }`}>
                  {energyOk ? `${energyPct}% ✓` : `${energyPct}% — απαιτείται ≥20%`}
                </span>
              </div>
              <span className="text-sm font-bold text-gray-800">{fmtEuro(ana.energy_works_budget)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${energyOk ? 'bg-green-500' : 'bg-red-400'}`}
                style={{ width: `${Math.min(100, energyPct)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-base">🔨</span>
                <span className="text-sm font-semibold text-gray-700">Γενικές Εργασίες</span>
                <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">{generalPct}%</span>
              </div>
              <span className="text-sm font-bold text-gray-800">{fmtEuro(ana.general_works_budget)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full transition-all bg-blue-400" style={{ width: `${Math.min(100, generalPct)}%` }} />
            </div>
          </div>

          {maxBudget > 0 && (
            <div className={`mt-4 rounded-xl p-3 border flex items-start gap-2 ${
              totalBudget <= maxBudget ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
            }`}>
              <span className="text-base flex-shrink-0">{totalBudget <= maxBudget ? '✅' : '⚠️'}</span>
              <div className={`text-xs ${totalBudget <= maxBudget ? 'text-green-700' : 'text-orange-700'}`}>
                {totalBudget <= maxBudget
                  ? <>Ο προϋπολογισμός <strong>{fmtEuro(totalBudget)}</strong> είναι εντός του μέγιστου ορίου {fmtEuro(maxBudget)}.</>
                  : <>Ο προϋπολογισμός <strong>{fmtEuro(totalBudget)}</strong> υπερβαίνει το μέγιστο όριο {fmtEuro(maxBudget)}. Η επιδότηση υπολογίζεται μέχρι το όριο.</>
                }
              </div>
            </div>
          )}
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

      {/* ── Inspection fee payment section ──────────────────────────────── */}
      {ana.inspection_fee_paid === false && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 shadow-sm">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-amber-400/10" />
          <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-amber-400/10" />

          <div className="relative">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-amber-400 text-white flex items-center justify-center text-2xl shadow">
                🏦
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-0.5">Εκκρεμεί Πληρωμή</div>
                <h3 className="text-base font-extrabold text-amber-900">Έλεγχος Ακινήτου & Εισοδηματικών Κριτηρίων</h3>
                <p className="text-sm text-amber-700 mt-1">Απαιτείται εφάπαξ πληρωμή για τον αρχικό έλεγχο επιλεξιμότητας.</p>
              </div>
            </div>

            <div className="bg-white border border-amber-200 rounded-xl p-4 mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-amber-600 font-medium mb-0.5">Ποσό πληρωμής</div>
                <div className="text-2xl font-black text-amber-900">60,76 €</div>
                <div className="text-xs text-amber-500 mt-0.5">49 € + ΦΠΑ 24%</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Δικαιούχος</div>
                <div className="text-sm font-bold text-gray-800">I MENTOR IKE</div>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-2">Τραπεζικοί Λογαριασμοί</div>
              {BANK_ACCOUNTS.map(({ bank, iban }) => (
                <div key={bank} className="bg-white border border-amber-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-gray-700 flex-shrink-0">{bank}</span>
                  <span className="text-xs font-mono text-gray-600 break-all text-right">{iban}</span>
                </div>
              ))}
            </div>

            <div className="bg-amber-100 border border-amber-300 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <span className="flex-shrink-0 text-base">📲</span>
              <span>Μετά την πληρωμή, <strong>στείλτε την απόδειξη</strong> στον σύμβουλό σας μέσω της φόρμας επικοινωνίας παρακάτω ή με email.</span>
            </div>
          </div>
        </div>
      )}

      {ana.inspection_fee_paid === true && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-green-500 text-white flex items-center justify-center text-2xl shadow flex-shrink-0">✅</div>
          <div>
            <div className="text-sm font-bold text-green-800">Πληρωμή Ελέγχου — Εξοφλημένο</div>
            <div className="text-xs text-green-600 mt-0.5">Ο έλεγχος ακινήτου &amp; εισοδηματικών κριτηρίων έχει καλυφθεί.</div>
          </div>
        </div>
      )}
    </div>
  )
}
