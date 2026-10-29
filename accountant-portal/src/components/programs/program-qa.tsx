'use client'
import { useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessageCircleQuestion, Send, Loader2 } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function ProgramQA({ programId }: { programId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  async function send() {
    const question = input.trim()
    if (!question || sending) return
    setError('')
    setInput('')
    const history = messages
    const nextMessages: ChatMessage[] = [...history, { role: 'user', content: question }]
    setMessages(nextMessages)
    setSending(true)
    try {
      const res = await fetch(`/api/programs/${programId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessages(m => [...m, { role: 'assistant', content: data.answer }])
      } else {
        setError(data.error || 'Σφάλμα κατά την αποστολή της ερώτησης.')
      }
    } catch {
      setError('Σφάλμα δικτύου.')
    } finally {
      setSending(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 normal-case text-base text-slate-800 font-semibold">
          <MessageCircleQuestion size={18} className="text-indigo-600" />
          Ρωτήστε για το Πρόγραμμα
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">
          Οι απαντήσεις βασίζονται αποκλειστικά στα στοιχεία του προγράμματος και στα συνημμένα έγγραφα παραπάνω.
        </p>

        {messages.length > 0 && (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1 border border-slate-100 rounded-lg p-3 bg-slate-50">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-xl rounded-bl-sm px-3 py-2 text-sm text-slate-400 flex items-center gap-1.5">
                  <Loader2 size={14} className="animate-spin" /> Σκέφτεται...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="π.χ. Ποια είναι η προθεσμία υποβολής; Καλύπτει ΚΑΔ 56.10;"
            rows={2}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          />
          <Button size="sm" onClick={send} loading={sending} disabled={!input.trim()}>
            <Send size={14} />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
