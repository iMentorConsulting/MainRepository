import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const campaign = await prisma.gemiCampaign.findUnique({
    where: { id },
    include: {
      program: { select: { id: true, title: true } },
      _count: { select: { recipients: true } },
    },
  })

  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(campaign)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const existing = await prisma.gemiCampaign.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Only DRAFT campaigns can be updated' }, { status: 400 })
  }

  const data = await request.json()
  const allowed = ['title', 'subject', 'htmlContent', 'messageTemplate']
  const updateData: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in data) updateData[key] = data[key]
  }

  const campaign = await prisma.gemiCampaign.update({
    where: { id },
    data: updateData,
    include: {
      program: { select: { id: true, title: true } },
      _count: { select: { recipients: true } },
    },
  })

  return NextResponse.json(campaign)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const campaign = await prisma.gemiCampaign.findUnique({ where: { id }, select: { id: true } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.gemiCampaignRecipient.deleteMany({ where: { campaignId: id } })
  await prisma.gemiCampaign.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
