import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notIndividualWhere } from '@/lib/business-filters'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const accountants = await prisma.accountant.findMany({
    include: { _count: { select: { businesses: { where: notIndividualWhere }, users: true } } },
    orderBy: { officeName: 'asc' },
  })

  return NextResponse.json({ accountants })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await request.json()

  const accountant = await prisma.accountant.create({ data })
  return NextResponse.json(accountant, { status: 201 })
}
