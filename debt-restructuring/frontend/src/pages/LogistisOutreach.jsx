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

// ── Employee settings persisted to localStorage ───────────────────
const SETTINGS_KEY = 'logistis-employee-settings'
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {} } catch { return {} }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

// ── Placeholder fill ──────────────────────────────────────────────
function fill(text, { accName = '', myName = '', myPhone = '', myEmail = '' } = {}) {
  return text
    .replace(/\[ΟΝΟΜΑ ΛΟΓΙΣΤΗ\]/g, accName || '[ΟΝΟΜΑ ΛΟΓΙΣΤΗ]')
    .replace(/\[ΟΝΟΜΑ ΣΑΣ\]/g, myName || '[ΟΝΟΜΑ ΣΑΣ]')
    .replace(/\[ΟΝΟΜΑ ΥΠΑΛΛΗΛΟΥ\]/g, myName || '[ΟΝΟΜΑ ΥΠΑΛΛΗΛΟΥ]')
    .replace(/\[ΤΗΛΕΦΩΝΟ\]/g, myPhone || '[ΤΗΛΕΦΩΝΟ]')
    .replace(/\[EMAIL ΥΠΑΛΛΗΛΟΥ\]/g, myEmail || '[EMAIL ΥΠΑΛΛΗΛΟΥ]')
}

