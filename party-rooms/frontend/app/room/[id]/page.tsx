'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { getRoom } from '@/lib/api'
import Chat from '@/components/Chat'
import MemberList from '@/components/MemberList'
import Queue from '@/components/Queue'

// Browser-only components — no SSR
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

export default function RoomPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.id as string

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

  useEffect(() => {
    const token = localStorage.getItem('token')
    const user = localStorage.getItem('user')
    if (!token || !user) { router.replace('/'); return }
    meRef.current = JSON.parse(user)

    // Load room info
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
  }, [roomId, router])

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

  function leaveRoom() {
    disconnectSocket()
    router.push('/rooms')
  }

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Header — compact on mobile */}
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

      {/* Main content — column on mobile, row on desktop */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">

        {/* Video column — 16:9 fixed height on mobile, fills space on desktop */}
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

          {/* Screen share button — desktop only (mobile: shown in sidebar) */}
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

        {/* Sidebar — bottom on mobile (flex-1), right panel on desktop */}
        <div className="flex-1 min-h-0 md:flex-none md:w-72 lg:w-80 flex flex-col glass border-t md:border-t-0 md:border-l border-purple-800/50 overflow-hidden">

          {/* Mobile: screen share button when controller */}
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

          {/* Tabs */}
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

          {/* Tab content */}
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
