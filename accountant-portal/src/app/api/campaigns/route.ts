import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CONSULTANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = request.nextUrl
  const accountantIds = (searchParams.get('accountantIds') || '').split(',').filter(Boolean)
  const channels = (searchParams.get('channels') || '').split(',').filter(Boolean)
  const statuses = (searchParams.get('statuses') || '').split(',').filter(Boolean)
  const programIds = (searchParams.get('programIds') || '').split(',').filter(Boolean)
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''

  const where: any = {}

  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    where.accountantId = session.user.accountantId
  } else if (session.user.role === 'ADMIN' && accountantIds.length > 0) {
    const realIds = accountantIds.filter(id => id !== '__none__')
    const wantsNone = accountantIds.includes('__none__')
    if (wantsNone && realIds.length > 0) {
      where.OR = [{ accountantId: null }, { accountantId: { in: realIds } }]
    } else if (wantsNone) {
      where.accountantId = null
    } else {
      where.accountantId = { in: realIds }
    }
  }

  if (channels.length > 0) where.channel = { in: channels }
  if (statuses.length > 0) where.status = { in: statuses }
  if (programIds.length > 0) where.programId = { in: programIds }

  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = new Date(dateFrom)
    if (dateTo) {
      const end = new Date(dateTo)
      end.setHours(23, 59, 59, 999)
      where.createdAt.lte = end
    }
  }

  const [campaigns, accountants, programs] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: {
        program: { select: { id: true, title: true } },
        accountant: { select: { id: true, officeName: true, contactPerson: true } },
        _count: { select: { recipients: true, } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    session.user.role === 'ADMIN'
      ? prisma.accountant.findMany({ select: { id: true, officeName: true }, orderBy: { officeName: 'asc' } })
      : Promise.resolve([]),
    prisma.program.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } }),
  ])

  return NextResponse.json({ campaigns, accountants, programs })
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
