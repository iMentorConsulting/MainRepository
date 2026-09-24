import { Server, Socket } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import { verifySocketToken } from '../middleware/auth'

const prisma = new PrismaClient()

interface Member {
  userId: string
  username: string
  socketId: string
}

interface VideoState {
  videoId: string | null
  isPlaying: boolean
  currentTime: number
  syncedAt: number
}

interface QueueItem {
  id: string
  videoId: string
  title: string
  thumbnail?: string
  addedBy: string
  addedByUsername: string
  position: number
}

interface RoomState {
  members: Member[]
  video: VideoState
  queue: QueueItem[]
  controllerUserId: string | null
  isScreenSharing: boolean
  screenSharerId: string | null
  lastEndedAt: number
}

const rooms = new Map<string, RoomState>()

function getOrCreateRoom(roomId: string): RoomState {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      members: [],
      video: { videoId: null, isPlaying: false, currentTime: 0, syncedAt: Date.now() },
      queue: [],
      controllerUserId: null,
      isScreenSharing: false,
      screenSharerId: null,
      lastEndedAt: 0
    })
  }
  return rooms.get(roomId)!
}

function getCurrentController(state: RoomState): Member | null {
  if (state.members.length === 0) return null
  if (state.controllerUserId) {
    const found = state.members.find(m => m.userId === state.controllerUserId)
    if (found) return found
  }
  return state.members[0]
}

function getLiveTime(video: VideoState): number {
  if (!video.isPlaying) return video.currentTime
  return video.currentTime + (Date.now() - video.syncedAt) / 1000
}

