import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../api'

const STATUS_PIPELINE = [
  { key: 'assigned',    label: 'Ανατέθηκε',    color: 'bg-gray-100 text-gray-700' },
  { key: 'called',      label: 'Κλήθηκε',      color: 'bg-blue-100 text-blue-700' },
  { key: 'meeting_set', label: 'Ραντεβού',      color: 'bg-yellow-100 text-yellow-700' },
  { key: 'demo_done',   label: 'Demo έγινε',    color: 'bg-purple-100 text-purple-700' },
  { key: 'converted',   label: 'Έκλεισε ✅',   color: 'bg-green-100 text-green-700' },
  { key: 'rejected',    label: 'Αρνήθηκε ✗',   color: 'bg-red-100 text-red-700' },
]

const TERMINAL = new Set(['converted', 'rejected', 'skipped'])

const CALL_SCRIPTS = [
  {
    title: 'Σενάριο 1 — Πρώτη Επικοινωνία',
    subtitle: 'Δεν έχουμε ξαναμιλήσει. Στόχος: ενδιαφέρον & δέσμευση για email.',
    steps: [
      {
        label: 'Εισαγωγή',
        text: `«Καλημέρα σας, μιλώ με [ΟΝΟΜΑ ΛΟΓΙΣΤΗ]; Είμαι [ΟΝΟΜΑ ΣΑΣ] από την iMentor. Είμαστε εταιρεία εξειδικευμένη αποκλειστικά στον εξωδικαστικό μηχανισμό ρύθμισης οφειλών και στην πτώχευση φυσικών προσώπων — το "δεύτερο ευκαιρία" της νομοθεσίας 4738/2020.»`,
      },
      {
        label: 'Δημιουργία ενδιαφέροντος',
        text: `«Σας καλώ γιατί σίγουρα κάποιοι από τους πελάτες σας έχουν οφειλές σε εφορία, τράπεζες ή ταμεία. Εμείς κάνουμε δωρεάν, πλήρη ανάλυση και πρόβλεψη αποτελεσμάτων για τον πελάτη — χωρίς καμία δέσμευση. Βλέπουν ακριβώς τι μπορεί να ρυθμιστεί, σε πόσες δόσεις και με ποιο κούρεμα.»`,
      },
      {
        label: 'Κίνητρο συνεργασίας',
        text: `«Αν ο πελάτης προχωρήσει, εσείς λαμβάνετε αμοιβή παραπομπής — νόμιμη, συμφωνημένη εκ των προτέρων. Και εμείς αναλαμβάνουμε εξ ολοκλήρου τη διαχείριση. Εσείς απλά παραπέμπετε.»`,
      },
      {
        label: 'Κλείσιμο',
        text: `«Θα σας στείλω ένα σύντομο email με όλες τις λεπτομέρειες. Ποια διεύθυνση να χρησιμοποιήσω; Και αν θέλετε μπορούμε να κλείσουμε και ένα 15λεπτο Teams/τηλέφωνο για να σας δείξω ζωντανά πώς γίνεται η ανάλυση.»`,
      },
    ],
  },
  {
    title: 'Σενάριο 2 — Χειρισμός Αντιρρήσεων',
    subtitle: 'Ο λογιστής διστάζει ή λέει ότι δεν έχει τέτοιους πελάτες.',
    steps: [
      {
        label: '«Δεν έχω τέτοιους πελάτες»',
        text: `«Καταλαβαίνω. Ωστόσο η εμπειρία μας δείχνει ότι οι περισσότεροι πελάτες δεν αποκαλύπτουν στον λογιστή τους όλο το βάθος των οφειλών τους. Ίσως αξίζει απλά να τους ενημερώσετε ότι υπάρχει αυτή η επιλογή — δωρεάν γι' αυτούς. Αν έχουν πρόβλημα, θα σας ευχαριστήσουν.»`,
      },
      {
        label: '«Δεν ξέρω αν μπορώ να παραπέμψω»',
        text: `«Δεν παραπέμπετε σε νομικές υπηρεσίες — ενημερώνετε απλά τον πελάτη σας για μια δωρεάν υπηρεσία που μπορεί να τον βοηθήσει. Η αμοιβή παραπομπής είναι συμβατικά κατοχυρωμένη και συνηθισμένη πρακτική. Εμείς έχουμε ήδη δεκάδες λογιστές συνεργάτες σε όλη την Ελλάδα.»`,
      },
      {
        label: '«Δεν με ενδιαφέρει»',
        text: `«Σεβαστό. Μόνο να σας πω: οι πελάτες σας που έχουν οφειλή άνω των 10.000€ έχουν δικαίωμα σε ρύθμιση μέσω εξωδικαστικού. Αν αλλάξετε γνώμη ή κάποιος πελάτης σας ρωτήσει, έχετε το email μου. Σας ευχαριστώ για τον χρόνο σας.»`,
      },
    ],
  },
  {
    title: 'Σενάριο 3 — Follow-up μετά από ενδιαφέρον',
    subtitle: 'Ο λογιστής έχει ακούσει για εμάς ή έχουμε μιλήσει ξανά.',
    steps: [
      {
        label: 'Άνοιγμα',
        text: `«Καλημέρα [ΟΝΟΜΑ], είμαι [ΟΝΟΜΑ ΣΑΣ] από την iMentor. Είχαμε μιλήσει πρόσφατα για τη συνεργασία μας. Θέλω να σας ρωτήσω αν σκεφτήκατε κάποιον πελάτη που θα μπορούσαμε να ξεκινήσουμε με μια δωρεάν ανάλυση.»`,
      },
      {
        label: 'Αν έχει πελάτη',
        text: `«Τέλεια. Χρειάζομαι μόνο ΑΦΜ, ονοματεπώνυμο και τηλέφωνο. Εμείς αναλαμβάνουμε αμέσως. Θα επικοινωνήσουμε μαζί τους, θα κάνουμε την ανάλυση και θα σας κρατάμε ενήμερο σε κάθε βήμα. Αν προχωρήσει η υπόθεση, η αμοιβή σας εκδίδεται αυτόματα.»`,
      },
      {
        label: 'Αν χρειάζεται χρόνο',
        text: `«Καμία βιασύνη. Στείλτε μου email όταν θέλετε — [EMAIL ΥΠΑΛΛΗΛΟΥ]. Ή μπορείτε να μου δώσετε τα στοιχεία του πελάτη κατευθείαν τηλεφωνικά τώρα.»`,
      },
    ],
  },
]

