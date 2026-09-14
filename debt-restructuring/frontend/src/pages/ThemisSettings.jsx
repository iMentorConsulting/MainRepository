import { useState, useEffect } from 'react'
import { ArrowUpIcon, ArrowDownIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import * as api from '../api'

export default function ThemisSettings() {
  const [questions, setQuestions] = useState([])
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getThemisSettings().then(r => {
      setQuestions(r.data.questions || [])
      setInstructions(r.data.instructions || '')
    }).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.putThemisSettings({ questions: questions.filter(q => q.trim()), instructions })
      toast.success('Οι ρυθμίσεις της Θέμις αποθηκεύτηκαν')
    } catch {
      toast.error('Σφάλμα αποθήκευσης')
    } finally {
      setSaving(false)
    }
  }

  const updateQuestion = (i, text) => setQuestions(qs => qs.map((q, idx) => idx === i ? text : q))
  const removeQuestion = (i) => setQuestions(qs => qs.filter((_, idx) => idx !== i))
  const addQuestion = () => setQuestions(qs => [...qs, ''])
  const move = (i, dir) => setQuestions(qs => {
    const j = i + dir
    if (j < 0 || j >= qs.length) return qs
    const copy = [...qs]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    return copy
  })

  if (loading) return <div className="p-6 text-gray-500">Φόρτωση…</div>

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-black text-blue-900 mb-1">⚖️ Ρυθμίσεις Θέμις</h1>
        <p className="text-sm text-gray-500 mb-6">
          Η Θέμις είναι η AI βοηθός που κάνει τον προκαταρκτικό έλεγχο επιλεξιμότητας στα leads πριν τα καλέσει ο σύμβουλος.
          Όρισε εδώ τις ερωτήσεις και τις οδηγίες της.
        </p>

        <div className="bg-white rounded-2xl shadow p-5 mb-5">
          <h2 className="font-bold text-gray-700 mb-3">Ερωτήσεις Επιλεξιμότητας (με σειρά)</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {questions.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-6 text-right shrink-0">{i + 1}.</span>
                <input
                  className="input flex-1"
                  value={q}
                  onChange={e => updateQuestion(i, e.target.value)}
                  placeholder="π.χ. Έχετε ληξιπρόθεσμες οφειλές άνω των 10.000€;"
                />
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 text-gray-400 hover:text-blue-600 disabled:opacity-30 shrink-0">
                  <ArrowUpIcon className="w-4 h-4" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="p-1.5 text-gray-400 hover:text-blue-600 disabled:opacity-30 shrink-0">
                  <ArrowDownIcon className="w-4 h-4" />
                </button>
                <button onClick={() => removeQuestion(i)} className="p-1.5 text-gray-400 hover:text-red-600 shrink-0">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addQuestion} className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-semibold">
            <PlusIcon className="w-4 h-4" />Προσθήκη ερώτησης
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow p-5 mb-5">
          <h2 className="font-bold text-gray-700 mb-3">Επιπλέον Οδηγίες (ύφος, FAQ, τόνος, στοιχεία)</h2>
          <textarea
            className="input w-full min-h-[200px] resize-none"
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder={`Π.χ.
Μιλάς πάντα στον πληθυντικό με τους πελάτες (π.χ. "Καλησπέρα σας").

Στοιχεία εταιρείας:
I MENTOR Consulting
Παύλου Μπακογιάννη 5, 71410 Ηράκλειο Κρήτης
Πανελλαδική εξυπηρέτηση
Τηλ: 2810363007
Email: info@i-mentor.gr
Website: www.i-mentor.gr

Ύφος: Ζεστό, επαγγελματικό, με εμπάθεια.
Αν δεν ξέρεις κάτι, μη το απαντάς - δώσε τα στοιχεία της εταιρείας για περισσότερες πληροφορίες.`}
          />
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50 w-full md:w-auto">
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση Ρυθμίσεων'}
        </button>
      </div>
    </div>
  )
}