// ── Call scripts (raw — placeholders filled at render time) ───────
const CALL_SCRIPTS_RAW = [
  {
    title: 'Σενάριο 1 — Πρώτη Επικοινωνία',
    subtitle: 'Ο λογιστής γράφτηκε στο Logistis αλλά δεν έχει ανεβάσει πελατολόγιο.',
    steps: [
      {
        label: 'Εισαγωγή',
        text: `«Καλημέρα σας, μιλώ με [ΟΝΟΜΑ ΛΟΓΙΣΤΗ]; Είμαι [ΟΝΟΜΑ ΣΑΣ] από την iMentor. Είχατε γραφτεί στο Logistis για να ενημερώνεστε για επιχορηγούμενα προγράμματα για τους πελάτες σας — βλέπω όμως ότι δεν έχετε ανεβάσει ακόμα πελατολόγιο για έλεγχο, οπότε δεν έχετε δει ακόμα τι ταιριάσματα υπάρχουν για εσάς.»`,
      },
      {
        label: 'Σύνδεση με τον λόγο εγγραφής',
        text: `«Σας καλώ πρώτα απ' όλα γι' αυτό — αν θέλετε, μπορούμε να σας βοηθήσουμε τώρα να ανεβάσετε το πελατολόγιό σας ώστε να δείτε ποιοι πελάτες σας είναι επιλέξιμοι για τρέχοντα προγράμματα. Είναι δωρεάν και παίρνει λίγα λεπτά.»`,
      },
      {
        label: 'Εισαγωγή Εξωδικαστικού',
        text: `«Παράλληλα, θέλω να σας ενημερώσω ότι μέσα στο Logistis προστέθηκε πρόσφατα και μια δεύτερη δυνατότητα: μπορείτε να παραπέμπετε πελάτες σας που έχουν οφειλές — σε εφορία, τράπεζες/funds ή ταμεία — στην υπηρεσία εξωδικαστικής ρύθμισης που τρέχουμε εμείς. Κάνουμε δωρεάν ανάλυση, αναλαμβάνουμε όλη τη διαδικασία, και εσείς παίρνετε αμοιβή παραπομπής για κάθε υπόθεση που ολοκληρώνεται — χωρίς καμία δουλειά από εσάς.»`,
      },
      {
        label: 'Κλείσιμο',
        text: `«Οπότε δύο πράγματα μπορούμε να κάνουμε: αν θέλετε, σας συνδέω τώρα με το τμήμα επιχορηγούμενων προγραμμάτων για να δούμε το πελατολόγιό σας, και παράλληλα, όποτε σας έρθει πελάτης με οφειλή, τον παραπέμπετε για τον εξωδικαστικό. Τι από τα δύο σας ενδιαφέρει να δούμε πρώτα;»`,
      },
    ],
  },
  {
    title: 'Σενάριο 2 — Χειρισμός Αντιρρήσεων',
    subtitle: 'Ο λογιστής διστάζει, δεν έχει ανεβάσει πελατολόγιο ή λέει ότι δεν έχει τέτοιους πελάτες.',
    steps: [
      {
        label: '«Δεν έχω προλάβει να ανεβάσω πελατολόγιο»',
        text: `«Κανένα πρόβλημα, είναι γι' αυτό ακριβώς που σας καλώ. Αν θέλετε μπορούμε να το κάνουμε μαζί τώρα, ή σας συνδέω με το τμήμα προγραμμάτων και το κανονίζουν μαζί σας πιο αναλυτικά. Στο μεταξύ, η δυνατότητα του εξωδικαστικού δεν χρειάζεται πελατολόγιο — μόνο τον συγκεκριμένο πελάτη που θα θέλατε να παραπέμψετε.»`,
      },
      {
        label: '«Δεν έχω τέτοιους πελάτες (με οφειλές)»',
        text: `«Το καταλαβαίνω. Η εμπειρία μας δείχνει όμως ότι οι περισσότεροι λογιστές έχουν τουλάχιστον κάποιον πελάτη με οφειλή που απλά δεν το έχει αναφέρει. Στο μεταξύ, μη ξεχνάτε τον αρχικό λόγο που γραφτήκατε — τα επιχορηγούμενα προγράμματα. Θέλετε να δούμε αυτό τώρα;»`,
      },
      {
        label: '«Δεν ξέρω αν μπορώ να παραπέμψω έτσι απλά»',
        text: `«Δεν παραπέμπετε σε άγνωστη υπηρεσία — παραπέμπετε μέσα από τη δική σας πλατφόρμα, το Logistis, στην ίδια ομάδα που ήδη σας ενημερώνει για προγράμματα. Η αμοιβή παραπομπής είναι συμβατικά κατοχυρωμένη και το κάνουν ήδη δεκάδες συνάδελφοί σας.»`,
      },
      {
        label: '«Δεν με ενδιαφέρει κανένα από τα δύο τώρα»',
        text: `«Κατανοητό, δεν θέλω να σας κρατήσω. Και οι δύο δυνατότητες — τα προγράμματα και ο εξωδικαστικός — είναι ήδη ενεργές στον λογαριασμό σας στο Logistis, οπότε είναι εκεί όποτε τις χρειαστείτε. Σας ευχαριστώ για τον χρόνο σας.»`,
      },
    ],
  },
  {
    title: 'Σενάριο 3 — Follow-up μετά από ενδιαφέρον',
    subtitle: 'Έχουμε ξαναμιλήσει — ο λογιστής έδειξε ενδιαφέρον.',
    steps: [
      {
        label: 'Άνοιγμα',
        text: `«Καλημέρα [ΟΝΟΜΑ ΛΟΓΙΣΤΗ], είμαι [ΟΝΟΜΑ ΣΑΣ] από την iMentor. Μιλήσαμε πρόσφατα για το πελατολόγιο και τα προγράμματα, και για τη δυνατότητα παραπομπής εξωδικαστικού μέσα από το Logistis. Ήθελα να δω πώς πάει και αν προέκυψε κάτι από τα δύο.»`,
      },
      {
        label: 'Αν έχει πελάτη για εξωδικαστικό',
        text: `«Τέλεια. Χρειάζομαι μόνο ΑΦΜ, ονοματεπώνυμο και τηλέφωνο. Θα επικοινωνήσουμε άμεσα μαζί τους, θα κάνουμε την ανάλυση και θα σας κρατάμε ενήμερο σε κάθε βήμα μέσα από το Logistis.»`,
      },
      {
        label: 'Αν θέλει να δει πρώτα τα προγράμματα',
        text: `«Κανένα πρόβλημα — σας συνδέω με το τμήμα επιχορηγούμενων προγραμμάτων του γραφείου μας για να δουν μαζί σας το πελατολόγιο και τα ταιριάσματα. Ο εξωδικαστικός παραμένει διαθέσιμος όποτε τον χρειαστείτε, ξεχωριστά.»`,
      },
      {
        label: 'Αν χρειάζεται χρόνο',
        text: `«Καμία βιασύνη. Και οι δύο δυνατότητες είναι ήδη ενεργές στον λογαριασμό σας στο Logistis. Αν θέλετε, σας στέλνω κι ένα email με τα στοιχεία επικοινωνίας μου [EMAIL ΥΠΑΛΛΗΛΟΥ] ώστε να με βρίσκετε εύκολα όποτε είστε έτοιμος/η.»`,
      },
    ],
  },
]

