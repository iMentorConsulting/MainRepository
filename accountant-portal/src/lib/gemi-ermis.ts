import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

const TOKEN_TTL_DAYS = 90

function generateToken(): string {
  return crypto.randomBytes(6).toString('base64url')
}

export async function getOrCreateGemiErmisLink(gemiId: string, programId: string): Promise<string> {
  const baseUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const record = await prisma.gemiMatchToken.upsert({
        where: { gemiId_programId: { gemiId, programId } },
        create: { gemiId, programId, token: generateToken(), expiresAt },
        update: { expiresAt },
        select: { token: true },
      })
      return `${baseUrl}/ge/${record.token}`
    } catch (err: any) {
      if (err?.code !== 'P2002' || attempt === 2) throw err
    }
  }
  throw new Error('Could not generate GemiMatchToken')
}
