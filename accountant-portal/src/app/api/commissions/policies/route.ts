import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CONSULTANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const serviceId = searchParams.get('serviceId')
  const programId = searchParams.get('programId')
  const active = searchParams.get('active')

  const where: any = {}
  if (serviceId) where.serviceId = serviceId
  if (programId) where.programId = programId
  if (active !== null) where.active = active !== 'false'

  const policies = await (prisma.commissionPolicy as any).findMany({
    where,
    include: {
      service: { select: { id: true, name: true } },
      programs: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(policies)
}

export async function POST(req: NextRequest) {
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

  if (!name || !commissionType) {
    return NextResponse.json({ error: 'name and commissionType are required' }, { status: 400 })
  }

  const ids: string[] = Array.isArray(programIds) ? programIds : []

  const policy = await (prisma.commissionPolicy as any).create({
    data: {
      name,
      description: description || null,
      commissionType,
      fixedAmount: fixedAmount ? Math.round(fixedAmount) : null,
      percentage: percentage ?? null,
      minAmount: minAmount ? Math.round(minAmount) : null,
      maxAmount: maxAmount ? Math.round(maxAmount) : null,
      appliesToApplication: appliesToApplication ?? true,
      appliesToImplementation: appliesToImplementation ?? false,
      serviceId: serviceId || null,
      programs: ids.length ? { connect: ids.map((id: string) => ({ id })) } : undefined,
      active: active ?? true,
    },
    include: {
      service: { select: { id: true, name: true } },
      programs: { select: { id: true, title: true } },
    },
  })

  return NextResponse.json(policy, { status: 201 })
}
