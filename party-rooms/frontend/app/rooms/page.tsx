'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getRooms, createRoom, getRoomByCode } from '@/lib/api'

interface Room {
  id: string
  name: string
  code: string
  isPublic: boolean
  host: { username: string }
  _count: { members: number }
}

export default function RoomsPage() {
  const router = useRouter()
  const [rooms, setRooms] = useState<Room[]>([])
  const [username, setUsername] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadRooms = useCallback(async () => {
    const data = await getRooms()
    if (Array.isArray(data)) setRooms(data)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    const user = localStorage.getItem('user')
    if (!token) { router.replace('/'); return }
    if (user) setUsername(JSON.parse(user).username)
    loadRooms()
  }, [router, loadRooms])

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.replace('/')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newRoomName.trim()) return
    setLoading(true); setError('')
    try {
      const room = await createRoom(newRoomName.trim(), isPublic)
      if (room.error) { setError(room.error); return }
      router.push(`/room/${room.id}`)
    } catch {
      setError('Σφάλμα. Δοκίμασε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!joinCode.trim()) return
    setLoading(true); setError('')
    try {
      const room = await getRoomByCode(joinCode.trim())
      if (room.error) { setError('Λάθος κωδικός room.'); return }
      router.push(`/room/${room.id}`)
    } catch {
      setError('Σφάλμα. Δοκίμασε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-[100dvh] p-3 md:p-4">
      {/* Header */}
      <header className="max-w-5xl mx-auto flex items-center justify-between mb-5 md:mb-8 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xl md:text-2xl">🎉</span>
          <span className="font-bold text-white text-base md:text-lg">Party Rooms</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-purple-300 text-xs md:text-sm">👤 {username}</span>
          <button onClick={logout} className="btn-ghost text-xs md:text-sm py-1 px-2 md:py-1.5 md:px-4">Έξοδος</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto">
        {/* Action buttons */}
        <div className="flex gap-2 md:gap-3 mb-4 md:mb-6">
          <button onClick={() => { setShowCreate(true); setShowJoin(false); setError('') }} className="btn-primary text-sm md:text-base py-2 px-3 md:px-4">
            + Νέο Room
          </button>
          <button onClick={() => { setShowJoin(true); setShowCreate(false); setError('') }} className="btn-ghost border border-purple-700 text-sm md:text-base py-2 px-3 md:px-4">
            Κωδικός
          </button>
          <button onClick={loadRooms} className="btn-ghost ml-auto text-sm py-2">↻</button>
        </div>

        {/* Create Room */}
        {showCreate && (
          <div className="glass rounded-xl p-5 mb-6">
            <h3 className="font-semibold text-white mb-4">Δημιουργία Room</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                className="input"
                placeholder="Όνομα room..."
                value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
                maxLength={50}
                autoFocus
              />
              <label className="flex items-center gap-2 text-sm text-purple-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={e => setIsPublic(e.target.checked)}
                  className="w-4 h-4 accent-purple-600"
                />
                Δημόσιο room (εμφανίζεται στη λίστα)
              </label>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={loading || !newRoomName.trim()}>
                  {loading ? 'Φόρτωση...' : 'Δημιουργία'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost">
                  Ακύρωση
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Join Room */}
        {showJoin && (
          <div className="glass rounded-xl p-5 mb-6">
            <h3 className="font-semibold text-white mb-4">Είσοδος με Κωδικό</h3>
            <form onSubmit={handleJoin} className="flex gap-2">
              <input
                className="input"
                placeholder="6-ψήφιος κωδικός (πχ. A3F2B1)"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                autoFocus
              />
              <button type="submit" className="btn-primary whitespace-nowrap" disabled={loading || joinCode.length < 6}>
                Είσοδος
              </button>
            </form>
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </div>
        )}

        {/* Room List */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Δημόσια Rooms</h2>
          {rooms.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center text-purple-400">
              <p className="text-3xl mb-2">🎵</p>
              <p>Δεν υπάρχουν rooms ακόμα. Δημιούργησε ένα!</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map(room => (
                <div
                  key={room.id}
                  onClick={() => router.push(`/room/${room.id}`)}
                  className="glass rounded-xl p-4 cursor-pointer hover:border-purple-500 transition-colors group"
                >
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-white group-hover:text-brand-400 transition-colors">
                      {room.name}
                    </h3>
                    <span className="text-xs bg-purple-800/50 text-purple-300 px-2 py-0.5 rounded-full ml-2 shrink-0">
                      #{room.code}
                    </span>
                  </div>
                  <p className="text-purple-400 text-sm mt-1">Host: {room.host.username}</p>
                  <p className="text-purple-500 text-xs mt-2">
                    👥 {room._count.members} {room._count.members === 1 ? 'μέλος' : 'μέλη'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
