'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { ArrowLeft, Building2, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Εκκρεμεί', color: 'bg-amber-100 text-amber-700' },
  { value: 'ANSWERED', label: 'Απαντήθηκε', color: 'bg-blue-100 text-blue-700' },
  { value: 'COMPLETED', label: 'Ολοκληρώθηκε', color: 'bg-green-100 text-green-700' },
  { value: 'ARCHIVED', label: 'Αρχειοθετήθηκε', color: 'bg-gray-100 text-gray-600' },
]

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [conv, setConv] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function load() {
    const res = await fetch(`/api/chat/conversations/${id}/messages`)
    if (res.ok) {
      setConv(await res.json())
    } else {
      router.push('/chat')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conv?.messages?.length])

  // Poll for new messages every 15 seconds
  useEffect(() => {
    const iv = setInterval(async () => {
      const res = await fetch(`/api/chat/conversations/${id}/messages`)
      if (res.ok) setConv(await res.json())
    }, 15_000)
    return () => clearInterval(iv)
  }, [id])

  async function deleteMessage(msgId: string) {
    if (!confirm('Διαγραφή αυτού του μηνύματος;')) return
    setDeletingMsgId(msgId)
    await fetch(`/api/chat/messages/${msgId}`, { method: 'DELETE' })
    setConv((c: any) => ({ ...c, messages: c.messages.filter((m: any) => m.id !== msgId) }))
    setDeletingMsgId(null)
  }

  async function changeStatus(status: string) {
    setConv((c: any) => ({ ...c, status }))
    await fetch(`/api/chat/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  async function deleteConversation() {
    if (!confirm('Διαγραφή ολόκληρης της συνομιλίας; Η ενέργεια δεν αναιρείται.')) return
    await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' })
    router.push('/chat')
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || sending) return
    setSending(true)
    const res = await fetch(`/api/chat/conversations/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: body.trim() }),
    })
    if (res.ok) {
      setBody('')
      load()
    }
    setSending(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!conv) return null

  return (
    <div className="flex flex-col h-[calc(100vh-88px)] max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-200 mb-4 flex-shrink-0">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900 text-base truncate">{conv.subject}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            {isAdmin && (
              <span className="text-xs text-indigo-600 font-medium">
                {conv.accountant?.officeName} — {conv.accountant?.contactPerson}
              </span>
            )}
            {conv.business && (
              <Link href={`/businesses/${conv.business.id}`}
                className="text-xs text-gray-500 flex items-center gap-1 hover:text-indigo-600">
                <Building2 size={11} />
                {conv.business.onomasia || conv.business.afm}
              </Link>
            )}
          </div>
        </div>
        {isAdmin ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <select
              value={conv.status || 'PENDING'}
              onChange={e => changeStatus(e.target.value)}
              className="text-xs font-medium border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button
              onClick={deleteConversation}
              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Διαγραφή συνομιλίας"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : (
          <span className={`text-xs font-medium px-2 py-1 rounded-lg flex-shrink-0 ${STATUS_OPTIONS.find(s => s.value === conv.status)?.color || 'bg-gray-100 text-gray-600'}`}>
            {STATUS_OPTIONS.find(s => s.value === conv.status)?.label || 'Εκκρεμεί'}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {conv.messages?.map((msg: any) => {
          const isMe = (isAdmin && msg.senderRole === 'ADMIN') || (!isAdmin && msg.senderRole === 'ACCOUNTANT')
          const canDelete = isAdmin || (isMe && msg.senderId === session?.user?.id)
          return (
            <div key={msg.id} className={`flex items-end gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
              {isMe && canDelete && (
                <button
                  onClick={() => deleteMessage(msg.id)}
                  disabled={deletingMsgId === msg.id}
                  className="p-1 rounded text-indigo-300 hover:text-red-400 hover:bg-red-50 flex-shrink-0 transition-colors"
                  title="Διαγραφή μηνύματος"
                >
                  <Trash2 size={12} />
                </button>
              )}
              {!isMe && canDelete && (
                <button
                  onClick={() => deleteMessage(msg.id)}
                  disabled={deletingMsgId === msg.id}
                  className="order-2 p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 flex-shrink-0 transition-colors"
                  title="Διαγραφή μηνύματος"
                >
                  <Trash2 size={12} />
                </button>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                isMe
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm shadow-sm'
              }`}>
                <div className={`text-[11px] font-semibold mb-1 ${isMe ? 'text-indigo-200' : 'text-indigo-600'}`}>
                  {msg.senderRole === 'ADMIN' ? '🏢 I-MENTOR' : `👤 ${msg.senderName}`}
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                <p className={`text-[10px] mt-1 ${isMe ? 'text-indigo-300' : 'text-gray-400'}`}>
                  {new Date(msg.createdAt).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  {isMe && msg.readAt && <span className="ml-1">✓ Αναγνώστηκε</span>}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="flex gap-2 pt-4 border-t border-gray-200 mt-4 flex-shrink-0">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e as any) } }}
          rows={2}
          placeholder="Γράψτε μήνυμα... (Enter = αποστολή, Shift+Enter = νέα γραμμή)"
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 resize-none"
        />
        <button type="submit" disabled={sending || !body.trim()}
          className="self-end px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors">
          <Send size={18} />
        </button>
      </form>
    </div>
  )
}