export function setupSocket(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string
    const user = verifySocketToken(token)
    if (!user) return next(new Error('Unauthorized'))
    socket.data.userId = user.userId
    socket.data.username = user.username
    next()
  })

  io.on('connection', (socket: Socket) => {
    const { userId, username } = socket.data as { userId: string; username: string }

    // ── JOIN ROOM ──────────────────────────────────────────────────────────
    socket.on('room:join', async (roomId: string) => {
      const roomExists = await prisma.room.findUnique({ where: { id: roomId } })
      if (!roomExists) return

      socket.join(roomId)

      const state = getOrCreateRoom(roomId)
      const alreadyIn = state.members.find(m => m.userId === userId)
      if (!alreadyIn) {
        state.members.push({ userId, username, socketId: socket.id })
      } else {
        alreadyIn.socketId = socket.id
      }

      // First member becomes controller if none set
      if (!state.controllerUserId) state.controllerUserId = userId

      await prisma.roomMember.upsert({
        where: { roomId_userId: { roomId, userId } },
        create: { roomId, userId },
        update: {}
      })

      socket.emit('room:state', {
        members: state.members,
        video: { ...state.video, currentTime: getLiveTime(state.video) },
        queue: state.queue,
        controller: getCurrentController(state),
        isScreenSharing: state.isScreenSharing,
        screenSharerId: state.screenSharerId
      })

      socket.to(roomId).emit('room:member-joined', { userId, username })
      io.to(roomId).emit('room:members', state.members)

      const messages = await prisma.message.findMany({
        where: { roomId },
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: 'asc' },
        take: 50
      })
      socket.emit('chat:history', messages.map(m => ({
        id: m.id,
        userId: m.userId,
        username: m.user.username,
        content: m.content,
        createdAt: m.createdAt
      })))
    })

    // ── LEAVE ROOM ─────────────────────────────────────────────────────────
    socket.on('room:leave', (roomId: string) => {
      handleLeave(socket, io, roomId, userId)
    })

    // ── VIDEO CONTROL ──────────────────────────────────────────────────────
    socket.on('video:play', ({ roomId, currentTime }: { roomId: string; currentTime: number }) => {
      const state = rooms.get(roomId)
      if (!state) return
      if (getCurrentController(state)?.userId !== userId) return

      state.video.isPlaying = true
      state.video.currentTime = currentTime
      state.video.syncedAt = Date.now()
      io.to(roomId).emit('video:play', { currentTime })
    })

    socket.on('video:pause', ({ roomId, currentTime }: { roomId: string; currentTime: number }) => {
      const state = rooms.get(roomId)
      if (!state) return
      if (getCurrentController(state)?.userId !== userId) return

      state.video.isPlaying = false
      state.video.currentTime = currentTime
      state.video.syncedAt = Date.now()
      io.to(roomId).emit('video:pause', { currentTime })
    })

    socket.on('video:seek', ({ roomId, currentTime }: { roomId: string; currentTime: number }) => {
      const state = rooms.get(roomId)
      if (!state) return
      if (getCurrentController(state)?.userId !== userId) return

      state.video.currentTime = currentTime
      state.video.syncedAt = Date.now()
      io.to(roomId).emit('video:seek', { currentTime })
    })

    socket.on('video:change', ({ roomId, videoId, title, thumbnail }: {
      roomId: string; videoId: string; title: string; thumbnail?: string
    }) => {
      const state = rooms.get(roomId)
      if (!state) return
      if (getCurrentController(state)?.userId !== userId) return

      state.video = { videoId, isPlaying: false, currentTime: 0, syncedAt: Date.now() }
      // Person who changed the video becomes controller
      state.controllerUserId = userId
      io.to(roomId).emit('video:change', { videoId, title, thumbnail })
      io.to(roomId).emit('control:changed', { controller: getCurrentController(state) })
    })

    socket.on('video:ended', ({ roomId }: { roomId: string }) => {
      const state = rooms.get(roomId)
      if (!state) return

      const now = Date.now()
      if (now - state.lastEndedAt < 3000) return
      state.lastEndedAt = now

      if (state.queue.length > 0) {
        const next = state.queue.shift()!
        state.queue.forEach((item, i) => { item.position = i })
        state.video = { videoId: next.videoId, isPlaying: true, currentTime: 0, syncedAt: Date.now() }
        // Person who queued the next video becomes controller
        state.controllerUserId = next.addedBy
        io.to(roomId).emit('video:change', { videoId: next.videoId, title: next.title, thumbnail: next.thumbnail })
        io.to(roomId).emit('queue:updated', state.queue)
        io.to(roomId).emit('control:changed', { controller: getCurrentController(state) })
        prisma.queueItem.delete({ where: { id: next.id } }).catch(() => {})
      } else {
        state.video = { videoId: null, isPlaying: false, currentTime: 0, syncedAt: Date.now() }
        io.to(roomId).emit('video:change', { videoId: null, title: '', thumbnail: undefined })
      }
    })

    // ── QUEUE ──────────────────────────────────────────────────────────────
    socket.on('queue:add', async ({ roomId, videoId, title, thumbnail }: {
      roomId: string; videoId: string; title: string; thumbnail?: string
    }) => {
      const state = rooms.get(roomId)
      if (!state) return

      const position = state.queue.length
      const item = await prisma.queueItem.create({
        data: { roomId, userId, videoId, title, thumbnail: thumbnail || null, position }
      })

      const queueItem: QueueItem = {
        id: item.id, videoId, title, thumbnail, addedBy: userId, addedByUsername: username, position
      }
      state.queue.push(queueItem)

      if (!state.video.videoId) {
        state.queue.shift()
        state.video = { videoId, isPlaying: true, currentTime: 0, syncedAt: Date.now() }
        // Person who added becomes controller
        state.controllerUserId = userId
        io.to(roomId).emit('video:change', { videoId, title, thumbnail })
        io.to(roomId).emit('queue:updated', state.queue)
        io.to(roomId).emit('control:changed', { controller: getCurrentController(state) })
        prisma.queueItem.delete({ where: { id: item.id } }).catch(() => {})
      } else {
        io.to(roomId).emit('queue:updated', state.queue)
      }
    })

    socket.on('queue:remove', async ({ roomId, itemId }: { roomId: string; itemId: string }) => {
      const state = rooms.get(roomId)
      if (!state) return

      state.queue = state.queue.filter(q => q.id !== itemId)
      state.queue.forEach((item, i) => { item.position = i })
      io.to(roomId).emit('queue:updated', state.queue)
      prisma.queueItem.delete({ where: { id: itemId } }).catch(() => {})
    })

    // ── CONTROL PASS ───────────────────────────────────────────────────────
    socket.on('control:pass', ({ roomId }: { roomId: string }) => {
      const state = rooms.get(roomId)
      if (!state) return
      if (getCurrentController(state)?.userId !== userId) return
      if (state.members.length < 2) return

      const currentIdx = state.members.findIndex(m => m.userId === userId)
      const nextIdx = (currentIdx + 1) % state.members.length
      state.controllerUserId = state.members[nextIdx].userId
      io.to(roomId).emit('control:changed', { controller: getCurrentController(state) })
    })

    // ── CHAT ───────────────────────────────────────────────────────────────
    socket.on('chat:send', async ({ roomId, content }: { roomId: string; content: string }) => {
      if (!content?.trim()) return
      const message = await prisma.message.create({
        data: { roomId, userId, content: content.trim() }
      })
      io.to(roomId).emit('chat:message', {
        id: message.id,
        userId,
        username,
        content: message.content,
        createdAt: message.createdAt
      })
    })

    // ── SCREEN SHARE SIGNALING ─────────────────────────────────────────────
    socket.on('screen:start', ({ roomId }: { roomId: string }) => {
      const state = rooms.get(roomId)
      if (!state) return
      state.isScreenSharing = true
      state.screenSharerId = userId
      socket.to(roomId).emit('screen:started', { sharerId: userId, sharerUsername: username })
    })

    socket.on('screen:stop', ({ roomId }: { roomId: string }) => {
      const state = rooms.get(roomId)
      if (!state) return
      if (state.screenSharerId !== userId) return
      state.isScreenSharing = false
      state.screenSharerId = null
      io.to(roomId).emit('screen:stopped')
    })

    socket.on('screen:signal', ({ roomId, to, signal }: {
      roomId: string; to: string; signal: unknown
    }) => {
      const state = rooms.get(roomId)
      if (!state) return
      const target = state.members.find(m => m.userId === to)
      if (target) {
        io.to(target.socketId).emit('screen:signal', { from: userId, signal })
      }
    })

    // ── DISCONNECT ─────────────────────────────────────────────────────────
    socket.on('disconnecting', () => {
      socket.rooms.forEach(roomId => {
        if (roomId !== socket.id) {
          handleLeave(socket, io, roomId, userId)
        }
      })
    })
  })
}

function handleLeave(socket: Socket, io: Server, roomId: string, userId: string) {
  socket.leave(roomId)
  const state = rooms.get(roomId)
  if (!state) return

  const wasController = getCurrentController(state)?.userId === userId
  state.members = state.members.filter(m => m.userId !== userId)

  if (state.members.length === 0) {
    rooms.delete(roomId)
    return
  }

  // Transfer controller to first remaining member
  if (wasController) {
    state.controllerUserId = state.members[0].userId
  }

  if (state.screenSharerId === userId) {
    state.isScreenSharing = false
    state.screenSharerId = null
    io.to(roomId).emit('screen:stopped')
  }

  io.to(roomId).emit('room:member-left', { userId })
  io.to(roomId).emit('room:members', state.members)
  if (wasController) {
    io.to(roomId).emit('control:changed', { controller: getCurrentController(state) })
  }
}