const EMAIL_TEMPLATES = [
  {
    title: 'Email 1 — Μετά από θετική συνομιλία',
    subject: 'Συνεργασία iMentor — Δωρεάν ανάλυση εξωδικαστικής ρύθμισης',
    body: `Αγαπητέ/ή [ΟΝΟΜΑ],

Χαίρομαι που μιλήσαμε σήμερα. Σας στέλνω μερικές πληροφορίες για τη συνεργασία μας.

Η iMentor είναι εταιρεία εξειδικευμένη αποκλειστικά στον εξωδικαστικό μηχανισμό ρύθμισης οφειλών (Ν. 4738/2020) και στην πτώχευση φυσικών προσώπων. Είμαστε από τις πιο έμπειρες ομάδες στην Ελλάδα σε αυτό το αντικείμενο.

ΤΙ ΠΡΟΣΦΕΡΟΥΜΕ ΣΤΟΥΣ ΠΕΛΑΤΕΣ ΣΑΣ:
✓ Δωρεάν ανάλυση και πρόβλεψη αποτελεσμάτων εξωδικαστικής ρύθμισης
✓ Δεν χρειάζεται καμία δέσμευση για να δουν τι μπορούν να επιτύχουν
✓ Πλήρης διαχείριση της υπόθεσης από εξειδικευμένη νομική & χρηματοοικονομική ομάδα
✓ Ψηφιακή πλατφόρμα παρακολούθησης — ο πελάτης βλέπει κάθε βήμα

ΤΙ ΚΕΡΔΙΖΕΤΕ ΕΣΕΙΣ:
✓ Αμοιβή παραπομπής για κάθε υπόθεση που ολοκληρώνεται
✓ Οι πελάτες σας βλέπουν λύσεις — αυξάνεται η εμπιστοσύνη τους σε εσάς
✓ Καμία επιπλέον εργασία από εσάς — εμείς αναλαμβάνουμε τα πάντα

ΠΩΣ ΞΕΚΙΝΑΜΕ:
Στείλτε μου το ΑΦΜ, ονοματεπώνυμο και τηλέφωνο οποιουδήποτε ενδιαφερόμενου πελάτη. Θα επικοινωνήσουμε άμεσα, θα κάνουμε τη δωρεάν ανάλυση και θα σας κρατάμε ενήμερο.

Είμαι στη διάθεσή σας για οποιαδήποτε ερώτηση.

Με εκτίμηση,
[ΟΝΟΜΑ ΥΠΑΛΛΗΛΟΥ]
iMentor — Εξωδικαστικός & Πτώχευση
[ΤΗΛΕΦΩΝΟ]
info@i-mentor.gr | www.i-mentor.gr`,
  },
  {
    title: 'Email 2 — Follow-up (δεν απάντησε)',
    subject: 'Follow-up: Δωρεάν ανάλυση οφειλών για τους πελάτες σας',
    body: `Αγαπητέ/ή [ΟΝΟΜΑ],

Σας στέλνω αυτό το μήνυμα ως συνέχεια της επικοινωνίας μας. Θέλω να σιγουρευτώ ότι λάβατε τις πληροφορίες που σας έστειλα.

Εν συντομία: αν έχετε πελάτες με οφειλές σε εφορία (ΑΑΔΕ), τράπεζες/funds, ή ασφαλιστικά ταμεία (ΕΦΚΑ), εμείς μπορούμε να τους κάνουμε ΔΩΡΕΑΝ ανάλυση και να τους δείξουμε ακριβώς τι μπορούν να ρυθμίσουν.

Για εσάς: αμοιβή παραπομπής + επαγγελματική εξυπηρέτηση των πελατών σας.
Για τον πελάτη: δωρεάν, χωρίς καμία δέσμευση.

Αν υπάρχει κάποιος πελάτης που σκέφτεστε, στείλτε μου τα στοιχεία του και ξεκινάμε αμέσως.

Με εκτίμηση,
[ΟΝΟΜΑ ΥΠΑΛΛΗΛΟΥ]
iMentor
[ΤΗΛΕΦΩΝΟ]
info@i-mentor.gr`,
  },
  {
    title: 'Email 3 — Παρουσίαση εταιρείας (για ενδιαφερόμενο)',
    subject: 'iMentor — Εξωδικαστικός Μηχανισμός & Πτώχευση: Ποιοι είμαστε',
    body: `Αγαπητέ/ή [ΟΝΟΜΑ],

Σας στέλνω μια σύντομη παρουσίαση της iMentor.

ΠΟΙΟΙ ΕΙΜΑΣΤΕ:
Η iMentor είναι εξειδικευμένη εταιρεία στον εξωδικαστικό μηχανισμό ρύθμισης οφειλών (Ν. 4738/2020) και στη διαδικασία πτώχευσης φυσικών προσώπων. Είμαστε μία από τις πιο έμπειρες ομάδες στην Ελλάδα σε αυτό το εξαιρετικά τεχνικό αντικείμενο, με δεκάδες επιτυχημένες υποθέσεις.

ΤΙ ΚΑΝΟΥΜΕ:
• Εξωδικαστική ρύθμιση οφειλών: ρύθμιση χρεών προς ΑΑΔΕ, τράπεζες/funds, ΕΦΚΑ με κούρεμα και επιμήκυνση χρέους
• Πτώχευση φυσικών προσώπων: καθαρισμός χρεών μέσω νόμου 4738
• Ψηφιακή πλατφόρμα ανάλυσης: άμεση πρόβλεψη αποτελεσμάτων για κάθε υπόθεση

ΓΙΑΤΙ ΕΜΕΙΣ:
✓ Αποκλειστική εξειδίκευση — δεν κάνουμε τίποτα άλλο εκτός από εξωδικαστικό και πτώχευση
✓ Ιδιόκτητη τεχνολογία ανάλυσης — μοναδική στην Ελλάδα
✓ Πλήρης διαφάνεια — ο πελάτης βλέπει κάθε βήμα ψηφιακά
✓ Αποδεδειγμένα αποτελέσματα

Για τους συνεργάτες λογιστές:
Κάθε παραπομπή που ολοκληρώνεται αποδίδει αμοιβή. Εμείς αναλαμβάνουμε την πλήρη διαχείριση.

Είμαστε στη διάθεσή σας για οποιαδήποτε ερώτηση ή για να κλείσουμε μια σύντομη τηλεδιάσκεψη.

Με εκτίμηση,
[ΟΝΟΜΑ ΥΠΑΛΛΗΛΟΥ]
iMentor — Εξωδικαστικός & Πτώχευση
[ΤΗΛΕΦΩΝΟ]
info@i-mentor.gr | www.i-mentor.gr`,
  },
]

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors">
      {copied ? '✓ Αντιγράφηκε' : '📋 Αντιγραφή'}
    </button>
  )
}

