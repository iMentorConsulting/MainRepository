import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

const TOKEN_TTL_DAYS = 45

export async function getOrCreateMatchActionToken(
  accountantId: string,
  programId: string,
): Promise<string> {
  const existing = await prisma.matchActionToken.findUnique({
    where: { accountantId_programId: { accountantId, programId } },
  })

  if (existing && existing.expiresAt > new Date()) return existing.token

  const token = crypto.randomBytes(6).toString('base64url')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)

  await prisma.matchActionToken.upsert({
    where: { accountantId_programId: { accountantId, programId } },
    create: { token, accountantId, programId, expiresAt },
    update: { token, expiresAt },
  })

  return token
}
