import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

// Login or register with username only
router.post('/login', async (req: Request, res: Response) => {
  const { username } = req.body

  if (!username || typeof username !== 'string') {
    res.status(400).json({ error: 'Username is required' })
    return
  }

  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (clean.length < 2 || clean.length > 20) {
    res.status(400).json({ error: 'Username must be 2-20 characters (letters, numbers, _)' })
    return
  }

  try {
    let user = await prisma.user.findUnique({ where: { username: clean } })
    if (!user) {
      user = await prisma.user.create({ data: { username: clean } })
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '30d' }
    )

    res.json({ token, user: { id: user.id, username: user.username } })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
