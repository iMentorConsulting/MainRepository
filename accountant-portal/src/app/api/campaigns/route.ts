import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CONSULTANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const where: any = {}
  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    where.accountantId = session.user.accountantId
  }

  const campaigns = await prisma.campaign.findMany({
    where,
    include: {
      program: { select: { id: true, title: true } },
      _count: { select: { recipients: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ campaigns })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CONSULTANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const data = await request.json()

  const campaign = await prisma.campaign.create({
    data: {
      title: data.title,
      channel: data.channel,
      subject: data.subject || data.title,
      messageTemplate: data.messageTemplate,
      programId: data.programId || null,
      accountantId: session.user.role === 'ACCOUNTANT' ? session.user.accountantId : data.accountantId || null,
      createdBy: session.user.id,
      status: data.status || 'DRAFT',
    }
  })

  return NextResponse.json(campaign, { status: 201 })
}
