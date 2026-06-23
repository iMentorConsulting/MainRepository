import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

const TOKEN_TTL_DAYS = 90

// Short, URL-friendly token for new links — much shorter than Prisma's
// cuid() default (used as the column default only for legacy rows).
function generateShortToken(): string {
  return crypto.randomBytes(5).toString('base64url')
}

export async function getOrCreateErmisLink(businessId: string, programId: string): Promise<string> {
  const baseUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
  const existing = await prisma.businessMatchToken.findUnique({
    where: { businessId_programId: { businessId, programId } },
  })
  // Legacy rows carry a full cuid() token (25 chars) from before short links
  // existed — swap those in immediately instead of waiting out the TTL.
  if (existing && existing.expiresAt > new Date() && existing.token.length <= 12) {
    return `${baseUrl}/e/${existing.token}`
  }
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const token = await prisma.businessMatchToken.upsert({
        where: { businessId_programId: { businessId, programId } },
        create: { businessId, programId, expiresAt, token: generateShortToken() },
        update: { expiresAt, token: generateShortToken() },
      })
      return `${baseUrl}/e/${token.token}`
    } catch (error: any) {
      if (error?.code !== 'P2002' || attempt === 2) throw error
    }
  }
  throw new Error('Could not generate a unique Ermis token')
}
