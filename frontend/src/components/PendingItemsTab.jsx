import { useState, useEffect, useRef } from 'react'
import {
  PlusIcon, TrashIcon, PaperAirplaneIcon,
  ClipboardDocumentListIcon, CheckCircleIcon,
  BellAlertIcon, XMarkIcon, ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import {
  getPendingItemTemplates, getCasePendingItems, createCasePendingItem,
  updateCasePendingItem, deleteCasePendingItem, notifyCasePendingItems,
} from '../api'

// ── Pending item row ───────────────────────────────────────────────────────────

function PendingItemRow({ item, index, onCommentSaved, onDelete }) {
  const [comment, setComment] = useState(item.comment || '')
  const [saving, setSaving] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    setComment(item.comment || '')
  }, [item.comment])

  const handleCommentChange = (val) => {
    setComment(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        await onCommentSaved(item.id, val)
      } finally {
        setSaving(false)
      }
    }, 700)
  }

  return (
    <div className="group px-5 py-4 hover:bg-orange-50/40 transition-colors">
      <div className="flex items-start gap-3">
        {/* Index badge */}
        <span className="flex-shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center rounded-full bg-orange-100 text-orange-700 text-xs font-bold">
          {index + 1}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm font-semibold text-gray-800 leading-snug">{item.item_text}</p>
          <div className="relative">
            <input
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300 transition pr-7"
              placeholder="Σχόλιο / λεπτομέρεια (προαιρετικό)..."
              value={comment}
              onChange={(e) => handleCommentChange(e.target.value)}
            />
            {saving && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <div className="w-3.5 h-3.5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={() => onDelete(item.id)}
          className="flex-shrink-0 mt-0.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
          title="Διαγραφή"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Notification panel ─────────────────────────────────────────────────────────

function NotifyPanel({ items, caseData, caseId, onClose }) {
  const [notifType, setNotifType] = useState('both')
  const [sending, setSending] = useState(false)

  const buildPreview = () => {
    const lines = items.map(
      (i) => `• ${i.item_text}` + (i.comment ? `\n  → ${i.comment}` : '')
    ).join('\n')

    let portalNote = ''
    if (caseData?.portal_active && caseData?.share_token) {
      const portalUrl = `${window.location.origin}/portal/${caseData.share_token}`
      portalNote = (
        `\n\n---\n` +
        `📱 Παρακολουθήστε την πορεία της υπόθεσής σας διαδικτυακά:\n` +
        `${portalUrl}\n` +
        `Είσοδος με το ΑΦΜ σας. Εκεί μπορείτε να βλέπετε την κατάσταση, τις εκκρεμότητες και τα έγγραφά σας.`
      )
    }

    return (
      `Αγαπητέ/ή ${caseData?.client_name || ''},\n\n` +
      `Σχετικά με την υπόθεσή σας (${caseData?.service_type || ''}), χρειαζόμαστε τα παρακάτω έγγραφα / στοιχεία:\n\n` +
      `${lines}\n\n` +
      `Παρακαλούμε να μας τα αποστείλετε το συντομότερο δυνατό, ώστε να συνεχίσουμε τη διαδικασία χωρίς καθυστέρηση.\n\n` +
      `Για οποιαδήποτε απορία, είμαστε στη διάθεσή σας.\n\n` +
      `Με εκτίμηση,\niMentor Consulting` +
      portalNote
    )
  }

  const handleSend = async () => {
    setSending(true)
    try {
      const res = await notifyCasePendingItems(caseId, { notification_type: notifType })
      const results = res.results || []
      const sent = results.filter((r) => r.status === 'sent')
      const failed = results.filter((r) => r.status === 'failed')
      if (sent.length > 0) {
        toast.success(`Εστάλη σε ${sent.length} κανάλι${sent.length > 1 ? 'α' : ''}`)
        onClose()
      }
      if (failed.length > 0)
        toast.error(`Αποτυχία: ${failed.map((r) => r.error).filter(Boolean).join('; ') || 'Έλεγξε τις ρυθμίσεις SMTP/Viber'}`)
      if (sent.length === 0 && failed.length === 0)
        toast.error('Δεν υπάρχει email ή τηλέφωνο για τον πελάτη')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Σφάλμα αποστολής')
    } finally {
      setSending(false)
    }
  }

  const TYPES = [
    { value: 'email', label: 'Email' },
    { value: 'viber', label: 'Viber' },
    { value: 'both', label: 'Email + Viber' },
  ]

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-blue-900 flex items-center gap-2 text-sm">
          <BellAlertIcon className="w-5 h-5 text-blue-600" />
          Αποστολή Ειδοποίησης — {items.length} εκκρεμ{items.length === 1 ? 'ότητα' : 'ότητες'}
        </h4>
        <button onClick={onClose} className="text-blue-400 hover:text-blue-700">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Channel selector */}
      <div className="flex gap-4">
        {TYPES.map(({ value, label }) => (
          <label key={value} className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="radio"
              name="notifType"
              value={value}
              checked={notifType === value}
              onChange={() => setNotifType(value)}
              className="accent-blue-600"
            />
            <span className="text-sm font-medium text-gray-700">{label}</span>
          </label>
        ))}
      </div>

      {/* Preview */}
      <div className="bg-white rounded-lg border border-blue-100 p-4">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">
          Προεπισκόπηση μηνύματος
        </p>
        <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
          {buildPreview()}
        </pre>
      </div>

      {/* Contact info */}
      <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
        {caseData?.email && <span>📧 {caseData.email}</span>}
        {caseData?.phone && <span>📱 {caseData.phone}</span>}
        {!caseData?.email && !caseData?.phone && (
          <span className="flex items-center gap-1 text-orange-600">
            <ExclamationCircleIcon className="w-3.5 h-3.5" />
            Δεν υπάρχουν στοιχεία επικοινωνίας
          </span>
        )}
      </div>

      {/* Portal link badge */}
      {caseData?.portal_active && caseData?.share_token ? (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
          <span className="font-semibold">🔗 Portal link συμπεριλαμβάνεται</span>
          <span className="text-green-500">— ο πελάτης θα δει σύνδεσμο και οδηγίες εισόδου</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500">
          <span>Portal ανενεργό — δεν συμπεριλαμβάνεται σύνδεσμος</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <PaperAirplaneIcon className="w-4 h-4" />
          {sending ? 'Αποστολή...' : 'Αποστολή'}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Ακύρωση
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PendingItemsTab({ caseId, caseData }) {
  const [items, setItems] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [showNotify, setShowNotify] = useState(false)

  const programCategory = caseData?.program_category || ''

  useEffect(() => {
    load()
  }, [caseId])

  const load = async () => {
    setLoading(true)
    try {
      const [its, tmplts] = await Promise.all([
        getCasePendingItems(caseId),
        getPendingItemTemplates(programCategory),
      ])
      setItems(its)
      setTemplates(tmplts)
    } catch {
      toast.error('Σφάλμα φόρτωσης εκκρεμοτήτων')
    } finally {
      setLoading(false)
    }
  }

  const addItem = async (text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setAdding(true)
    try {
      const item = await createCasePendingItem(caseId, { item_text: trimmed, sort_order: items.length })
      setItems((prev) => [...prev, item])
      setNewText('')
    } catch {
      toast.error('Σφάλμα προσθήκης')
    } finally {
      setAdding(false)
    }
  }

  const handleCommentSaved = async (itemId, comment) => {
    try {
      await updateCasePendingItem(caseId, itemId, { comment })
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, comment } : i)))
    } catch {
      toast.error('Σφάλμα αποθήκευσης σχολίου')
    }
  }

  const handleDelete = async (itemId) => {
    try {
      await deleteCasePendingItem(caseId, itemId)
      setItems((prev) => prev.filter((i) => i.id !== itemId))
    } catch {
      toast.error('Σφάλμα διαγραφής')
    }
  }

  const unusedTemplates = templates.filter(
    (t) => !items.some((i) => i.item_text === t.item_text)
  )

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="bg-white rounded-xl border p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-50 rounded-xl">
            <ClipboardDocumentListIcon className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Εκκρεμότητες πελάτη</h3>
            {items.length === 0 ? (
              <p className="text-xs text-gray-400 mt-0.5">Δεν υπάρχουν εκκρεμότητες — όλα εντάξει</p>
            ) : (
              <p className="text-xs text-orange-600 font-medium mt-0.5">
                {items.length} εκκρεμ{items.length === 1 ? 'ότητα' : 'ότητες'} σε αναμονή
              </p>
            )}
          </div>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => setShowNotify((v) => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              showNotify
                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <PaperAirplaneIcon className="w-4 h-4" />
            {showNotify ? 'Κλείσιμο' : 'Αποστολή Ειδοποίησης'}
          </button>
        )}
      </div>

      {/* Notification panel */}
      {showNotify && items.length > 0 && (
        <NotifyPanel
          items={items}
          caseData={caseData}
          caseId={caseId}
          onClose={() => setShowNotify(false)}
        />
      )}

      {/* Quick-add from templates */}
      {unusedTemplates.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Γρήγορη Προσθήκη
            {programCategory && (
              <span className="ml-1.5 normal-case font-normal text-gray-400">
                — {programCategory}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {unusedTemplates.map((t) => (
              <button
                key={t.id}
                onClick={() => addItem(t.item_text)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-sm text-gray-600 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 transition-all font-medium"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                {t.item_text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pending items list */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 select-none">
            <CheckCircleIcon className="w-11 h-11 mb-2 opacity-30" />
            <p className="text-sm font-medium">Δεν υπάρχουν εκκρεμότητες</p>
            <p className="text-xs mt-1 text-gray-300">
              Προσθέστε από τον κατάλογο παραπάνω ή χρησιμοποιήστε το πεδίο εισαγωγής
            </p>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Εκκρεμότητες ({items.length})
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {items.map((item, idx) => (
                <PendingItemRow
                  key={item.id}
                  item={item}
                  index={idx}
                  onCommentSaved={handleCommentSaved}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add custom item */}
      <div className="bg-white rounded-xl border p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Προσθήκη Νέας Εκκρεμότητας
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300 transition"
            placeholder="π.χ. Υπεύθυνη δήλωση αδεικτικού στοιχείου..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem(newText)}
          />
          <button
            onClick={() => addItem(newText)}
            disabled={adding || !newText.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <PlusIcon className="w-4 h-4" />
            {adding ? 'Προσθήκη...' : 'Προσθήκη'}
          </button>
        </div>
      </div>
    </div>
  )
}
