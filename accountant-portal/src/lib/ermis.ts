import { prisma } from '@/lib/prisma'

const TOKEN_TTL_DAYS = 90

export async function getOrCreateErmisLink(businessId: string, programId: string): Promise<string> {
  const baseUrl = process.env.APP_URL || 'https://logistis.i-mentor.gr'
  const existing = await prisma.businessMatchToken.findUnique({
    where: { businessId_programId: { businessId, programId } },
  })
  if (existing && existing.expiresAt > new Date()) {
    return `${baseUrl}/match/${existing.token}`
  }
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  const token = await prisma.businessMatchToken.upsert({
    where: { businessId_programId: { businessId, programId } },
    create: { businessId, programId, expiresAt },
    update: { expiresAt },
  })
  return `${baseUrl}/match/${token.token}`
}
