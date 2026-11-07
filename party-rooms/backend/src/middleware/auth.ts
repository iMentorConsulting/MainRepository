import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  userId?: string
  username?: string
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret') as {
      userId: string
      username: string
    }
    req.userId = payload.userId
    req.username = payload.username
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

export function verifySocketToken(token: string): { userId: string; username: string } | null {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'secret') as {
      userId: string
      username: string
    }
  } catch {
    return null
  }
}
