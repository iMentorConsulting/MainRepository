'use client'

import { useState, useRef, useEffect } from 'react'
import { ChatMessage } from '@/app/room/[id]/page'

interface Props {
  messages: ChatMessage[]
  onSend: (content: string) => void
  myUserId: string
}

export default function Chat({ messages, onSend, myUserId }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    onSend(input.trim())
    setInput('')
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-purple-500 text-xs text-center mt-4">Δεν υπάρχουν μηνύματα ακόμα</p>
        )}
        {messages.map(msg => {
          const isMe = msg.userId === myUserId
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              {!isMe && (
                <span className="text-purple-400 text-xs mb-0.5 ml-1">{msg.username}</span>
              )}
              <div className={`max-w-[85%] px-3 py-1.5 rounded-xl text-sm ${
                isMe
                  ? 'bg-brand-600/80 text-white rounded-br-sm'
                  : 'bg-white/10 text-purple-100 rounded-bl-sm'
              }`}>
                {msg.content}
              </div>
              <span className="text-purple-600 text-xs mt-0.5 mx-1">{formatTime(msg.createdAt)}</span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-purple-800/50 flex gap-2">
        <input
          className="input text-sm py-1.5 flex-1"
          placeholder="Γράψε μήνυμα..."
          value={input}
          onChange={e => setInput(e.target.value)}
          maxLength={500}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="btn-primary text-sm py-1.5 px-3 disabled:opacity-40"
        >
          →
        </button>
      </form>
    </div>
  )
}
