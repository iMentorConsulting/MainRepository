import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  return NextResponse.json(campaign)
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await request.json()
  delete data.id; delete data.recipients; delete data.program; delete data.accountant
  delete data.createdAt; delete data.updatedAt; delete data._count

  const campaign = await prisma.campaign.update({
    where: { id: params.id },
    data,
  })

  return NextResponse.json(campaign)
}