const EMAIL_TEMPLATES_RAW = [
  {
    title: 'Email 1 — Μετά από θετική συνομιλία',
    subject: 'Πελατολόγιο, προγράμματα & η δυνατότητα εξωδικαστικού στο Logistis',
    body: `Αγαπητέ/ή [ΟΝΟΜΑ ΛΟΓΙΣΤΗ],

Χαίρομαι που μιλήσαμε σήμερα. Σας στέλνω λίγες πληροφορίες, τόσο για τα επιχορηγούμενα προγράμματα όσο και για τη δυνατότητα εξωδικαστικού.

ΓΙΑ ΤΑ ΕΠΙΧΟΡΗΓΟΥΜΕΝΑ ΠΡΟΓΡΑΜΜΑΤΑ:
Είχατε γραφτεί στο Logistis ακριβώς γι' αυτό — να βλέπετε ποιοι πελάτες σας είναι επιλέξιμοι για τρέχοντα προγράμματα. Βλέπω ότι δεν έχει ανέβει ακόμα πελατολόγιο για έλεγχο. Αν θέλετε, το τμήμα επιχορηγούμενων προγραμμάτων του γραφείου μας μπορεί να σας βοηθήσει να το κάνετε — είναι δωρεάν και παίρνει λίγα λεπτά.

ΓΙΑ ΤΟΝ ΕΞΩΔΙΚΑΣΤΙΚΟ:
Όπως είπαμε, μέσα από το Logistis μπορείτε επίσης να παραπέμπετε πελάτες σας με οφειλές (εφορία, τράπεζες/funds, ΕΦΚΑ) για δωρεάν ανάλυση εξωδικαστικής ρύθμισης — χωρίς καμία δέσμευση για εκείνον.

ΤΙ ΚΑΝΟΥΜΕ ΕΜΕΙΣ:
✓ Δωρεάν ανάλυση και πρόβλεψη αποτελεσμάτων
✓ Πλήρης διαχείριση της υπόθεσης από εξειδικευμένη νομική & χρηματοοικονομική ομάδα
✓ Ενημέρωση σε κάθε βήμα μέσα από το Logistis

ΤΙ ΚΕΡΔΙΖΕΤΕ ΕΣΕΙΣ:
✓ Αμοιβή παραπομπής για κάθε υπόθεση που ολοκληρώνεται
✓ Καμία επιπλέον δουλειά από εσάς

ΠΩΣ ΞΕΚΙΝΑΜΕ:
Για το πελατολόγιο/προγράμματα, πείτε μου αν θέλετε να σας συνδέσω με το αρμόδιο τμήμα. Για τον εξωδικαστικό, στείλτε μου απλά ΑΦΜ, ονοματεπώνυμο και τηλέφωνο του ενδιαφερόμενου πελάτη όποτε προκύψει.

Είμαι στη διάθεσή σας για οποιαδήποτε ερώτηση.

Με εκτίμηση,
[ΟΝΟΜΑ ΥΠΑΛΛΗΛΟΥ]
iMentor
[ΤΗΛΕΦΩΝΟ]
info@i-mentor.gr | www.i-mentor.gr`,
  },
  {
    title: 'Email 2 — Follow-up (δεν απάντησε)',
    subject: 'Υπενθύμιση: πελατολόγιο για προγράμματα & εξωδικαστικός στο Logistis',
    body: `Αγαπητέ/ή [ΟΝΟΜΑ ΛΟΓΙΣΤΗ],

Σας ξαναγράφω σύντομα, καθώς δεν είχαμε ευκαιρία να τα πούμε ξανά μετά την πρώτη μας επικοινωνία.

Υπενθυμίζω τα δύο πράγματα που συζητήσαμε:

1) Είχατε γραφτεί στο Logistis για τα επιχορηγούμενα προγράμματα, αλλά δεν έχετε ανεβάσει ακόμα πελατολόγιο για έλεγχο ταιριασμάτων. Αν θέλετε, μπορούμε να σας βοηθήσουμε να το κάνετε — δωρεάν, λίγα λεπτά.

2) Μέσα από το Logistis έχετε επίσης τη δυνατότητα να παραπέμπετε πελάτες με οφειλές (εφορία, τράπεζες/funds, ΕΦΚΑ) για δωρεάν ανάλυση εξωδικαστικής ρύθμισης — με αμοιβή παραπομπής για εσάς, χωρίς καμία επιπλέον δουλειά.

Πείτε μου ποιο από τα δύο σας ενδιαφέρει να δούμε πρώτα, ή στείλτε μου απευθείας στοιχεία πελάτη αν έχετε κάποιον στο μυαλό σας.

Με εκτίμηση,
[ΟΝΟΜΑ ΥΠΑΛΛΗΛΟΥ]
iMentor
[ΤΗΛΕΦΩΝΟ]
info@i-mentor.gr`,
  },
  {
    title: 'Email 3 — Πώς λειτουργεί η υπηρεσία (για ενδιαφερόμενο)',
    subject: 'Πώς λειτουργεί η παραπομπή εξωδικαστικού μέσα από το Logistis',
    body: `Αγαπητέ/ή [ΟΝΟΜΑ ΛΟΓΙΣΤΗ],

Σας στέλνω μια σύντομη περιγραφή του πώς λειτουργεί η υπηρεσία εξωδικαστικού που έχετε ήδη διαθέσιμη στο Logistis — παράλληλα με τα επιχορηγούμενα προγράμματα που ήταν και ο αρχικός λόγος εγγραφής σας.

ΠΩΣ ΔΟΥΛΕΥΕΙ Η ΠΑΡΑΠΟΜΠΗ:
1. Μας στέλνετε τα στοιχεία του πελάτη (ΑΦΜ, ονοματεπώνυμο, τηλέφωνο) — απευθείας από το Logistis
2. Κάνουμε δωρεάν ανάλυση και του δείχνουμε τι μπορεί να πετύχει
3. Αν προχωρήσει, αναλαμβάνουμε όλη τη διαδικασία μέχρι το τέλος
4. Παρακολουθείτε την πορεία της υπόθεσης μέσα από το Logistis
5. Όταν ολοκληρωθεί, λαμβάνετε την αμοιβή παραπομπής σας

ΜΗΝ ΞΕΧΝΑΤΕ ΚΑΙ ΤΑ ΠΡΟΓΡΑΜΜΑΤΑ:
Αν δεν έχετε ακόμα ανεβάσει το πελατολόγιό σας για έλεγχο επιχορηγούμενων προγραμμάτων, πείτε το μου και σας συνδέω απευθείας με το αρμόδιο τμήμα του γραφείου μας — είναι ο βασικός λόγος που έχετε λογαριασμό στο Logistis, οπότε αξίζει να το αξιοποιήσετε.

Αν θέλετε, μπορούμε να κλείσουμε ένα σύντομο τηλεφώνημα ή Teams για να σας δείξω ζωντανά και τα δύο μέσα στο Logistis.

Με εκτίμηση,
[ΟΝΟΜΑ ΥΠΑΛΛΗΛΟΥ]
iMentor
[ΤΗΛΕΦΩΝΟ]
info@i-mentor.gr | www.i-mentor.gr`,
  },
]

