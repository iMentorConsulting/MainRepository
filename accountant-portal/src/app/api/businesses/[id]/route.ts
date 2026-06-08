import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const business = await prisma.business.findUnique({
    where: { id: params.id },
    include: {
      accountant: true,
      activities: true,
      programMatches: {
        include: { program: { select: { id: true, title: true, category: true } } },
        orderBy: { matchScore: 'desc' },
      },
      requests: {
        include: { program: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
      },
      campaignRecipients: {
        include: { campaign: { select: { id: true, title: true, channel: true } } },
        orderBy: { sentAt: 'desc' },
      },
    }
  })

  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Accountant can only see their own businesses
  if (session.user.role === 'ACCOUNTANT' && business.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(business)
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.business.findUnique({ where: { id: params.id }, select: { accountantId: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Accountants may only edit their own businesses, and may not reassign ownership
  if (session.user.role === 'ACCOUNTANT' && existing.accountantId !== session.user.accountantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await request.json()
  const { activities, ...updateData } = data

  // Remove undefined/null id fields
  delete updateData.id
  delete updateData.accountant
  delete updateData.programMatches
  delete updateData.requests
  delete updateData.campaignRecipients
  delete updateData.createdAt
  delete updateData.updatedAt
  if (session.user.role === 'ACCOUNTANT') delete updateData.accountantId

  const business = await prisma.business.update({
    where: { id: params.id },
    data: updateData,
  })

  if (Array.isArray(activities)) {
    await prisma.businessActivity.deleteMany({ where: { businessId: params.id } })
    if (activities.length > 0) {
      await prisma.businessActivity.createMany({
        data: activities.map((a: any) => ({
          businessId: params.id,
          firmActCode: a.firmActCode,
          firmActDescr: a.firmActDescr || null,
          firmActKind: a.firmActKind ?? null,
          firmActKindDescr: a.firmActKindDescr || null,
        })),
      })
    }
  }

  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entity: 'Business',
    entityId: business.id,
  })

  return NextResponse.json(business)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.business.delete({ where: { id: params.id } })

  await createAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    entity: 'Business',
    entityId: params.id,
  })

  return NextResponse.json({ success: true })
}
