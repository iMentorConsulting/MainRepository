import { useState } from 'react'
import { createMessage, deleteMessage } from '../api'
import { TrashIcon, PaperAirplaneIcon, ChatBubbleLeftRightIcon, LockClosedIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const fmtDate = (s) => {
  if (!s) return ''
  const d = new Date(s)
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' })
}
const fmtTime = (s) => {
  if (!s) return ''
  return new Date(s).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
}

function groupByDate(messages) {
  const groups = []
  let currentDate = null
  for (const m of messages) {
    const d = fmtDate(m.created_at)
    if (d !== currentDate) {
      groups.push({ date: d, items: [] })
      currentDate = d
    }
    groups[groups.length - 1].items.push(m)
  }
  return groups
}

export default function MessagesTab({ caseId, caseData, onRefresh }) {
  const messages = [...(caseData?.messages || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const [content, setContent] = useState('')
  const [isInternal, setIsInternal] = useState(true)
  const [sending, setSending] = useState(false)

  const handleSend = async (e) => {
    e.preventDefault()
    if (!content.trim()) return
    setSending(true)
    try {
      await createMessage(caseId, { content: content.trim(), is_internal: isInternal })
      setContent('')
      onRefresh()
    } catch { toast.error('Σφάλμα αποστολής') } finally { setSending(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Διαγραφή μηνύματος;')) return
    try { await deleteMessage(caseId, id); onRefresh() }
    catch { toast.error('Σφάλμα διαγραφής') }
  }

  const groups = groupByDate(messages)

  return (
    <div className="flex flex-col gap-4">
      {/* Timeline */}
      <div className="bg-white rounded-xl border p-6 min-h-48">
        {messages.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <ChatBubbleLeftRightIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Δεν υπάρχουν μηνύματα</p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[18px] top-0 bottom-0 w-0.5 bg-gray-200" />

            {groups.map((group, gi) => (
              <div key={gi}>
                {/* Date separator */}
                <div className="relative flex items-center mb-4 mt-2">
                  <div className="w-9 flex-shrink-0 flex justify-center">
                    <div className="w-3 h-3 rounded-full bg-gray-300 border-2 border-white ring-2 ring-gray-300 z-10" />
                  </div>
                  <span className="ml-3 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-white px-2">
                    {group.date}
                  </span>
                </div>

                {group.items.map((m) => (
                  <div key={m.id} className="relative flex items-start mb-4 group">
                    {/* Dot */}
                    <div className="w-9 flex-shrink-0 flex justify-center pt-1.5 z-10">
                      <div className={`w-2.5 h-2.5 rounded-full border-2 border-white ring-2 ${m.is_internal ? 'bg-gray-400 ring-gray-300' : 'bg-blue-400 ring-blue-300'}`} />
                    </div>

                    {/* Card */}
                    <div className={`flex-1 rounded-xl px-4 py-3 border ${m.is_internal ? 'bg-gray-50 border-gray-200' : 'bg-blue-50 border-blue-100'}`}>
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-800">{m.author_name || 'Άγνωστος'}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 ${m.is_internal ? 'bg-gray-200 text-gray-500' : 'bg-blue-200 text-blue-700'}`}>
                            {m.is_internal
                              ? <><LockClosedIcon className="w-3 h-3" />Εσωτερικό</>
                              : <><GlobeAltIcon className="w-3 h-3" />Ορατό σε πελάτη</>}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-400">{fmtTime(m.created_at)}</span>
                          <button
                            onClick={() => handleDelete(m.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compose */}
      <form onSubmit={handleSend} className="bg-white rounded-xl border p-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-sm font-medium text-gray-700">Νέο Μήνυμα</span>
          <button
            type="button"
            onClick={() => setIsInternal(p => !p)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${isInternal ? 'bg-gray-100 text-gray-600 border-gray-300' : 'bg-blue-100 text-blue-700 border-blue-300'}`}
          >
            {isInternal ? <><LockClosedIcon className="w-3 h-3" />Εσωτερικό</> : <><GlobeAltIcon className="w-3 h-3" />Ορατό σε πελάτη</>}
          </button>
        </div>
        <div className="flex gap-2">
          <textarea
            className="input flex-1 resize-none"
            rows={3}
            placeholder="Γράψτε μήνυμα ή σημείωση..."
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleSend(e) }}
          />
          <button type="submit" disabled={sending || !content.trim()} className="btn-primary self-end">
            <PaperAirplaneIcon className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">Ctrl+Enter για αποστολή</p>
      </form>
    </div>
  )
}
