import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CONSULTANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const policy = await (prisma.commissionPolicy as any).findUnique({
    where: { id: params.id },
    include: {
      service: { select: { id: true, name: true } },
      programs: { select: { id: true, title: true } },
      ...(session.user.role === 'ADMIN' ? {
        accountantOverrides: {
          include: {
            accountant: { select: { id: true, officeName: true, contactPerson: true } },
          },
        },
      } : {}),
    },
  })

  if (!policy) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(policy)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    name,
    description,
    commissionType,
    fixedAmount,
    percentage,
    minAmount,
    maxAmount,
    appliesToApplication,
    appliesToImplementation,
    serviceId,
    programIds,
    active,
  } = body

  const policy = await (prisma.commissionPolicy as any).update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(commissionType !== undefined && { commissionType }),
      ...(fixedAmount !== undefined && { fixedAmount: fixedAmount ? Math.round(fixedAmount) : null }),
      ...(percentage !== undefined && { percentage }),
      ...(minAmount !== undefined && { minAmount: minAmount ? Math.round(minAmount) : null }),
      ...(maxAmount !== undefined && { maxAmount: maxAmount ? Math.round(maxAmount) : null }),
      ...(appliesToApplication !== undefined && { appliesToApplication }),
      ...(appliesToImplementation !== undefined && { appliesToImplementation }),
      ...(serviceId !== undefined && { serviceId: serviceId || null }),
      ...(programIds !== undefined && { programs: { set: (programIds as string[]).map((id: string) => ({ id })) } }),
      ...(active !== undefined && { active }),
    },
    include: {
      service: { select: { id: true, name: true } },
      programs: { select: { id: true, title: true } },
    },
  })

  return NextResponse.json(policy)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Soft delete: set active = false if there are linked commissions, else hard delete
  const linked = await prisma.commission.count({ where: { commissionPolicyId: params.id } })
  if (linked > 0) {
    await prisma.commissionPolicy.update({
      where: { id: params.id },
      data: { active: false },
    })
    return NextResponse.json({ message: 'Policy deactivated (has linked commissions)' })
  }

  await prisma.commissionPolicy.delete({ where: { id: params.id } })
  return NextResponse.json({ message: 'Deleted' })
}
