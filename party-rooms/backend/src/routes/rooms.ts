import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()
const prisma = new PrismaClient()

function generateCode(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase()
}

// List public rooms
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { isPublic: true },
      include: {
        host: { select: { username: true } },
        _count: { select: { members: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })
    res.json(rooms)
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// Get room by join code
router.get('/join/:code', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const room = await prisma.room.findUnique({
      where: { code: req.params.code.toUpperCase() },
      include: { host: { select: { username: true } } }
    })
    if (!room) {
      res.status(404).json({ error: 'Room not found' })
      return
    }
    res.json(room)
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// Get room by ID
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: {
        host: { select: { username: true } },
        messages: {
          include: { user: { select: { username: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50
        },
        queue: {
          include: { user: { select: { username: true } } },
          orderBy: { position: 'asc' }
        },
        members: {
          include: { user: { select: { username: true } } }
        }
      }
    })
    if (!room) {
      res.status(404).json({ error: 'Room not found' })
      return
    }
    res.json(room)
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// Create room
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { name, isPublic = true } = req.body
  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    res.status(400).json({ error: 'Room name is required' })
    return
  }

  let code = generateCode()
  let attempts = 0
  while (attempts < 5) {
    const exists = await prisma.room.findUnique({ where: { code } })
    if (!exists) break
    code = generateCode()
    attempts++
  }

  try {
    const room = await prisma.room.create({
      data: {
        name: name.trim(),
        code,
        hostId: req.userId!,
        isPublic: Boolean(isPublic)
      },
      include: { host: { select: { username: true } } }
    })
    res.json(room)
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
