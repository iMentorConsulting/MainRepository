'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Building2, Briefcase, ShieldCheck, FileSignature, Lock, Banknote, Rocket, CheckCircle2, PlusCircle, Trash2, Info, Globe2 } from 'lucide-react'

// Σημείο 5 της λίστας αφορά τη Δήλωση Σώρευσης De minimis — δεν επαναλαμβάνεται
// ως ξεχωριστό checkbox, καλύπτεται από το ένα μεγάλο checkbox αποδοχής.
const TERMS = [
  'Η δημιουργούμενη θέση εργασίας αντιπροσωπεύει καθαρή αύξηση της απασχόλησης της επιχείρησης του μήνα/τριμήνου που προηγείται της υποβολής της ηλεκτρονικής αίτησης',
  'Η αίτηση χρηματοδότησης επέχει θέση υπεύθυνης δήλωσης του άρθρου 8 του ν.1599/1986(ΦΕΚ Α΄75) για τα στοιχεία που αναφέρονται σε αυτήν. Συνεπώς θα πρέπει να εμφανίζει ταυτότητα περιεχομένου με τα σχετικά δικαιολογητικά. Η ανακρίβεια των στοιχείων που δηλώνονται στην αίτηση επισύρει τις προβλεπόμενες ποινικές και διοικητικές κυρώσεις.',
  'Οι δικαιούχοι φέρουν την ευθύνη της πλήρους και ορθής συμπλήρωσης της ηλεκτρονικής τους αίτησης(συμπεριλαμβανομένων και των επισυναπτόμενων αρχείων)',
  'Διόρθωση ή τροποποίηση ή συμπλήρωση των αιτήσεων, συμπλήρωση τυχόν ελλειπόντων στοιχείων, έστω και συμπληρωματικών ή διευκρινιστικών, δεν επιτρέπεται μετά την ηλεκτρονική υποβολή της αίτησης',
  'Έχω επισυνάψει την Δήλωση Σώρευσης του Καν. 2831/2023 De minimis',
  'Οι δικαιούχοι φέρουν την αποκλειστική ευθύνη της επικαιροποίησης των στοιχείων του μητρώου της επιχείρησης τους πριν την οριστικοποίηση της υποβολής της παρούσας αίτησης.',
  'Οι δικαιούχοι δεσμεύονται να μην έχουν υπαχθεί ούτε να αιτηθούν την υπαγωγή των ατόμων που θα προσλάβουν μέσω του παρόντος προγράμματος, ταυτόχρονα και σε άλλα προγράμματα ή επενδυτικά σχέδια ή δράσεις ενισχύσεων,στα οποία επιχορηγείται το μισθολογικό ή/και το μη μισθολογικό κόστος',
]

const FINAL_TERMS_TEXT = 'Έλαβα γνώση των όρων και προϋποθέσεων του προγράμματος όπως ορίζονται στη Δημόσια Πρόσκληση τους οποίους αποδέχομαι και πληρώ'

