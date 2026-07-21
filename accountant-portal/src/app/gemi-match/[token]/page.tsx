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
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 max-w-xl w-full overflow-hidden">
        {/* Branded header */}
        <div className="text-center py-5 px-8" style={{ background: 'linear-gradient(135deg, #1a3a6b 0%, #2563eb 100%)' }}>
          <img
            src="https://i-mentor.gr/wp-content/uploads/2026/06/logo-white-transparent.png"
            alt="i-Mentor Consulting"
            className="h-16 mx-auto object-contain"
          />
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>Σύμβουλοι Επιχειρήσεων</p>
        </div>

        <div className="p-8">
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

        {/* Contact footer */}
        <div className="border-t border-slate-100 bg-slate-50/60 px-8 py-4 text-center">
          <p className="text-xs text-slate-500 flex items-center justify-center gap-3 flex-wrap">
            <a href="tel:+302810363007" className="hover:text-blue-700">📞 2810 363007</a>
            <span className="text-slate-300">|</span>
            <a href="mailto:info@i-mentor.gr" className="hover:text-blue-700">✉️ info@i-mentor.gr</a>
            <span className="text-slate-300">|</span>
            <a href="https://www.i-mentor.gr" target="_blank" rel="noopener noreferrer" className="hover:text-blue-700">🌐 www.i-mentor.gr</a>
          </p>
        </div>
      </div>
    </div>
  )
}
