import { useEffect, useState } from 'react'
import api from '../api'
import toast from 'react-hot-toast'
import { ChatBubbleLeftRightIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

export default function Communications() {
  const [comms, setComms] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/communications').then(r => setComms(r.data)).catch(() => toast.error('Σφάλμα φόρτωσης')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

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

  const channelColor = (ch) => ch === 'airbnb' ? 'bg-red-100 text-red-700' : ch === 'booking' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
  const fmt = (d) => d ? new Date(d).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Left panel — list */}
      <div className="w-full sm:w-80 lg:w-96 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChatBubbleLeftRightIcon className="w-5 h-5 text-[#1e3a5f]" />
            <h1 className="font-bold text-[#1e3a5f] text-base">Επικοινωνία</h1>
            <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{comms.length}</span>
          </div>
          <button onClick={load} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title="Ανανέωση">
            <ArrowPathIcon className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loading && <div className="flex justify-center py-10"><div className="animate-spin w-6 h-6 border-2 border-[#1e3a5f] border-t-transparent rounded-full" /></div>}
          {!loading && comms.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">
              <ChatBubbleLeftRightIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
              Δεν υπάρχουν μηνύματα ακόμα.<br />Κάντε σάρωση email από τις Ρυθμίσεις.
            </div>
          )}
          {comms.map(c => (
            <button key={c.id} onClick={() => setSelected(c)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selected?.id === c.id ? 'bg-sky-50 border-l-2 border-[#1e3a5f]' : ''}`}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${channelColor(c.channel)}`}>{c.channel}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${c.direction === 'out' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-700'}`}>
                    {c.direction === 'out' ? '→ Εξερχόμενο' : '← Εισερχόμενο'}
                  </span>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{fmt(c.sent_at)}</span>
              </div>
              <p className="text-sm font-medium text-gray-800 truncate">{c.guest_name || 'Επισκέπτης'}</p>
              <p className="text-xs text-gray-500 truncate mt-0.5">{c.subject}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel — full message */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <ChatBubbleLeftRightIcon className="w-14 h-14 mb-3 opacity-20" />
            <p className="text-sm">Επιλέξτε ένα μήνυμα</p>
          </div>
        ) : (
          <>
            {/* Message header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${channelColor(selected.channel)}`}>{selected.channel}</span>
                <span className="text-xs text-gray-400">{fmt(selected.sent_at)}</span>
                {selected.direction === 'out' && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">Εξερχόμενο</span>}
              </div>
              <h2 className="font-semibold text-gray-900 text-sm">{selected.subject}</h2>
              <p className="text-xs text-gray-500">
                {selected.guest_name && <><strong>Επισκέπτης:</strong> {selected.guest_name} · </>}
                {selected.unit_name && <><strong>Μονάδα:</strong> {selected.unit_name} · </>}
                {selected.check_in && <><strong>Check-in:</strong> {selected.check_in}</>}
              </p>
              {selected.relay_email && (
                <p className="text-xs text-red-700 break-all">🔁 <strong>Airbnb relay:</strong> {selected.relay_email}</p>
              )}
            </div>

            {/* Message body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed max-w-3xl">
                {selected.body || selected.body_preview || <span className="text-gray-400 italic">Δεν υπάρχει περιεχόμενο.</span>}
              </div>
            </div>

            {/* Reply box (only for Airbnb with relay email) */}
            {selected.relay_email && selected.channel === 'airbnb' && (
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
