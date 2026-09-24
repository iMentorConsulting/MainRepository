'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { getRoom, login } from '@/lib/api'
import Chat from '@/components/Chat'
import MemberList from '@/components/MemberList'
import Queue from '@/components/Queue'

const YouTubePlayer = dynamic(() => import('@/components/YouTubePlayer'), { ssr: false })
const ScreenShare = dynamic(() => import('@/components/ScreenShare'), { ssr: false })

export interface Member { userId: string; username: string; socketId: string }
export interface QueueItem {
  id: string; videoId: string; title: string; thumbnail?: string
  addedBy: string; addedByUsername: string; position: number
}
export interface ChatMessage {
  id: string; userId: string; username: string; content: string; createdAt: string
}
export interface VideoState {
  videoId: string | null; isPlaying: boolean; currentTime: number
}

// ── Inline login shown when visitor arrives via share link ──────────────────
function JoinScreen({ roomId, onJoined }: { roomId: string; onJoined: (user: { userId: string; username: string }) => void }) {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [roomName, setRoomName] = useState('')

  // Try to get public room name (may fail without token — just show generic title)
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/rooms/public/${roomId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.name) setRoomName(d.name) })
      .catch(() => {})
  }, [roomId])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim()) return
    setLoading(true); setError('')
    try {
      const data = await login(username.trim())
      if (data.error) { setError(data.error); return }
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      onJoined(data.user)
    } catch {
      setError('Σφάλμα σύνδεσης. Δοκίμασε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-purple-700/15 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎉</div>
          <h1 className="text-3xl font-bold text-white">Party Rooms</h1>
          {roomName ? (
            <p className="text-purple-300 mt-2 text-sm">Προσκλήθηκες στο <span className="text-white font-medium">«{roomName}»</span></p>
          ) : (
            <p className="text-purple-300 mt-2 text-sm">Προσκλήθηκες σε ένα room</p>
          )}
        </div>

        <div className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Πώς σε λένε;</h2>
          <p className="text-purple-400 text-xs mb-4">Δεν χρειάζεται password — απλώς ένα username</p>
          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              className="input"
              placeholder="πχ. alex_gr"
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={20}
              autoFocus
            />
            {error && (
              <div className="bg-red-500/20 border border-red-500/40 rounded-lg px-3 py-2 text-red-300 text-sm">
                {error}
              </div>
            )}
            <button type="submit" className="btn-primary w-full text-base py-2.5" disabled={loading || !username.trim()}>
              {loading ? 'Σύνδεση...' : 'Μπες στο Room →'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}

// ── Main room page ──────────────────────────────────────────────────────────
export default function RoomPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.id as string

  // null = checking, false = needs login, true = ready
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

  const [roomName, setRoomName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [controller, setController] = useState<Member | null>(null)
  const [video, setVideo] = useState<VideoState>({ videoId: null, isPlaying: false, currentTime: 0 })
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [screenSharerId, setScreenSharerId] = useState<string | null>(null)
  const [tab, setTab] = useState<'chat' | 'queue' | 'members'>('chat')
  const [copied, setCopied] = useState(false)

  const meRef = useRef<{ userId: string; username: string } | null>(null)
  const isController = controller?.userId === meRef.current?.userId

  // Check auth on mount
  useEffect(() => {
    const token = localStorage.getItem('token')
    const user = localStorage.getItem('user')
    if (token && user) {
      meRef.current = JSON.parse(user)
      setAuthenticated(true)
    } else {
      setAuthenticated(false)
    }
  }, [])

  // Socket setup — runs only when authenticated
  useEffect(() => {
    if (!authenticated) return

    getRoom(roomId).then(data => {
      if (data.error) { router.replace('/rooms'); return }
      setRoomName(data.name)
      setRoomCode(data.code)
    })

    const socket = getSocket()
    socket.emit('room:join', roomId)

    socket.on('room:state', (state: {
      members: Member[]; video: VideoState; queue: QueueItem[]
      controller: Member | null; isScreenSharing: boolean; screenSharerId: string | null
    }) => {
      setMembers(state.members)
      setVideo(state.video)
      setQueue(state.queue)
      setController(state.controller)
      setIsScreenSharing(state.isScreenSharing)
      setScreenSharerId(state.screenSharerId)
    })

    socket.on('room:members', (m: Member[]) => setMembers(m))
    socket.on('room:member-joined', () => {})
    socket.on('room:member-left', () => {})

    socket.on('video:play', ({ currentTime }: { currentTime: number }) => {
      setVideo(v => ({ ...v, isPlaying: true, currentTime }))
    })
    socket.on('video:pause', ({ currentTime }: { currentTime: number }) => {
      setVideo(v => ({ ...v, isPlaying: false, currentTime }))
    })
    socket.on('video:seek', ({ currentTime }: { currentTime: number }) => {
      setVideo(v => ({ ...v, currentTime }))
    })
    socket.on('video:change', ({ videoId }: { videoId: string }) => {
      setVideo({ videoId, isPlaying: true, currentTime: 0 })
    })

    socket.on('queue:updated', (q: QueueItem[]) => setQueue(q))
    socket.on('control:changed', ({ controller: c }: { controller: Member }) => setController(c))

    socket.on('chat:history', (msgs: ChatMessage[]) => setMessages(msgs))
    socket.on('chat:message', (msg: ChatMessage) => {
      setMessages(prev => [...prev.slice(-99), msg])
    })

    socket.on('screen:started', ({ sharerId }: { sharerId: string }) => {
      setIsScreenSharing(true)
      setScreenSharerId(sharerId)
    })
    socket.on('screen:stopped', () => {
      setIsScreenSharing(false)
      setScreenSharerId(null)
    })

    return () => {
      socket.emit('room:leave', roomId)
      socket.off('room:state')
      socket.off('room:members')
      socket.off('room:member-joined')
      socket.off('room:member-left')
      socket.off('video:play')
      socket.off('video:pause')
      socket.off('video:seek')
      socket.off('video:change')
      socket.off('queue:updated')
      socket.off('control:changed')
      socket.off('chat:history')
      socket.off('chat:message')
      socket.off('screen:started')
      socket.off('screen:stopped')
    }
  }, [authenticated, roomId, router])

  const handleVideoEvent = useCallback((event: 'play' | 'pause' | 'seek' | 'ended', currentTime: number) => {
    const socket = getSocket()
    if (event === 'ended') {
      socket.emit('video:ended', { roomId })
    } else {
      socket.emit(`video:${event}`, { roomId, currentTime })
    }
  }, [roomId])

  const handleAddToQueue = useCallback((videoId: string, title: string, thumbnail?: string) => {
    getSocket().emit('queue:add', { roomId, videoId, title, thumbnail })
  }, [roomId])

  const handleRemoveFromQueue = useCallback((itemId: string) => {
    getSocket().emit('queue:remove', { roomId, itemId })
  }, [roomId])

  const handlePassControl = useCallback(() => {
    getSocket().emit('control:pass', { roomId })
  }, [roomId])

  const handleSendMessage = useCallback((content: string) => {
    getSocket().emit('chat:send', { roomId, content })
  }, [roomId])

  const handleVideoChange = useCallback((videoId: string, title: string, thumbnail?: string) => {
    getSocket().emit('video:change', { roomId, videoId, title, thumbnail })
  }, [roomId])

  function copyCode() {
    navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function leaveRoom() {
    disconnectSocket()
    router.push('/rooms')
  }

  // Loading
  if (authenticated === null) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <div className="text-purple-400 text-sm">Φόρτωση...</div>
      </div>
    )
  }

  // Not logged in — show inline join screen
  if (authenticated === false) {
    return (
      <JoinScreen
        roomId={roomId}
        onJoined={user => {
          meRef.current = user
          setAuthenticated(true)
        }}
      />
    )
  }

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="glass border-b border-purple-800/50 px-3 py-2 md:px-4 md:py-2.5 flex items-center gap-2 shrink-0">
        <button onClick={leaveRoom} className="text-purple-400 hover:text-white transition-colors text-sm shrink-0">
          ←
        </button>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-base hidden sm:inline">🎉</span>
          <h1 className="font-bold text-white text-sm md:text-base truncate">{roomName}</h1>
          {roomCode && (
            <button
              onClick={copyCode}
              className="text-xs bg-purple-800/50 hover:bg-purple-700/50 text-purple-300 px-1.5 py-0.5 rounded-full transition-colors shrink-0"
            >
              #{roomCode} {copied ? '✓' : '⎘'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Share link button */}
          <button
            onClick={copyLink}
            className="text-xs bg-purple-800/30 hover:bg-purple-700/50 text-purple-300 px-2 py-1 rounded-lg transition-colors"
            title="Αντιγραφή link room"
          >
            🔗
          </button>
          {controller && (
            <span className="text-xs text-purple-400 hidden md:block">
              🎮 {controller.username}
            </span>
          )}
          {isController && (
            <span className="text-xs text-brand-400 font-medium md:hidden">🎮</span>
          )}
          {isController && members.length > 1 && (
            <button onClick={handlePassControl} className="btn-primary text-xs py-1 px-2.5">
              Πάσο →
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
        <div className="h-[56vw] md:h-auto md:flex-1 shrink-0 flex flex-col overflow-hidden">
          <div className="flex-1 bg-black relative min-h-0">
            {isScreenSharing && screenSharerId ? (
              <ScreenShare
                roomId={roomId}
                isSharer={screenSharerId === meRef.current?.userId}
                sharerId={screenSharerId}
                members={members}
                me={meRef.current}
              />
            ) : (
              <YouTubePlayer
                video={video}
                isController={isController}
                onVideoEvent={handleVideoEvent}
                onAddToQueue={handleAddToQueue}
                onVideoChange={handleVideoChange}
              />
            )}
          </div>

          {isController && !isScreenSharing && (
            <div className="hidden md:flex bg-[#0f0a1a] border-t border-purple-900/50 px-4 py-2 items-center gap-3 shrink-0">
              <span className="text-purple-400 text-xs">Είσαι ο controller</span>
              <button
                onClick={() => {
                  getSocket().emit('screen:start', { roomId })
                  setIsScreenSharing(true)
                  setScreenSharerId(meRef.current?.userId || null)
                }}
                className="text-xs btn-ghost border border-purple-700 py-1 px-3"
              >
                📺 Κοινοποίηση οθόνης
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 md:flex-none md:w-72 lg:w-80 flex flex-col glass border-t md:border-t-0 md:border-l border-purple-800/50 overflow-hidden">
          {isController && !isScreenSharing && (
            <div className="md:hidden bg-[#0f0a1a] border-b border-purple-900/50 px-3 py-1.5 flex items-center gap-2 shrink-0">
              <span className="text-purple-400 text-xs flex-1">Είσαι ο controller</span>
              <button
                onClick={() => {
                  getSocket().emit('screen:start', { roomId })
                  setIsScreenSharing(true)
                  setScreenSharerId(meRef.current?.userId || null)
                }}
                className="text-xs btn-ghost border border-purple-700 py-0.5 px-2"
              >
                📺 Οθόνη
              </button>
            </div>
          )}

          <div className="flex border-b border-purple-800/50 shrink-0">
            {(['chat', 'queue', 'members'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 md:py-2.5 text-xs font-medium transition-colors ${
                  tab === t
                    ? 'text-brand-400 border-b-2 border-brand-500'
                    : 'text-purple-400 hover:text-purple-200'
                }`}
              >
                {t === 'chat' ? '💬 Chat' : t === 'queue' ? '📋 Queue' : '👥 Μέλη'}
                {t === 'chat' && messages.length > 0 && (
                  <span className="ml-1 text-purple-500">({messages.length})</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden min-h-0">
            {tab === 'chat' && (
              <Chat
                messages={messages}
                onSend={handleSendMessage}
                myUserId={meRef.current?.userId || ''}
              />
            )}
            {tab === 'queue' && (
              <Queue
                queue={queue}
                isController={isController}
                myUserId={meRef.current?.userId || ''}
                onRemove={handleRemoveFromQueue}
                onAddToQueue={handleAddToQueue}
                onVideoChange={handleVideoChange}
              />
            )}
            {tab === 'members' && (
              <MemberList
                members={members}
                controller={controller}
                myUserId={meRef.current?.userId || ''}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
