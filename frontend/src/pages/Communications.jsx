import { useEffect, useState, useCallback } from 'react'
import api from '../api'
import toast from 'react-hot-toast'
import {
  ChatBubbleLeftRightIcon, ArrowPathIcon,
  CheckCircleIcon, ChevronDownIcon, ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'

const fmt = (d) => d
  ? new Date(d).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : ''

const fmtFull = (d) => d
  ? new Date(d).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : ''

const channelBadge = (ch) =>
  ch === 'airbnb' ? 'bg-red-100 text-red-700' :
  ch === 'booking' ? 'bg-blue-100 text-blue-700' :
  'bg-gray-100 text-gray-600'

export default function Communications() {
  const [groups, setGroups] = useState([])
  const [selectedBookingId, setSelectedBookingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/communications')
      .then(r => setGroups(r.data))
      .catch(() => toast.error('Σφάλμα φόρτωσης'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const selected = groups.find(g => g.booking_id === selectedBookingId) || null

  const handleSelect = async (group) => {
    setSelectedBookingId(group.booking_id)
    setReply('')
    // Mark all unread messages in this booking as read
    if (group.unread_count > 0) {
      try {
        await api.patch(`/communications/booking/${group.booking_id}/read-all`)
        setGroups(prev => prev.map(g =>
          g.booking_id === group.booking_id
            ? { ...g, unread_count: 0, messages: g.messages.map(m => ({ ...m, is_read: true })) }
            : g
        ))
      } catch { /* best effort */ }
    }
  }

  const handleReply = async () => {
    if (!reply.trim() || !selected?.booking_id) return
    setSending(true)
    try {
      await api.post(`/bookings/${selected.booking_id}/reply-airbnb`, { message: reply })
      toast.success('Μήνυμα στάλθηκε!')
      setReply('')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Αποτυχία αποστολής')
    } finally {
      setSending(false)
    }
  }

  const totalUnread = groups.reduce((s, g) => s + (g.unread_count || 0), 0)

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* ── Left panel: booking list ── */}
      <div className="w-full sm:w-80 lg:w-96 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChatBubbleLeftRightIcon className="w-5 h-5 text-[#1e3a5f]" />
            <h1 className="font-bold text-[#1e3a5f] text-base">Επικοινωνία</h1>
            {totalUnread > 0 && (
              <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5 font-semibold">
                {totalUnread}
              </span>
            )}
          </div>
          <button onClick={load} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title="Ανανέωση">
            <ArrowPathIcon className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loading && (
            <div className="flex justify-center py-10">
              <div className="animate-spin w-6 h-6 border-2 border-[#1e3a5f] border-t-transparent rounded-full" />
            </div>
          )}
          {!loading && groups.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">
              <ChatBubbleLeftRightIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
              Δεν υπάρχουν μηνύματα ακόμα.
            </div>
          )}
          {groups.map(g => {
            const isActive = selectedBookingId === g.booking_id
            const hasUnread = g.unread_count > 0
            return (
              <button key={g.booking_id} onClick={() => handleSelect(g)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${isActive ? 'bg-sky-50 border-l-2 border-[#1e3a5f]' : ''}`}>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {g.channel && (
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${channelBadge(g.channel)}`}>
                        {g.channel}
                      </span>
                    )}
                    <span className={`text-sm truncate ${hasUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {g.guest_name}
                    </span>
                    {hasUnread && (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" />
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{fmt(g.latest_at)}</span>
                </div>
                <p className="text-xs text-gray-500 truncate">{g.unit_name}{g.check_in ? ` · ${g.check_in}` : ''}</p>
                <p className={`text-xs truncate mt-0.5 ${hasUnread ? 'text-gray-700' : 'text-gray-400'}`}>
                  {g.latest_preview || '—'}
                </p>
                {g.messages.length > 1 && (
                  <p className="text-xs text-gray-400 mt-0.5">{g.messages.length} μηνύματα</p>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right panel: thread view ── */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <ChatBubbleLeftRightIcon className="w-14 h-14 mb-3 opacity-20" />
            <p className="text-sm">Επιλέξτε μια συνομιλία</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {selected.channel && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${channelBadge(selected.channel)}`}>
                      {selected.channel}
                    </span>
                  )}
                  <span className="font-semibold text-gray-900 text-sm">{selected.guest_name}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selected.unit_name && <>{selected.unit_name} · </>}
                  {selected.check_in && <>Check-in: {selected.check_in}</>}
                </p>
                {selected.relay_email && (
                  <p className="text-xs text-red-700 break-all mt-0.5">🔁 {selected.relay_email}</p>
                )}
              </div>
              <span className="text-xs text-gray-400 shrink-0">{selected.messages.length} μηνύματα</span>
            </div>

            {/* Message thread */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {[...selected.messages].reverse().map((m, i) => (
                <MessageBubble key={m.id} msg={m} isLast={i === selected.messages.length - 1} />
              ))}
            </div>

            {/* Reply box */}
            {selected.relay_email && (
              <div className="bg-white border-t border-gray-200 px-6 py-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500">Απάντηση μέσω Airbnb</p>
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  rows={3}
                  placeholder="Γράψε το μήνυμά σου..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] resize-none"
                />
                <button onClick={handleReply} disabled={sending || !reply.trim()}
                  className="bg-red-600 text-white px-6 py-2 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {sending ? 'Αποστολή…' : '✈️ Αποστολή μέσω Airbnb'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ msg, isLast }) {
  const [expanded, setExpanded] = useState(isLast)
  const isOut = msg.direction === 'out'
  const body = (msg.body || '').trim()
  const preview = body.slice(0, 100).replace(/\n/g, ' ')

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-2xl w-full rounded-xl border ${
        isOut ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-200'
      }`}>
        {/* Bubble header */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between px-4 py-2.5 gap-3 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            {msg.is_read
              ? <CheckCircleSolid className="w-4 h-4 text-green-400 shrink-0" />
              : <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 mt-0.5" />
            }
            <span className={`text-xs ${isOut ? 'text-blue-600' : 'text-gray-500'}`}>
              {isOut ? '→ Εξερχόμενο' : '← Εισερχόμενο'}
            </span>
            {!expanded && (
              <span className="text-xs text-gray-500 truncate">{preview || '—'}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-400">{fmtFull(msg.sent_at)}</span>
            {expanded
              ? <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronRightIcon className="w-3.5 h-3.5 text-gray-400" />
            }
          </div>
        </button>

        {/* Body */}
        {expanded && (
          <div className="px-4 pb-4 border-t border-gray-100">
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed mt-3">
              {body || <span className="text-gray-400 italic">Δεν υπάρχει περιεχόμενο.</span>}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
