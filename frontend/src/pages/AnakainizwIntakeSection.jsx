// AnakainizwIntakeSection.jsx
// Client intake form for ΑΝΑΚΑΙΝΙΖΩ portal — property + household confirmation + missing docs upload.

import { useState } from 'react'
import { submitAnakainizwIntake, uploadPortalFile } from '../api'

const USAGE_OPTIONS = [
  { value: 'ΚΕΝΟ', label: 'Κενό' },
  { value: 'ΜΙΣΘΩΜΕΝΟ', label: 'Μισθωμένο' },
  { value: 'ΙΔΙΟΚΑΤΟΙΚΗΣΗ', label: 'Ιδιοκατοίκηση' },
]

const TYPE_OPTIONS = [
  'Μονοκατοικία',
  'Διαμέρισμα',
  'Μεζονέτα',
  'Ισόγειο',
  'Άλλο',
]

const AGE_OPTIONS = [
  'Πριν το 1980',
  '1980–2000',
  '2000–2011',
  'Πριν το 1960',
]

const HOUSEHOLD_OPTIONS = [
  { value: 'άγαμος', label: 'Άγαμος/η (μεμονωμένο άτομο)' },
  { value: 'ζευγάρι', label: 'Ζευγάρι / Οικογένεια' },
]

const SPECIAL_CONDITIONS = [
  { key: 'boost_island', icon: '🏝️', label: 'Νησί / Ορεινή Περιοχή', hint: 'Το ακίνητο βρίσκεται σε νησί ή ορεινή περιοχή' },
  { key: 'boost_single_parent', icon: '👨‍👧', label: 'Μονογονεϊκή Οικογένεια', hint: 'Ένας γονέας με εξαρτώμενα τέκνα' },
  { key: 'boost_three_children', icon: '👨‍👩‍👧‍👦', label: 'Τρίτεκνη Οικογένεια', hint: 'Οικογένεια με 3 εξαρτώμενα τέκνα' },
  { key: 'boost_large_family', icon: '👪', label: 'Πολύτεκνη Οικογένεια', hint: 'Οικογένεια με 4+ εξαρτώμενα τέκνα' },
  { key: 'boost_youth', icon: '🧑', label: 'Νέος/α 25–35 ετών', hint: 'Ο αιτών έχει ηλικία 25 έως 35 ετών' },
  { key: 'boost_disability', icon: '♿', label: 'ΑμεΑ', hint: 'Πιστοποιημένη αναπηρία' },
]

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

function fmtDateTime(isoStr) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return d.toLocaleString('el-GR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Athens' })
  } catch {
    return isoStr
  }
}

