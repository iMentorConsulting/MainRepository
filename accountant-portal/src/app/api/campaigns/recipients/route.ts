import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Returns the list of businesses that would receive a campaign
// given an optional programId. Used by the campaign wizard before creation.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CONSULTANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const programId = searchParams.get('programId') || null
  const isAdmin = session.user.role === 'ADMIN'
  const sessionAccountantId = isAdmin ? null : ((session.user as any).accountantId || null)

  const [businesses, accountants] = await Promise.all([
    prisma.business.findMany({
      where: {
        ...(sessionAccountantId ? { accountantId: sessionAccountantId } : {}),
        excludedFromCampaigns: false,
      },
      select: {
        id: true,
        afm: true,
        onomasia: true,
        email: true,
        phone: true,
        viberPhone: true,
        postalAreaDescription: true,
        accountantId: true,
        accountant: { select: { id: true, officeName: true } },
      },
      orderBy: { onomasia: 'asc' },
    }),
    isAdmin
      ? prisma.accountant.findMany({ select: { id: true, officeName: true }, orderBy: { officeName: 'asc' } })
      : Promise.resolve([]),
  ])

  let filtered = businesses

  if (programId) {
    const matches = await prisma.programMatch.findMany({
      where: { programId },
      select: { businessId: true, status: true },
    })
    const matchedIds = new Set(matches.filter(m => m.status !== 'REJECTED').map(m => m.businessId))
    filtered = filtered.filter(b => matchedIds.has(b.id))
  }

  // Mark businesses that have already received a sent campaign for this specific program
  let sentBusinessIds = new Set<string>()
  if (programId && filtered.length > 0) {
    const sentRecipients = await prisma.campaignRecipient.findMany({
      where: {
        businessId: { in: filtered.map(b => b.id) },
        sentAt: { not: null },
        campaign: { programId },
      },
      select: { businessId: true },
    })
    sentBusinessIds = new Set(sentRecipients.map(r => r.businessId))
  }

  const result = filtered.map(b => ({
    ...b,
    sentCampaign: sentBusinessIds.has(b.id),
  }))

  return NextResponse.json({ businesses: result, accountants })
}
