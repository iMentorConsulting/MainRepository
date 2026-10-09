'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const CLIENT_COUNT_OPTIONS = [
  { value: '1-20', label: '1 - 20' },
  { value: '21-50', label: '21 - 50' },
  { value: '51-150', label: '51 - 150' },
  { value: '150+', label: 'Πάνω από 150' },
]

const COOPERATION_GOAL_OPTIONS = [
  { value: 'opportunities', label: 'Στοχευμένες ευκαιρίες επιδότησης για τους πελάτες μου' },
  { value: 'commissions', label: 'Προμήθειες από επιτυχημένες υποθέσεις' },
  { value: 'both', label: 'Και τα δύο' },
  { value: 'other', label: 'Κάτι άλλο (περιγράψτε το παρακάτω)' },
]

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    officeName: '', contactPerson: '', email: '', phone: '', password: '',
    officeLocation: '', clientCountRange: '', cooperationGoal: '', notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError('Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες')
      return
    }
    if (!form.clientCountRange || !form.cooperationGoal) {
      setError('Παρακαλούμε συμπληρώστε όλα τα υποχρεωτικά πεδία του ερωτηματολογίου')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setDone(true)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Σφάλμα υποβολής αίτησης')
      }
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 max-w-md w-full text-center space-y-3">
          <h1 className="text-xl font-bold text-slate-900">Ο λογαριασμός σας δημιουργήθηκε ✓</h1>
          <p className="text-slate-500 text-sm">
            Μπορείτε να συνδεθείτε άμεσα στο portal με το email και τον κωδικό που επιλέξατε. Η αναζήτηση επιχειρήσεων μέσω ΑΑΔΕ θα ενεργοποιηθεί μόλις η ομάδα μας εγκρίνει την αίτησή σας — θα ενημερωθείτε με email.
          </p>
          <Link href="/login" className="inline-block text-indigo-600 hover:underline text-sm font-medium">Σύνδεση στο Portal →</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-10">
      <div className="relative w-full max-w-xl">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Εγγραφή Λογιστικού Γραφείου</h1>
          <p className="text-slate-500 text-sm mt-1">Συνεργαστείτε με την I-MENTOR — δημιουργήστε λογαριασμό για το γραφείο σας</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">{error}</div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Στοιχεία Γραφείου & Λογαριασμού</h2>
            <div className="space-y-3">
              <Field label="Επωνυμία Γραφείου *" value={form.officeName} onChange={v => update('officeName', v)} required />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Υπεύθυνος Επικοινωνίας *" value={form.contactPerson} onChange={v => update('contactPerson', v)} required />
                <Field label="Τηλέφωνο" value={form.phone} onChange={v => update('phone', v)} />
              </div>
              <Field label="Email *" type="email" value={form.email} onChange={v => update('email', v)} required />
              <Field label="Κωδικός Πρόσβασης * (τουλ. 8 χαρακτήρες)" type="password" value={form.password} onChange={v => update('password', v)} required />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Ερωτηματολόγιο Συνεργασίας</h2>
            <p className="text-xs text-slate-400 mb-3">Μας βοηθά να προσαρμόσουμε τη συνεργασία στις ανάγκες του γραφείου σας.</p>
            <div className="space-y-4">
              <Field label="Τοποθεσία Γραφείου (πόλη/περιοχή) *" value={form.officeLocation} onChange={v => update('officeLocation', v)} required />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Κατά προσέγγιση αριθμός πελατών (επιχειρήσεων) *</label>
                <div className="grid grid-cols-2 gap-2">
                  {CLIENT_COUNT_OPTIONS.map(opt => (
                    <RadioCard key={opt.value} name="clientCountRange" value={opt.value} label={opt.label}
                      checked={form.clientCountRange === opt.value} onChange={() => update('clientCountRange', opt.value)} />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Ποιος είναι ο κύριος στόχος της συνεργασίας; *</label>
                <div className="space-y-2">
                  {COOPERATION_GOAL_OPTIONS.map(opt => (
                    <RadioCard key={opt.value} name="cooperationGoal" value={opt.value} label={opt.label} fullWidth
                      checked={form.cooperationGoal === opt.value} onChange={() => update('cooperationGoal', opt.value)} />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Επιπλέον σχόλια (προαιρετικό)</label>
                <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 text-sm" />
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-all duration-200 disabled:opacity-50"
            style={{background: 'linear-gradient(135deg, #4f46e5, #6366f1)'}}>
            {loading ? 'Υποβολή...' : 'Υποβολή Αίτησης Εγγραφής'}
          </button>

          <p className="text-center text-slate-400 text-xs">
            Έχετε ήδη λογαριασμό; <Link href="/login" className="text-indigo-600 hover:underline font-medium">Συνδεθείτε εδώ</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required }: { label: string, value: string, onChange: (v: string) => void, type?: string, required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required}
        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 text-sm" />
    </div>
  )
}

function RadioCard({ name, value, label, checked, onChange, fullWidth }: { name: string, value: string, label: string, checked: boolean, onChange: () => void, fullWidth?: boolean }) {
  return (
    <label className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm cursor-pointer transition-colors ${fullWidth ? 'w-full' : ''} ${checked ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="text-indigo-600 focus:ring-indigo-500" />
      {label}
    </label>
  )
}
