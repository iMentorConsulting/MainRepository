'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ErmisChat, ErmisChatMessage } from '@/components/programs/ermis-chat'

export default function GemiMatchPage() {
  const { token } = useParams<{ token: string }>()
  const [business, setBusiness] = useState<{ name: string } | null>(null)
  const [program, setProgram] = useState<{ title: string; description: string | null } | null>(null)
  const [chatLog, setChatLog] = useState<ErmisChatMessage[]>([])
  const [caseAssigned, setCaseAssigned] = useState(false)
  const [kickoffPending, setKickoffPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/public/gemi-match/${token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) { setError(data.error || 'Σφάλμα'); return }
        setBusiness(data.business)
        setProgram(data.program)
        setCaseAssigned(Boolean(data.caseAssigned))
        if (data.chatLog?.length) {
          setChatLog(data.chatLog)
        } else {
          setKickoffPending(true)
          fetch(`/api/public/gemi-match/${token}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kickoff: true }),
          })
            .then(async r2 => {
              if (r2.ok) {
                const d2 = await r2.json()
                if (d2.reply) setChatLog([{ role: 'assistant', text: d2.reply }])
              } else if (r2.status === 400) {
                const r3 = await fetch(`/api/public/gemi-match/${token}`)
                if (r3.ok) { const d3 = await r3.json(); if (d3.chatLog?.length) setChatLog(d3.chatLog) }
              } else {
                setError('Ο Ερμής δεν είναι διαθέσιμος αυτή τη στιγμή. Ανανεώστε τη σελίδα για να δοκιμάσετε ξανά.')
              }
            })
            .catch(() => setError('Σφάλμα σύνδεσης.'))
            .finally(() => setKickoffPending(false))
        }
      })
      .catch(() => setError('Σφάλμα φόρτωσης'))
  }, [token])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-xl w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4 text-2xl">
            🤖
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-1">Ερμής — Έλεγχος Επιλεξιμότητας</h1>
          <p className="text-sm text-slate-500">Ο ψηφιακός σύμβουλος επιλεξιμότητας της I-MENTOR</p>
          {program && (
            <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
              {program.title}
            </div>
          )}
        </div>

        {error ? (
          <p className="text-sm text-red-600 text-center">{error}</p>
        ) : !program || kickoffPending ? (
          <p className="text-sm text-slate-400 text-center">{kickoffPending ? 'Ο Ερμής ετοιμάζεται...' : 'Φόρτωση...'}</p>
        ) : (
          <ErmisChat
            token={token}
            apiPath={`/api/public/gemi-match/${token}/chat`}
            initialMessages={chatLog}
            initialCaseAssigned={caseAssigned}
          />
        )}
      </div>
    </div>
  )
}
