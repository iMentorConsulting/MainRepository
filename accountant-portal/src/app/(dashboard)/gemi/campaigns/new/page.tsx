'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ArrowLeft, Send, Users } from 'lucide-react'

const GEMI_DISCLAIMER = `Η παρούσα επικοινωνία αποστέλλεται στο πλαίσιο της υπηρεσίας ΓΕΜΗ και αφορά πληροφορίες σχετικές με εγγεγραμμένες επιχειρήσεις. Σύμφωνα με τον Ν. 4919/2022 και τον Κανονισμό (ΕΕ) 2016/679 (GDPR), τα στοιχεία επικοινωνίας χρησιμοποιούνται αποκλειστικά για ενημερωτικούς σκοπούς που σχετίζονται με το Γενικό Εμπορικό Μητρώο. Εάν δεν επιθυμείτε να λαμβάνετε τέτοιες ενημερώσεις, μπορείτε να επικοινωνήσετε μαζί μας για διαγραφή από τη λίστα αποστολής.`

type Channel = 'EMAIL' | 'VIBER' | 'EMAIL_AND_VIBER'

export default function NewGemiCampaignPage() {
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [channel, setChannel] = useState<Channel>('EMAIL')
  const [programId, setProgramId] = useState('')
  const [programs, setPrograms] = useState<any[]>([])
  const [subject, setSubject] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [viberMessage, setViberMessage] = useState('')

  const [savingDraft, setSavingDraft] = useState(false)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [recipientCount, setRecipientCount] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/programs')
      .then(r => r.json())
      .then(d => setPrograms(d.programs || []))
      .catch(() => {})
  }, [])

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  function validate() {
    if (!title.trim()) { showToast('Το πεδίο Τίτλος είναι υποχρεωτικό.', false); return false }
    return true
  }

  async function createCampaign() {
    const res = await fetch('/api/gemi/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        channel,
        programId: programId || undefined,
        subject: subject.trim() || undefined,
        htmlContent: htmlContent.trim() || undefined,
        viberMessage: viberMessage.trim() || undefined,
        status: 'DRAFT',
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || 'Σφάλμα δημιουργίας καμπάνιας')
    }
    return res.json()
  }

  async function handleSaveDraft() {
    if (!validate()) return
    setSavingDraft(true)
    try {
      const created = await createCampaign()
      if (created.recipientCount != null) setRecipientCount(created.recipientCount)
      showToast('Το πρόχειρο αποθηκεύτηκε.', true)
      router.push(`/gemi/campaigns/${created.id}`)
    } catch (e: any) {
      showToast(e.message || 'Σφάλμα αποθήκευσης.', false)
    } finally {
      setSavingDraft(false)
    }
  }

  async function handleSend() {
    if (!validate()) return
    setSending(true)
    try {
      const created = await createCampaign()
      if (created.recipientCount != null) setRecipientCount(created.recipientCount)
      const sendRes = await fetch(`/api/gemi/campaigns/${created.id}/send`, { method: 'POST' })
      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({}))
        showToast(err?.error || 'Σφάλμα κατά την αποστολή.', false)
      } else {
        showToast('Η καμπάνια δημιουργήθηκε και ξεκίνησε η αποστολή.', true)
        router.push(`/gemi/campaigns/${created.id}`)
      }
    } catch (e: any) {
      showToast(e.message || 'Σφάλμα αποστολής.', false)
    } finally {
      setSending(false)
    }
  }

  const showEmail = channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER'
  const showViber = channel === 'VIBER' || channel === 'EMAIL_AND_VIBER'

  return (
    <div className="max-w-2xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <Link href="/gemi/campaigns">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Νέα Καμπάνια ΓΕΜΗ</h1>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5">
        {/* Τίτλος */}
        <Input
          label="Τίτλος"
          placeholder="π.χ. Ενημέρωση ΓΕΜΗ Ιουλίου 2026"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />

        {/* Κανάλι */}
        <Select
          label="Κανάλι"
          value={channel}
          onChange={e => setChannel(e.target.value as Channel)}
          options={[
            { value: 'EMAIL', label: 'Email' },
            { value: 'VIBER', label: 'Viber' },
            { value: 'EMAIL_AND_VIBER', label: 'Email & Viber' },
          ]}
        />

        {/* Πρόγραμμα */}
        <Select
          label="Πρόγραμμα (προαιρετικό)"
          value={programId}
          onChange={e => setProgramId(e.target.value)}
          placeholder="— Χωρίς συγκεκριμένο πρόγραμμα —"
        >
          <option value="">— Χωρίς συγκεκριμένο πρόγραμμα —</option>
          {programs.map((p: any) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </Select>

        {/* Email fields */}
        {showEmail && (
          <>
            <Input
              label="Θέμα (Subject)"
              placeholder="π.χ. Ενημέρωση για την επιχείρησή σας από το ΓΕΜΗ"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">HTML Περιεχόμενο</label>
              <textarea
                value={htmlContent}
                onChange={e => setHtmlContent(e.target.value)}
                rows={14}
                placeholder="<p>Αγαπητέ/ή...</p>"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-150 resize-y"
              />
              <p className="text-xs text-slate-400">Εισάγετε το HTML περιεχόμενο του email. Η αποποίηση ΓΕΜΗ θα προστεθεί αυτόματα στο τέλος.</p>
            </div>
          </>
        )}

        {/* Viber fields */}
        {showViber && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Μήνυμα Viber</label>
            <textarea
              value={viberMessage}
              onChange={e => setViberMessage(e.target.value)}
              rows={5}
              placeholder="Αγαπητέ/ή, σας ενημερώνουμε..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-150 resize-y"
            />
            <p className="text-xs text-slate-400">Κείμενο Viber (έως 1000 χαρακτήρες). Η αποποίηση ΓΕΜΗ θα προστεθεί αυτόματα.</p>
          </div>
        )}

        {/* Disclaimer note */}
        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Αποποίηση ΓΕΜΗ — προστίθεται αυτόματα</p>
          <p className="text-xs text-gray-400 leading-relaxed">{GEMI_DISCLAIMER}</p>
        </div>

        {/* Recipient count preview after draft creation */}
        {recipientCount !== null && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <Users size={16} />
            <span>Εκτιμώμενοι παραλήπτες: <strong>{recipientCount}</strong></span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            variant="outline"
            loading={savingDraft}
            disabled={sending}
            onClick={handleSaveDraft}
          >
            Αποθήκευση Πρόχειρου
          </Button>
          <Button
            loading={sending}
            disabled={savingDraft}
            onClick={handleSend}
          >
            <Send size={15} className="mr-2" />
            Δημιουργία &amp; Αποστολή
          </Button>
        </div>
      </div>
    </div>
  )
}