export default function LogistisOutreach({ currentEmployee }) {
  const [data, setData] = useState(undefined)
  const [errMsg, setErrMsg] = useState(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [activeTab, setActiveTab] = useState('assignment')
  const [openScript, setOpenScript] = useState(null)
  const [confirmSkip, setConfirmSkip] = useState(false)

  const load = () => {
    setData(undefined)
    setErrMsg(null)
    api.getMyAccountantAssignment()
      .then(r => {
        const d = r.data || {}
        setData(d)
        setNotes(d?.assignment?.notes || '')
      })
      .catch(e => {
        const status = e?.response?.status
        const detail = e?.response?.data?.detail || e?.message || 'unknown'
        setErrMsg(`HTTP ${status ?? '?'}: ${detail}`)
        setData(null)
      })
  }

  useEffect(() => { load() }, [])

  const handleStatus = async (newStatus) => {
    setSaving(true)
    try {
      await api.updateAccountantStatus(newStatus, notes)
      toast.success('Ενημερώθηκε')
      load()
    } catch { toast.error('Σφάλμα') } finally { setSaving(false) }
  }

  const handleSkip = async () => {
    setConfirmSkip(false)
    setSaving(true)
    try {
      await api.updateAccountantStatus('skipped', notes)
      toast.success('Ο λογιστής παραβλέφθηκε — μπορείς να αναθέσεις τον επόμενο')
      load()
    } catch { toast.error('Σφάλμα') } finally { setSaving(false) }
  }

  const handleAssignNext = async () => {
    setAssigning(true)
    try {
      const r = await api.assignNextAccountant()
      if (r.data.assigned) {
        toast.success('Νέος λογιστής ανατέθηκε!')
        load()
      } else {
        toast('Δεν υπάρχουν διαθέσιμοι λογιστές αυτή τη στιγμή', { icon: 'ℹ️' })
      }
    } catch (e) {
      const msg = e?.response?.data?.detail
      if (msg?.includes('Already has')) {
        toast('Έχεις ήδη ενεργή ανάθεση', { icon: 'ℹ️' })
      } else {
        toast.error('Σφάλμα ανάθεσης')
      }
    } finally { setAssigning(false) }
  }

  const saveNotes = async () => {
    if (!data?.assignment) return
    setSaving(true)
    try {
      await api.updateAccountantStatus(data.assignment.status, notes)
      toast.success('Σημειώσεις αποθηκεύτηκαν')
    } catch { toast.error('Σφάλμα') } finally { setSaving(false) }
  }

  const acc = data?.accountant
  const asgn = data?.assignment
  const isDone = asgn && TERMINAL.has(asgn.status)
  const currentStep = STATUS_PIPELINE.findIndex(s => s.key === asgn?.status)

  const tabs = [
    { key: 'assignment', label: 'Ανάθεση' },
    { key: 'scripts', label: 'Σενάρια Κλήσης' },
    { key: 'emails', label: 'Email Templates' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-black text-blue-800 mb-1">Outreach Λογιστών</h1>
      <p className="text-gray-500 text-sm mb-5">Προσέγγισε τον ανατεθειμένο λογιστή και πρότεινε δωρεάν εκτίμηση για τους πελάτες του.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors -mb-px ${
              activeTab === t.key
                ? 'bg-white border border-b-white border-gray-200 text-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: ASSIGNMENT ── */}
      {activeTab === 'assignment' && (
        <>
          {data === undefined && <div className="text-gray-400 text-sm py-12 text-center">Φόρτωση...</div>}

          {data === null && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-600">
              <div className="font-semibold mb-1">Σφάλμα σύνδεσης</div>
              {errMsg && <div className="text-xs font-mono mt-1">{errMsg}</div>}
            </div>
          )}

          {data !== undefined && data !== null && !asgn && (
            <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-gray-600 mb-4">Δεν έχεις ανατεθεί λογιστή ακόμα.</p>
              <button onClick={handleAssignNext} disabled={assigning} className="btn-primary px-6">
                {assigning ? 'Αναζήτηση...' : 'Ανάθεση Επόμενου Λογιστή'}
              </button>
            </div>
          )}

          {asgn && (
            <div className="space-y-4">
              {/* Accountant card */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                {acc ? (
                  <>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">Λογιστής</div>
                        <div className="text-xl font-black text-gray-800">{acc.name}</div>
                        {acc.office_name && <div className="text-sm text-gray-500 mt-0.5">{acc.office_name}</div>}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400 mb-0.5">Πελάτες</div>
                        <div className="text-2xl font-black text-blue-700">{acc.client_count ?? '—'}</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      {acc.phone && (
                        <a href={`tel:${acc.phone}`} className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2 text-blue-700 hover:bg-blue-100 transition-colors font-medium">
                          📞 {acc.phone}
                        </a>
                      )}
                      {acc.email && (
                        <a href={`mailto:${acc.email}`} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-100 transition-colors truncate">
                          ✉️ {acc.email}
                        </a>
                      )}
                      {acc.city && (
                        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-gray-600">
                          📍 {acc.city}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-gray-400 text-sm">Τα στοιχεία του λογιστή δεν είναι διαθέσιμα αυτή τη στιγμή.</div>
                )}

                {/* Skip button */}
                {!isDone && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    {confirmSkip ? (
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm text-gray-600">Σίγουρα θέλεις να παραβλέψεις αυτόν τον λογιστή;</span>
                        <button onClick={handleSkip} className="text-sm px-3 py-1.5 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600">Ναι, παράβλεψη</button>
                        <button onClick={() => setConfirmSkip(false)} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Άκυρο</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmSkip(true)} disabled={saving}
                        className="text-xs px-3 py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 transition-colors">
                        ↩ Παράβλεψη λογιστή (για άλλον συνάδελφο)
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Status pipeline */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Κατάσταση</div>
                <div className="flex flex-wrap gap-2">
                  {STATUS_PIPELINE.map((s, i) => {
                    const isActive = asgn.status === s.key
                    const isPast = i < currentStep
                    return (
                      <button key={s.key} disabled={saving || isDone} onClick={() => handleStatus(s.key)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all border-2 ${
                          isActive ? `${s.color} border-current scale-105 shadow-sm`
                          : isPast ? 'bg-gray-50 text-gray-300 border-transparent'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                        }`}>
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notes */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Σημειώσεις</div>
                <textarea rows={3} disabled={isDone} value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Τι είπε, πότε να ξαναπάρεις, κ.λπ."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400" />
                {!isDone && (
                  <button onClick={saveNotes} disabled={saving} className="mt-2 btn-secondary text-xs px-4 py-1.5">
                    Αποθήκευση σημειώσεων
                  </button>
                )}
              </div>

              {/* Done → get next */}
              {isDone && (
                <div className={`rounded-2xl p-5 text-center ${
                  asgn.status === 'converted' ? 'bg-green-50 border border-green-200'
                  : asgn.status === 'skipped' ? 'bg-orange-50 border border-orange-200'
                  : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="text-2xl mb-2">
                    {asgn.status === 'converted' ? '🏆' : asgn.status === 'skipped' ? '↩' : '✗'}
                  </div>
                  <p className={`font-semibold mb-4 ${
                    asgn.status === 'converted' ? 'text-green-700'
                    : asgn.status === 'skipped' ? 'text-orange-600'
                    : 'text-red-600'
                  }`}>
                    {asgn.status === 'converted' ? 'Μπράβο! Ο λογιστής ενδιαφέρεται.'
                    : asgn.status === 'skipped' ? 'Παραβλέφθηκε — ο λογιστής μπαίνει πίσω στο pool.'
                    : 'Αρνήθηκε. Συνέχισε με τον επόμενο.'}
                  </p>
                  <button onClick={handleAssignNext} disabled={assigning} className="btn-primary px-6">
                    {assigning ? 'Αναζήτηση...' : 'Επόμενος Λογιστής →'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── TAB: CALL SCRIPTS ── */}
      {activeTab === 'scripts' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 mb-4">Επίλεξε το κατάλληλο σενάριο ανάλογα με την περίσταση. Τα κείμενα σε [ΑΓΚΥΛΕΣ] αντικατάστησέ τα με τα πραγματικά στοιχεία.</p>
          {CALL_SCRIPTS.map((script, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => setOpenScript(openScript === idx ? null : idx)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors">
                <div>
                  <div className="font-bold text-gray-800">{script.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{script.subtitle}</div>
                </div>
                <span className="text-gray-400 text-lg">{openScript === idx ? '▲' : '▼'}</span>
              </button>

              {openScript === idx && (
                <div className="px-5 pb-5 border-t border-gray-100 space-y-4 pt-4">
                  {script.steps.map((step, si) => (
                    <div key={si}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">{step.label}</span>
                        <CopyButton text={step.text} />
                      </div>
                      <div className="bg-blue-50 rounded-lg px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border-l-4 border-blue-300">
                        {step.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: EMAIL TEMPLATES ── */}
      {activeTab === 'emails' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 mb-4">Έτοιμα email για αποστολή μετά την κλήση. Αντίγραψε, αλλαξε τα [ΠΕΔΙΑ] και στείλε.</p>
          {EMAIL_TEMPLATES.map((tpl, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="font-bold text-gray-800">{tpl.title}</div>

              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Θέμα</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 font-medium border border-gray-200">
                    {tpl.subject}
                  </div>
                  <CopyButton text={tpl.subject} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Σώμα email</div>
                  <CopyButton text={tpl.body} />
                </div>
                <pre className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border border-gray-200 font-sans max-h-64 overflow-y-auto">
                  {tpl.body}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
