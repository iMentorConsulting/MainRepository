'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { ErmisChat, ErmisChatMessage } from '@/components/programs/ermis-chat'

type PublicProgram = { title: string; description: string | null }

export default function PublicMatchPage() {
  const { token } = useParams<{ token: string }>()
  const [business, setBusiness] = useState<{ name: string } | null>(null)
  const [program, setProgram] = useState<PublicProgram | null>(null)
  const [chatLog, setChatLog] = useState<ErmisChatMessage[]>([])
  const [caseAssigned, setCaseAssigned] = useState(false)
  const [error, setError] = useState('')

  const [kickoffPending, setKickoffPending] = useState(false)

  useEffect(() => {
    fetch(`/api/public/match/${token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) { setError(data.error || 'Σφάλμα'); return }
        setBusiness(data.business)
        setProgram(data.program)
        setCaseAssigned(Boolean(data.caseAssigned))
        if (data.chatLog?.length) {
          setChatLog(data.chatLog)
        } else {
          // Ερμής leads the conversation himself, with what he already knows,
          // instead of waiting for the customer to ask something first.
          setKickoffPending(true)
          fetch(`/api/public/match/${token}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kickoff: true }),
          })
            .then(async r2 => {
              const d2 = await r2.json()
              if (r2.ok) setChatLog([{ role: 'assistant', text: d2.reply }])
            })
            .finally(() => setKickoffPending(false))
        }
      })
      .catch(() => setError('Σφάλμα φόρτωσης'))
  }, [token])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-xl w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={24} />
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-1">Ερμής</h1>
          <p className="text-sm text-slate-500">Ο ψηφιακός σύμβουλος επιλεξιμότητας της I-MENTOR</p>
        </div>

        {error ? (
          <p className="text-sm text-red-600 text-center">{error}</p>
        ) : !program || kickoffPending ? (
          <p className="text-sm text-slate-400 text-center">{kickoffPending ? 'Ο Ερμής ετοιμάζεται...' : 'Φόρτωση...'}</p>
        ) : (
          <ErmisChat
            token={token}
            initialMessages={chatLog}
            initialCaseAssigned={caseAssigned}
          />
        )}
      </div>
    </div>
  )
}
