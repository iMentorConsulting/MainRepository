'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Plus, Building2, Clock } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import NewConversationModal from './new-conversation-modal'

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'μόλις τώρα'
  if (mins < 60) return `${mins}λ`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}ώ`
  return `${Math.floor(hrs / 24)}μ`
}

export default function ChatPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [conversations, setConversations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  async function load() {
    const res = await fetch('/api/chat/conversations')
    if (res.ok) setConversations(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function onCreated(conv: any) {
    setShowNew(false)
    router.push(`/chat/${conv.id}`)
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Επικοινωνία</h1>
          <p className="text-gray-500 mt-1 text-sm">Άμεση επικοινωνία με την ομάδα I-MENTOR</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} className="mr-2" />
          Νέο μήνυμα
        </Button>
      </div>

      {showNew && (
        <NewConversationModal
          onClose={() => setShowNew(false)}
          onCreated={onCreated}
          isAdmin={isAdmin}
        />
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="py-16 text-center">
            <MessageSquare size={40} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium">Δεν υπάρχουν συνομιλίες</p>
            <p className="text-gray-400 text-sm mt-1">Ξεκινήστε μια νέα συνομιλία με την ομάδα I-MENTOR</p>
            <button onClick={() => setShowNew(true)}
              className="mt-4 text-indigo-600 hover:underline text-sm font-medium">
              + Νέο μήνυμα
            </button>
          </div>
        ) : isAdmin ? (
          (() => {
            const groups = new Map<string, { office: string; contact: string; convs: any[] }>()
            for (const conv of conversations) {
              const key = conv.accountant?.id || 'unknown'
              if (!groups.has(key)) {
                groups.set(key, {
                  office: conv.accountant?.officeName || 'Άγνωστο γραφείο',
                  contact: conv.accountant?.contactPerson || '',
                  convs: [],
                })
              }
              groups.get(key)!.convs.push(conv)
            }
            return Array.from(groups.entries()).map(([key, group]) => {
              const unreadCount = group.convs.filter(conv => {
                const lastMsg = conv.messages?.[0]
                return lastMsg && !lastMsg.readAt && lastMsg.senderRole === 'ACCOUNTANT'
              }).length
              return (
                <details key={key} className="group/office border-b border-gray-100 last:border-b-0" open>
                  <summary className="flex items-center justify-between px-5 py-3 bg-gray-50 cursor-pointer select-none hover:bg-gray-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-bold text-gray-900 truncate">{group.office}</span>
                      {group.contact && <span className="text-xs text-gray-500 truncate">— {group.contact}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {unreadCount > 0 && (
                        <span className="text-[11px] font-semibold bg-indigo-600 text-white rounded-full px-2 py-0.5">
                          {unreadCount}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{group.convs.length} συνομιλίες</span>
                    </div>
                  </summary>
                  <ul className="divide-y divide-gray-100">
                    {group.convs.map(conv => (
                      <ConversationRow key={conv.id} conv={conv} isAdmin={isAdmin} />
                    ))}
                  </ul>
                </details>
              )
            })
          })()
        ) : (
          <ul className="divide-y divide-gray-100">
            {conversations.map(conv => (
              <ConversationRow key={conv.id} conv={conv} isAdmin={isAdmin} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ConversationRow({ conv, isAdmin }: { conv: any; isAdmin: boolean }) {
  const lastMsg = conv.messages?.[0]
  const unread = lastMsg && !lastMsg.readAt &&
    ((isAdmin && lastMsg.senderRole === 'ACCOUNTANT') ||
     (!isAdmin && lastMsg.senderRole === 'ADMIN'))
  return (
    <li>
      <Link href={`/chat/${conv.id}`}
        className="flex items-start gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${unread ? 'bg-indigo-600' : 'bg-indigo-100'}`}>
          <MessageSquare size={16} className={unread ? 'text-white' : 'text-indigo-600'} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold truncate ${unread ? 'text-gray-900' : 'text-gray-700'}`}>
              {conv.subject}
            </span>
            {unread && <span className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0" />}
          </div>
          {isAdmin && (
            <p className="text-xs text-indigo-600 font-medium truncate">
              {conv.accountant?.officeName} — {conv.accountant?.contactPerson}
            </p>
          )}
          {conv.business && (
            <p className="text-xs text-gray-400 flex items-center gap-1 truncate">
              <Building2 size={10} />
              {conv.business.onomasia || conv.business.afm}
            </p>
          )}
          {lastMsg && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{lastMsg.body}</p>
          )}
        </div>
        {lastMsg && (
          <span className="text-[11px] text-gray-400 flex-shrink-0 mt-0.5 flex items-center gap-1">
            <Clock size={10} />
            {timeAgo(lastMsg.createdAt)}
          </span>
        )}
      </Link>
    </li>
  )
}
