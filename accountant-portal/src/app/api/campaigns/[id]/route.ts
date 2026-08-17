import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CONSULTANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      program: { select: { id: true, title: true } },
      accountant: { select: { id: true, officeName: true } },
      recipients: {
        include: { business: { select: { id: true, onomasia: true, afm: true } } },
        orderBy: { status: 'asc' },
      },
    }
  })

  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role === 'ACCOUNTANT' && campaign.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(campaign)
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CONSULTANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.campaign.findUnique({ where: { id: params.id }, select: { accountantId: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role === 'ACCOUNTANT' && existing.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await request.json()
  delete data.id; delete data.recipients; delete data.program; delete data.accountant
  delete data.createdAt; delete data.updatedAt; delete data._count
  if (session.user.role === 'ACCOUNTANT') delete data.accountantId

  const campaign = await prisma.campaign.update({
    where: { id: params.id },
    data,
  })

  return NextResponse.json(campaign)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CONSULTANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role === 'ACCOUNTANT' && campaign.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (campaign.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Μόνο πρόχειρες καμπάνιες μπορούν να διαγραφούν' }, { status: 400 })
  }

  await prisma.campaignRecipient.deleteMany({ where: { campaignId: params.id } })
  await prisma.campaign.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