const DECLARATIONS: { field: 'noRecentLaborFines' | 'genderEqualityPrinciple' | 'noRecentStaffReduction'; text: string }[] = [
  {
    field: 'noRecentLaborFines',
    text: 'Στην επιχείρηση δεν έχουν επιβληθεί πρόστιμα, σύμφωνα με τον ν. 4488/2017, μέσα σε χρονικό διάστημα δύο (2) ετών από την ημερομηνία ανάρτησης της εντολής κενής θέσης - δήλωσης προτίμησης - ελέγχου προϋποθέσεων: α) τρεις (3) πράξεις επιβολής προστίμου από τα αρμόδια ελεγκτικά όργανα της Επιθεώρησης Εργασίας για παραβάσεις της εργατικής νομοθεσίας που χαρακτηρίζονται, σύμφωνα με την υπό στοιχεία 80016/31-8-2022 (Β΄ 4629), υπουργική απόφαση όπως ισχύει, ως «υψηλής» ή «πολύ υψηλής» σοβαρότητας, οι οποίες προκύπτουν αθροιστικά από τρεις (3) διενεργηθέντες ελέγχους ή β) δύο (2) πράξεις επιβολής προστίμου από τα αρμόδια ελεγκτικά όργανα της Επιθεώρησης Εργασίας ή του Ενιαίου Φορέα Κοινωνικής Ασφάλισης (e-ΕΦΚΑ) για παραβάσεις που αφορούν αδήλωτη εργασία, οι οποίες προκύπτουν αθροιστικά από δύο (2) διενεργηθέντες ελέγχους. Ο δυνητικά δικαιούχος κατά την ανάρτηση της εντολής κενής θέσης δηλώνει υπεύθυνα ότι δεν έχουν επιβληθεί σε βάρος του οι ως άνω κυρώσεις.',
  },
  {
    field: 'genderEqualityPrinciple',
    text: 'Η επιχείρηση τηρεί την αρχή της «Ισότητας μεταξύ ανδρών και γυναικών και πρόληψης διακρίσεων». Κατά την αξιολόγηση εξετάζεται αν προασπίζεται η ισότητα μεταξύ ανδρών και γυναικών και αποτρέπεται κάθε διάκριση λόγω φύλου, φυλής, εθνοτικής καταγωγής, θρησκείας, πεποιθήσεων, αναπηρίας, ηλικίας, γενετήσιου προσανατολισμού καθώς και στις περιπτώσεις που απασχολούνται άτομα με αναπηρία, η εξασφάλιση της προσβασιμότητας τους στους χώρους εργασίας.',
  },
  {
    field: 'noRecentStaffReduction',
    text: 'Η επιχείρηση δεν έχει προβεί σε μείωση προσωπικού κατά το μήνα/τρίμηνο που προηγείται της ανάρτησης της εντολής κενής θέσης (σύμφωνα με τους όρους και τις προϋποθέσεις της ΚΥΑ του προγράμματος για το οποίο αιτείται).',
  },
]

const EXPERIENCE_OPTIONS = [
  { value: 'NONE', label: 'Δεν απαιτείται' },
  { value: 'UP_TO_1', label: 'μέχρι ένα έτος' },
  { value: 'UP_TO_2', label: 'μέχρι δύο έτη' },
  { value: 'TWO_TO_FIVE', label: 'από δύο έως πέντε έτη' },
  { value: 'OVER_FIVE', label: 'περισσότερα από πέντε έτη' },
]

export interface DypaFormValue {
  ownerIsLegalEntity: boolean
  ownerLegalEntityName: string | null
  hasExistingStaff: boolean
  staffIndefiniteFull: number | null
  staffIndefinitePart: number | null
  staffFixedFull: number | null
  staffFixedPart: number | null
  staffOtherForm: number | null
  affiliatedCompanies: { name: string; afm: string }[] | null
  positionTitle: string | null
  positionDescription: string | null
  requiresLicense: boolean
  licenseDescription: string | null
  requiredExperience: string | null
  requiresForeignLanguage: boolean
  foreignLanguageDescription: string | null
  noRecentLaborFines: boolean
  genderEqualityPrinciple: boolean
  noRecentStaffReduction: boolean
  termsAcceptedAt: string | null
  finalAcceptedAt: string | null
  hireStartDate: string | null
  taxisnetUsernameSet: boolean
  taxisnetPasswordSet: boolean
  initialFeeStatus: string
  recurringFeeActive: boolean
  billingCycleCount: number
  status: string
}

export interface DypaBusinessInfo {
  afm: string
  onomasia: string | null
  postalAddress?: string | null
  postalAddressNo?: string | null
  postalAreaDescription?: string | null
  regdate?: string | null
  mainActivity?: string | null
}

