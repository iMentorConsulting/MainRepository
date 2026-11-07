'use client'
import { useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessageCircleQuestion, Send, Loader2, User, X } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

type ClientFound = { source: 'business' | 'gemi'; onomasia: string | null } | null

export function ProgramQA({ programId }: { programId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Optional: type in a client's ΑΦΜ (claimed Business or unclaimed ΓΕΜΗ
  // lead — either works) to discuss that specific client's eligibility for
  // this program in the same conversation, alongside the program's own rules.
  const [afmInput, setAfmInput] = useState('')
  const [clientAfm, setClientAfm] = useState('')
  const [clientFound, setClientFound] = useState<ClientFound>(null)

  function connectClient() {
    const afm = afmInput.trim()
    if (!afm) return
    setClientAfm(afm)
    setClientFound(null)
  }

  function disconnectClient() {
    setClientAfm('')
    setAfmInput('')
    setClientFound(null)
  }

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
        body: JSON.stringify({ question, history, afm: clientAfm || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessages(m => [...m, { role: 'assistant', content: data.answer }])
        if (clientAfm) setClientFound(data.clientFound ?? null)
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

        {clientAfm ? (
          <div className="flex items-center justify-between gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-xs text-indigo-800 min-w-0">
              <User size={12} className="shrink-0" />
              <span className="truncate">
                {clientFound === null
                  ? `Πελάτης ΑΦΜ ${clientAfm} συνδεδεμένος — ρωτήστε κάτι για να επιβεβαιωθεί`
                  : clientFound
                  ? `${clientFound.onomasia || 'Πελάτης'} (ΑΦΜ ${clientAfm}${clientFound.source === 'gemi' ? ' — ΓΕΜΗ, μη ανακτημένος' : ''})`
                  : `Δεν βρέθηκε επιχείρηση με ΑΦΜ ${clientAfm}`}
              </span>
            </span>
            <button onClick={disconnectClient} className="text-indigo-400 hover:text-indigo-700 shrink-0"><X size={13} /></button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={afmInput}
              onChange={e => setAfmInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && connectClient()}
              placeholder="ΑΦΜ πελάτη (προαιρετικό — για ερωτήσεις για συγκεκριμένο πελάτη)"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <Button size="sm" variant="outline" onClick={connectClient} disabled={!afmInput.trim()}>
              <User size={12} className="mr-1" /> Σύνδεση
            </Button>
          </div>
        )}

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
