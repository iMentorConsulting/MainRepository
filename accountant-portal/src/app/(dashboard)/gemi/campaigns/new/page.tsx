'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ArrowLeft, Send, Users, Mail, MessageCircle, FlaskConical } from 'lucide-react'
import { Suspense } from 'react'

const GEMI_DISCLAIMER = `Τα στοιχεία επικοινωνίας σας αντλήθηκαν από το Γενικό Εμπορικό Μητρώο (ΓΕΜΗ) μέσω του επίσημου Open Data API του Ελληνικού Δημοσίου, υπό την άδεια ανοιχτών δεδομένων ODC-BY-1.0, η οποία επιτρέπει ρητά την εμπορική χρήση. Πρόκειται για δημόσια διαθέσιμα εταιρικά στοιχεία (gemi.gov.gr).`

type Channel = 'EMAIL' | 'VIBER' | 'EMAIL_AND_VIBER'

export default function NewGemiCampaignPage() {
  return (
    <Suspense fallback={null}>
      <NewGemiCampaignPageInner />
    </Suspense>
  )
}

function NewGemiCampaignPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [title, setTitle] = useState('')
  const [channel, setChannel] = useState<Channel>('EMAIL')
  const [programId, setProgramId] = useState(searchParams.get('programId') || '')
  const [programs, setPrograms] = useState<any[]>([])
  const [subject, setSubject] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [viberMessage, setViberMessage] = useState('')

  // Recipients
  const [recipientCount, setRecipientCount] = useState<{ emailCount: number; viberCount: number; total: number } | null>(null)
  const [countLoading, setCountLoading] = useState(false)

  // Test send
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState('')

  const [savingDraft, setSavingDraft] = useState(false)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/programs')
      .then(r => r.json())
      .then(d => setPrograms(Array.isArray(d) ? d : (d.programs || [])))
      .catch(() => {})
  }, [])

  const fetchCount = useCallback(async () => {
    setCountLoading(true)
    const params = new URLSearchParams({ channel })
    if (programId) params.set('programId', programId)
    const res = await fetch(`/api/gemi/campaigns/recipient-count?${params}`)
    if (res.ok) setRecipientCount(await res.json())
    setCountLoading(false)
  }, [channel, programId])

  useEffect(() => { fetchCount() }, [fetchCount])

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  function validate() {
    if (!title.trim()) { showToast('Ο τίτλος είναι υποχρεωτικός.', false); return false }
    if ((channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER') && !htmlContent.trim()) {
      showToast('Απαιτείται HTML περιεχόμενο email.', false); return false
    }
    if ((channel === 'VIBER' || channel === 'EMAIL_AND_VIBER') && !viberMessage.trim()) {
      showToast('Απαιτείται κείμενο Viber.', false); return false
    }
    return true
  }

  async function createCampaign(sendNow = false) {
    const res = await fetch('/api/gemi/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        channel,
        programId: programId || undefined,
        subject: subject.trim() || undefined,
        htmlContent: htmlContent.trim() || undefined,
        messageTemplate: viberMessage.trim() || undefined,
        status: 'DRAFT',
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || 'Σφάλμα δημιουργίας καμπάνιας')
    }
    const campaign = await res.json()
    if (sendNow) {
      const sendRes = await fetch(`/api/gemi/campaigns/${campaign.id}/send`, { method: 'POST' })
      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({}))
        throw new Error(err?.error || 'Σφάλμα αποστολής')
      }
    }
    return campaign
  }

  async function handleSaveDraft() {
    if (!validate()) return
    setSavingDraft(true)
    try {
      const c = await createCampaign(false)
      showToast('Αποθηκεύτηκε ως πρόχειρο.', true)
      router.push(`/gemi/campaigns`)
    } catch (e: any) {
      showToast(e.message, false)
    } finally {
      setSavingDraft(false)
    }
  }

  async function handleSend() {
    if (!validate()) return
    if (!window.confirm(`Αποστολή σε ${recipientCount?.total ?? '?'} παραλήπτες; Δεν υπάρχει αναίρεση.`)) return
    setSending(true)
    try {
      await createCampaign(true)
      showToast('Η καμπάνια απεστάλη!', true)
      router.push('/gemi/campaigns')
    } catch (e: any) {
      showToast(e.message, false)
    } finally {
      setSending(false)
    }
  }

  async function handleTestSend() {
    if (!testEmail.trim()) { showToast('Εισάγετε email δοκιμής.', false); return }
    if (!htmlContent.trim()) { showToast('Απαιτείται HTML περιεχόμενο για δοκιμαστική αποστολή.', false); return }
    setTestSending(true)
    setTestResult('')
    const res = await fetch('/api/gemi/campaigns/test-send/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testEmail: testEmail.trim(), subject: subject || title || 'ΓΕΜΗ Test', htmlContent }),
    })
    // For test send we don't need a saved campaign, use a dedicated endpoint
    const res2 = await fetch('/api/gemi/campaigns/_/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testEmail: testEmail.trim(), subject: subject || title || 'ΓΕΜΗ Test', htmlContent }),
    })
    if (res2.ok) {
      setTestResult(`✓ Δοκιμαστικό email εστάλη στο ${testEmail}`)
    } else {
      const err = await res2.json().catch(() => ({}))
      setTestResult(`✗ ${err.error || 'Σφάλμα αποστολής'}`)
    }
    setTestSending(false)
  }

  const showEmail = channel === 'EMAIL' || channel === 'EMAIL_AND_VIBER'
  const showViber = channel === 'VIBER' || channel === 'EMAIL_AND_VIBER'

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Link href="/gemi/campaigns">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Νέα Καμπάνια ΓΕΜΗ</h1>
      </div>

      {/* Basic fields */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Βασικά Στοιχεία</h2>
        <Input
          label="Τίτλος *"
          placeholder="π.χ. Ενημέρωση ΓΕΜΗ Ιουλίου 2026"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <Select
          label="Κανάλι"
          value={channel}
          onChange={e => setChannel(e.target.value as Channel)}
          options={[
            { value: 'EMAIL', label: 'Email (Moosend)' },
            { value: 'VIBER', label: 'Viber (Chatwoot)' },
            { value: 'EMAIL_AND_VIBER', label: 'Email + Viber' },
          ]}
        />
      </div>

      {/* Recipients */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Παραλήπτες</h2>
        <Select
          label="Πρόγραμμα (φιλτράρει στις ταυτισμένες επιχειρήσεις)"
          value={programId}
          onChange={e => setProgramId(e.target.value)}
        >
          <option value="">— Όλη η λίστα ΓΕΜΗ (χωρίς φίλτρο) —</option>
          {programs.map((p: any) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </Select>

        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${recipientCount && recipientCount.total > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
          <Users size={16} className="text-blue-600 shrink-0" />
          {countLoading ? (
            <span className="text-sm text-gray-400">Υπολογισμός…</span>
          ) : recipientCount ? (
            <div className="text-sm">
              <span className="font-semibold text-blue-800">{recipientCount.total.toLocaleString('el-GR')} παραλήπτες</span>
              {recipientCount.emailCount > 0 && (
                <span className="ml-2 text-gray-500"><Mail size={12} className="inline mr-0.5" />{recipientCount.emailCount.toLocaleString('el-GR')} email</span>
              )}
              {recipientCount.viberCount > 0 && (
                <span className="ml-2 text-gray-500"><MessageCircle size={12} className="inline mr-0.5" />{recipientCount.viberCount.toLocaleString('el-GR')} Viber</span>
              )}
            </div>
          ) : null}
        </div>
        {programId && recipientCount && recipientCount.total === 0 && (
          <p className="text-xs text-amber-600">⚠️ Δεν βρέθηκαν επιχειρήσεις ταυτισμένες με αυτό το πρόγραμμα που να έχουν email/τηλέφωνο.</p>
        )}
      </div>

      {/* Email content */}
      {showEmail && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Περιεχόμενο Email</h2>
          <Input
            label="Θέμα (Subject) *"
            placeholder="π.χ. Ευκαιρία χρηματοδότησης για την επιχείρησή σας"
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">HTML Περιεχόμενο *</label>
            <textarea
              value={htmlContent}
              onChange={e => setHtmlContent(e.target.value)}
              rows={12}
              placeholder={`<p>Αγαπητέ/ή,</p>\n<p>Σας ενημερώνουμε ότι...</p>`}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-y"
            />
            <p className="text-xs text-slate-400 mt-1">Η αποποίηση ΓΕΜΗ προστίθεται αυτόματα στο τέλος κάθε email.</p>
          </div>

          {/* Test send */}
          <div className="border-t border-gray-100 pt-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1"><FlaskConical size={12} />Δοκιμαστική Αποστολή</p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="test@example.com"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <Button
                variant="outline"
                size="sm"
                loading={testSending}
                onClick={async () => {
                  if (!testEmail.trim() || !htmlContent.trim()) {
                    showToast('Απαιτούνται email δοκιμής και HTML περιεχόμενο.', false); return
                  }
                  setTestSending(true); setTestResult('')
                  // Create a temp campaign and send test
                  const tempRes = await fetch('/api/gemi/campaigns', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      title: `[TEST] ${title || 'Draft'}`,
                      channel: 'EMAIL',
                      subject: subject || title || 'ΓΕΜΗ Test',
                      htmlContent,
                      status: 'DRAFT',
                    }),
                  })
                  if (!tempRes.ok) { showToast('Σφάλμα δημιουργίας δοκιμαστικής καμπάνιας.', false); setTestSending(false); return }
                  const temp = await tempRes.json()
                  const testRes = await fetch(`/api/gemi/campaigns/${temp.id}/test-send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ testEmail: testEmail.trim(), subject: subject || title || 'ΓΕΜΗ Test', htmlContent }),
                  })
                  if (testRes.ok) {
                    setTestResult(`✓ Εστάλη στο ${testEmail}`)
                    showToast(`Δοκιμαστικό email εστάλη στο ${testEmail}`, true)
                  } else {
                    const err = await testRes.json().catch(() => ({}))
                    setTestResult(`✗ ${err.error || 'Σφάλμα'}`)
                    showToast(err.error || 'Σφάλμα αποστολής δοκιμής.', false)
                  }
                  setTestSending(false)
                }}
              >
                <FlaskConical size={14} className="mr-1" />
                Αποστολή Δοκιμής
              </Button>
            </div>
            {testResult && <p className="text-xs text-gray-500">{testResult}</p>}
          </div>
        </div>
      )}

      {/* Viber content */}
      {showViber && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Κείμενο Viber</h2>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Μήνυμα * (έως 1000 χαρακτήρες)</label>
            <textarea
              value={viberMessage}
              onChange={e => setViberMessage(e.target.value)}
              rows={5}
              maxLength={900}
              placeholder="Αγαπητέ/ή, σας ενημερώνουμε..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-y"
            />
            <div className="flex justify-between">
              <p className="text-xs text-slate-400 mt-1">Η αποποίηση ΓΕΜΗ προστίθεται αυτόματα.</p>
              <span className="text-xs text-gray-400 mt-1">{viberMessage.length}/900</span>
            </div>
          </div>
        </div>
      )}

      {/* Legal disclaimer preview */}
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Αποποίηση ΓΕΜΗ — προστίθεται αυτόματα</p>
        <p className="text-xs text-amber-600 leading-relaxed">{GEMI_DISCLAIMER}</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pb-8">
        <Button variant="outline" loading={savingDraft} disabled={sending} onClick={handleSaveDraft}>
          Αποθήκευση Πρόχειρου
        </Button>
        <Button loading={sending} disabled={savingDraft || !recipientCount || recipientCount.total === 0} onClick={handleSend} className="bg-indigo-600 hover:bg-indigo-700">
          <Send size={15} className="mr-2" />
          Αποστολή σε {recipientCount?.total?.toLocaleString('el-GR') ?? '…'} παραλήπτες
        </Button>
      </div>
    </div>
  )
}
