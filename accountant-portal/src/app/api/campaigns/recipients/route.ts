import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Returns the list of businesses that would receive a campaign
// given an optional programId. Used by the campaign wizard before creation.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const programId = searchParams.get('programId') || null
  const accountantId = session.user.role === 'ADMIN'
    ? searchParams.get('accountantId') || null
    : (session.user as any).accountantId || null

  let businesses = await prisma.business.findMany({
    where: {
      ...(accountantId ? { accountantId } : {}),
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
    },
    orderBy: { onomasia: 'asc' },
  })

  if (programId) {
    const matches = await prisma.programMatch.findMany({
      where: { programId },
      select: { businessId: true, status: true },
    })
    const matchedIds = new Set(matches.filter(m => m.status !== 'REJECTED').map(m => m.businessId))
    businesses = businesses.filter(b => matchedIds.has(b.id))
  }

  return NextResponse.json(businesses)
}
