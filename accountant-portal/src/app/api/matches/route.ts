import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '25')
  const status = searchParams.get('status') || ''
  const skip = (page - 1) * limit

  const where: any = {}
  if (status) where.status = status

  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    where.business = { accountantId: session.user.accountantId }
  }

  const [matches, total] = await Promise.all([
    prisma.programMatch.findMany({
      where,
      skip,
      take: limit,
      include: {
        business: { select: { id: true, afm: true, onomasia: true } },
        program: { select: { id: true, title: true, category: true } },
      },
      orderBy: { matchScore: 'desc' },
    }),
    prisma.programMatch.count({ where }),
  ])

  return NextResponse.json({ matches, total, page, limit })
}
