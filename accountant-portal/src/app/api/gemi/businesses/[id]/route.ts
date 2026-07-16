import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const business = await prisma.gemiLookup.findUnique({
    where: { id },
    include: {
      programMatches: {
        include: { program: { select: { id: true, title: true } } },
        orderBy: { matchScore: 'desc' },
      },
      campaignRecipients: {
        include: { campaign: { select: { id: true, title: true, channel: true, sentAt: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  })

  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // If claimed, fetch the accountant name
  let claimedAccountant = null
  if (business.claimedAccountantId) {
    claimedAccountant = await prisma.accountant.findUnique({
      where: { id: business.claimedAccountantId },
      select: { officeName: true, contactPerson: true },
    })
  }

  return NextResponse.json({ ...business, claimedAccountant })
}
