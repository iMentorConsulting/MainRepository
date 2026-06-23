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

  useEffect(() => {
    fetch(`/api/public/match/${token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) { setError(data.error || 'Σφάλμα'); return }
        setBusiness(data.business)
        setProgram(data.program)
        setChatLog(data.chatLog || [])
        setCaseAssigned(Boolean(data.caseAssigned))
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
        ) : !program ? (
          <p className="text-sm text-slate-400 text-center">Φόρτωση...</p>
        ) : (
          <ErmisChat
            token={token}
            initialMessages={chatLog}
            initialCaseAssigned={caseAssigned}
            greeting={`Γεια σου${business ? ` ${business.name}` : ''}! Είμαι ο Ερμής. Ας δούμε αν ταιριάζετε στο πρόγραμμα «${program.title}» — πες μου λίγα λόγια για την επιχείρησή σου ή ρώτα με ό,τι θέλεις.`}
          />
        )}
      </div>
    </div>
  )
}
