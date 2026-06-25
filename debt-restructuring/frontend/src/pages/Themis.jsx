import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import * as api from '../api'

export default function Themis() {
  const { token } = useParams()
  const [transcript, setTranscript] = useState([])
  const [status, setStatus] = useState('in_progress')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    api.themisGetSession(token)
      .then(r => { setTranscript(r.data.transcript || []); setStatus(r.data.status) })
      .catch(() => setError('Ο σύνδεσμος δεν βρέθηκε ή δεν είναι πλέον διαθέσιμος.'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending || status !== 'in_progress') return
    setSending(true)
    setInput('')
    setTranscript(t => [...t, { role: 'lead', text }])
    try {
      const r = await api.themisSendMessage(token, text)
      setTranscript(t => [...t, { role: 'themis', text: r.data.reply }])
      setStatus(r.data.status)
    } catch {
      setTranscript(t => [...t, { role: 'themis', text: 'Συγγνώμη, υπήρξε ένα τεχνικό πρόβλημα. Δοκιμάστε ξανά σε λίγο.' }])
    } finally {
      setSending(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-700 flex items-center justify-center">
      <div className="text-white text-lg font-semibold animate-pulse">⚖️ Φόρτωση…</div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 text-center max-w-sm">
        <div className="text-4xl mb-4">❌</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Σφάλμα</h2>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    </div>
  )

  const done = status !== 'in_progress'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-700 flex flex-col">
      <div className="flex flex-col items-center px-5 py-4 bg-white/5 backdrop-blur-sm border-b border-white/10">
        <img src="/logo.png" alt="i-Mentor" className="h-12 object-contain" onError={e => { e.target.onerror=null; e.target.src='https://i-mentor.gr/wp-content/uploads/2025/11/transparent-logo.png' }} />
        <div className="text-blue-200 text-sm font-bold mt-2">⚖️ Θέμις — i-Mentor Consulting</div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 max-w-2xl w-full mx-auto space-y-3">
        {transcript.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'themis' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
              m.role === 'themis' ? 'bg-white text-gray-800' : 'bg-blue-600 text-white'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-400 rounded-2xl px-4 py-3 text-sm animate-pulse">Η Θέμις γράφει…</div>
          </div>
        )}
        {done && (
          <div className="text-center text-blue-200 text-sm pt-4">
            ✅ Η συζήτηση ολοκληρώθηκε. Ένας σύμβουλός μας θα επικοινωνήσει μαζί σας σύντομα.
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-6 pt-2 max-w-2xl w-full mx-auto">
        <div className="flex gap-2">
          <input
            className="input flex-1 bg-white"
            placeholder={done ? 'Η συζήτηση έχει ολοκληρωθεί' : 'Γράψτε το μήνυμά σας…'}
            value={input}
            disabled={done || sending}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button
            className="btn-primary disabled:opacity-50"
            disabled={done || sending || !input.trim()}
            onClick={handleSend}
          >
            Αποστολή
          </button>
        </div>
      </div>
    </div>
  )
}
