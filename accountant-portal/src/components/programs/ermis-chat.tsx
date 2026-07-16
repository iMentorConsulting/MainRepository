'use client'
import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'

export interface ErmisChatMessage {
  role: 'user' | 'assistant'
  text: string
}

// Splits "**bold**" segments out of Ερμής's replies into <strong> elements —
// the model is instructed to use this markup for emphasis (numbers, ΚΑΔ, verdicts).
function renderWithBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

export function ErmisChat({
  token,
  apiPath,
  initialMessages,
  initialCaseAssigned,
}: {
  token: string
  apiPath?: string
  initialMessages: ErmisChatMessage[]
  initialCaseAssigned: boolean
}) {
  const [messages, setMessages] = useState<ErmisChatMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [caseAssigned, setCaseAssigned] = useState(initialCaseAssigned)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setError('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setSending(true)
    try {
      const res = await fetch(apiPath ?? `/api/public/match/${token}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Σφάλμα')
        return
      }
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply }])
      if (data.caseAssigned) setCaseAssigned(true)
    } catch {
      setError('Σφάλμα σύνδεσης')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto mb-3 pr-1">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user'
                ? 'self-end bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2 text-sm max-w-[85%]'
                : 'self-start bg-slate-100 text-slate-700 rounded-2xl rounded-bl-sm px-4 py-2 text-sm max-w-[85%] whitespace-pre-wrap'
            }
          >
            {m.role === 'assistant' ? renderWithBold(m.text) : m.text}
          </div>
        ))}
        {sending && (
          <div className="self-start bg-slate-100 text-slate-400 rounded-2xl rounded-bl-sm px-4 py-2 text-sm">
            Ο Ερμής σκέφτεται...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {caseAssigned && (
        <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-2">
          Η υπόθεσή σας έχει καταχωρηθεί — ένας σύμβουλος της I-MENTOR θα επικοινωνήσει μαζί σας.
        </p>
      )}
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder="Γράψτε την απάντησή σας..."
          disabled={sending}
          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="bg-indigo-600 text-white rounded-xl px-3 py-2 disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