export interface DypaProgramInfo {
  title: string
  description?: string | null
  minSubsidyPct?: number | null
  maxSubsidyPct?: number | null
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500'
const labelCls = 'text-sm font-medium text-gray-700 mb-1 block'

export function DypaForm({
  value, business, program, onPatch, onSubmitTaxisnet, onAcceptTerms, onFinalAccept, onSetHireStartDate,
  pricing, canSetHireDate, canConfirmPayment, onConfirmPayment, showTaxisnet = true, saving,
}: {
  value: DypaFormValue
  business?: DypaBusinessInfo | null
  program?: DypaProgramInfo | null
  onPatch: (patch: Record<string, any>) => Promise<void> | void
  onSubmitTaxisnet: (username: string, password: string) => Promise<void> | void
  onAcceptTerms: () => Promise<void> | void
  onFinalAccept: (businessClaimsPaid: boolean) => Promise<void> | void
  onSetHireStartDate: (date: string) => Promise<void> | void
  pricing?: { initialFeeCents: number; recurringFeeCents: number; ibanHolderName: string; ibanPiraeus: string; ibanEurobank: string; ibanAlpha: string }
  canSetHireDate: boolean
  canConfirmPayment?: boolean
  onConfirmPayment?: () => Promise<void> | void
  showTaxisnet?: boolean
  saving?: boolean
}) {
  const [affiliated, setAffiliated] = useState(value.affiliatedCompanies || [])
  const [taxisnetUser, setTaxisnetUser] = useState('')
  const [taxisnetPass, setTaxisnetPass] = useState('')
  const [hireDate, setHireDate] = useState(value.hireStartDate ? value.hireStartDate.slice(0, 10) : '')
  const [termsChecked, setTermsChecked] = useState<boolean[]>(TERMS.map(() => !!value.termsAcceptedAt))
  const [finalChecked, setFinalChecked] = useState(!!value.finalAcceptedAt)
  const [businessClaimsPaid, setBusinessClaimsPaid] = useState(false)

  const locked = !!value.finalAcceptedAt

  function addAffiliated() {
    setAffiliated(a => [...a, { name: '', afm: '' }])
  }
  function updateAffiliated(i: number, field: string, v: string) {
    setAffiliated(a => a.map((row, idx) => idx === i ? { ...row, [field]: v } : row))
  }
  function removeAffiliated(i: number) {
    setAffiliated(a => a.filter((_, idx) => idx !== i))
  }

  const euro = (cents: number) => (cents / 100).toLocaleString('el-GR', { minimumFractionDigits: 2 })

  return (
    <div className="space-y-6">
      {(business || program) && (
        <Card className="border-slate-300 bg-slate-50">
          <CardContent className="p-5 space-y-4">
            {business && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Στοιχεία Επιχείρησης</p>
                <div className="grid sm:grid-cols-2 gap-2 text-sm text-slate-800">
                  <p><span className="text-slate-500">ΑΦΜ:</span> <strong>{business.afm}</strong></p>
                  <p><span className="text-slate-500">Επωνυμία:</span> <strong>{business.onomasia || '—'}</strong></p>
                  <p><span className="text-slate-500">Έδρα:</span> <strong>{[business.postalAddress, business.postalAddressNo, business.postalAreaDescription].filter(Boolean).join(' ') || '—'}</strong></p>
                  <p><span className="text-slate-500">Βασική δραστηριότητα:</span> <strong>{business.mainActivity || '—'}</strong></p>
                  <p><span className="text-slate-500">Ημ/νία έναρξης:</span> <strong>{business.regdate || '—'}</strong></p>
                </div>
              </div>
            )}
            {program && (
              <div className="border-t border-slate-200 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Πρόγραμμα</p>
                <p className="text-sm text-slate-800 font-semibold">{program.title}</p>
                {program.description && <p className="text-sm text-slate-600 mt-1">{program.description}</p>}
                {(program.minSubsidyPct || program.maxSubsidyPct) && (
                  <p className="text-xs text-slate-500 mt-1">
                    Ποσοστό επιδότησης: {program.minSubsidyPct ?? program.maxSubsidyPct}%{program.minSubsidyPct && program.maxSubsidyPct && program.minSubsidyPct !== program.maxSubsidyPct ? ` - ${program.maxSubsidyPct}%` : ''}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
            <Building2 size={18} className="text-indigo-600" /> 1. Συνδεδεμένες Επιχειρήσεις
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={locked} checked={value.ownerIsLegalEntity}
              onChange={e => onPatch({ ownerIsLegalEntity: e.target.checked })} />
            Ο ιδιοκτήτης/μέτοχος ≥25% είναι νομικό πρόσωπο
          </label>
          {value.ownerIsLegalEntity && (
            <div>
              <label className={labelCls}>Επωνυμία νομικού προσώπου</label>
              <input disabled={locked} className={inputCls} value={value.ownerLegalEntityName || ''}
                onChange={e => onPatch({ ownerLegalEntityName: e.target.value })} />
            </div>
          )}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
            Υπάρχουν άλλες επιχειρήσεις συνδεδεμένες με την επιχείρηση, ή μέτοχοι/εταίροι της επιχείρησης που συμμετέχουν με ποσοστό άνω του 25% σε άλλη επιχείρηση (συμπεριλαμβανομένων ατομικών επιχειρήσεων που ανήκουν στους ίδιους τους μετόχους/εταίρους);
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls + ' mb-0'}>Αν ΝΑΙ, καταχωρίστε επωνυμία &amp; ΑΦΜ</label>
              {!locked && (
                <button type="button" onClick={addAffiliated} className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">
                  <PlusCircle size={14} /> Προσθήκη
                </button>
              )}
            </div>
            <div className="space-y-2">
              {affiliated.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_180px_auto] gap-2">
                  <input disabled={locked} className={inputCls} placeholder="Επωνυμία" value={row.name}
                    onChange={e => updateAffiliated(i, 'name', e.target.value)} />
                  <input disabled={locked} className={inputCls} placeholder="ΑΦΜ" value={row.afm}
                    onChange={e => updateAffiliated(i, 'afm', e.target.value)} />
                  {!locked && (
                    <button type="button" onClick={() => removeAffiliated(i)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                  )}
                </div>
              ))}
            </div>
            {!locked && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => onPatch({ affiliatedCompanies: affiliated })}>
                Αποθήκευση Συνδεδεμένων
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
            <Briefcase size={18} className="text-indigo-600" /> 2. Υφιστάμενο Προσωπικό
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <span className={labelCls + ' mb-0'}>ΠΡΟΫΠΑΡΧΟΝ ΠΡΟΣΩΠΙΚΟ</span>
            <div className="flex gap-2">
              <button type="button" disabled={locked} onClick={() => onPatch({ hasExistingStaff: true })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${value.hasExistingStaff ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300'}`}>
                ΝΑΙ
              </button>
              <button type="button" disabled={locked} onClick={() => onPatch({ hasExistingStaff: false })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${!value.hasExistingStaff ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300'}`}>
                ΟΧΙ
              </button>
            </div>
          </div>
          {value.hasExistingStaff && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Αορίστου χρόνου πλήρους απασχόλησης</label>
                <input disabled={locked} type="number" min={0} className={inputCls} value={value.staffIndefiniteFull ?? ''}
                  onChange={e => onPatch({ staffIndefiniteFull: e.target.value === '' ? null : parseInt(e.target.value) })} />
              </div>
              <div>
                <label className={labelCls}>Αορίστου χρόνου μερικής απασχόλησης</label>
                <input disabled={locked} type="number" min={0} className={inputCls} value={value.staffIndefinitePart ?? ''}
                  onChange={e => onPatch({ staffIndefinitePart: e.target.value === '' ? null : parseInt(e.target.value) })} />
              </div>
              <div>
                <label className={labelCls}>Ορισμένου χρόνου πλήρους απασχόλησης</label>
                <input disabled={locked} type="number" min={0} className={inputCls} value={value.staffFixedFull ?? ''}
                  onChange={e => onPatch({ staffFixedFull: e.target.value === '' ? null : parseInt(e.target.value) })} />
              </div>
              <div>
                <label className={labelCls}>Ορισμένου χρόνου μερικής απασχόλησης</label>
                <input disabled={locked} type="number" min={0} className={inputCls} value={value.staffFixedPart ?? ''}
                  onChange={e => onPatch({ staffFixedPart: e.target.value === '' ? null : parseInt(e.target.value) })} />
              </div>
              <div>
                <label className={labelCls}>Άλλης μορφής απασχόλησης</label>
                <input disabled={locked} type="number" min={0} className={inputCls} value={value.staffOtherForm ?? ''}
                  onChange={e => onPatch({ staffOtherForm: e.target.value === '' ? null : parseInt(e.target.value) })} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
            <Briefcase size={18} className="text-indigo-600" /> 3. Στοιχεία Θέσης Εργασίας
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className={labelCls}>Τίτλος θέσης *</label>
            <input disabled={locked} className={inputCls} value={value.positionTitle || ''}
              onChange={e => onPatch({ positionTitle: e.target.value })} placeholder="Ο ακριβής τίτλος θέσης που θα κατατεθεί στη ΔΥΠΑ, π.χ. «υπάλληλος γραφείου»" />
            <p className="text-xs text-slate-500 mt-1">Αυτός είναι ο τίτλος θέσης που θα αιτηθούμε από τη ΔΥΠΑ — γράψτε τον με τον ίδιο τρόπο που θα δηλωθεί στην πλατφόρμα της ΔΥΠΑ.</p>
          </div>
          <div>
            <label className={labelCls}>Περιγραφή καθηκόντων</label>
            <textarea disabled={locked} rows={3} className={inputCls} value={value.positionDescription || ''}
              onChange={e => onPatch({ positionDescription: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={locked} checked={value.requiresLicense}
              onChange={e => onPatch({ requiresLicense: e.target.checked })} />
            Απαιτείται άδεια ασκήσεως επαγγέλματος για τον υπάλληλο; <span className="text-xs text-slate-400">(προτείνεται: δεν απαιτείται)</span>
          </label>
          {value.requiresLicense && (
            <input disabled={locked} className={inputCls} value={value.licenseDescription || ''}
              onChange={e => onPatch({ licenseDescription: e.target.value })} placeholder="Είδος άδειας" />
          )}
          <div>
            <label className={labelCls}>Απαιτούμενη προηγούμενη εμπειρία <span className="text-xs text-slate-400">(προτείνεται: δεν απαιτείται)</span></label>
            <select disabled={locked} className={inputCls} value={value.requiredExperience || 'NONE'}
              onChange={e => onPatch({ requiredExperience: e.target.value })}>
              {EXPERIENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
            <Globe2 size={18} className="text-indigo-600" /> 4. Ξένες Γλώσσες
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={locked} checked={value.requiresForeignLanguage}
              onChange={e => onPatch({ requiresForeignLanguage: e.target.checked })} />
            Απαιτείται ξένη γλώσσα
          </label>
          {value.requiresForeignLanguage && (
            <input disabled={locked} className={inputCls} value={value.foreignLanguageDescription || ''}
              onChange={e => onPatch({ foreignLanguageDescription: e.target.value })} placeholder="π.χ. Αγγλικά - επίπεδο Β2" />
          )}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              <strong>Tip:</strong> Αν η επιχείρηση έχει ήδη εντοπίσει τον συγκεκριμένο άνεργο που θέλει να προσλάβει μέσω ΔΥΠΑ, ζητήστε ακριβώς τις γλώσσες που θα δηλώσει ο ίδιος ο υποψήφιος στον εργασιακό του σύμβουλο στη ΔΥΠΑ (π.χ. ΑΓΓΛΙΚΑ+ΓΕΡΜΑΝΙΚΑ+ΙΣΠΑΝΙΚΑ), ώστε ο αλγόριθμος αντιστοίχισης της ΔΥΠΑ να προτείνει στην επιχείρηση ακριβώς αυτόν τον υποψήφιο.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
            <ShieldCheck size={18} className="text-indigo-600" /> 5. Επιβεβαιώσεις
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {DECLARATIONS.map(d => (
            <label key={d.field} className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" className="mt-0.5" disabled={locked} checked={value[d.field]}
                onChange={e => onPatch({ [d.field]: e.target.checked })} />
              <span>{d.text}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      {showTaxisnet && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
              <Lock size={18} className="text-indigo-600" /> Κωδικοί Taxisnet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              Οι κωδικοί αποθηκεύονται κρυπτογραφημένα (AES-256) και χρησιμοποιούνται αποκλειστικά για την υποβολή της αίτησης στη ΔΥΠΑ. Μπορούν να καταχωρηθούν τώρα ή να αναβληθούν μέχρι μετά την πληρωμή της επιχείρησης.
            </div>
            {(value.taxisnetUsernameSet && value.taxisnetPasswordSet && !taxisnetUser && !taxisnetPass) ? (
              <p className="text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 size={14} /> Έχουν ήδη καταχωρηθεί.</p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Όνομα χρήστη Taxisnet</label>
                <input disabled={locked} autoComplete="off" className={inputCls} value={taxisnetUser} onChange={e => setTaxisnetUser(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Κωδικός Taxisnet</label>
                <input disabled={locked} type="password" autoComplete="new-password" className={inputCls} value={taxisnetPass} onChange={e => setTaxisnetPass(e.target.value)} />
              </div>
            </div>
            {!locked && (taxisnetUser || taxisnetPass) && (
              <Button size="sm" variant="outline" onClick={() => onSubmitTaxisnet(taxisnetUser, taxisnetPass)}>Αποθήκευση Κωδικών</Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
            <FileSignature size={18} className="text-indigo-600" /> 6. Αποδοχή Όρων &amp; Προϋποθέσεων Συμμετοχής
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="space-y-2 text-sm text-gray-700 list-none">
            {TERMS.map((term, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-semibold flex-shrink-0">{i + 1}.</span>
                <span>{term}</span>
              </li>
            ))}
          </ol>
          <div className="rounded-lg border border-gray-200 p-3">
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" disabled={locked || !!value.termsAcceptedAt} className="mt-0.5" checked={termsChecked[0] && termsChecked.every(Boolean)}
                onChange={e => setTermsChecked(TERMS.map(() => e.target.checked))} />
              <span className="font-medium">{FINAL_TERMS_TEXT}</span>
            </label>
          </div>
          {value.termsAcceptedAt ? (
            <p className="text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 size={14} /> Οι όροι έχουν γίνει αποδεκτοί στις {new Date(value.termsAcceptedAt).toLocaleString('el-GR')}</p>
          ) : (
            <Button size="sm" disabled={!termsChecked.every(Boolean)} onClick={onAcceptTerms}>Αποδοχή Όρων</Button>
          )}
        </CardContent>
      </Card>

      {pricing && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
              <Banknote size={18} className="text-indigo-600" /> 7. Κόστη, Διαδικασία &amp; Πληρωμή
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-4 text-sm text-indigo-900 space-y-2">
              <p className="font-semibold">ΑΡΧΙΚΗ ΥΠΟΒΟΛΗ ΤΗΣ ΑΙΤΗΣΗΣ: 150€+ΦΠΑ = 186€</p>
              <p className="text-xs text-indigo-700">Καταβάλλεται τώρα, με αιτιολογία κατάθεσης τη μορφή «επωνυμία επιχείρησης &amp; ΔΥΠΑ» (π.χ. «ΠΑΠΑΔΑΚΗΣ ΟΕ ΔΥΠΑ»).</p>
              <p className="font-semibold pt-2">ΚΑΤΟΠΙΝ, ΚΑΙ ΜΟΝΟ ΜΕΤΑ ΤΗΝ ΕΓΚΡΙΣΗ ΑΠΟ ΔΥΠΑ, ΑΦΟΥ ΓΙΝΕΙ Η ΠΡΟΣΛΗΨΗ. ΚΑΤΑΒΑΛΕΤΑΙ 50€+ΦΠΑ ΜΕ ΤΗΝ ΠΡΟΣΛΗΨΗ ΑΤΟΜΟΥ.</p>
              <p className="font-semibold pt-2">ΚΑΘΕ ΔΙΜΗΝΟ ΑΠΑΙΤΕΙΤΑΙ ΝΑ ΑΝΕΒΑΙΝΟΥΝ ΕΓΓΡΑΦΑ ΣΧΕΤΙΚΑ ΜΕ ΤΗΝ ΜΙΣΘΟΔΟΣΙΑ ΤΟΥ ΣΥΓΚΕΚΡΙΜΕΝΟΥ ΥΠΑΛΛΗΛΟΥ ΣΤΗΝ ΠΛΑΤΦΟΡΜΑ ΤΗΣ ΔΥΠΑ, ΟΥΤΩΣ ΩΣΤΕ ΝΑ ΓΙΝΟΝΤΑΙ ΟΙ ΠΛΗΡΩΜΕΣ (ΕΠΙΧΟΡΗΓΗΣΗ) ΑΠΟ ΤΗΝ ΔΥΠΑ ΠΡΟΣ ΤΗΝ ΕΠΙΧΕΙΡΗΣΗ. Η ΣΥΓΚΕΚΡΙΜΕΝΗ ΔΙΑΔΙΚΑΣΙΑ ΤΙΜΟΛΟΓΕΙΤΑΙ 50€+ΦΠΑ ΚΑΘΕ ΔΙΜΗΝΟ.</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              <IbanBox bank="Πειραιώς" iban={pricing.ibanPiraeus || 'GR4501714330006433164381388'} holder="I MENTOR IKE" />
              <IbanBox bank="Eurobank" iban={pricing.ibanEurobank || 'GR5802601680000060201330648'} holder="I MENTOR IKE" />
              <IbanBox bank="Alpha bank" iban={pricing.ibanAlpha || 'GR2401407750775002330002138'} holder="I MENTOR IKE" />
            </div>
            {value.initialFeeStatus === 'PAID' ? (
              <p className="text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 size={14} /> Η προκαταβολή έχει επιβεβαιωθεί.</p>
            ) : (
              <>
                {!value.finalAcceptedAt && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={businessClaimsPaid} onChange={e => setBusinessClaimsPaid(e.target.checked)} />
                    Πραγματοποίησα την τραπεζική κατάθεση
                  </label>
                )}
                {canConfirmPayment && (
                  <Button size="sm" variant="outline" onClick={onConfirmPayment}>Επιβεβαίωση Πληρωμής (Admin)</Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!value.finalAcceptedAt ? (
        <Card className="border-indigo-200">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={finalChecked} onChange={e => setFinalChecked(e.target.checked)} disabled={!value.termsAcceptedAt} />
              Επιβεβαιώνω ότι όλα τα στοιχεία είναι ακριβή και υποβάλλω την αίτηση ανάθεσης
            </label>
            <Button disabled={!finalChecked || !value.termsAcceptedAt || saving} loading={saving}
              onClick={() => onFinalAccept(businessClaimsPaid)}>
              <Rocket size={16} className="mr-1" /> Οριστική Υποβολή
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-emerald-800 flex items-center gap-1 font-medium">
              <CheckCircle2 size={16} /> Η αίτηση υποβλήθηκε στις {new Date(value.finalAcceptedAt).toLocaleString('el-GR')}
            </p>
            {canSetHireDate && (
              <div className="flex items-end gap-3">
                <div>
                  <label className={labelCls}>Ημερομηνία πρόσληψης ανέργου</label>
                  <input type="date" className={inputCls} value={hireDate} onChange={e => setHireDate(e.target.value)} disabled={!!value.hireStartDate} />
                </div>
                {!value.hireStartDate && (
                  <Button size="sm" disabled={!hireDate} onClick={() => onSetHireStartDate(hireDate)}>Καταχώριση Πρόσληψης</Button>
                )}
                {value.hireStartDate && (
                  <Badge variant="success">Ξεκίνησε ο δίμηνος κύκλος παρακολούθησης (#{value.billingCycleCount})</Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function IbanBox({ bank, iban, holder }: { bank: string; iban: string; holder: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="font-semibold text-gray-700">{bank}</p>
      <p className="font-mono text-gray-900 mt-1">{iban}</p>
      <p className="text-gray-400 mt-1">{holder}</p>
    </div>
  )
}
