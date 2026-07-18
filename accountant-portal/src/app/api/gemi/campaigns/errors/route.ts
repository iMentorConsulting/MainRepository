import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const errors = await prisma.gemiCampaignRecipient.findMany({
    where: { status: 'error' },
    select: { id: true, campaignId: true, recipient: true, errorMessage: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(errors)
}