// ── Convert plain-text email body → HTML for rich paste into Gmail ─
function plainToHtml(text) {
  const lines = text.split('\n')
  let html = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">'
  let inList = false
  let inOl = false

  const closeLists = () => {
    if (inList) { html += '</ul>'; inList = false }
    if (inOl) { html += '</ol>'; inOl = false }
  }

  for (const raw of lines) {
    const t = raw.trimEnd().trim()

    // All-caps section header: ends with ':', ≥70% of letters are uppercase
    if (t.endsWith(':') && t.length >= 6) {
      const content = t.slice(0, -1)
      const letters = (content.match(/[a-zA-ZͰ-Ͽἀ-῿]/g) || []).length
      const uppers  = (content.match(/[A-ZΑ-ΩΆΈ-ΊΌΎ-Ώ]/g) || []).length
      if (letters > 0 && uppers / letters >= 0.7) {
        closeLists()
        html += `<p style="margin:14px 0 4px"><strong style="color:#1a4faa">${t}</strong></p>`
        continue
      }
    }

    // Checkmark bullet (✓ ...)
    if (/^✓\s/.test(t)) {
      if (inOl) { html += '</ol>'; inOl = false }
      if (!inList) { html += '<ul style="margin:4px 0 4px 20px;padding:0">'; inList = true }
      html += `<li style="margin:2px 0;color:#1a7a3a"><strong>${t.replace(/^✓\s*/, '')}</strong></li>`
      continue
    }

    // Numbered list (1. ... / 1) ...)
    const numMatch = t.match(/^(\d+)[.)]\s+(.+)/)
    if (numMatch) {
      if (inList) { html += '</ul>'; inList = false }
      if (!inOl) { html += '<ol style="margin:6px 0 8px 24px;padding:0">'; inOl = true }
      html += `<li style="margin:4px 0">${numMatch[2]}</li>`
      continue
    }

    // Bullet with dash or •
    if (/^[•\-]\s/.test(t)) {
      if (inOl) { html += '</ol>'; inOl = false }
      if (!inList) { html += '<ul style="margin:4px 0 4px 20px;padding:0">'; inList = true }
      html += `<li style="margin:2px 0">${t.replace(/^[•\-]\s*/, '')}</li>`
      continue
    }

    // Empty line → paragraph break
    if (t === '') {
      closeLists()
      html += '<br>'
      continue
    }

    // Signature line (Με εκτίμηση, or name/phone/website)
    if (/^(Με εκτίμηση|iMentor|info@|www\.)/.test(t)) {
      closeLists()
      html += `<p style="margin:2px 0;color:#555">${t}</p>`
      continue
    }

    // Regular paragraph line
    closeLists()
    html += `<p style="margin:4px 0">${t}</p>`
  }

  closeLists()
  html += '</div>'
  return html
}

