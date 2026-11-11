'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck, Send, Phone, ExternalLink, CheckCircle2, Clock, X } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface Question {
  id: string
  section: number
  sectionTitle: string
  text: string
  bold: boolean
}

interface Row {
  id: string
  token: string
  sentAt: string | null
  respondedAt: string | null
  lastReminderAt: string | null
  reminderCount: number
  questions: Question[]
  answers: Record<string, string> | null
  business: { id: string; onomasia: string | null; afm: string; email: string | null; phone: string | null }
  program: { id: string; title: string }
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000))
}

function AnswersModal({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: (updated: Row) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>(row.answers || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(markResponded: boolean) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/businesses/${row.business.id}/microcredits-plan/questionnaire/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId: row.program.id, answers, markResponded }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Σφάλμα')
      onSaved({ ...row, answers, respondedAt: data.questionnaire.respondedAt })
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const sections = Array.from(new Set(row.questions.map(q => q.section))).sort((a, b) => a - b)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">{row.business.onomasia || row.business.afm}</h2>
            <p className="text-xs text-gray-500">{row.program.title} — συμπλήρωση απαντήσεων από σύμβουλο (π.χ. μετά τηλεφωνική συνέντευξη)</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          {sections.map(section => {
            const sectionQuestions = row.questions.filter(q => q.section === section)
            return (
              <div key={section} className="space-y-3">
                <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wide">{section}. {sectionQuestions[0]?.sectionTitle}</h3>
                {sectionQuestions.map(q => (
                  <div key={q.id}>
                    <label className={`block text-sm mb-1.5 whitespace-pre-line ${q.bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{q.text}</label>
                    <textarea
                      value={answers[q.id] || ''}
                      onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      rows={q.bold ? 2 : 3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
            )
          })}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={() => save(false)} disabled={saving} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">
              Αποθήκευση
            </button>
            <button onClick={() => save(true)} disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              Αποθήκευση & Σήμανση ως Απαντημένο
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MicrocreditsQuestionnairesPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'answered'>('pending')
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [editingRow, setEditingRow] = useState<Row | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch('/api/microcredits-questionnaires')
      .then(r => r.json())
      .then(d => setRows(d.questionnaires || []))
      .finally(() => setLoading(false))
  }, [])

  async function resend(row: Row) {
    setResendingId(row.id)
    try {
      const res = await fetch(`/api/businesses/${row.business.id}/microcredits-plan/questionnaire/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId: row.program.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Σφάλμα αποστολής')
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, lastReminderAt: data.questionnaire.lastReminderAt, reminderCount: data.questionnaire.reminderCount } : r))
      setToast('Το ερωτηματολόγιο επαναστάλθηκε.')
    } catch (err: any) {
      setToast(err.message)
    } finally {
      setResendingId(null)
      setTimeout(() => setToast(''), 3000)
    }
  }

  const filtered = rows.filter(r => filter === 'all' ? true : filter === 'answered' ? !!r.respondedAt : !r.respondedAt)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="w-6 h-6 text-indigo-600" />
        <h1 className="text-lg font-bold text-gray-900">Ερωτηματολόγια Μικροπιστώσεων</h1>
      </div>
      <p className="text-sm text-gray-500">Παρακολούθηση όλων των ερωτηματολογίων που έχουν σταλεί στους πελάτες για το Ταμείο Μικροπιστώσεων — ποια έχουν απαντηθεί, πότε στάλθηκε η τελευταία υπενθύμιση, και επαναποστολή ή συμπλήρωση απαντήσεων με τηλεφωνική συνέντευξη.</p>

      {toast && <div className="text-sm bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg">{toast}</div>}

      <div className="flex items-center gap-2">
        {(['pending', 'answered', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {f === 'pending' ? 'Εκκρεμή' : f === 'answered' ? 'Απαντημένα' : 'Όλα'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Φόρτωση...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">Δεν υπάρχουν ερωτηματολόγια σε αυτήν την κατηγορία.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Επιχείρηση</th>
                <th className="text-left px-4 py-3 font-medium">Πρόγραμμα</th>
                <th className="text-left px-4 py-3 font-medium">Στάλθηκε</th>
                <th className="text-left px-4 py-3 font-medium">Κατάσταση</th>
                <th className="text-left px-4 py-3 font-medium">Υπενθυμίσεις</th>
                <th className="text-right px-4 py-3 font-medium">Ενέργειες</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(row => {
                const pendingDays = row.respondedAt ? null : daysSince(row.sentAt)
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/businesses/${row.business.id}`} className="font-medium text-gray-900 hover:text-indigo-600 flex items-center gap-1">
                        {row.business.onomasia || row.business.afm} <ExternalLink size={12} className="opacity-50" />
                      </Link>
                      <p className="text-xs text-gray-400">{row.business.afm}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.program.title}</td>
                    <td className="px-4 py-3 text-gray-500">{row.sentAt ? formatDateTime(row.sentAt) : '—'}</td>
                    <td className="px-4 py-3">
                      {row.respondedAt ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle2 size={14} /> Απαντήθηκε</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                          <Clock size={14} /> Εκκρεμεί{pendingDays !== null ? ` (${pendingDays} ημ.)` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {row.reminderCount > 0 ? `${row.reminderCount}× — τελ. ${row.lastReminderAt ? formatDateTime(row.lastReminderAt) : '—'}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                      {!row.respondedAt && (
                        <button
                          onClick={() => resend(row)}
                          disabled={resendingId === row.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium hover:bg-gray-50 disabled:opacity-60"
                        >
                          <Send size={12} /> Επαναποστολή
                        </button>
                      )}
                      <button
                        onClick={() => setEditingRow(row)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium hover:bg-gray-50"
                      >
                        <Phone size={12} /> Απαντήσεις
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingRow && (
        <AnswersModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSaved={updated => setRows(prev => prev.map(r => r.id === updated.id ? updated : r))}
        />
      )}
    </div>
  )
}