export default function AnakainizwIntakeSection({ caseData, token, onRefresh }) {
  const ana = caseData?.anakainizw || {}
  const alreadySubmitted = !!ana.client_intake_submitted_at

  const [form, setForm] = useState({
    property_sqm: ana.property_sqm ?? '',
    property_prefecture: ana.property_prefecture ?? '',
    property_address: ana.property_address ?? '',
    property_type: ana.property_type ?? '',
    property_age: ana.property_age ?? '',
    property_usage: ana.property_usage ?? '',
    renovation_works: ana.renovation_works ?? '',
    legality: ana.legality ?? '',
    household_type: ana.household_type ?? '',
    num_children: ana.num_children ?? 0,
    actual_income: ana.actual_income ?? '',
    boost_island: ana.boost_island ?? false,
    boost_single_parent: ana.boost_single_parent ?? false,
    boost_three_children: ana.boost_three_children ?? false,
    boost_large_family: ana.boost_large_family ?? false,
    boost_youth: ana.boost_youth ?? false,
    boost_disability: ana.boost_disability ?? false,
  })

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [submittedAt, setSubmittedAt] = useState(ana.client_intake_submitted_at || null)

  // Per-doc upload state
  const [uploading, setUploading] = useState({})
  const [uploaded, setUploaded] = useState({})
  const [uploadError, setUploadError] = useState({})

  const missingDocs = DOC_ITEMS.filter(d => {
    const received = !!ana[d.key]
    const extras = ana.doc_extras?.[d.key]
    const notNeeded = extras?.not_needed === true
    return !received && !notNeeded
  })

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        property_sqm: form.property_sqm !== '' ? parseFloat(form.property_sqm) : null,
        num_children: parseInt(form.num_children, 10) || 0,
        actual_income: form.actual_income !== '' ? parseFloat(form.actual_income) : null,
      }
      const res = await submitAnakainizwIntake(token, payload)
      setSubmittedAt(res.submitted_at)
      setSaved(true)
      onRefresh?.()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Σφάλμα αποστολής. Παρακαλώ δοκιμάστε ξανά.')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(docKey, file) {
    setUploading(u => ({ ...u, [docKey]: true }))
    setUploadError(ue => ({ ...ue, [docKey]: '' }))
    try {
      await uploadPortalFile(token, file)
      setUploaded(u => ({ ...u, [docKey]: file.name }))
    } catch {
      setUploadError(ue => ({ ...ue, [docKey]: 'Αποτυχία μεταφόρτωσης' }))
    } finally {
      setUploading(u => ({ ...u, [docKey]: false }))
    }
  }

  const isLocked = alreadySubmitted || saved

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl shadow">📝</div>
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-0.5">Απαιτείται Ενέργεια</div>
            <h3 className="text-base font-extrabold text-blue-900">Επιβεβαίωση Στοιχείων Ακινήτου &amp; Νοικοκυριού</h3>
            <p className="text-sm text-blue-700 mt-1">
              Παρακαλώ ελέγξτε και συμπληρώστε τα παρακάτω στοιχεία ώστε ο σύμβουλός σας να προχωρήσει με τον έλεγχο επιλεξιμότητάς σας.
            </p>
          </div>
        </div>

        {(isLocked) && (
          <div className="mt-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
            <span className="text-lg">✅</span>
            <span>
              <strong>Η φόρμα έχει υποβληθεί</strong>
              {submittedAt && <span className="text-green-600 ml-1">— {fmtDateTime(submittedAt)}</span>}
            </span>
          </div>
        )}
      </div>

      {/* ── Property Details Form ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <span>🏠</span> Στοιχεία Ακινήτου
        </h4>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Prefecture */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Νομός / Περιοχή</label>
              <input
                type="text"
                value={form.property_prefecture}
                onChange={e => set('property_prefecture', e.target.value)}
                disabled={isLocked}
                placeholder="π.χ. Αττική"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            {/* Sqm */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Εμβαδόν (τ.μ.)</label>
              <input
                type="number"
                min="1"
                step="0.1"
                value={form.property_sqm}
                onChange={e => set('property_sqm', e.target.value)}
                disabled={isLocked}
                placeholder="π.χ. 85"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            {/* Address */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Διεύθυνση Ακινήτου</label>
              <input
                type="text"
                value={form.property_address}
                onChange={e => set('property_address', e.target.value)}
                disabled={isLocked}
                placeholder="Οδός, Αριθμός, Πόλη, ΤΚ"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Τύπος Κατοικίας</label>
              <select
                value={form.property_type}
                onChange={e => set('property_type', e.target.value)}
                disabled={isLocked}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              >
                <option value="">— Επιλέξτε —</option>
                {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {/* Age */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Παλαιότητα Κατοικίας</label>
              <select
                value={form.property_age}
                onChange={e => set('property_age', e.target.value)}
                disabled={isLocked}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              >
                <option value="">— Επιλέξτε —</option>
                {AGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {/* Usage */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Χρήση Ακινήτου</label>
              <select
                value={form.property_usage}
                onChange={e => set('property_usage', e.target.value)}
                disabled={isLocked}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              >
                <option value="">— Επιλέξτε —</option>
                {USAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {/* Legality */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Νομιμότητα Ακινήτου</label>
              <input
                type="text"
                value={form.legality}
                onChange={e => set('legality', e.target.value)}
                disabled={isLocked}
                placeholder="π.χ. Νόμιμο, Τακτοποιημένο..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            {/* Renovation works */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Εργασίες Ανακαίνισης που σκοπεύετε να πραγματοποιήσετε</label>
              <textarea
                rows={3}
                value={form.renovation_works}
                onChange={e => set('renovation_works', e.target.value)}
                disabled={isLocked}
                placeholder="π.χ. Μόνωση, κουφώματα, εγκαταστάσεις..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500 resize-none"
              />
            </div>
          </div>

          {/* ── Household ── */}
          <div className="border-t pt-4 mt-2">
            <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
              <span>👥</span> Στοιχεία Νοικοκυριού
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Τύπος Νοικοκυριού</label>
                <select
                  value={form.household_type}
                  onChange={e => set('household_type', e.target.value)}
                  disabled={isLocked}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="">— Επιλέξτε —</option>
                  {HOUSEHOLD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Αριθμός Τέκνων</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={form.num_children}
                  onChange={e => set('num_children', e.target.value)}
                  disabled={isLocked}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Δηλωθέν Εισόδημα (€)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.actual_income}
                  onChange={e => set('actual_income', e.target.value)}
                  disabled={isLocked}
                  placeholder="π.χ. 18000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
            </div>
          </div>

          {/* ── Special Conditions ── */}
          <div className="border-t pt-4 mt-2">
            <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-1 flex items-center gap-2">
              <span>⭐</span> Ειδικές Συνθήκες (αύξηση επιχορήγησης)
            </h4>
            <p className="text-xs text-gray-500 mb-3">Επιλέξτε αν ισχύει κάποια από τις παρακάτω κατηγορίες. Μπορεί να αυξήσουν το ποσοστό επιχορήγησής σας.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SPECIAL_CONDITIONS.map(({ key, icon, label, hint }) => (
                <label key={key} className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all ${
                  isLocked ? 'cursor-default opacity-70' : 'hover:border-blue-300 hover:bg-blue-50/50'
                } ${form[key] ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200'}`}>
                  <input
                    type="checkbox"
                    checked={!!form[key]}
                    disabled={isLocked}
                    onChange={e => set(key, e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded accent-blue-600 flex-shrink-0"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{icon} {label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* ── Submit ── */}
          {!isLocked && (
            <div className="pt-2">
              {error && (
                <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold shadow hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-60"
              >
                {saving ? 'Αποστολή...' : '✅ Υποβολή Στοιχείων'}
              </button>
              <p className="mt-2 text-xs text-gray-400">Μετά την υποβολή, τα στοιχεία δεν μπορούν να τροποποιηθούν από εδώ.</p>
            </div>
          )}
        </form>
      </div>

      {/* ── Missing Documents Upload ── */}
      {missingDocs.length > 0 && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
          <h4 className="text-sm font-bold text-orange-800 uppercase tracking-wide mb-1 flex items-center gap-2">
            <span>📎</span> Εκκρεμή Έγγραφα
          </h4>
          <p className="text-xs text-orange-600 mb-4">Τα παρακάτω έγγραφα δεν έχουν παραληφθεί ακόμα. Εάν τα έχετε διαθέσιμα, μπορείτε να τα ανεβάσετε εδώ.</p>
          <div className="space-y-3">
            {missingDocs.map(doc => (
              <div key={doc.key} className="bg-white border border-orange-100 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-lg">{doc.icon}</span>
                  <span className="text-sm font-medium text-gray-800">{doc.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {uploaded[doc.key] ? (
                    <div className="flex items-center gap-1 text-green-700 text-xs font-bold">
                      <span>✅</span> <span className="truncate max-w-[180px]">{uploaded[doc.key]}</span>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploading[doc.key]}
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) handleUpload(doc.key, file)
                        }}
                      />
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        uploading[doc.key]
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200'
                      }`}>
                        {uploading[doc.key] ? '⏳ Αποστολή...' : '📤 Ανέβασμα'}
                      </span>
                    </label>
                  )}
                  {uploadError[doc.key] && (
                    <span className="text-xs text-red-500">{uploadError[doc.key]}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-orange-500">
            Μετά το ανέβασμα, ο σύμβουλός σας θα λάβει ειδοποίηση και θα ενημερώσει το αρχείο σας.
          </p>
        </div>
      )}
    </div>
  )
}