// ── Helpers ───────────────────────────────────────────────────────

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy}
      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors whitespace-nowrap">
      {copied ? '✓ Αντιγράφηκε' : '📋 Αντιγραφή'}
    </button>
  )
}

function CopyAndGmail({ body, subject, to }) {
  const [state, setState] = useState('idle') // idle | ok | warn

  const handle = async () => {
    const html = plainToHtml(body)

    // 1. Write rich HTML (+ plain fallback) to clipboard
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([body], { type: 'text/plain' }),
        }),
      ])
      setState('ok')
    } catch {
      try { await navigator.clipboard.writeText(body) } catch {}
      setState('warn')
    }
    setTimeout(() => setState('idle'), 4000)

    // 2. Open Gmail compose with recipient + subject pre-filled, body empty
    //    (user pastes the formatted HTML from clipboard)
    const url = `https://mail.google.com/mail/?view=cm&fs=1${to ? `&to=${encodeURIComponent(to)}` : ''}&su=${encodeURIComponent(subject)}`
    window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={handle}
        className={`inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg border font-semibold transition-colors whitespace-nowrap ${
          state === 'ok'
            ? 'bg-green-50 border-green-300 text-green-700'
            : state === 'warn'
              ? 'bg-amber-50 border-amber-300 text-amber-700'
              : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
        }`}>
        {state === 'ok'
          ? '✓ Gmail άνοιξε'
          : state === 'warn'
            ? '⚠ Gmail άνοιξε (plain text)'
            : '✨ Αντιγραφή & Άνοιγμα Gmail'}
      </button>
      {(state === 'ok' || state === 'warn') && (
        <span className="text-xs text-green-700 font-semibold animate-pulse">
          👆 Κάνε Ctrl+V (Paste) στο σώμα
        </span>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────

export default function LogistisOutreach({ currentEmployee }) {
  const [data, setData] = useState(undefined)
  const [errMsg, setErrMsg] = useState(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [activeTab, setActiveTab] = useState('assignment')
  const [openScript, setOpenScript] = useState(null)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [drafts, setDrafts] = useState({}) // editable email body per template index

  // Employee personal details for placeholder replacement
  const [myName, setMyName] = useState(() => loadSettings().name || '')
  const [myPhone, setMyPhone] = useState(() => loadSettings().phone || '')
  const [myEmail, setMyEmail] = useState(() => loadSettings().email || '')

  const persistSettings = (n, p, e) => {
    saveSettings({ name: n, phone: p, email: e })
  }

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

  // Talking-point: gap between declared and actual client count
  const declaredNum = acc?.declared_client_count
    ? parseInt(String(acc.declared_client_count).replace(/\D/g, ''), 10)
    : null
  const actualNum = typeof acc?.client_count === 'number' ? acc.client_count : null
  const hasGap = declaredNum && actualNum !== null && actualNum < declaredNum * 0.5

  // Placeholder context
  const ctx = { accName: acc?.name || '', myName, myPhone, myEmail }

  const tabs = [
    { key: 'assignment', label: 'Ανάθεση' },
    { key: 'scripts', label: 'Σενάρια Κλήσης' },
    { key: 'emails', label: 'Email Templates' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-black text-blue-800">Outreach Λογιστών</h1>
        <button onClick={() => setShowSettings(v => !v)}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors mt-1">
          ⚙️ Τα στοιχεία μου
        </button>
      </div>
      <p className="text-gray-500 text-sm mb-4">Προσέγγισε τον ανατεθειμένο λογιστή και πρότεινε δωρεάν εκτίμηση για τους πελάτες του.</p>

      {/* Employee settings panel */}
      {showSettings && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 space-y-3">
          <div className="text-sm font-semibold text-amber-800 mb-1">Τα στοιχεία σου — αντικαθιστούν τα [ΠΕΔΙΑ] αυτόματα</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ονοματεπώνυμο</label>
              <input value={myName} onChange={e => { setMyName(e.target.value); persistSettings(e.target.value, myPhone, myEmail) }}
                placeholder="π.χ. Στέλλα Παπαδοπούλου"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Τηλέφωνο</label>
              <input value={myPhone} onChange={e => { setMyPhone(e.target.value); persistSettings(myName, e.target.value, myEmail) }}
                placeholder="π.χ. 6900000000"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Email</label>
              <input value={myEmail} onChange={e => { setMyEmail(e.target.value); persistSettings(myName, myPhone, e.target.value) }}
                placeholder="π.χ. stella@i-mentor.gr"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-400" />
            </div>
          </div>
        </div>
      )}

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
                    {/* Name + client counts */}
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">Λογιστής</div>
                        <div className="text-xl font-black text-gray-800">{acc.name}</div>
                        {acc.office_name && <div className="text-sm text-gray-500 mt-0.5">{acc.office_name}</div>}
                      </div>
                      <div className="text-right space-y-1">
                        <div>
                          <div className="text-xs text-gray-400">Πελάτες στο σύστημα</div>
                          <div className="text-2xl font-black text-blue-700">{actualNum ?? '—'}</div>
                        </div>
                        {acc.declared_client_count && (
                          <div>
                            <div className="text-xs text-gray-400">Δηλωμένοι κατά εγγραφή</div>
                            <div className="text-lg font-bold text-gray-500">{acc.declared_client_count}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Gap talking point */}
                    {hasGap && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                        💡 <strong>Talking point:</strong> Έχουν ανεβάσει μόνο {actualNum} από τους δηλωμένους {acc.declared_client_count} πελάτες — δεν έχουν ακόμα εξερευνήσει το πλήρες πελατολόγιό τους.
                      </div>
                    )}

                    {/* Contact row */}
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
                      {(acc.city || acc.area) && (
                        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-gray-600">
                          📍 {acc.city || acc.area}
                        </div>
                      )}
                    </div>

                    {/* Address */}
                    {acc.address && (
                      <div className="mt-2 flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                        <span className="mt-0.5">🏢</span>
                        <span>{acc.address}</span>
                      </div>
                    )}
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
          {(!myName || !myPhone) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700 flex items-center gap-2">
              💡 Συμπλήρωσε «Τα στοιχεία μου» (πάνω δεξιά) για να αντικατασταθούν αυτόματα τα [ΠΕΔΙΑ].
            </div>
          )}
          {CALL_SCRIPTS_RAW.map((script, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <button onClick={() => setOpenScript(openScript === idx ? null : idx)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors">
                <div>
                  <div className="font-bold text-gray-800">{script.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{script.subtitle}</div>
                </div>
                <span className="text-gray-400 text-lg ml-2 shrink-0">{openScript === idx ? '▲' : '▼'}</span>
              </button>

              {openScript === idx && (
                <div className="px-5 pb-5 border-t border-gray-100 space-y-4 pt-4">
                  {script.steps.map((step, si) => {
                    const filled = fill(step.text, ctx)
                    return (
                      <div key={si}>
                        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                          <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">{step.label}</span>
                          <CopyButton text={filled} />
                        </div>
                        <div className="bg-blue-50 rounded-lg px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border-l-4 border-blue-300">
                          {filled}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: EMAIL TEMPLATES ── */}
      {activeTab === 'emails' && (
        <div className="space-y-4">
          {(!myName || !myPhone) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700 flex items-center gap-2">
              💡 Συμπλήρωσε «Τα στοιχεία μου» (πάνω δεξιά) για να αντικατασταθούν αυτόματα τα [ΠΕΔΙΑ].
            </div>
          )}
          {EMAIL_TEMPLATES_RAW.map((tpl, idx) => {
            const filledSubject = fill(tpl.subject, ctx)
            const filledBody = fill(tpl.body, ctx)
            const currentBody = drafts[idx] !== undefined ? drafts[idx] : filledBody
            const hasEdited = drafts[idx] !== undefined && drafts[idx] !== filledBody
            return (
              <div key={idx} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="font-bold text-gray-800">{tpl.title}</div>

                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Θέμα</div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 font-medium border border-gray-200">
                    {filledSubject}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Σώμα email</div>
                      {hasEdited && (
                        <button
                          onClick={() => setDrafts(d => { const nd = { ...d }; delete nd[idx]; return nd })}
                          className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                          ↺ Επαναφορά
                        </button>
                      )}
                    </div>
                    <CopyAndGmail body={currentBody} subject={filledSubject} to={acc?.email} />
                  </div>

                  <textarea
                    value={currentBody}
                    onChange={e => setDrafts(d => ({ ...d, [idx]: e.target.value }))}
                    rows={14}
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 leading-relaxed font-sans resize-y focus:outline-none focus:border-blue-400 bg-gray-50"
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
