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

  const recipients = await prisma.gemiCampaignRecipient.findMany({
    where: { campaignId: id },
    select: { id: true, recipient: true, channel: true, status: true, sentAt: true, errorMessage: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(recipients)
}
