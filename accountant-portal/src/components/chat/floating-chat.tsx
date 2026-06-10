'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { MessageSquare, X, Plus, Send, ArrowLeft, Building2, ChevronDown } from 'lucide-react'

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'μόλις τώρα'
  if (mins < 60) return `${mins}λ`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}ώ`
  return `${Math.floor(hrs / 24)}μ`
}

export function FloatingChat() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'list' | 'thread' | 'new'>('list')
  const [conversations, setConversations] = useState<any[]>([])
  const [activeConv, setActiveConv] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [msgBody, setMsgBody] = useState('')
  const [sending, setSending] = useState(false)

  // New conversation form state
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')
  const [bizSearch, setBizSearch] = useState('')
  const [bizResults, setBizResults] = useState<any[]>([])
  const [selectedBiz, setSelectedBiz] = useState<any>(null)
  const [accountants, setAccountants] = useState<any[]>([])
  const [selectedAccountantId, setSelectedAccountantId] = useState('')
  const [creating, setCreating] = useState(false)

  const [unreadCount, setUnreadCount] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/chat/conversations')
    if (res.ok) {
      const list = await res.json()
      setConversations(list)
      const unread = list.filter((c: any) => {
        const last = c.messages?.[0]
        return last && !last.readAt &&
          ((isAdmin && last.senderRole === 'ACCOUNTANT') || (!isAdmin && last.senderRole === 'ADMIN'))
      }).length
      setUnreadCount(unread)
    }
  }, [isAdmin])

  useEffect(() => {
    loadConversations()
    const iv = setInterval(loadConversations, 30_000)
    return () => clearInterval(iv)
  }, [loadConversations])

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/accountants').then(r => r.json()).then(d => setAccountants(Array.isArray(d) ? d : (d.accountants || [])))
    }
  }, [isAdmin])

  useEffect(() => {
    if (!bizSearch) { setBizResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/businesses?search=${encodeURIComponent(bizSearch)}&limit=10`)
      const d = await res.json()
      setBizResults(d.businesses || [])
    }, 300)
    return () => clearTimeout(t)
  }, [bizSearch])

  async function openThread(conv: any) {
    setActiveConv(conv)
    setView('thread')
    const res = await fetch(`/api/chat/conversations/${conv.id}/messages`)
    if (res.ok) {
      const data = await res.json()
      setMessages(data.messages || [])
      setActiveConv(data)
      loadConversations()
    }
    // Poll thread
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/chat/conversations/${conv.id}/messages`)
      if (r.ok) {
        const d = await r.json()
        setMessages(d.messages || [])
      }
    }, 10_000)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  function backToList() {
    if (pollRef.current) clearInterval(pollRef.current)
    setView('list')
    setActiveConv(null)
    setMessages([])
    loadConversations()
  }

  async function sendMessage() {
    if (!msgBody.trim() || !activeConv || sending) return
    setSending(true)
    const res = await fetch(`/api/chat/conversations/${activeConv.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: msgBody.trim() }),
    })
    if (res.ok) {
      setMsgBody('')
      const r = await fetch(`/api/chat/conversations/${activeConv.id}/messages`)
      if (r.ok) { const d = await r.json(); setMessages(d.messages || []) }
    }
    setSending(false)
  }

  async function createConversation() {
    if (!newSubject.trim() || !newBody.trim()) return
    setCreating(true)
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: newSubject.trim(),
        body: newBody.trim(),
        businessId: selectedBiz?.id || null,
        accountantId: isAdmin ? selectedAccountantId : undefined,
      }),
    })
    if (res.ok) {
      const conv = await res.json()
      setNewSubject(''); setNewBody(''); setSelectedBiz(null); setBizSearch('')
      await loadConversations()
      openThread(conv)
    }
    setCreating(false)
  }

  if (!session) return null

  return (
    <>
      {/* Floating panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-[360px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ maxHeight: '520px' }}>
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white flex-shrink-0">
            {view !== 'list' && (
              <button onClick={backToList} className="p-1 rounded hover:bg-white/20 transition-colors mr-1">
                <ArrowLeft size={16} />
              </button>
            )}
            <MessageSquare size={16} />
            <span className="font-semibold text-sm flex-1">
              {view === 'list' ? 'Επικοινωνία με I-MENTOR' :
               view === 'new' ? 'Νέο μήνυμα' :
               activeConv?.subject || 'Συνομιλία'}
            </span>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/20 transition-colors">
              <ChevronDown size={16} />
            </button>
          </div>

          {/* List view */}
          {view === 'list' && (
            <>
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                {conversations.length === 0 ? (
                  <div className="py-10 text-center text-gray-400 text-sm">
                    <MessageSquare size={32} className="mx-auto mb-2 text-gray-200" />
                    Δεν υπάρχουν συνομιλίες
                  </div>
                ) : conversations.map(conv => {
                  const last = conv.messages?.[0]
                  const unread = last && !last.readAt &&
                    ((isAdmin && last.senderRole === 'ACCOUNTANT') || (!isAdmin && last.senderRole === 'ADMIN'))
                  return (
                    <button key={conv.id} onClick={() => openThread(conv)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${unread ? 'bg-indigo-500' : 'bg-transparent'}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${unread ? 'text-gray-900' : 'text-gray-700'}`}>{conv.subject}</p>
                          {isAdmin && <p className="text-xs text-indigo-600 truncate">{conv.accountant?.officeName}</p>}
                          {last && <p className="text-xs text-gray-400 truncate">{last.body}</p>}
                        </div>
                        {last && <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(last.createdAt)}</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="p-3 border-t border-gray-100 flex-shrink-0">
                <button onClick={() => setView('new')}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
                  <Plus size={16} />
                  Νέο μήνυμα
                </button>
              </div>
            </>
          )}

          {/* New conversation */}
          {view === 'new' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isAdmin && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Λογιστής *</label>
                  <select value={selectedAccountantId} onChange={e => setSelectedAccountantId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="">Επιλέξτε...</option>
                    {accountants.map((a: any) => <option key={a.id} value={a.id}>{a.officeName}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Θέμα *</label>
                <input value={newSubject} onChange={e => setNewSubject(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="π.χ. Ερώτηση για πρόγραμμα ΕΣΠΑ" />
              </div>
              <div className="relative">
                <label className="block text-xs font-medium text-gray-700 mb-1">Επιχείρηση (προαιρετικό)</label>
                {selectedBiz ? (
                  <div className="flex items-center gap-2 border border-indigo-200 rounded-lg px-3 py-2 bg-indigo-50">
                    <span className="text-xs text-indigo-800 font-medium flex-1 truncate">{selectedBiz.onomasia || selectedBiz.afm}</span>
                    <button type="button" onClick={() => setSelectedBiz(null)}><X size={12} className="text-indigo-400" /></button>
                  </div>
                ) : (
                  <>
                    <input value={bizSearch} onChange={e => setBizSearch(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Αναζήτηση..." />
                    {bizResults.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-36 overflow-y-auto">
                        {bizResults.map((b: any) => (
                          <li key={b.id}>
                            <button type="button" onClick={() => { setSelectedBiz(b); setBizSearch(''); setBizResults([]) }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50">
                              <span className="font-medium">{b.onomasia || '—'}</span>
                              <span className="text-gray-400 ml-2">{b.afm}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Μήνυμα *</label>
                <textarea value={newBody} onChange={e => setNewBody(e.target.value)} rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                  placeholder="Γράψτε το μήνυμά σας..." />
              </div>
              <button onClick={createConversation} disabled={creating || !newSubject.trim() || !newBody.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
                {creating ? 'Αποστολή...' : 'Αποστολή →'}
              </button>
            </div>
          )}

          {/* Thread view */}
          {view === 'thread' && (
            <>
              {activeConv?.business && (
                <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center gap-1.5 flex-shrink-0">
                  <Building2 size={12} className="text-indigo-500" />
                  <span className="text-xs text-indigo-700 truncate">{activeConv.business.onomasia || activeConv.business.afm}</span>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.map((msg: any) => {
                  const isMe = (isAdmin && msg.senderRole === 'ADMIN') || (!isAdmin && msg.senderRole === 'ACCOUNTANT')
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${isMe ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'}`}>
                        {!isMe && <p className="text-[10px] font-bold text-indigo-600 mb-0.5">{msg.senderRole === 'ADMIN' ? '🏢 I-MENTOR' : `👤 ${msg.senderName}`}</p>}
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                        <p className={`text-[10px] mt-0.5 ${isMe ? 'text-indigo-300' : 'text-gray-400'}`}>
                          {new Date(msg.createdAt).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              <div className="flex gap-2 p-3 border-t border-gray-100 flex-shrink-0">
                <textarea value={msgBody} onChange={e => setMsgBody(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  rows={2} placeholder="Γράψτε μήνυμα..."
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none" />
                <button onClick={sendMessage} disabled={sending || !msgBody.trim()}
                  className="self-end p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors">
                  <Send size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating bubble button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 hover:scale-110"
        aria-label="Chat με I-MENTOR"
      >
        {open ? <X size={22} /> : <MessageSquare size={22} />}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </>
  )
}
