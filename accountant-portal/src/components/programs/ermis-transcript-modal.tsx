'use client'
import { useEffect, useState } from 'react'
import { X, MessageSquare } from 'lucide-react'

interface ErmisTranscriptModalProps {
  businessId: string
  programId: string
  onClose: () => void
}

// Splits "**bold**" segments out of Ερμής's replies into <strong> elements —
// the model is instructed to use this markup for emphasis (numbers, ΚΑΔ, verdicts).
function renderWithBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

export function ErmisTranscriptModal({ businessId, programId, onClose }: ErmisTranscriptModalProps) {
  const [chatLog, setChatLog] = useState<{ role: string; text: string }[]>([])
  const [tokenUsage, setTokenUsage] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/ermis-chat?businessId=${businessId}&programId=${programId}`)
      .then(r => r.json())
      .then(d => {
        setChatLog(d.chatLog || [])
        setTokenUsage(d.tokenUsage || 0)
      })
      .finally(() => setLoading(false))
  }, [businessId, programId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-indigo-600" />
            <h2 className="text-base font-semibold text-slate-900">Συζήτηση με τον Ερμή</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <p className="text-sm text-slate-400">Φόρτωση...</p>
          ) : chatLog.length === 0 ? (
            <p className="text-sm text-slate-400">Δεν υπάρχει ακόμη συζήτηση για αυτό το match.</p>
          ) : (
            chatLog.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === 'user'
                    ? 'self-end bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2 text-sm max-w-[85%] ml-auto'
                    : 'self-start bg-slate-100 text-slate-700 rounded-2xl rounded-bl-sm px-4 py-2 text-sm max-w-[85%] whitespace-pre-wrap'
                }
              >
                {m.role === 'assistant' ? renderWithBold(m.text) : m.text}
              </div>
            ))
          )}
        </div>

        {tokenUsage > 0 && (
          <div className="px-6 pb-4 pt-2 border-t border-slate-100 text-xs text-slate-400 flex-shrink-0">
            Tokens χρησιμοποιημένα σε αυτή τη συζήτηση: {tokenUsage.toLocaleString('el-GR')}
          </div>
        )}
      </div>
    </div>
  )
}
